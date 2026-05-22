import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate } from 'k6/metrics'

const indexErrors = new Counter('index_errors_total')
const errorRate   = new Rate('error_rate')

export const options = {
  stages: [
    { duration: '10s', target: 20  },
    { duration: '30s', target: 100 },
    { duration: '20s', target: 0   },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    error_rate:        ['rate<0.05'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001'

const WORDS = [
  'distributed', 'search', 'index', 'shard', 'replica', 'consensus', 'leader',
  'follower', 'election', 'partition', 'network', 'latency', 'throughput',
  'inverted', 'posting', 'scoring', 'ranking', 'tokenize', 'stemming',
  'cache', 'redis', 'bloom', 'filter', 'skip', 'list', 'compression',
]

function randomWords(n = 8) {
  const result = []
  for (let i = 0; i < n; i++) {
    result.push(WORDS[Math.floor(Math.random() * WORDS.length)])
  }
  return result.join(' ')
}

function randomId() {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function () {
  const doc = {
    id:      randomId(),
    title:   `Article on ${randomWords(3)}`,
    content: Array.from({ length: 5 }, () => randomWords(15)).join('. ') + '.',
    metadata: {
      source: 'load-test',
      category: WORDS[Math.floor(Math.random() * WORDS.length)],
    },
    timestamp: Date.now(),
  }

  const res = http.post(`${BASE_URL}/api/documents`, JSON.stringify(doc), {
    headers: { 'Content-Type': 'application/json' },
    tags:    { operation: 'index' },
  })

  const ok = check(res, {
    'status 201': r => r.status === 201,
    'success true': r => {
      try { return JSON.parse(r.body).success === true } catch { return false }
    },
  })

  errorRate.add(!ok)
  if (!ok) indexErrors.add(1)

  sleep(Math.random() * 0.2 + 0.05)
}
