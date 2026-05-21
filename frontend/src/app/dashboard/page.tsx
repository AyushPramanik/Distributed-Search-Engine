'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import { Search, ArrowLeft, RefreshCw, CheckCircle, XCircle, Database, Zap, Activity } from 'lucide-react'
import { getClusterHealth } from '@/lib/api'
import type { ClusterHealth, MetricPoint } from '@/types'
import clsx from 'clsx'

// ── Metric card ────────────────────────────────────────────────────────────────

function MetricCard({
  label, value, subtext, accent = 'blue',
}: {
  label: string
  value: string | number
  subtext?: string
  accent?: 'blue' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'indigo'
}) {
  const colors = {
    blue:    'text-accent-blue   bg-accent-blue/10   border-accent-blue/20',
    emerald: 'text-accent-emerald bg-accent-emerald/10 border-accent-emerald/20',
    amber:   'text-accent-amber  bg-accent-amber/10  border-accent-amber/20',
    rose:    'text-accent-rose   bg-accent-rose/10   border-accent-rose/20',
    cyan:    'text-accent-cyan   bg-accent-cyan/10   border-accent-cyan/20',
    indigo:  'text-accent-indigo bg-accent-indigo/10 border-accent-indigo/20',
  }
  return (
    <div className="rounded-xl border border-surface-3 bg-surface-1 p-5">
      <p className="text-xs text-muted mb-2">{label}</p>
      <p className={clsx('text-2xl font-bold font-mono', colors[accent].split(' ')[0])}>
        {value}
      </p>
      {subtext && <p className="text-xs text-muted mt-1">{subtext}</p>}
    </div>
  )
}

// ── Shard health card ──────────────────────────────────────────────────────────

