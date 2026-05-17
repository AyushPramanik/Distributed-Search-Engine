#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"

echo "Seeding distributed search engine at $BASE_URL"
echo ""

index_doc() {
    local id="$1"
    local title="$2"
    local content="$3"

    local payload
    payload=$(cat <<EOF
{
  "id": "$id",
  "title": "$title",
  "content": "$content",
  "timestamp": $(date +%s)000
}
EOF
)
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$BASE_URL/api/documents" \
        -H "Content-Type: application/json" \
        -d "$payload")

    if [ "$status" = "201" ]; then
        echo "  [OK] $id"
    else
        echo "  [FAIL] $id (HTTP $status)"
    fi
}

index_doc "doc-001" \
    "Introduction to Distributed Systems" \
    "Distributed systems are collections of independent computers that appear to users as a single coherent system. Key challenges include fault tolerance, consistency, availability, and partition tolerance as defined by the CAP theorem. Modern distributed systems must handle network partitions gracefully."

index_doc "doc-002" \
    "BM25 and TF-IDF: Ranking Algorithms Explained" \
    "BM25 (Best Match 25) is a bag-of-words retrieval function that ranks documents based on the query terms appearing in each document. It extends TF-IDF by normalizing for document length and adding a term frequency saturation parameter k1 and length normalization b."

index_doc "doc-003" \
    "Inverted Index Data Structure" \
    "An inverted index maps content words to their locations in a database file or document set. It is the central data structure of modern search engines including Google, Elasticsearch, and Lucene. The index stores posting lists containing document IDs and term frequencies."

index_doc "doc-004" \
    "Consistent Hashing and Shard Routing" \
    "Consistent hashing distributes keys across nodes such that minimal remapping occurs when nodes are added or removed. It is used for shard routing in distributed databases and caches. Virtual nodes improve load balancing by assigning multiple positions on the hash ring per physical node."

index_doc "doc-005" \
    "The Raft Consensus Algorithm" \
    "Raft is a consensus algorithm designed to be understandable as an alternative to Paxos. It achieves consensus via a leader election protocol and log replication. Raft guarantees that at most one leader exists per term and that all committed entries are replicated to a majority of servers."

index_doc "doc-006" \
    "Redis as a Query Cache" \
    "Redis is an in-memory data structure store used as a database, cache, and message broker. For search engines, Redis provides sub-millisecond query result caching with configurable TTL and LRU eviction policies. Cache hit rates above 80% can dramatically reduce backend load."

index_doc "doc-007" \
    "Bloom Filters for Membership Testing" \
    "A Bloom filter is a space-efficient probabilistic data structure used to test whether an element is a member of a set. False positives are possible but false negatives are not. Bloom filters are used in search engines to quickly determine whether a document contains a given term before accessing disk."

index_doc "doc-008" \
    "Skip Lists vs B-Trees for Index Storage" \
    "Skip lists provide O(log n) average complexity for search, insertion, and deletion and are simpler to implement in concurrent settings compared to B-trees. LevelDB uses a skip list for its in-memory write buffer (memtable). Skip lists support efficient range scans critical for search index traversal."

index_doc "doc-009" \
    "Vector Clocks and Causality" \
    "Vector clocks are used to determine causality in distributed systems. Each process maintains a vector of logical clocks. When events are sent across processes, vector clocks are updated to capture happens-before relationships. They are foundational to conflict detection in eventually consistent systems."

index_doc "doc-010" \
    "Prometheus and Observability" \
    "Prometheus is an open-source systems monitoring toolkit that collects metrics as time series data. It uses a pull-based model where targets expose HTTP endpoints serving metrics in text format. Key metric types include counters, gauges, histograms, and summaries."

index_doc "doc-011" \
    "Log-Structured Merge Trees" \
    "LSM trees are a data structure used in storage engines like LevelDB and RocksDB that optimize write throughput by buffering writes in memory and periodically merging sorted files. Compaction merges SSTables to reduce read amplification at the cost of write amplification."

index_doc "doc-012" \
    "gRPC and Protocol Buffers" \
    "gRPC is a high-performance RPC framework developed by Google that uses HTTP/2 for transport and Protocol Buffers for interface definition. It supports four communication patterns: unary, server streaming, client streaming, and bidirectional streaming."

index_doc "doc-013" \
    "Eventual Consistency and BASE" \
    "BASE (Basically Available, Soft state, Eventually consistent) is an alternative to ACID transactions for distributed systems. Eventual consistency guarantees that if no new updates are made to a data item, eventually all accesses will return the last updated value."

index_doc "doc-014" \
    "Docker and Container Orchestration" \
    "Docker enables developers to package applications into containers with all their dependencies. Docker Compose orchestrates multi-container applications defining services, networks, and volumes. Kubernetes extends this to production-scale cluster management with auto-scaling and self-healing."

index_doc "doc-015" \
    "Search Engine Architecture at Scale" \
    "Large-scale search engines like Google and Bing use distributed crawling, indexing pipelines, and serving infrastructure to handle billions of queries per day. Key components include the crawler, document store, indexer, serving layer, query processor, and ranking model."

echo ""
echo "Seeding complete. Verifying with a test search..."
echo ""

result=$(curl -s "$BASE_URL/api/search?q=distributed+systems&page_size=5")
echo "$result" | python3 -m json.tool 2>/dev/null || echo "$result"

echo ""
echo "Done."
