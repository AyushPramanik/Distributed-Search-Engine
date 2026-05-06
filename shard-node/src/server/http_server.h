#pragma once

#include "../index/inverted_index.h"
#include "../metrics/metrics.h"

#include <memory>
#include <string>

// Forward-declare httplib types to avoid polluting every translation unit.
namespace httplib { class Server; }

namespace search {

struct ServerConfig {
    std::string shard_id;
    int         port{8080};
    int         threads{4};
};

class HttpServer {
public:
    HttpServer(ServerConfig config,
               std::shared_ptr<InvertedIndex> index,
               std::shared_ptr<ShardMetrics>  metrics);
    ~HttpServer();

    // Blocks until stop() is called.
    void run();
    void stop();

private:
    ServerConfig                    config_;
    std::shared_ptr<InvertedIndex>  index_;
    std::shared_ptr<ShardMetrics>   metrics_;
    std::unique_ptr<httplib::Server> server_;

    void register_routes();

    // Route handlers
    void handle_index_document(const httplib::Request& req, httplib::Response& res);
    void handle_search(const httplib::Request& req, httplib::Response& res);
    void handle_delete_document(const httplib::Request& req, httplib::Response& res);
    void handle_health(const httplib::Request& req, httplib::Response& res);
    void handle_metrics(const httplib::Request& req, httplib::Response& res);
};

}  // namespace search
