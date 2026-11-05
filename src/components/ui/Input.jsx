import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const Input = forwardRef(({
  className,
  type = 'text',
  label,
  error,
  helperText,
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="label">
          {label}
        </label>
      )}
      <input
        type={type}
        ref={ref}
        className={cn(
          'input',
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

Input.displayName = 'Input'

export default Input
