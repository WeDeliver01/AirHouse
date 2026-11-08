import { cn } from '../../lib/utils'
import Icon from './Icon'

/**
 * Stitch MetricCard — a single KPI/data tile.
 * `label` (label-md, on-surface-variant) over `value` (headline-lg, on-surface)
 * with an optional helper line and trend chip (positive / negative / neutral).
 */
export default function MetricCard({
  label,
  value,
  helper,
  trend,
  trendDirection = 'neutral',
  icon,
  className,
  ...props
}) {
  const trendStyles = {
    positive: 'text-secondary',
    negative: 'text-error',
    neutral: 'text-on-surface-variant',
  }
  const trendIcon = {
    positive: 'trending_up',
    negative: 'trending_down',
    neutral: 'trending_flat',
  }
  return (
    <div
      className={cn(
        'bg-surface border border-outline-variant rounded p-md flex flex-col gap-sm',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        {icon && (
          <span className="w-8 h-8 rounded bg-primary-container/20 text-primary inline-flex items-center justify-center">
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>

      <div className="font-headline-lg text-headline-lg text-on-surface">{value}</div>

      {(helper || trend) && (
        <div className="flex items-center gap-sm">
          {trend && (
            <span
              className={cn(
                'inline-flex items-center gap-xs font-label-md text-label-md',
                trendStyles[trendDirection],
              )}
            >
              <Icon name={trendIcon[trendDirection]} size={14} />
              {trend}
            </span>
          )}
          {helper && (
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {helper}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
