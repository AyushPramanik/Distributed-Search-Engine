export interface SearchResult {
  id: string
  title: string
  snippet: string
  score: number
  shard_id?: string
}

export interface SearchResponse {
  results: SearchResult[]
  total_hits: number
  latency_us: number
  shards_queried: number
  shards_failed: number
  cached: boolean
  query: string
  page: number
  page_size: number
}

export interface ShardHealth {
  shard_id: string
  healthy: boolean
  document_count: number
  index_size_bytes: number
  cpu_usage: number
  memory_usage_mb: number
  address: string
  latency_us: number
}

export interface ClusterHealth {
  healthy: boolean
  total_shards: number
  healthy_shards: number
  shards: ShardHealth[]
}

export interface MetricPoint {
  time: string
  value: number
}

export interface MetricSeries {
  name: string
  data: MetricPoint[]
}
