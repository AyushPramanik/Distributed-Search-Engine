import type { ClusterHealth, SearchResponse } from '@/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function search(
  query: string,
  page = 1,
  pageSize = 10,
  algorithm = 'bm25',
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    page_size: String(pageSize),
    algorithm,
  })
  const res = await fetch(`${BASE_URL}/api/search?${params}`, { cache: 'no-store' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Search failed: ${res.status}`)
  }
  return res.json()
}

export async function indexDocument(doc: {
  id: string
  title: string
  content: string
  metadata?: Record<string, string>
}) {
  const res = await fetch(`${BASE_URL}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...doc, timestamp: Date.now() }),
  })
  return res.json()
}

export async function deleteDocument(id: string) {
  const res = await fetch(`${BASE_URL}/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return res.json()
}

export async function getClusterHealth(): Promise<ClusterHealth> {
  const res = await fetch(`${BASE_URL}/api/health`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Health check failed')
  return res.json()
}
