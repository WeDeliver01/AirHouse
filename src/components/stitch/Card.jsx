import { cn } from '../../lib/utils'

/**
 * Stitch Card — the primary surface for property listings, dashboards, and
 * data modules. 1px outline-variant border, 4px corner radius, no shadow by
 * default. Set `elevated` to add the canonical `.ambient-shadow`.
 */
export default function Card({
  className,
  children,
  elevated = false,
  padding = 'md',
  as: Tag = 'div',
  ...props
}) {
  const padMap = {
    none: '',
    sm: 'p-sm',
    md: 'p-md',
    lg: 'p-lg',
  }
  return (
    <Tag
      className={cn(
        'bg-surface border border-outline-variant rounded',
        padMap[padding] ?? padMap.md,
        elevated && 'ambient-shadow',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn('mb-md', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3
      className={cn('font-headline-md text-headline-md text-on-surface', className)}
      {...props}
    >
      {children}
    </h3>
  )
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p
      className={cn('font-body-sm text-body-sm text-on-surface-variant mt-xs', className)}
      {...props}
    >
      {children}
    </p>
  )
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('font-body-md text-body-md text-on-surface', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }) {
  return (
    <div
      className={cn('mt-md pt-md border-t border-outline-variant', className)}
      {...props}
    >
      {children}
    </div>
  )
}
