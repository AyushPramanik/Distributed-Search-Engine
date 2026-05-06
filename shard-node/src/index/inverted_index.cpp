#include "inverted_index.h"

#include <algorithm>
#include <cmath>
#include <sstream>

namespace search {

static constexpr double kBM25K1 = 1.5;
static constexpr double kBM25B  = 0.75;

InvertedIndex::InvertedIndex(const std::string& shard_id)
    : shard_id_(shard_id) {}

bool InvertedIndex::index_document(const std::string& id,
                                    const std::string& title,
                                    const std::string& content,
                                    int64_t timestamp) {
    std::unique_lock lock(mutex_);

    if (id_map_.count(id)) return false;

    uint32_t internal_id = next_id_.fetch_add(1);

    std::string full_text = title + " " + content;
    auto tokens = tokenizer_.tokenize(full_text);

    // Build term-frequency map and positions
    std::unordered_map<std::string, std::vector<uint32_t>> term_positions;
    for (uint32_t pos = 0; pos < tokens.size(); ++pos) {
        term_positions[tokens[pos]].push_back(pos);
    }

    // Add to inverted index
    for (const auto& [term, positions] : term_positions) {
        PostingEntry entry;
        entry.doc_id    = internal_id;
        entry.term_freq = static_cast<uint32_t>(positions.size());
        entry.positions = positions;
        index_[term].push_back(entry);
    }

    // Update average document length (incremental mean)
    uint64_t n = doc_count_.load();
    avg_doc_length_ = (avg_doc_length_ * n + tokens.size()) / (n + 1);

    DocumentMeta meta;
    meta.ext_id     = id;
    meta.title      = title;
    meta.content    = content;
    meta.term_count = static_cast<uint32_t>(tokens.size());
    meta.timestamp  = timestamp;

    docs_[internal_id] = std::move(meta);
    id_map_[id]        = internal_id;
    doc_count_.fetch_add(1);

    return true;
}

bool InvertedIndex::delete_document(const std::string& id) {
    std::unique_lock lock(mutex_);

    auto it = id_map_.find(id);
    if (it == id_map_.end()) return false;

    uint32_t internal_id = it->second;
    docs_[internal_id].deleted = true;
    id_map_.erase(it);
    doc_count_.fetch_sub(1);
    return true;
}

std::vector<SearchHit> InvertedIndex::search(const std::string& query,
                                               int page,
                                               int page_size,
                                               const std::string& algorithm) const {
    auto terms = tokenizer_.tokenize_query(query);
    if (terms.empty()) return {};

    std::shared_lock lock(mutex_);

    // Collect candidate document IDs (union across terms)
    std::unordered_map<uint32_t, double> scores;
    for (const auto& term : terms) {
        auto it = index_.find(term);
        if (it == index_.end()) continue;
        for (const auto& entry : it->second) {
            auto doc_it = docs_.find(entry.doc_id);
            if (doc_it == docs_.end() || doc_it->second.deleted) continue;
            scores[entry.doc_id] += 0.0;  // ensure entry exists
        }
    }

    // Score all candidates
    for (auto& [doc_id, score] : scores) {
        if (algorithm == "tfidf") {
            score = score_tfidf(doc_id, terms);
        } else {
            score = score_bm25(doc_id, terms);
        }
    }

    // Sort by descending score
    std::vector<std::pair<uint32_t, double>> ranked(scores.begin(), scores.end());
    std::sort(ranked.begin(), ranked.end(),
              [](const auto& a, const auto& b) { return a.second > b.second; });

    // Paginate
    int offset = (page > 0 ? page - 1 : 0) * page_size;
    int end    = std::min(static_cast<int>(ranked.size()), offset + page_size);

    std::vector<SearchHit> hits;
    hits.reserve(end - offset);
    for (int i = offset; i < end; ++i) {
        const auto& doc = docs_.at(ranked[i].first);
        SearchHit hit;
        hit.doc_id  = doc.ext_id;
        hit.title   = doc.title;
        hit.snippet = generate_snippet(doc.content, terms);
        hit.score   = ranked[i].second;
        hits.push_back(std::move(hit));
    }
    return hits;
}

uint64_t InvertedIndex::term_count() const {
    std::shared_lock lock(mutex_);
    return index_.size();
}

// ── Scoring ───────────────────────────────────────────────────────────────────

double InvertedIndex::score_bm25(uint32_t doc_id,
                                  const std::vector<std::string>& terms) const {
    auto doc_it = docs_.find(doc_id);
    if (doc_it == docs_.end()) return 0.0;

    double dl   = static_cast<double>(doc_it->second.term_count);
    double N    = static_cast<double>(doc_count_.load());
    double score = 0.0;

    for (const auto& term : terms) {
        auto idx_it = index_.find(term);
        if (idx_it == index_.end()) continue;

        // Document frequency
        double df = 0;
        uint32_t tf = 0;
        for (const auto& entry : idx_it->second) {
            if (!docs_.at(entry.doc_id).deleted) ++df;
            if (entry.doc_id == doc_id) tf = entry.term_freq;
        }
        if (df == 0 || tf == 0) continue;

        double idf = std::log((N - df + 0.5) / (df + 0.5) + 1.0);
        double norm_tf = (tf * (kBM25K1 + 1.0)) /
                         (tf + kBM25K1 * (1.0 - kBM25B + kBM25B * dl / avg_doc_length_));
        score += idf * norm_tf;
    }
    return score;
}

double InvertedIndex::score_tfidf(uint32_t doc_id,
                                   const std::vector<std::string>& terms) const {
    auto doc_it = docs_.find(doc_id);
    if (doc_it == docs_.end()) return 0.0;

    double dl    = static_cast<double>(doc_it->second.term_count);
    double N     = static_cast<double>(doc_count_.load());
    double score = 0.0;

    for (const auto& term : terms) {
        auto idx_it = index_.find(term);
        if (idx_it == index_.end()) continue;

        double df = 0;
        uint32_t tf = 0;
        for (const auto& entry : idx_it->second) {
            if (!docs_.at(entry.doc_id).deleted) ++df;
            if (entry.doc_id == doc_id) tf = entry.term_freq;
        }
        if (df == 0 || tf == 0) continue;

        double tfidf = (dl > 0 ? tf / dl : 0.0) * std::log(N / df + 1.0);
        score += tfidf;
    }
    return score;
}

// ── Snippet generation ────────────────────────────────────────────────────────

std::string InvertedIndex::generate_snippet(const std::string& content,
                                             const std::vector<std::string>& terms,
                                             int context_chars) {
    if (content.empty()) return "";

    // Find first occurrence of any query term (case-insensitive)
    std::string lower_content = content;
    std::transform(lower_content.begin(), lower_content.end(),
                   lower_content.begin(), ::tolower);

    size_t best_pos = std::string::npos;
    for (const auto& term : terms) {
        size_t pos = lower_content.find(term);
        if (pos != std::string::npos) {
            if (best_pos == std::string::npos || pos < best_pos) {
                best_pos = pos;
            }
        }
    }

    size_t start = 0;
    if (best_pos != std::string::npos) {
        start = best_pos > static_cast<size_t>(context_chars / 2)
                    ? best_pos - context_chars / 2
                    : 0;
    }

    // Snap to word boundary
    while (start > 0 && content[start] != ' ') --start;

    size_t end = std::min(content.size(), start + context_chars);
    while (end < content.size() && content[end] != ' ') ++end;

    std::string snippet = content.substr(start, end - start);
    if (start > 0) snippet = "..." + snippet;
    if (end < content.size()) snippet += "...";

    return snippet;
}

}  // namespace search
