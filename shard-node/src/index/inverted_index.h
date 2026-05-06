#pragma once

#include "tokenizer.h"

#include <atomic>
#include <cstdint>
#include <shared_mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace search {

struct PostingEntry {
    uint32_t doc_id;
    uint32_t term_freq;
    std::vector<uint32_t> positions;
};

struct DocumentMeta {
    std::string ext_id;
    std::string title;
    std::string content;  // stored for snippet generation
    uint32_t    term_count;
    int64_t     timestamp;
    bool        deleted{false};
};

struct SearchHit {
    std::string doc_id;
    std::string title;
    std::string snippet;
    double      score;
};

class InvertedIndex {
public:
    explicit InvertedIndex(const std::string& shard_id);

    // Returns false if the document ID already exists (use delete first).
    bool index_document(const std::string& id,
                        const std::string& title,
                        const std::string& content,
                        int64_t timestamp);

    // Soft-deletes a document. Returns false if not found.
    bool delete_document(const std::string& id);

    // Searches the index using the requested algorithm ("bm25" or "tfidf").
    std::vector<SearchHit> search(const std::string& query,
                                   int page,
                                   int page_size,
                                   const std::string& algorithm = "bm25") const;

    uint64_t document_count() const noexcept { return doc_count_.load(); }
    uint64_t term_count() const;
    const std::string& shard_id() const noexcept { return shard_id_; }

private:
    std::string shard_id_;
    Tokenizer tokenizer_;

    // Inverted index: stemmed term -> sorted posting list
    std::unordered_map<std::string, std::vector<PostingEntry>> index_;
    // Internal numeric ID -> document metadata
    std::unordered_map<uint32_t, DocumentMeta> docs_;
    // External string ID -> internal numeric ID
    std::unordered_map<std::string, uint32_t> id_map_;

    std::atomic<uint32_t> next_id_{0};
    std::atomic<uint64_t> doc_count_{0};
    double avg_doc_length_{0.0};

    mutable std::shared_mutex mutex_;

    double score_bm25(uint32_t doc_id,
                      const std::vector<std::string>& terms) const;
    double score_tfidf(uint32_t doc_id,
                       const std::vector<std::string>& terms) const;

    static std::string generate_snippet(const std::string& content,
                                         const std::vector<std::string>& terms,
                                         int context_chars = 120);
};

}  // namespace search
