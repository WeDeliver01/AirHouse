import { cn } from '../../lib/utils'
import Button from './Button'

const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
    >
      {Icon && (
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-text-secondary" />
        </div>
      )}
      {title && (
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          {title}
        </h3>
      )}
      {description && (
        <p className="text-sm text-text-secondary max-w-sm mb-4">
          {description}
        </p>
      )}
      {action && actionLabel && (
        <Button onClick={action} variant="primary">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

export default EmptyState
