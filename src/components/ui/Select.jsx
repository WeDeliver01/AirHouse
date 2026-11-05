import { forwardRef } from 'react'
import { cn } from '../../lib/utils'
import { ChevronDown } from 'lucide-react'

const Select = forwardRef(({
  className,
  label,
  error,
  helperText,
  options = [],
  placeholder = 'Select an option',
  children,
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            'appearance-none cursor-pointer pr-10',
            'transition-all duration-200',
            error && 'border-red-500 focus:ring-red-200 focus:border-red-500',
            className
          )}
          style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
          {...props}
        >
          {children ? (
            children
          ) : (
            <>
              <option value="" disabled>
                {placeholder}
              </option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </>
          )}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
      </div>
      {(error || helperText) && (
        <p className={cn(
          'mt-1.5 text-xs',
          error ? 'text-red-500' : 'text-gray-500'
        )}>
          {error || helperText}
        </p>
      )}
    </div>
  )
})

Select.displayName = 'Select'

export default Select