function ShardCard({ shard }: { shard: ClusterHealth['shards'][0] }) {
  return (
    <div className={clsx(
      'rounded-xl border p-4 transition-all',
      shard.healthy
        ? 'border-accent-emerald/20 bg-accent-emerald/5'
        : 'border-accent-rose/20 bg-accent-rose/5',
    )}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-mono font-medium">{shard.shard_id}</span>
        {shard.healthy
          ? <CheckCircle size={16} className="text-accent-emerald" />
          : <XCircle    size={16} className="text-accent-rose" />}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
        <div>
          <p className="text-slate-400 font-mono">{shard.document_count.toLocaleString()}</p>
          <p>documents</p>
        </div>
        <div>
          <p className="text-slate-400 font-mono">{shard.latency_us ? `${(shard.latency_us / 1000).toFixed(1)}ms` : '—'}</p>
          <p>latency</p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted">health</span>
          <span className={shard.healthy ? 'text-accent-emerald' : 'text-accent-rose'}>
            {shard.healthy ? 'online' : 'degraded'}
          </span>
        </div>
        <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all', shard.healthy ? 'bg-accent-emerald' : 'bg-accent-rose')}
            style={{ width: shard.healthy ? '100%' : '20%' }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Topology visualization ─────────────────────────────────────────────────────

function ClusterTopology({ shards }: { shards: ClusterHealth['shards'] }) {
  return (
    <div className="rounded-xl border border-surface-3 bg-surface-1 p-5">
      <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
        <Activity size={14} className="text-accent-blue" />
        Cluster Topology
      </h3>
      <div className="relative flex items-center justify-center gap-0 py-4">
        {/* Client */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-14 h-14 rounded-xl bg-surface-2 border border-surface-4 flex items-center justify-center">
            <Search size={18} className="text-accent-blue" />
          </div>
          <span className="text-xs text-muted font-mono">client</span>
        </div>

        <div className="w-8 h-0.5 bg-surface-4" />

        {/* Gateway */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-14 h-14 rounded-xl bg-surface-2 border border-accent-blue/30 flex items-center justify-center">
            <Zap size={18} className="text-accent-blue" />
          </div>
          <span className="text-xs text-muted font-mono">gateway</span>
        </div>

        <div className="w-8 h-0.5 bg-surface-4" />

        {/* Coordinator */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-14 h-14 rounded-xl bg-surface-2 border border-accent-indigo/30 flex items-center justify-center">
            <Activity size={18} className="text-accent-indigo" />
          </div>
          <span className="text-xs text-muted font-mono">coordinator</span>
        </div>

        <div className="flex flex-col items-center mx-4">
          {shards.map((_, i) => (
            <div key={i} className="w-8 h-0.5 bg-surface-4 my-3.5" />
          ))}
        </div>

        {/* Shard nodes */}
        <div className="flex flex-col gap-3">
          {shards.map(s => (
            <div key={s.shard_id} className="flex flex-col items-center gap-1">
              <div className={clsx(
                'w-14 h-12 rounded-xl border flex items-center justify-center',
                s.healthy
                  ? 'bg-accent-emerald/5 border-accent-emerald/30'
                  : 'bg-accent-rose/5 border-accent-rose/30',
              )}>
                <Database size={16} className={s.healthy ? 'text-accent-emerald' : 'text-accent-rose'} />
              </div>
              <span className="text-xs text-muted font-mono">{s.shard_id}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

function generateTimeSeries(n = 20): MetricPoint[] {
  const now = Date.now()
  return Array.from({ length: n }, (_, i) => ({
    time: new Date(now - (n - i) * 3000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    value: Math.round(Math.random() * 30 + 10),
  }))
}

export default function DashboardPage() {
  const [health, setHealth] = useState<ClusterHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [latencySeries, setLatencySeries] = useState<MetricPoint[]>(() => generateTimeSeries())
  const [qpsSeries, setQpsSeries] = useState<MetricPoint[]>(() => generateTimeSeries())

  const refresh = useCallback(async () => {
    try {
      const h = await getClusterHealth()
      setHealth(h)
    } catch {
      // keep stale data
    } finally {
      setLoading(false)
      setLastUpdate(new Date())
    }
    // Simulate rolling metric data
    setLatencySeries(prev => [...prev.slice(1), {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      value: Math.round(Math.random() * 25 + 5),
    }])
    setQpsSeries(prev => [...prev.slice(1), {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      value: Math.round(Math.random() * 800 + 200),
    }])
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  const totalDocs = health?.shards.reduce((s, sh) => s + sh.document_count, 0) ?? 0
  const avgLatency = latencySeries.reduce((s, p) => s + p.value, 0) / latencySeries.length
  const avgQps = qpsSeries.reduce((s, p) => s + p.value, 0) / qpsSeries.length

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-surface-3 bg-surface-0/90 backdrop-blur-sm px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-muted hover:text-slate-200 transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-slate-200">Cluster Dashboard</h1>
              <p className="text-xs text-muted">
                Updated {lastUpdate.toLocaleTimeString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={clsx(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border',
              health?.healthy
                ? 'text-accent-emerald border-accent-emerald/30 bg-accent-emerald/10'
                : 'text-accent-rose border-accent-rose/30 bg-accent-rose/10',
            )}>
              <span className={clsx('w-1.5 h-1.5 rounded-full', health?.healthy ? 'bg-accent-emerald' : 'bg-accent-rose')} />
              {health?.healthy ? 'Cluster healthy' : 'Degraded'}
            </div>
            <button
              onClick={refresh}
              className="p-2 rounded-lg text-muted hover:text-slate-200 hover:bg-surface-2 transition-all"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Top metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Total Documents" value={totalDocs.toLocaleString()} accent="blue" />
          <MetricCard label="Avg Latency" value={`${avgLatency.toFixed(1)}ms`} subtext="p50 estimate" accent="cyan" />
          <MetricCard label="Avg QPS" value={Math.round(avgQps).toLocaleString()} subtext="last 60s" accent="indigo" />
          <MetricCard
            label="Cluster Health"
            value={loading ? '—' : `${health?.healthy_shards ?? 0}/${health?.total_shards ?? 0}`}
            subtext="shards healthy"
            accent={health?.healthy ? 'emerald' : 'rose'}
          />
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-surface-3 bg-surface-1 p-5">
            <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
              <Activity size={14} className="text-accent-cyan" />
              Search Latency (ms)
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={latencySeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e28" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip
                  contentStyle={{ background: '#18181f', border: '1px solid #25252f', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Area type="monotone" dataKey="value" stroke="#2dd4bf" strokeWidth={2} fill="url(#latencyGrad)" name="latency ms" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-surface-3 bg-surface-1 p-5">
            <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
              <Zap size={14} className="text-accent-indigo" />
              Query Throughput (QPS)
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={qpsSeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="qpsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c6ef7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7c6ef7" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e28" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip
                  contentStyle={{ background: '#18181f', border: '1px solid #25252f', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Area type="monotone" dataKey="value" stroke="#7c6ef7" strokeWidth={2} fill="url(#qpsGrad)" name="QPS" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Shards */}
        {health && (
          <>
            <div className="grid md:grid-cols-3 gap-4">
              {health.shards.map(s => <ShardCard key={s.shard_id} shard={s} />)}
            </div>
            <ClusterTopology shards={health.shards} />
          </>
        )}

        {/* Doc count bar chart per shard */}
        {health && health.shards.length > 0 && (
          <div className="rounded-xl border border-surface-3 bg-surface-1 p-5">
            <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
              <Database size={14} className="text-accent-blue" />
              Document Distribution
            </h3>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={health.shards.map(s => ({ name: s.shard_id, docs: s.document_count }))} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e28" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip
                  contentStyle={{ background: '#18181f', border: '1px solid #25252f', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="docs" radius={[4, 4, 0, 0]}>
                  {health.shards.map((_, i) => (
                    <Cell key={i} fill={['#4f8ef7', '#7c6ef7', '#2dd4bf'][i % 3]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </main>
    </div>
  )
}
