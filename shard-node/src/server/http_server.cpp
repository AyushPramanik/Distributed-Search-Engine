#define CPPHTTPLIB_OPENSSL_SUPPORT 0
#include "http_server.h"

#include <httplib.h>
#include <nlohmann/json.hpp>

#include <chrono>
#include <iostream>
#include <stdexcept>

using json = nlohmann::json;

namespace search {

HttpServer::HttpServer(ServerConfig config,
                       std::shared_ptr<InvertedIndex> index,
                       std::shared_ptr<ShardMetrics>  metrics)
    : config_(std::move(config)),
      index_(std::move(index)),
      metrics_(std::move(metrics)),
      server_(std::make_unique<httplib::Server>()) {
    server_->new_task_queue = [this] {
        return new httplib::ThreadPool(config_.threads);
    };
    register_routes();
}

HttpServer::~HttpServer() = default;

void HttpServer::run() {
    std::cout << "[shard:" << config_.shard_id << "] listening on :"
              << config_.port << "\n";
    if (!server_->listen("0.0.0.0", config_.port)) {
        throw std::runtime_error("Failed to bind port " +
                                 std::to_string(config_.port));
    }
}

void HttpServer::stop() {
    server_->stop();
}

void HttpServer::register_routes() {
    // Document indexing
    server_->Post("/v1/documents", [this](const httplib::Request& req,
                                           httplib::Response& res) {
        handle_index_document(req, res);
    });

    // Search
    server_->Get("/v1/search", [this](const httplib::Request& req,
                                       httplib::Response& res) {
        handle_search(req, res);
    });

    // Delete document
    server_->Delete(R"(/v1/documents/([^/]+))",
                    [this](const httplib::Request& req, httplib::Response& res) {
                        handle_delete_document(req, res);
                    });

    // Health check
    server_->Get("/v1/health", [this](const httplib::Request& req,
                                       httplib::Response& res) {
        handle_health(req, res);
    });

    // Prometheus metrics
    server_->Get("/metrics", [this](const httplib::Request& req,
                                     httplib::Response& res) {
        handle_metrics(req, res);
    });
}

// ─────────────────────────────────────────────────────────────────────────────

void HttpServer::handle_index_document(const httplib::Request& req,
                                        httplib::Response& res) {
    auto t0 = std::chrono::steady_clock::now();
    metrics_->increment_index_requests();

    json body;
    try {
        body = json::parse(req.body);
    } catch (...) {
        res.status = 400;
        res.set_content(R"({"error":"invalid JSON"})", "application/json");
        metrics_->increment_index_errors();
        return;
    }

    std::string id      = body.value("id", "");
    std::string title   = body.value("title", "");
    std::string content = body.value("content", "");
    int64_t ts          = body.value("timestamp", 0LL);

    if (id.empty() || content.empty()) {
        res.status = 400;
        res.set_content(R"({"error":"id and content are required"})",
                        "application/json");
        metrics_->increment_index_errors();
        return;
    }

    bool ok = index_->index_document(id, title, content, ts);

    auto t1 = std::chrono::steady_clock::now();
    double us = std::chrono::duration<double, std::micro>(t1 - t0).count();
    metrics_->record_index_latency(us);
    metrics_->set_document_count(index_->document_count());

    if (!ok) {
        res.status = 409;
        json resp = {{"success", false},
                     {"message", "document already exists"},
                     {"shard_id", config_.shard_id}};
        res.set_content(resp.dump(), "application/json");
        return;
    }

    res.status = 201;
    json resp = {{"success", true},
                 {"message", "indexed"},
                 {"shard_id", config_.shard_id}};
    res.set_content(resp.dump(), "application/json");
}

void HttpServer::handle_search(const httplib::Request& req,
                                httplib::Response& res) {
    auto t0 = std::chrono::steady_clock::now();
    metrics_->increment_search_requests();

    std::string query = req.has_param("q") ? req.get_param_value("q") : "";
    if (query.empty()) {
        res.status = 400;
        res.set_content(R"({"error":"query parameter q is required"})",
                        "application/json");
        metrics_->increment_search_errors();
        return;
    }

    int page      = 1;
    int page_size = 10;
    std::string algo = "bm25";

    if (req.has_param("page"))
        page = std::max(1, std::stoi(req.get_param_value("page")));
    if (req.has_param("page_size"))
        page_size = std::min(100, std::max(1, std::stoi(req.get_param_value("page_size"))));
    if (req.has_param("algorithm"))
        algo = req.get_param_value("algorithm");

    auto hits = index_->search(query, page, page_size, algo);

    auto t1 = std::chrono::steady_clock::now();
    double us = std::chrono::duration<double, std::micro>(t1 - t0).count();
    metrics_->record_search_latency(us);

    json results = json::array();
    for (const auto& h : hits) {
        results.push_back({{"id", h.doc_id},
                           {"title", h.title},
                           {"snippet", h.snippet},
                           {"score", h.score},
                           {"shard_id", config_.shard_id}});
    }

    json resp = {{"results", results},
                 {"total_hits", static_cast<int>(hits.size())},
                 {"latency_us", static_cast<int64_t>(us)},
                 {"shard_id", config_.shard_id}};
    res.set_content(resp.dump(), "application/json");
}

void HttpServer::handle_delete_document(const httplib::Request& req,
                                         httplib::Response& res) {
    std::string id = req.matches[1];
    bool ok = index_->delete_document(id);

    if (!ok) {
        res.status = 404;
        json resp = {{"success", false}, {"message", "document not found"}};
        res.set_content(resp.dump(), "application/json");
        return;
    }

    metrics_->set_document_count(index_->document_count());
    json resp = {{"success", true}, {"message", "deleted"}};
    res.set_content(resp.dump(), "application/json");
}

void HttpServer::handle_health(const httplib::Request& /*req*/,
                                httplib::Response& res) {
    json resp = {{"shard_id", config_.shard_id},
                 {"healthy", true},
                 {"document_count", static_cast<int64_t>(index_->document_count())},
                 {"term_count", static_cast<int64_t>(index_->term_count())}};
    res.set_content(resp.dump(), "application/json");
}

void HttpServer::handle_metrics(const httplib::Request& /*req*/,
                                 httplib::Response& res) {
    res.set_content(metrics_->prometheus_exposition(), "text/plain; version=0.0.4");
}

}  // namespace search
