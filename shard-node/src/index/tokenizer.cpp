#include "tokenizer.h"

#include <algorithm>
#include <cctype>
#include <sstream>

namespace search {

static const std::unordered_set<std::string> kEnglishStopwords = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "that",
    "this", "these", "those", "it", "its", "i", "me", "my", "we", "our",
    "you", "your", "he", "his", "she", "her", "they", "their", "them",
    "what", "which", "who", "whom", "when", "where", "why", "how",
    "not", "no", "nor", "so", "yet", "both", "either", "neither", "each",
    "few", "more", "most", "other", "some", "such", "than", "too", "very",
    "just", "about", "above", "after", "all", "also", "any", "because",
    "before", "between", "during", "into", "must", "only", "same", "then",
    "there", "through", "under", "until", "upon", "while"
};

Tokenizer::Tokenizer() : stopwords_(kEnglishStopwords) {}

std::vector<std::string> Tokenizer::tokenize(const std::string& text) const {
    std::vector<std::string> tokens;
    std::string current;

    for (unsigned char ch : text) {
        if (std::isalnum(ch)) {
            current += std::tolower(ch);
        } else if (!current.empty()) {
            auto normalized = normalize(current);
            if (!normalized.empty() && !is_stopword(normalized)) {
                auto stemmed = stem(normalized);
                if (stemmed.length() >= 2) {
                    tokens.push_back(stemmed);
                }
            }
            current.clear();
        }
    }
    if (!current.empty()) {
        auto normalized = normalize(current);
        if (!normalized.empty() && !is_stopword(normalized)) {
            auto stemmed = stem(normalized);
            if (stemmed.length() >= 2) {
                tokens.push_back(stemmed);
            }
        }
    }
    return tokens;
}

std::vector<std::string> Tokenizer::tokenize_query(const std::string& text) const {
    return tokenize(text);
}

std::string Tokenizer::normalize(const std::string& token) const {
    std::string result;
    result.reserve(token.size());
    for (unsigned char ch : token) {
        result += std::tolower(ch);
    }
    return result;
}

bool Tokenizer::is_stopword(const std::string& word) const {
    return stopwords_.count(word) > 0;
}

// ── Simplified Porter Stemmer ─────────────────────────────────────────────────

// Measure: count VC sequences (consonant clusters / vowel clusters pairs)
// in the part of the string after position 0.
int Tokenizer::measure(const std::string& s) {
    int m = 0;
    bool in_vowel = false;
    auto is_vowel = [](char c) -> bool {
        return c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u';
    };

    for (size_t i = 0; i < s.size(); ++i) {
        char c = s[i];
        // Treat 'y' as vowel if preceded by consonant
        bool v = is_vowel(c) || (c == 'y' && i > 0 && !is_vowel(s[i - 1]));
        if (v) {
            if (!in_vowel && m > 0) ++m;
            in_vowel = true;
        } else {
            if (in_vowel) ++m;
            in_vowel = false;
        }
    }
    return m;
}

bool Tokenizer::contains_vowel(const std::string& s) {
    for (char c : s) {
        if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u') return true;
    }
    return false;
}

bool Tokenizer::ends_double_consonant(const std::string& s) {
    if (s.size() < 2) return false;
    char last = s.back();
    if (last == 'a' || last == 'e' || last == 'i' || last == 'o' || last == 'u') return false;
    return s[s.size() - 2] == last;
}

bool Tokenizer::ends_with_vowel_consonant_vowel(const std::string& s) {
    if (s.size() < 3) return false;
    auto is_vowel = [](char c) { return c=='a'||c=='e'||c=='i'||c=='o'||c=='u'; };
    char c1 = s[s.size()-3], c2 = s[s.size()-2], c3 = s.back();
    return is_vowel(c1) && !is_vowel(c2) && is_vowel(c3) && c3 != 'w' && c3 != 'x' && c3 != 'y';
}

