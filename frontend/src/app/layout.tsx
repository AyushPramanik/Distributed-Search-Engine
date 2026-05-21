import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Distributed Search Engine',
  description: 'High-performance distributed full-text search infrastructure',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-surface-0 text-slate-200 min-h-screen">
        {children}
      </body>
    </html>
  )
}
