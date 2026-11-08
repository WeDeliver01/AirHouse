import { forwardRef, useId } from 'react'
import { cn } from '../../lib/utils'

const Input = forwardRef(({
  id,
  className,
  type = 'text',
  label,
  error,
  helperText,
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
      <input
        id={controlId}
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
