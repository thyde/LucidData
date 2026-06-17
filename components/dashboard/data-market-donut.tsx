'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { categoryLabel, colorForIndex } from '@/components/dashboard/chart-theme'
import type { CategoryCount } from '@/lib/services/data-insights.service'

export function DataMarketDonut({ data }: { data: CategoryCount[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  const chartData = data.map((d) => ({ name: categoryLabel(d.category), value: d.count }))

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-40 w-40 shrink-0">
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={2}
                strokeWidth={0}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={colorForIndex(i)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full border-8 border-muted" />
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold">{total}</span>
          <span className="text-[10px] text-muted-foreground">data points</span>
        </div>
      </div>

      <ul className="flex-1 space-y-1 text-sm">
        {total === 0 && <li className="text-muted-foreground">Add vault data to see your data market.</li>}
        {chartData.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorForIndex(i) }} />
              {d.name}
            </span>
            <span className="font-medium">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
