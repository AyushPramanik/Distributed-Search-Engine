import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Counter, Rate } from 'k6/metrics'

// ── Custom metrics ────────────────────────────────────────────────────────────

const searchLatency    = new Trend('search_latency_ms', true)
const cacheHits        = new Counter('cache_hits_total')
const errorRate        = new Rate('error_rate')

// ── Load profile ──────────────────────────────────────────────────────────────
// Ramp up → steady state → ramp down

export const options = {
  stages: [
    { duration: '30s', target: 50   },   // ramp up to 50 VUs
    { duration: '2m',  target: 200  },   // steady 200 VUs
    { duration: '1m',  target: 500  },   // peak load
    { duration: '30s', target: 200  },   // scale back
    { duration: '30s', target: 0    },   // ramp down
  ],
  thresholds: {
    http_req_duration:          ['p(95)<250'],   // 95th percentile under 250ms
    'search_latency_ms':        ['p(95)<200'],
    'http_req_failed':          ['rate<0.01'],   // <1% error rate
    'error_rate':               ['rate<0.01'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001'

const QUERIES = [
  'distributed systems',
  'inverted index',
  'search engine',
  'consensus algorithm',
  'replication factor',
  'shard routing',
  'bloom filter',
  'skip list',
  'consistent hashing',
  'log structured merge',
  'raft consensus',
  'vector clock',
  'gossip protocol',
  'two phase commit',
  'eventual consistency',
  'BM25 ranking',
  'TF-IDF scoring',
  'query optimization',
  'index compression',
  'document retrieval',
]

const ALGORITHMS = ['bm25', 'tfidf']

export default function () {
  const query     = QUERIES[Math.floor(Math.random() * QUERIES.length)]
  const algorithm = ALGORITHMS[Math.floor(Math.random() * ALGORITHMS.length)]
  const page      = Math.floor(Math.random() * 3) + 1

  const url = `${BASE_URL}/api/search?q=${encodeURIComponent(query)}&algorithm=${algorithm}&page=${page}&page_size=10`
  const t0  = Date.now()

  const res = http.get(url, {
    headers: { 'Accept': 'application/json' },
    tags:    { operation: 'search' },
  })

  const latency = Date.now() - t0
  searchLatency.add(latency)

  const ok = check(res, {
    'status 200':              r => r.status === 200,
    'has results field':       r => JSON.parse(r.body).results !== undefined,
    'latency_us present':      r => JSON.parse(r.body).latency_us !== undefined,
    'response time < 500ms':   () => latency < 500,
  })

  errorRate.add(!ok)

  if (res.status === 200) {
    const body = JSON.parse(res.body)
    if (body.cached) cacheHits.add(1)
  }

  sleep(Math.random() * 0.5 + 0.1)  // 100–600ms think time
}

export function handleSummary(data) {
  return {
    'results/search-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  }
}

function textSummary(data, opts) {
  const metrics = data.metrics
  const lines = [
    '\n── Search Load Test Summary ──────────────────────────────────',
    `  Total requests:   ${metrics.http_reqs?.values?.count ?? '?'}`,
    `  Request rate:     ${metrics.http_reqs?.values?.rate?.toFixed(2) ?? '?'} req/s`,
    `  p50 latency:      ${metrics.http_req_duration?.values?.['p(50)']?.toFixed(2) ?? '?'} ms`,
    `  p95 latency:      ${metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) ?? '?'} ms`,
    `  p99 latency:      ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(2) ?? '?'} ms`,
    `  Error rate:       ${((metrics.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%`,
    `  Cache hits:       ${metrics.cache_hits_total?.values?.count ?? 0}`,
    '────────────────────────────────────────────────────────────────\n',
  ]
  return lines.join('\n')
}
