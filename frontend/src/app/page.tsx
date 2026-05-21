'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Zap, Database, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'

const SUGGESTIONS = [
  'distributed systems',
  'inverted index',
  'consensus algorithms',
  'log-structured merge tree',
  'consistent hashing',
  'vector clocks',
  'bloom filters',
  'skip lists',
]

export default function HomePage() {
  const [query, setQuery] = useState('')
  const [algorithm, setAlgorithm] = useState<'bm25' | 'tfidf'>('bm25')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleSearch = useCallback(() => {
    const q = query.trim()
    if (!q) return
    const params = new URLSearchParams({ q, algorithm })
    router.push(`/results?${params}`)
  }, [query, algorithm, router])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 flex items-center justify-between px-8 py-4 border-b border-surface-3 bg-surface-0/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-accent-blue" />
          <span className="font-mono font-medium text-sm text-slate-300">
            distributed-search
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm text-muted hover:text-slate-200 transition-colors flex items-center gap-1.5">
            <LayoutDashboard size={14} />
            Dashboard
          </Link>
          <a
            href="https://github.com/ayushpramanik/distributed-search-engine"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted hover:text-slate-200 transition-colors"
          >
            GitHub
          </a>
        </div>
      </nav>

      {/* Hero */}
      <div className="w-full max-w-2xl flex flex-col items-center gap-10 animate-fade-in">
        <div className="text-center flex flex-col gap-3">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
              <Search size={20} className="text-accent-blue" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-100">
            Distributed Search
          </h1>
          <p className="text-muted text-base max-w-sm mx-auto leading-relaxed">
            Full-text search across a sharded cluster with BM25 ranking, Redis caching, and live observability.
          </p>
        </div>

        {/* Search bar */}
        <div className="w-full flex flex-col gap-3">
          <div className="relative group">
            <div className="absolute inset-0 rounded-xl bg-accent-blue/5 group-focus-within:bg-accent-blue/10 transition-colors pointer-events-none" />
            <div className="relative flex items-center border border-surface-4 group-focus-within:border-accent-blue/50 rounded-xl transition-colors bg-surface-1">
              <Search size={16} className="ml-4 text-muted flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search documents..."
                autoFocus
                className="flex-1 bg-transparent px-3 py-3.5 text-slate-200 placeholder-muted focus:outline-none text-sm"
              />
              <button
                onClick={handleSearch}
                disabled={!query.trim()}
                className="mr-2 px-4 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Search
              </button>
            </div>
          </div>

          {/* Algorithm toggle */}
          <div className="flex items-center gap-3 justify-end">
            <span className="text-xs text-muted">Ranking:</span>
            {(['bm25', 'tfidf'] as const).map(alg => (
              <button
                key={alg}
                onClick={() => setAlgorithm(alg)}
                className={clsx(
                  'px-3 py-1 rounded-md text-xs font-mono transition-colors',
                  algorithm === alg
                    ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                    : 'text-muted hover:text-slate-300 border border-transparent',
                )}
              >
                {alg.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Suggestions */}
        <div className="w-full">
          <p className="text-xs text-muted mb-3 text-center">Try searching for</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => {
                  setQuery(s)
                  const params = new URLSearchParams({ q: s, algorithm })
                  router.push(`/results?${params}`)
                }}
                className="px-3 py-1.5 rounded-full text-xs bg-surface-2 border border-surface-4 text-muted hover:text-slate-200 hover:border-surface-4/80 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-8 text-center">
          {[
            { icon: Database, label: 'Shards', value: '3 nodes' },
            { icon: Zap, label: 'Algorithm', value: 'BM25 / TF-IDF' },
            { icon: Search, label: 'Cache', value: 'Redis LRU' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <Icon size={14} className="text-accent-blue/70" />
              <span className="text-xs text-muted">{label}</span>
              <span className="text-xs font-mono text-slate-400">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
