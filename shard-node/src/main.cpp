#include "index/inverted_index.h"
#include "metrics/metrics.h"
#include "server/http_server.h"

#include <csignal>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>

// Global server pointer for signal handler.
static search::HttpServer* g_server = nullptr;

static void signal_handler(int /*sig*/) {
    if (g_server) g_server->stop();
}

static std::string env_or(const char* name, const char* fallback) {
    const char* v = std::getenv(name);
    return v ? std::string(v) : std::string(fallback);
}

int main() {
    std::string shard_id = env_or("SHARD_ID", "shard-0");
    int port             = std::stoi(env_or("HTTP_PORT", "8080"));
    int threads          = std::stoi(env_or("WORKER_THREADS", "4"));

    std::cout << "[shard:" << shard_id << "] starting up\n";

    auto index   = std::make_shared<search::InvertedIndex>(shard_id);
    auto metrics = std::make_shared<search::ShardMetrics>(shard_id);

    search::ServerConfig cfg{shard_id, port, threads};
    search::HttpServer server(cfg, index, metrics);

    g_server = &server;
    std::signal(SIGINT,  signal_handler);
    std::signal(SIGTERM, signal_handler);

    server.run();  // blocks

    std::cout << "[shard:" << shard_id << "] shutdown complete\n";
    return 0;
}
