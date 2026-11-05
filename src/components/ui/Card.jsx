import { cn } from '../../lib/utils'

export function Card({ className, children, hover = false, glass = false, ...props }) {
  return (
    <div
      className={cn(
        'bg-white/95 backdrop-blur-sm border border-gray-100 rounded-2xl p-6 transition-all duration-200',
        hover && 'hover:shadow-lg hover:border-gray-200 cursor-pointer',
        glass && 'bg-white/80',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn('mb-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3 className={cn('text-lg font-semibold text-gray-900', className)} {...props}>
      {children}
    </h3>
  )
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p className={cn('text-sm text-gray-500 mt-1', className)} {...props}>
      {children}
    </p>
  )
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }) {
  return (
    <div className={cn('mt-4 pt-4 border-t border-gray-100', className)} {...props}>
      {children}
    </div>
  )
}

export default Card
