package types

// Document is a unit of content to be indexed.
type Document struct {
	ID        string            `json:"id"`
	Title     string            `json:"title"`
	Content   string            `json:"content"`
	Metadata  map[string]string `json:"metadata,omitempty"`
	Timestamp int64             `json:"timestamp"`
}

// SearchResult is a single ranked result returned from a shard.
type SearchResult struct {
	ID      string  `json:"id"`
	Title   string  `json:"title"`
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
	ShardID string  `json:"shard_id,omitempty"`
}

// SearchRequest encodes a query from the API layer.
type SearchRequest struct {
	Query     string `json:"query"`
	Page      int    `json:"page"`
	PageSize  int    `json:"page_size"`
	Algorithm string `json:"algorithm"` // "bm25" | "tfidf"
}

// SearchResponse is the aggregated result set returned to callers.
type SearchResponse struct {
	Results       []SearchResult `json:"results"`
	TotalHits     int            `json:"total_hits"`
	LatencyUs     int64          `json:"latency_us"`
	ShardsQueried int            `json:"shards_queried"`
	ShardsFailed  int            `json:"shards_failed"`
	Cached        bool           `json:"cached"`
	Query         string         `json:"query"`
	Page          int            `json:"page"`
	PageSize      int            `json:"page_size"`
}

// IndexResponse is returned after indexing a document.
type IndexResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	ShardID string `json:"shard_id,omitempty"`
}

// DeleteResponse is returned after deleting a document.
type DeleteResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// ShardHealth reports the runtime state of a shard.
type ShardHealth struct {
	ShardID        string  `json:"shard_id"`
	Healthy        bool    `json:"healthy"`
	DocumentCount  int64   `json:"document_count"`
	IndexSizeBytes int64   `json:"index_size_bytes"`
	CPUUsage       float64 `json:"cpu_usage"`
	MemoryUsageMB  float64 `json:"memory_usage_mb"`
	Address        string  `json:"address"`
	Latency        int64   `json:"latency_us"`
}

// ClusterHealth aggregates health across all shards.
type ClusterHealth struct {
	Healthy      bool          `json:"healthy"`
	TotalShards  int           `json:"total_shards"`
	HealthyShards int          `json:"healthy_shards"`
	Shards       []ShardHealth `json:"shards"`
}

// ErrorResponse is the standard error envelope.
type ErrorResponse struct {
	Error   string `json:"error"`
	Code    int    `json:"code"`
	Message string `json:"message"`
}
