import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

const LoadingSpinner = ({
  size = 'default',
  className,
  text,
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    default: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  }

  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <Loader2 className={cn('animate-spin text-primary', sizes[size])} />
      {text && (
        <p className="mt-2 text-sm text-text-secondary">{text}</p>
      )}
    </div>
  )
}

export const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <LoadingSpinner size="lg" text="Loading..." />
  </div>
)

export default LoadingSpinner
