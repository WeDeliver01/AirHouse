import { cn } from '../../lib/utils'
import Icon from './Icon'

/**
 * Stitch EmptyState — used inside cards/tables when there is no data yet.
 * Centered icon (in a tonal tile), short headline, supporting text, optional CTA.
 */
export default function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-md py-lg',
        className,
      )}
      {...props}
    >
      <span className="w-12 h-12 rounded bg-surface-container text-on-surface-variant inline-flex items-center justify-center mb-md">
        <Icon name={icon} size={24} />
      </span>
      {title && (
        <h3 className="font-headline-md text-headline-md text-on-surface">{title}</h3>
      )}
      {description && (
        <p className="font-body-md text-body-md text-on-surface-variant mt-xs max-w-md">
          {description}
        </p>
      )}
      {action && <div className="mt-md">{action}</div>}
    </div>
  )
}
