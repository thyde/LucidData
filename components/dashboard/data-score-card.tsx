'use client'

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts'
import type { DataScore } from '@/lib/services/data-insights.service'

export function DataScoreCard({ score }: { score: DataScore }) {
  const data = [{ name: 'score', value: score.score, fill: 'hsl(var(--primary))' }]

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-32 w-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="72%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: 'hsl(var(--muted))' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{score.score}</span>
          <span className="text-[10px] text-muted-foreground">data score</span>
        </div>
      </div>

      <div className="flex-1 space-y-1 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{score.completeness}%</span> profile complete
        </p>
        <p>
          <span className="font-medium text-foreground">{score.vaultEntries}</span> vault entries
        </p>
        <p>
          <span className="font-medium text-foreground">{score.optedInFields}</span> fields opted in to sell
        </p>
        <p>
          <span className="font-medium text-foreground">
            {score.categoriesCovered}/{score.totalCategories}
          </span>{' '}
          categories covered
        </p>
      </div>
    </div>
  )
}
