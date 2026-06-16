import type { ReactNode } from 'react'

export default function OrgLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <span className="font-semibold text-lg">Lucid</span>
          <span className="text-muted-foreground text-sm">for Organizations</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto py-12 px-6">
        {children}
      </main>
    </div>
  )
}
