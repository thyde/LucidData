import { cn } from '@/lib/utils'

/**
 * LucidData brand mark: a database/equalizer motif (stacked bars) rendered in the
 * primary brand color. Inspired by the MyData data-bars logo, kept on the LucidData
 * blue palette.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-7 w-7 text-primary', className)}
      aria-hidden="true"
    >
      <rect x="3" y="14" width="3.4" height="15" rx="1.7" fill="currentColor" />
      <rect x="9" y="9" width="3.4" height="20" rx="1.7" fill="currentColor" opacity="0.85" />
      <rect x="15" y="3" width="3.4" height="26" rx="1.7" fill="currentColor" />
      <rect x="21" y="9" width="3.4" height="20" rx="1.7" fill="currentColor" opacity="0.85" />
      <rect x="27" y="14" width="3.4" height="15" rx="1.7" fill="currentColor" />
    </svg>
  )
}

export function Logo({ className, hideWordmark }: { className?: string; hideWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold', className)}>
      <LogoMark />
      {!hideWordmark && <span className="text-xl tracking-tight">LucidData</span>}
    </span>
  )
}
