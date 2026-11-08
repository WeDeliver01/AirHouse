import { forwardRef, useId } from 'react'
import { cn } from '../../lib/utils'

const Textarea = forwardRef(({
  id,
  className,
  label,
  error,
  helperText,
  rows = 4,
  ...props
}, ref) => {
  // Associate the label with the control so screen readers announce it
  // and so it can be found by its accessible name.
  const reactId = useId()
  const controlId = id || reactId
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={controlId} className="label">
          {label}
        </label>
      )}
      <textarea
        id={controlId}
        ref={ref}
        rows={rows}
        className={cn(
          'input resize-y min-h-[100px]',
          error && 'input-error',
          className
        )}
        {...props}
      />
      {(error || helperText) && (
        <p className={cn(
          'mt-1.5 text-xs',
          error ? 'text-danger' : 'text-text-secondary'
        )}>
          {error || helperText}
        </p>
      )}
    </div>
  )
})

Textarea.displayName = 'Textarea'

export default Textarea