std::string Tokenizer::stem(const std::string& word) const {
    if (word.length() <= 2) return word;

    std::string s = word;

    // Step 1a: plurals
    auto ends_with = [&](const std::string& suffix) -> bool {
        return s.size() >= suffix.size() &&
               s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
    };
    auto replace_suffix = [&](const std::string& suffix, const std::string& replacement) {
        s = s.substr(0, s.size() - suffix.size()) + replacement;
    };

    if (ends_with("sses")) {
        replace_suffix("sses", "ss");
    } else if (ends_with("ies")) {
        replace_suffix("ies", "i");
    } else if (ends_with("ss")) {
        // no-op
    } else if (ends_with("s") && s.size() > 2) {
        replace_suffix("s", "");
    }

    // Step 1b: -ed, -ing
    bool did_step1b = false;
    if (ends_with("eed")) {
        std::string stem_part = s.substr(0, s.size() - 3);
        if (measure(stem_part) > 0) replace_suffix("eed", "ee");
    } else if (ends_with("ed")) {
        std::string stem_part = s.substr(0, s.size() - 2);
        if (contains_vowel(stem_part)) {
            replace_suffix("ed", "");
            did_step1b = true;
        }
    } else if (ends_with("ing")) {
        std::string stem_part = s.substr(0, s.size() - 3);
        if (contains_vowel(stem_part)) {
            replace_suffix("ing", "");
            did_step1b = true;
        }
    }

    if (did_step1b) {
        if (ends_with("at") || ends_with("bl") || ends_with("iz")) {
            s += 'e';
        } else if (ends_double_consonant(s) && !ends_with("l") && !ends_with("s") && !ends_with("z")) {
            s = s.substr(0, s.size() - 1);
        } else if (measure(s) == 1 && ends_with_vowel_consonant_vowel(s)) {
            s += 'e';
        }
    }

    // Step 1c: y -> i
    if (ends_with("y") && contains_vowel(s.substr(0, s.size() - 1))) {
        replace_suffix("y", "i");
    }

    // Step 2: common derivational suffixes
    struct Rule { const char* suffix; const char* replacement; };
    static const Rule step2_rules[] = {
        {"ational", "ate"}, {"tional", "tion"}, {"enci", "ence"},
        {"anci", "ance"},   {"izer", "ize"},     {"abli", "able"},
        {"alli", "al"},     {"entli", "ent"},    {"eli", "e"},
        {"ousli", "ous"},   {"ization", "ize"},  {"ation", "ate"},
        {"ator", "ate"},    {"alism", "al"},      {"iveness", "ive"},
        {"fulness", "ful"}, {"ousness", "ous"},  {"aliti", "al"},
        {"iviti", "ive"},   {"biliti", "ble"},
    };
    for (const auto& r : step2_rules) {
        if (ends_with(r.suffix)) {
            std::string stem_part = s.substr(0, s.size() - strlen(r.suffix));
            if (measure(stem_part) > 0) {
                replace_suffix(r.suffix, r.replacement);
                break;
            }
        }
    }

    // Step 3
    static const Rule step3_rules[] = {
        {"icate", "ic"}, {"ative", ""}, {"alize", "al"},
        {"iciti", "ic"}, {"ical", "ic"}, {"ful", ""}, {"ness", ""},
    };
    for (const auto& r : step3_rules) {
        if (ends_with(r.suffix)) {
            std::string stem_part = s.substr(0, s.size() - strlen(r.suffix));
            if (measure(stem_part) > 0) {
                replace_suffix(r.suffix, r.replacement);
                break;
            }
        }
    }

    // Step 4: remove derivational suffixes (measure > 1)
    static const char* step4_suffixes[] = {
        "ement", "ment", "ance", "ence", "able", "ible", "ism",
        "ate", "iti", "ous", "ive", "ize", "ion", "al", "er", "ic",
    };
    for (const char* suffix : step4_suffixes) {
        if (ends_with(suffix)) {
            std::string stem_part = s.substr(0, s.size() - strlen(suffix));
            if (measure(stem_part) > 1) {
                // Special case: "ion" requires stem to end in s or t
                if (strcmp(suffix, "ion") == 0) {
                    if (!stem_part.empty() && (stem_part.back() == 's' || stem_part.back() == 't')) {
                        replace_suffix(suffix, "");
                    }
                } else {
                    replace_suffix(suffix, "");
                }
                break;
            }
        }
    }

    // Step 5a: remove trailing e
    if (ends_with("e")) {
        std::string stem_part = s.substr(0, s.size() - 1);
        int m = measure(stem_part);
        if (m > 1 || (m == 1 && !ends_with_vowel_consonant_vowel(stem_part))) {
            replace_suffix("e", "");
        }
    }

    // Step 5b: ll -> l
    if (ends_with("ll") && measure(s) > 1) {
        s = s.substr(0, s.size() - 1);
    }

    return s;
}

}  // namespace search
