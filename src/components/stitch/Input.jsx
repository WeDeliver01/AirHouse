import { forwardRef, useId } from 'react'
import { cn } from '../../lib/utils'

/**
 * Stitch Input — high-trust text field. Always-visible label above the field
 * (label-md), 1px outline that thickens to primary on focus, sharp 4px corners.
 * Wrapper around the native <input> element so existing form code keeps working.
 */
const Input = forwardRef(function Input(
  { className, label, error, helperText, id, type = 'text', ...props },
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
      <input
        id={inputId}
        ref={ref}
        type={type}
        className={cn(
          'w-full bg-surface-container-lowest text-on-surface px-sm py-sm rounded',
          'border font-body-md text-body-md transition-colors',
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

export default Input
