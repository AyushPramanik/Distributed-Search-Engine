#pragma once

#include <atomic>
#include <chrono>
#include <mutex>
#include <string>
#include <vector>

namespace search {

// Simple histogram for latency tracking with fixed buckets (microseconds).
class LatencyHistogram {
public:
    explicit LatencyHistogram(std::vector<double> buckets);
    void observe(double value_us);
    std::string prometheus_text(const std::string& name,
                                 const std::string& help) const;

private:
    std::vector<double> buckets_;
    std::vector<std::atomic<uint64_t>> counts_;
    std::atomic<uint64_t> total_count_{0};
    std::atomic<double>   total_sum_{0.0};
    mutable std::mutex    mutex_;
};

// All metrics for one shard node.
class ShardMetrics {
public:
    explicit ShardMetrics(const std::string& shard_id);

    void record_index_latency(double us);
    void record_search_latency(double us);
    void increment_index_requests();
    void increment_search_requests();
    void increment_index_errors();
    void increment_search_errors();
    void set_document_count(uint64_t n);

    // Returns the full Prometheus text format exposition.
    std::string prometheus_exposition() const;

private:
    std::string shard_id_;
    LatencyHistogram index_latency_;
    LatencyHistogram search_latency_;
    std::atomic<uint64_t> index_requests_{0};
    std::atomic<uint64_t> search_requests_{0};
    std::atomic<uint64_t> index_errors_{0};
    std::atomic<uint64_t> search_errors_{0};
    std::atomic<uint64_t> document_count_{0};
};

}  // namespace search
