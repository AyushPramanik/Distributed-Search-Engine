# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/JSON (REST)
┌──────────────────────────▼──────────────────────────────────────┐
│                    API Gateway  (Go)                             │
│  • CORS, rate-limit, request logging                             │
│  • Redis query cache (5-min TTL, LRU eviction)                  │
│  • Prometheus /metrics endpoint                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/JSON
┌──────────────────────────▼──────────────────────────────────────┐
│                  Query Coordinator  (Go)                         │
│  • Fan-out search to all shards concurrently                     │
│  • FNV-32a consistent hashing for document routing              │
│  • Result aggregation + global re-ranking                        │
│  • Graceful degradation (continues if shards fail)              │
│  • Background shard health monitor                               │
└───────────┬────────────────────┬───────────────────┬────────────┘
            │ HTTP/JSON          │ HTTP/JSON          │ HTTP/JSON
┌───────────▼──────┐   ┌────────▼──────┐   ┌─────────▼─────────┐
│   Shard-1 (C++)  │   │ Shard-2 (C++) │   │   Shard-3 (C++)   │
│  Inverted Index  │   │ Inverted Index │   │  Inverted Index   │
│  BM25 / TF-IDF  │   │ BM25 / TF-IDF │   │  BM25 / TF-IDF   │
│  Porter Stemmer  │   │ Porter Stemmer│   │  Porter Stemmer  │
└──────────────────┘   └───────────────┘   └───────────────────┘
```

## Component Responsibilities

### Shard Node (C++17)

Each shard is an independent C++ process that:

1. **Tokenization pipeline**: lowercasing → punctuation stripping → stopword removal → Porter stemming
2. **Inverted index**: `term → [(doc_id, tf, positions), ...]` in-memory hash map
3. **Scoring**: BM25 (k1=1.5, b=0.75) and TF-IDF
4. **Snippet generation**: extracts 120-character context window around best-matching term
5. **Concurrency**: `std::shared_mutex` — reads run in parallel, writes are exclusive

The C++ implementation is thread-safe and designed for high read concurrency.

### Query Coordinator (Go)

The coordinator is the distributed query orchestrator:

1. **Document routing**: FNV-32a hash of document ID mod shard count → deterministic placement
2. **Search fan-out**: goroutines fan out to all N shards simultaneously with per-shard timeout
3. **Result merging**: deduplication by document ID (max score wins), global sort by score, pagination
4. **Fault tolerance**: any shard that times out is skipped; results from healthy shards are returned
5. **Health monitoring**: background goroutine polls shard health every 15 seconds

### API Gateway (Go)

The public-facing gateway:

1. **Caching layer**: Redis-backed query cache keyed on `(query, page, page_size, algorithm)`
2. **Cache invalidation**: all cached results are flushed when a document is indexed or deleted
3. **Metrics**: per-route request count and latency histograms via Prometheus
4. **Structured logging**: JSON log line per request with latency, status, and request ID

## Data Flow: Search Query

```
1. User submits GET /api/search?q=distributed+systems
2. Gateway checks Redis cache → miss
3. Gateway forwards to Coordinator GET /v1/search?q=...
4. Coordinator fans out to all 3 shards concurrently (timeout: 5s)
5. Each shard:
   a. Tokenizes query → ["distribut", "system"] (stemmed)
   b. Looks up posting lists for each term
   c. Scores candidate documents (BM25)
   d. Returns top-50 results with score + snippet
6. Coordinator receives 3 result sets
7. Deduplicates across shards (doc may appear on one shard only)
8. Global re-rank by score, paginate
9. Returns to Gateway → stores in Redis (5-min TTL)
10. Gateway returns to client with cache=false
11. Identical query within 5 min → cache=true, 0ms extra latency
```

## Data Flow: Document Indexing

```
1. Client POST /api/documents {id, title, content}
2. Gateway forwards to Coordinator
3. Coordinator computes FNV-32a(id) % 3 → selects shard
4. Selected shard:
   a. Tokenizes title + content
   b. Builds posting entries with term frequencies and positions
   c. Updates inverted index (exclusive write lock)
   d. Recalculates average document length (incremental mean)
5. Coordinator returns success with shard_id
6. Gateway invalidates Redis cache
```

## Ranking Algorithms

### BM25 (default)

```
Score(D, Q) = Σ IDF(qi) × (f(qi,D) × (k1+1)) / (f(qi,D) + k1 × (1 - b + b × |D|/avgdl))

IDF(qi) = log((N - n(qi) + 0.5) / (n(qi) + 0.5) + 1)

Parameters: k1=1.5 (saturation), b=0.75 (length normalization)
```

### TF-IDF

```
Score(D, Q) = Σ TF(qi,D) × IDF(qi)

TF(qi,D) = f(qi,D) / |D|
IDF(qi)  = log(N / df(qi) + 1)
```

BM25 outperforms TF-IDF in most benchmarks by better handling term frequency saturation
and document length normalization.

## Sharding Strategy

Documents are assigned to shards using FNV-32a consistent hashing:

```go
func shardForDoc(id string) int {
    h := fnv.New32a()
    h.Write([]byte(id))
    return int(h.Sum32()) % numShards
}
```

**Trade-offs:**
- Simple modular hashing works well for static cluster sizes
- Adding shards requires rebalancing (not implemented); use virtual nodes + ring hashing for elastic clusters
- Search always queries all shards regardless of query content (full fan-out)

## Caching Strategy

Redis stores serialized `SearchResponse` JSON with a 5-minute TTL:

```
Key:   search:{query}:{page}:{page_size}:{algorithm}
Value: JSON(SearchResponse)
TTL:   300 seconds
```

Cache invalidation is coarse-grained (full flush on any write). A production system would
use query-aware invalidation or a shorter TTL.

## Observability

Each service exposes `/metrics` in Prometheus text format:

| Metric | Type | Labels |
|--------|------|--------|
| `gateway_http_requests_total` | counter | method, path, status |
| `gateway_http_request_duration_seconds` | histogram | method, path |
| `gateway_cache_hits_total` | counter | result (hit/miss) |
| `coordinator_search_requests_total` | counter | status |
| `coordinator_search_latency_us` | histogram | status |
| `coordinator_index_requests_total` | counter | status |
| `shard_search_latency_us` | histogram | shard_id |
| `shard_index_latency_us` | histogram | shard_id |
| `shard_document_count` | gauge | shard_id |
| `shard_search_requests_total` | counter | shard_id |
| `shard_index_requests_total` | counter | shard_id |

Grafana dashboards visualize p50/p95/p99 latencies, QPS, cache hit rate, and per-shard document distribution.
