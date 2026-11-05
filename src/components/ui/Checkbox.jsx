import { forwardRef } from 'react'
import { cn } from '../../lib/utils'
import { Check } from 'lucide-react'

const Checkbox = forwardRef(({
  className,
  label,
  description,
  checked,
  onChange,
  disabled = false,
  ...props
}, ref) => {
  return (
    <label className={cn(
      'flex items-start gap-3 cursor-pointer',
      disabled && 'opacity-50 cursor-not-allowed',
      className
    )}>
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only"
          {...props}
        />
        <div className={cn(
          'w-5 h-5 rounded border-2 transition-all flex items-center justify-center',
          checked 
            ? 'bg-primary border-primary' 
            : 'border-border bg-white hover:border-primary/50'
        )}>
          {checked && <Check className="w-3 h-3 text-white" />}
        </div>
      </div>
      {(label || description) && (
        <div>
          {label && (
            <span className="text-sm font-medium text-text-primary">
              {label}
            </span>
          )}
          {description && (
            <p className="text-xs text-text-secondary mt-0.5">
              {description}
            </p>
          )}
        </div>
      )}
    </label>
  )
})

Checkbox.displayName = 'Checkbox'

export default Checkbox
