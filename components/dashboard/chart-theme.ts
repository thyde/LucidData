// Shared chart palette + category labels for the MyData-style dashboard widgets.
// Colors reference the theme's chart CSS variables defined in app/globals.css.

export const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
  'hsl(var(--muted-foreground))',
  'hsl(var(--secondary-foreground))',
]

export const CATEGORY_LABELS: Record<string, string> = {
  personal: 'Personal',
  health: 'Health',
  financial: 'Financial',
  credentials: 'Credentials',
  location: 'Location',
  interests: 'Interests',
  browsing: 'Browsing',
  other: 'Other',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category
}

export function colorForIndex(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]
}

/** Format a cents integer as a USD string. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}
