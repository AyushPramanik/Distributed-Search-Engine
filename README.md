# Distributed Search Engine

A production-style distributed full-text search engine built from scratch. Designed to demonstrate distributed systems engineering, high-performance indexing, and infrastructure observability.

## Architecture

```
┌──────────────┐     REST/JSON      ┌──────────────────┐     REST/JSON      ┌─────────────────────────────────┐
│  Next.js UI  │ ──────────────────▶│   API Gateway    │ ──────────────────▶│     Query Coordinator (Go)      │
│  (React/TS)  │                    │      (Go)        │                    │  fan-out · merge · rank · route  │
└──────────────┘                    │  Redis cache     │                    └──────────────┬──────────────────┘
                                    │  Prometheus      │                                   │
                                    └──────────────────┘                    ┌──────────────┼──────────────┐
                                                                            │              │              │
                                                                   ┌────────▼────┐ ┌───────▼────┐ ┌──────▼─────┐
                                                                   │  Shard-1   │ │  Shard-2  │ │  Shard-3  │
                                                                   │   (C++17)  │ │  (C++17)  │ │  (C++17)  │
                                                                   │ BM25/TF-IDF│ │BM25/TF-IDF│ │BM25/TF-IDF│
                                                                   └────────────┘ └───────────┘ └────────────┘
```

## Features

**Core search infrastructure**
- Inverted index with Porter stemmer, stopword filtering, and positional indexing
- BM25 and TF-IDF ranking algorithms with configurable parameters
- Snippet extraction with query-term highlighting context
- Thread-safe concurrent indexing and search (`std::shared_mutex`)

**Distributed architecture**
- 3-shard cluster with FNV-32a consistent hash routing for document placement
- Parallel fan-out search: all shards queried simultaneously per request
- Global result merging and re-ranking across shards
- Graceful shard failure handling — partial results returned on timeout
- Background health monitor with 15-second polling interval

**Caching**
- Redis query cache with 5-minute TTL and LRU eviction
- Cache invalidation on document writes
- Per-request cache hit/miss tracking

**Observability**
- Prometheus metrics at every service layer (p50/p95/p99 latency, QPS, error rate)
- Grafana dashboards provisioned automatically
- Structured JSON request logging
- Per-shard document count and health metrics

**Frontend**
- Dark-mode search UI with real-time latency display
- Cluster topology visualization
- Live metrics dashboard with streaming charts (Recharts)
- Relevance score and shard attribution per result

## Quick Start

**Requirements:** Docker, Docker Compose v2

```bash
git clone https://github.com/ayushpramanik/distributed-search-engine
cd distributed-search-engine
docker compose up --build -d
```

| Service     | URL                          |
|-------------|------------------------------|
| Frontend    | http://localhost:3000        |
| API Gateway | http://localhost:3001        |
| Grafana     | http://localhost:3100 (admin/admin) |
| Prometheus  | http://localhost:9091        |
| Shard-1     | http://localhost:18081       |

**Seed with sample data:**

```bash
bash scripts/seed-data.sh
```

**Test the search API:**

```bash
# Search
curl "http://localhost:3001/api/search?q=distributed+systems&algorithm=bm25"

# Index a document
curl -X POST http://localhost:3001/api/documents \
  -H "Content-Type: application/json" \
  -d '{"id":"doc-1","title":"Test","content":"Distributed search engines use inverted indexes for fast full-text retrieval."}'

# Cluster health
curl http://localhost:3001/api/health
```

## Project Structure

```
├── shard-node/           C++17 search engine core
│   └── src/
│       ├── index/        Inverted index, tokenizer, BM25/TF-IDF scorer
│       ├── server/       HTTP server (cpp-httplib)
│       └── metrics/      Prometheus text format exporter
├── query-coordinator/    Go — distributed query orchestration
│   └── internal/
│       ├── coordinator/  Fan-out, health monitor, consistent hashing
│       ├── shard/        Per-shard HTTP client
│       └── aggregator/   Result merging and re-ranking
├── api-gateway/          Go — public REST API with Redis caching
├── shared/               Go — shared type definitions
├── frontend/             Next.js 14 + TypeScript + Tailwind
├── monitoring/           Prometheus config + Grafana dashboards
├── load-testing/         k6 load test scripts
├── scripts/              Setup and data seeding
├── docs/                 Architecture, API reference
└── shared-proto/         Protobuf service contracts
```

## Load Testing

```bash
# Install k6: https://k6.io/docs/getting-started/installation/

# Search load (ramp to 500 concurrent users)
k6 run load-testing/search-load.js

# Indexing stress test
k6 run load-testing/index-load.js
```

Target thresholds: p95 search latency < 250ms, error rate < 1%.

## Local Development

```bash
# C++ shard (requires cmake + g++ or clang++)
cd shard-node && cmake -B build && cmake --build build
./shard-node/build/shard_node

# Go coordinator
cd query-coordinator && go run ./cmd/coordinator

# Go API gateway
cd api-gateway && go run ./cmd/gateway

# Frontend
cd frontend && npm install && npm run dev
```

## Design Decisions

**Why C++ for shard nodes?** Index operations are CPU-bound (tokenization, scoring over large posting lists). C++ provides deterministic memory layout, zero-overhead abstractions, and direct control over concurrency primitives.

**Why HTTP/JSON for internal RPC?** Simplifies local development and debugging without a code generation step. A production deployment would add gRPC (proto file included in `shared-proto/`) for reduced serialization overhead.

**Why FNV hashing vs consistent hashing ring?** FNV mod N is simpler and sufficient for a static cluster. For elastic scaling, replace with a virtual node ring (each physical node gets 150 virtual positions) to minimize reshuffling on membership change.

**Why coarse-grained cache invalidation?** Full cache flush on any write is simple and correct. A production system would track per-query affected terms and invalidate selectively, or use a shorter TTL for higher write workloads.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Search core | C++17, cpp-httplib, nlohmann/json |
| Coordinator | Go 1.21, chi router |
| API Gateway | Go 1.21, chi router, go-redis/v9 |
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Recharts |
| Cache | Redis 7 |
| Metrics | Prometheus, Grafana |
| Load testing | k6 |
| Containers | Docker, Docker Compose |
