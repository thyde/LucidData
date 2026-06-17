'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { categoryLabel, colorForIndex, formatCents } from '@/components/dashboard/chart-theme'

interface RevenueDonutProps {
  byCategory: { category: string; cents: number }[]
  earnedThisMonthCents: number
}

export function RevenueDonut({ byCategory, earnedThisMonthCents }: RevenueDonutProps) {
  const data = byCategory
    .filter((d) => d.cents > 0)
    .map((d) => ({ name: categoryLabel(d.category), value: d.cents }))

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-40 w-40 shrink-0">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={colorForIndex(i)} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatCents(Number(value))}
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
          <span className="text-lg font-bold">{formatCents(earnedThisMonthCents)}</span>
          <span className="text-[10px] text-muted-foreground">this month</span>
        </div>
      </div>

      <ul className="flex-1 space-y-1 text-sm">
        {data.length === 0 && (
          <li className="text-muted-foreground">No earnings yet. Opt data in to start earning.</li>
        )}
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorForIndex(i) }} />
              {d.name}
            </span>
            <span className="font-medium">{formatCents(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
