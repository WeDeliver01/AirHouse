import { forwardRef, useId } from 'react'
import { cn } from '../../lib/utils'

/**
 * Stitch Textarea — same visual treatment as Stitch Input, but for multi-line.
 */
const Textarea = forwardRef(function Textarea(
  { className, label, error, helperText, rows = 4, id, ...props },
  ref,
) {
  const reactId = useId()
  const inputId = id || reactId
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs"
        >
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        ref={ref}
        rows={rows}
        className={cn(
          'w-full bg-surface-container-lowest text-on-surface px-sm py-sm rounded',
          'border font-body-md text-body-md transition-colors resize-y',
          'placeholder:text-on-surface-variant/60',
          'focus:outline-none focus:ring-0',
          error
            ? 'border-error focus:border-error'
            : 'border-outline-variant focus:border-primary',
          className,
        )}
        {...props}
      />
      {(error || helperText) && (
        <p
          className={cn(
            'mt-xs font-body-sm text-body-sm',
            error ? 'text-error' : 'text-on-surface-variant',
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  )
})

export default Textarea
