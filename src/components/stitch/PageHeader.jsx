import { cn } from '../../lib/utils'

/**
 * Stitch PageHeader — sits at the top of a content area to anchor the page.
 * `eyebrow` (label-md), `title` (headline-lg), `description` (body-md).
 * `actions` slot lives on the right on desktop, stacks below on mobile.
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  children,
  ...props
}) {
  return (
    <div
      className={cn(
        'flex flex-col md:flex-row md:items-end md:justify-between gap-md',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
            {eyebrow}
          </div>
        )}
        {title && (
          <h1 className="font-headline-lg text-headline-lg text-on-surface">{title}</h1>
        )}
        {description && (
          <p className="font-body-md text-body-md text-on-surface-variant mt-sm max-w-2xl">
            {description}
          </p>
        )}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-sm">{actions}</div>}
    </div>
  )
}
