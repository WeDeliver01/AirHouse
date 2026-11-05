import { cn } from '../../lib/utils'
import Icon from './Icon'

/**
 * Stitch Chip — small, non-rounded rectangle for status, tags, filters.
 * Per DESIGN.md: light tint of the status color, darker text variant.
 */
const TONES = {
  neutral:   'bg-surface-variant text-on-surface-variant',
  primary:   'bg-primary-container/20 text-primary',
  secondary: 'bg-secondary-container text-on-secondary-container',
  tertiary:  'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  success:   'bg-secondary-container text-on-secondary-container',
  warning:   'bg-error-container text-on-error-container',
  danger:    'bg-error-container text-on-error-container',
}

export default function Chip({
  children,
  tone = 'neutral',
  icon,
  onRemove,
  className,
  ...props
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-xs px-sm py-xs rounded font-label-md text-label-md',
        TONES[tone] || TONES.neutral,
        className,
      )}
      {...props}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center justify-center hover:opacity-70"
          aria-label="Remove"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </span>
  )
}
