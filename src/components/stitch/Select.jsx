import { forwardRef, useId } from 'react'
import { cn } from '../../lib/utils'
import Icon from './Icon'

/**
 * Stitch Select — wraps the native <select> with the Stitch field skin.
 * Pass `options` ([{ value, label }]) or render <option> children directly.
 */
const Select = forwardRef(function Select(
  {
    className,
    label,
    error,
    helperText,
    placeholder,
    options,
    children,
    id,
    ...props
  },
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
      <div className="relative">
        <select
          id={inputId}
          ref={ref}
          className={cn(
            'w-full appearance-none bg-surface-container-lowest text-on-surface',
            'px-sm pr-9 py-sm rounded border font-body-md text-body-md transition-colors',
            'focus:outline-none focus:ring-0',
            error
              ? 'border-error focus:border-error'
              : 'border-outline-variant focus:border-primary',
            className,
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <Icon
          name="expand_more"
          size={18}
          className="pointer-events-none absolute right-sm top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
      </div>
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

export default Select
