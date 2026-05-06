#pragma once

#include <string>
#include <vector>
#include <unordered_set>

namespace search {

class Tokenizer {
public:
    Tokenizer();

    // Tokenize text into normalized, stemmed, stop-word-filtered tokens.
    std::vector<std::string> tokenize(const std::string& text) const;

    // Tokenize for query — same pipeline, preserves ordering for scoring.
    std::vector<std::string> tokenize_query(const std::string& text) const;

private:
    std::unordered_set<std::string> stopwords_;

    std::string normalize(const std::string& token) const;
    std::string stem(const std::string& word) const;
    bool is_stopword(const std::string& word) const;

    // Porter stemmer step helpers
    static int measure(const std::string& stem);
    static bool ends_with_vowel_consonant_vowel(const std::string& s);
    static bool contains_vowel(const std::string& s);
    static bool ends_double_consonant(const std::string& s);
};

}  // namespace search
