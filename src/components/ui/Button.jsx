import { forwardRef } from 'react'
import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

const Button = forwardRef(({
  className,
  variant = 'primary',
  size = 'default',
  isLoading = false,
  disabled,
  children,
  ...props
}, ref) => {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'bg-transparent border-transparent hover:bg-gray-100',
    link: 'bg-transparent border-transparent text-primary hover:underline p-0',
  }

  const sizes = {
    sm: 'btn-sm',
    default: '',
    lg: 'btn-lg',
  }

  return (
    <button
      ref={ref}
      className={cn(
        'btn',
        variants[variant],
        sizes[size],
        isLoading && 'opacity-70 cursor-wait',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      )}
      {children}
    </button>
  )
})

Button.displayName = 'Button'

export default Button
