import { cn } from '../../lib/utils'

const StatCard = ({ 
  label, 
  value, 
  className,
  trend,
  trendValue,
  icon: Icon,
  ...props 
}) => {
  return (
    <div
      className={cn('stat-card', className)}
      {...props}
    >
      <div className="relative z-10">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center mb-3">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
        <p className="text-sm text-text-secondary mb-1">{label}</p>
        <p className="text-3xl font-bold text-text-primary">{value}</p>
        {trend && (
          <p className={cn(
            'text-xs mt-2 font-medium',
            trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-text-secondary'
          )}>
            {trend === 'up' && '↑ '}
            {trend === 'down' && '↓ '}
            {trendValue}
          </p>
        )}
      </div>
    </div>
  )
}

export default StatCard
