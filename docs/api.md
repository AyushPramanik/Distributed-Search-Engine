# API Reference

Base URL: `http://localhost:3001`

## Search

### `GET /api/search`

Search the index across all shards.

**Query parameters**

| Parameter   | Type   | Default | Description                          |
|-------------|--------|---------|--------------------------------------|
| `q`         | string | —       | **Required.** Search query           |
| `page`      | int    | 1       | Page number (1-indexed)             |
| `page_size` | int    | 10      | Results per page (max 100)          |
| `algorithm` | string | `bm25`  | Ranking algorithm: `bm25` or `tfidf` |

**Response `200 OK`**

```json
{
  "results": [
    {
      "id": "doc-001",
      "title": "Introduction to Distributed Systems",
      "snippet": "...appear to users as a single coherent system. Key challenges include fault tolerance...",
      "score": 3.841,
      "shard_id": "shard-2"
    }
  ],
  "total_hits": 42,
  "latency_us": 2341,
  "shards_queried": 3,
  "shards_failed": 0,
  "cached": false,
  "query": "distributed systems",
  "page": 1,
  "page_size": 10
}
```

---

## Documents

### `POST /api/documents`

Index a document. The document is routed to the appropriate shard via consistent hashing.

**Request body**

```json
{
  "id": "unique-document-id",
  "title": "Document Title",
  "content": "Full document text content for indexing...",
  "metadata": {
    "author": "Ayush Pramanik",
    "category": "systems"
  },
  "timestamp": 1700000000000
}
```

**Response `201 Created`**

```json
{
  "success": true,
  "message": "indexed",
  "shard_id": "shard-1"
}
```

**Response `409 Conflict`** — document ID already exists (delete first).

---

### `DELETE /api/documents/:id`

Remove a document. The request is broadcast to all shards (document location is opaque to the gateway).

**Response `200 OK`**

```json
{
  "success": true,
  "message": "deleted"
}
```

**Response `404 Not Found`** — no shard contains this document ID.

---

## Cluster Health

### `GET /api/health`

Returns the health status of the entire cluster.

**Response `200 OK`** (healthy) / `503 Service Unavailable` (degraded)

```json
{
  "healthy": true,
  "total_shards": 3,
  "healthy_shards": 3,
  "shards": [
    {
      "shard_id": "shard-1",
      "healthy": true,
      "document_count": 523,
      "index_size_bytes": 0,
      "cpu_usage": 0,
      "memory_usage_mb": 0,
      "address": "http://shard-1:8080",
      "latency_us": 412
    }
  ]
}
```

---

## Direct Shard API

Shards also expose their API directly (bypassing caching and routing):

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/documents` | Index document on this shard |
| `GET` | `/v1/search?q=...` | Search this shard only |
| `DELETE` | `/v1/documents/:id` | Delete from this shard |
| `GET` | `/v1/health` | Shard health |
| `GET` | `/metrics` | Prometheus metrics |

Shard ports: shard-1=18081, shard-2=18082, shard-3=18083

---

## Error format

All errors return a consistent envelope:

```json
{
  "error": "short machine-readable message",
  "code": 400,
  "message": "human-readable description"
}
```
