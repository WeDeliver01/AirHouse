import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const Textarea = forwardRef(({
  className,
  label,
  error,
  helperText,
  rows = 4,
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="label">
          {label}
        </label>
      )}
      <textarea
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
