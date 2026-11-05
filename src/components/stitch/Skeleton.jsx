import { cn } from '../../lib/utils'

/**
 * Stitch Skeleton — neutral placeholder block used during loading states.
 * Uses surface-container-high so it sits a single tonal layer above the page.
 */
export default function Skeleton({ className, rounded = true, ...props }) {
  return (
    <div
      className={cn(
        'animate-pulse-soft bg-surface-container-high',
        rounded && 'rounded',
        className,
      )}
      {...props}
    />
  )
}

export function SkeletonText({ lines = 3, className, ...props }) {
  return (
    <div className={cn('space-y-sm', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}
