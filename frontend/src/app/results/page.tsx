'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { Search, ArrowLeft, Zap, Database, CheckCircle, Clock, Hash } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import { search } from '@/lib/api'
import type { SearchResponse } from '@/types'

function ResultCard({
  result,
  index,
}: {
  result: SearchResponse['results'][0]
  index: number
}) {
  return (
    <div
      className="group border border-surface-3 rounded-xl p-5 bg-surface-1 hover:border-surface-4 hover:bg-surface-2 transition-all animate-slide-up"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-muted">#{index + 1}</span>
            {result.shard_id && (
              <span className="text-xs font-mono text-accent-indigo/70 bg-accent-indigo/10 px-1.5 py-0.5 rounded">
                {result.shard_id}
              </span>
            )}
          </div>
          <h3 className="font-medium text-slate-200 text-sm mb-2 leading-snug group-hover:text-white transition-colors">
            {result.title || result.id}
          </h3>
          {result.snippet && (
            <p className="text-xs text-muted leading-relaxed line-clamp-3">
              {result.snippet}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="text-xs font-mono text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/20 px-2 py-1 rounded-md">
            {result.score.toFixed(4)}
          </div>
          <span className="text-xs text-muted">score</span>
        </div>
      </div>
    </div>
  )
}

function ResultsMeta({ resp, latencyMs }: { resp: SearchResponse; latencyMs: number }) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted flex-wrap">
      <span className="flex items-center gap-1.5">
        <Hash size={12} />
        {resp.total_hits} results
      </span>
      <span className="flex items-center gap-1.5">
        <Clock size={12} />
        {latencyMs}ms
      </span>
      <span className="flex items-center gap-1.5">
        <Database size={12} />
        {resp.shards_queried} shard{resp.shards_queried !== 1 ? 's' : ''}
        {resp.shards_failed > 0 && (
          <span className="text-accent-rose">({resp.shards_failed} failed)</span>
        )}
      </span>
      {resp.cached && (
        <span className="flex items-center gap-1.5 text-accent-cyan">
          <Zap size={12} />
          cached
        </span>
      )}
    </div>
  )
}

function ResultsContent() {
  const sp = useSearchParams()
  const router = useRouter()
  const query = sp.get('q') ?? ''
  const algorithm = (sp.get('algorithm') ?? 'bm25') as 'bm25' | 'tfidf'
  const page = parseInt(sp.get('page') ?? '1', 10)

  const [resp, setResp] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState(query)
  const [latencyMs, setLatencyMs] = useState(0)

  const doSearch = useCallback(async () => {
    if (!query) return
    setLoading(true)
    setError(null)
    const t0 = performance.now()
    try {
      const r = await search(query, page, 10, algorithm)
      setLatencyMs(Math.round(performance.now() - t0))
      setResp(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [query, page, algorithm])

  useEffect(() => { doSearch() }, [doSearch])
  useEffect(() => { setSearchInput(query) }, [query])

  const navigate = (q: string, alg: string, pg: number) => {
    const params = new URLSearchParams({ q, algorithm: alg, page: String(pg) })
    router.push(`/results?${params}`)
  }

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Search header */}
      <header className="sticky top-0 z-10 border-b border-surface-3 bg-surface-0/90 backdrop-blur-sm px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href="/" className="text-muted hover:text-slate-200 transition-colors">
            <ArrowLeft size={18} />
          </Link>

          <div className="flex-1 relative group flex items-center border border-surface-4 group-focus-within:border-accent-blue/50 rounded-lg transition-colors bg-surface-1">
            <Search size={14} className="ml-3 text-muted flex-shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') navigate(searchInput.trim(), algorithm, 1)
              }}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-200 placeholder-muted focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            {(['bm25', 'tfidf'] as const).map(alg => (
              <button
                key={alg}
                onClick={() => navigate(query, alg, 1)}
                className={clsx(
                  'px-2.5 py-1 rounded text-xs font-mono transition-colors',
                  algorithm === alg
                    ? 'bg-accent-blue/20 text-accent-blue'
                    : 'text-muted hover:text-slate-300',
                )}
              >
                {alg.toUpperCase()}
              </button>
            ))}
          </div>

          <Link href="/dashboard" className="text-muted hover:text-slate-200 transition-colors text-sm">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {loading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="border border-surface-3 rounded-xl p-5 bg-surface-1 animate-pulse">
                <div className="h-3 bg-surface-3 rounded w-1/4 mb-3" />
                <div className="h-4 bg-surface-3 rounded w-3/4 mb-2" />
                <div className="h-3 bg-surface-3 rounded w-full" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="border border-accent-rose/30 rounded-xl p-5 bg-accent-rose/10 text-accent-rose text-sm">
            {error}
          </div>
        )}

        {!loading && !error && resp && (
          <div className="flex flex-col gap-6">
            <ResultsMeta resp={resp} latencyMs={latencyMs} />

            {resp.results.length === 0 ? (
              <div className="text-center py-16 text-muted">
                <Search size={32} className="mx-auto mb-4 opacity-30" />
                <p>No results for <span className="text-slate-400">"{query}"</span></p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {resp.results.map((r, i) => (
                  <ResultCard key={r.id} result={r} index={i + (page - 1) * 10} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {resp.total_hits > 10 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  onClick={() => navigate(query, algorithm, page - 1)}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-lg border border-surface-4 text-sm text-muted hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs text-muted font-mono">page {page}</span>
                <button
                  onClick={() => navigate(query, algorithm, page + 1)}
                  disabled={resp.results.length < 10}
                  className="px-4 py-2 rounded-lg border border-surface-4 text-sm text-muted hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsContent />
    </Suspense>
  )
}
