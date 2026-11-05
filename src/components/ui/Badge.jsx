import { cn } from '../../lib/utils'

const Badge = ({ 
  className, 
  variant = 'primary', 
  children,
  ...props 
}) => {
  const variants = {
    primary: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    secondary: 'bg-gray-100 text-text-secondary',
  }

  return (
    <span
      className={cn(
        'badge',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export default Badge
