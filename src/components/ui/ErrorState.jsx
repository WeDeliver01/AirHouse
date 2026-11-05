import { cn } from '../../lib/utils'
import Button from './Button'
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react'

const ErrorState = ({
  title = 'Something went wrong',
  message = 'We couldn\'t load this page. Please try again.',
  onRetry,
  retryLabel = 'Try Again',
  icon: CustomIcon,
  variant = 'default',
  className,
}) => {
  const Icon = CustomIcon || (variant === 'network' ? WifiOff : AlertTriangle)

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4 text-center',
        className
      )}
    >
      <div className={cn(
        'w-16 h-16 rounded-full flex items-center justify-center mb-4',
        variant === 'network' ? 'bg-amber-50' : 'bg-red-50'
      )}>
        <Icon className={cn(
          'w-8 h-8',
          variant === 'network' ? 'text-amber-500' : 'text-red-400'
        )} />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title}
      </h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6">
        {message}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

export default ErrorState
