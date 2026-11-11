import { cn } from '../../lib/utils'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

// Sparkline Chart
export const SparklineChart = ({ data, color = '#d2f9f0', height = 40 }) => {
  if (!data || data.length < 2) return null
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const points = data.map((val, i) => `${(i / (data.length - 1)) * 100},${100 - ((val - min) / range) * 100}`).join(' ')
  const id = `spark-${Math.random().toString(36).slice(2)}`
  return (
    <svg viewBox="0 0 100 100" className="w-full" style={{ height }} preserveAspectRatio="none">
      
      <polygon points={`0,100 ${points} 100,100`} fill={color} fillOpacity="0.15" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

// Donut/Ring Chart
export const DonutChart = ({ value, max = 100, size = 120, strokeWidth = 12, color = '#d2f9f0', label }) => {
  const r = (size - strokeWidth) / 2, c = 2 * Math.PI * r, p = (value / max) * c
  const percent = Math.round((value / max) * 100)
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} 
            strokeDasharray={c} strokeDashoffset={c - p} strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold">{percent}%</span>
        </div>
      </div>
      {label && <p className="text-sm text-gray-500 mt-2">{label}</p>}
    </div>
  )
}

// Bar Chart
export const BarChart = ({ data, height = 200, color = '#d2f9f0', formatValue }) => {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map(d => d.value))
  return (
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <div className="w-full rounded-t-lg hover:opacity-80 transition-all cursor-pointer relative group"
            style={{ height: `${Math.max((item.value / max) * (height - 40), 8)}px`, backgroundColor: color }}>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
              {formatValue ? formatValue(item.value) : item.value}
            </div>
          </div>
          <span className="text-xs text-gray-500">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// Stat Card with Trend
export const StatCard = ({ label, value, subValue, trend, trendValue, icon: Icon, gradient, sparkData, onClick, className }) => (
  <div onClick={onClick} className={cn(
    "bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-all duration-300",
    onClick && "cursor-pointer", className
  )}>
    <div className="flex items-start justify-between mb-3">
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {subValue && <p className="text-xs text-gray-400 mt-0.5">{subValue}</p>}
      </div>
      {Icon && (
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', gradient || 'bg-primary/10')}>
          <Icon className={cn('w-6 h-6', gradient ? 'text-white' : 'text-primary')} />
        </div>
      )}
    </div>
    {sparkData && <div className="mb-3"><SparklineChart data={sparkData} height={35} /></div>}
    {trendValue && (
      <div className="flex items-center gap-2">
        <span className={cn('flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-full',
          trend === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
          {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{trendValue}
        </span>
        <span className="text-xs text-gray-400">vs last month</span>
      </div>
    )}
  </div>
)

// Gradient Stat Card
export const GradientStatCard = ({ label, value, subValue, icon: Icon, gradient }) => (
  <div className={cn('rounded-2xl p-5 text-white', gradient)}>
    {Icon && <Icon className="w-8 h-8 opacity-80 mb-2" />}
    <p className="text-3xl font-bold">{value}</p>
    <p className="text-sm opacity-80">{label}</p>
    {subValue && <p className="text-xs opacity-60 mt-1">{subValue}</p>}
  </div>
)

// Mini Stat Card
export const MiniStatCard = ({ label, value, icon: Icon, color = 'primary' }) => {
  const colors = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-red-100 text-red-600',
  }
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100">
      <div className="flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', colors[color])}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

// Status Badge
export const StatusBadge = ({ status }) => {
  const config = {
    active: 'bg-green-100 text-green-700',
    completed: 'bg-blue-100 text-blue-700',
    pending: 'bg-amber-100 text-amber-700',
    draft: 'bg-gray-100 text-gray-700',
    open: 'bg-primary/10 text-primary',
    rejected: 'bg-red-100 text-red-700',
    accepted: 'bg-green-100 text-green-700',
    new: 'bg-blue-100 text-blue-700',
    contacted: 'bg-yellow-100 text-yellow-700',
    qualified: 'bg-purple-100 text-purple-700',
    converted: 'bg-green-100 text-green-700',
    lost: 'bg-red-100 text-red-700',
    paid: 'bg-green-100 text-green-700',
    processing: 'bg-blue-100 text-blue-700',
  }
  return (
    <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold capitalize', config[status] || 'bg-gray-100 text-gray-700')}>
      {status}
    </span>
  )
}
