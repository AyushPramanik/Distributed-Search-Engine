#include "metrics.h"

#include <sstream>
#include <iomanip>
#include <cmath>

namespace search {

LatencyHistogram::LatencyHistogram(std::vector<double> buckets)
    : buckets_(std::move(buckets)), counts_(buckets_.size() + 1) {
    for (auto& c : counts_) c.store(0);
}

void LatencyHistogram::observe(double value_us) {
    for (size_t i = 0; i < buckets_.size(); ++i) {
        if (value_us <= buckets_[i]) {
            counts_[i].fetch_add(1);
            break;
        }
    }
    // +Inf bucket
    counts_.back().fetch_add(1);
    total_count_.fetch_add(1);

    // Atomic double add using compare-exchange
    double current = total_sum_.load();
    while (!total_sum_.compare_exchange_weak(current, current + value_us)) {}
}

std::string LatencyHistogram::prometheus_text(const std::string& name,
                                               const std::string& help) const {
    std::ostringstream ss;
    ss << "# HELP " << name << " " << help << "\n";
    ss << "# TYPE " << name << " histogram\n";

    uint64_t cumulative = 0;
    for (size_t i = 0; i < buckets_.size(); ++i) {
        cumulative += counts_[i].load();
        ss << name << "_bucket{le=\"" << std::fixed << std::setprecision(0)
           << buckets_[i] << "\"} " << cumulative << "\n";
    }
    // +Inf bucket
    uint64_t total = total_count_.load();
    ss << name << "_bucket{le=\"+Inf\"} " << total << "\n";
    ss << name << "_sum " << std::fixed << std::setprecision(3) << total_sum_.load() << "\n";
    ss << name << "_count " << total << "\n";
    return ss.str();
}

// ─────────────────────────────────────────────────────────────────────────────

static const std::vector<double> kLatencyBuckets = {
    100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000
};

ShardMetrics::ShardMetrics(const std::string& shard_id)
    : shard_id_(shard_id),
      index_latency_(kLatencyBuckets),
      search_latency_(kLatencyBuckets) {}

void ShardMetrics::record_index_latency(double us)  { index_latency_.observe(us); }
void ShardMetrics::record_search_latency(double us) { search_latency_.observe(us); }
void ShardMetrics::increment_index_requests()       { index_requests_.fetch_add(1); }
void ShardMetrics::increment_search_requests()      { search_requests_.fetch_add(1); }
void ShardMetrics::increment_index_errors()         { index_errors_.fetch_add(1); }
void ShardMetrics::increment_search_errors()        { search_errors_.fetch_add(1); }
void ShardMetrics::set_document_count(uint64_t n)   { document_count_.store(n); }

std::string ShardMetrics::prometheus_exposition() const {
    std::ostringstream ss;
    const std::string label = "{shard_id=\"" + shard_id_ + "\"}";

    ss << index_latency_.prometheus_text(
        "shard_index_latency_us",
        "Document indexing latency in microseconds");

    ss << search_latency_.prometheus_text(
        "shard_search_latency_us",
        "Search query latency in microseconds");

    ss << "# HELP shard_index_requests_total Total document index requests\n"
       << "# TYPE shard_index_requests_total counter\n"
       << "shard_index_requests_total" << label << " " << index_requests_.load() << "\n";

    ss << "# HELP shard_search_requests_total Total search requests\n"
       << "# TYPE shard_search_requests_total counter\n"
       << "shard_search_requests_total" << label << " " << search_requests_.load() << "\n";

    ss << "# HELP shard_index_errors_total Total indexing errors\n"
       << "# TYPE shard_index_errors_total counter\n"
       << "shard_index_errors_total" << label << " " << index_errors_.load() << "\n";

    ss << "# HELP shard_search_errors_total Total search errors\n"
       << "# TYPE shard_search_errors_total counter\n"
       << "shard_search_errors_total" << label << " " << search_errors_.load() << "\n";

    ss << "# HELP shard_document_count Current number of indexed documents\n"
       << "# TYPE shard_document_count gauge\n"
       << "shard_document_count" << label << " " << document_count_.load() << "\n";

    return ss.str();
}

}  // namespace search
