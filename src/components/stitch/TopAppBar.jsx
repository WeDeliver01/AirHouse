import { cn } from '../../lib/utils'
import Icon from './Icon'

/**
 * Stitch TopAppBar — the sticky page header used across dashboards and
 * public pages. Frosted-white over surface, 1px outline-variant border below.
 */
export default function TopAppBar({
  title,
  leading,
  trailing,
  nav,
  sticky = true,
  className,
  ...props
}) {
  return (
    <header
      className={cn(
        sticky && 'sticky top-0 z-40',
        'flex items-center justify-between gap-md px-md py-sm',
        'bg-surface/85 backdrop-blur border-b border-outline-variant',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-md min-w-0">
        {leading}
        {title && (
          <span className="font-headline-md text-headline-md text-on-surface truncate">
            {title}
          </span>
        )}
        {nav && <nav className="hidden md:flex items-center gap-md">{nav}</nav>}
      </div>
      <div className="flex items-center gap-sm">{trailing}</div>
    </header>
  )
}

export function TopAppBarIconButton({ icon, label, onClick, className, ...props }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center w-9 h-9 rounded text-on-surface-variant',
        'hover:bg-surface-variant hover:text-on-surface transition-colors',
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={20} />
    </button>
  )
}
