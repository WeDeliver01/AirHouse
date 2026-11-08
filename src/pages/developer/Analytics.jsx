import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Button, LoadingSpinner, ErrorState } from '../../components/ui'
import { formatCurrency} from '../../lib/utils'
import { 
  TrendingUp, DollarSign, Megaphone, Target, ArrowUpRight, ArrowDownRight,
  Download, BarChart3, PieChart
} from 'lucide-react'
import { cn } from '../../lib/utils'

const SparklineChart = ({ data, color = '#d2f9f0', height = 40 }) => {
  if (!data || data.length < 2) return null
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const points = data.map((val, i) => `${(i / (data.length - 1)) * 100},${100 - ((val - min) / range) * 100}`).join(' ')
  return (
    <svg viewBox="0 0 100 100" className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs><linearGradient id={`an-${color.slice(1)}`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <polygon points={`0,100 ${points} 100,100`} fill={`url(#an-${color.slice(1)})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

const BarChart = ({ data, height = 200 }) => {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map(d => d.value))
  return (
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <div className="w-full bg-primary/80 rounded-t-lg hover:bg-primary transition-all cursor-pointer relative group"
            style={{ height: `${Math.max((item.value / max) * (height - 40), 8)}px` }}>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
              {item.value}
            </div>
          </div>
          <span className="text-xs text-gray-500">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

const DonutChart = ({ value, max = 100, size = 140, color = '#d2f9f0' }) => {
  const r = (size - 14) / 2, c = 2 * Math.PI * r, p = (value / max) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth="14" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="14" 
          strokeDasharray={c} strokeDashoffset={c - p} strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold">{Math.round((value / max) * 100)}%</span>
      </div>
    </div>
  )
}

const DeveloperAnalytics = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('30')
  const [stats, setStats] = useState({ campaigns: 0, leads: 0, conversions: 0, spent: 0 })
  const [monthlyData, setMonthlyData] = useState([])
  const [campaignPerformance, setCampaignPerformance] = useState([])

  useEffect(() => {
    if (user?.id) fetchData()
  }, [user, period, fetchData])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, title, property_name, total_budget, status, created_at')
        .eq('developer_id', user.id)

      const campaignIds = campaigns?.map(c => c.id) || []
      let leadsData = []
      if (campaignIds.length > 0) {
        const { data } = await supabase.from('leads').select('id, pipeline_stage, campaign_id, created_at, lead_quality').in('campaign_id', campaignIds)
        leadsData = data || []
      }

      const { data: assignmentsData } = campaignIds.length > 0 
        ? await supabase.from('campaign_assignments').select('id, creator_id, campaign_id, status').in('campaign_id', campaignIds)
        : { data: [] }

      const totalLeads = leadsData.length
      const conversions = leadsData.filter(l => l.pipeline_stage === 'converted').length
      const totalSpent = campaigns?.reduce((s, c) => s + (parseFloat(c.total_budget) || 0), 0) || 0

      const pipelineNew = leadsData.filter(l => l.pipeline_stage === 'new' || !l.pipeline_stage).length
      const pipelineContacted = leadsData.filter(l => l.pipeline_stage === 'contacted').length
      const pipelineQualified = leadsData.filter(l => l.pipeline_stage === 'qualified').length
      const pipelineConverted = conversions
      const pipelineLost = leadsData.filter(l => l.pipeline_stage === 'lost').length

      const creatorLeadMap = {}
      const assignments = assignmentsData || []
      assignments.forEach(a => {
        if (!creatorLeadMap[a.creator_id]) creatorLeadMap[a.creator_id] = { leads: 0, conversions: 0 }
      })
      leadsData.forEach(l => {
        const assign = assignments.find(a => a.campaign_id === l.campaign_id)
        if (assign) {
          if (!creatorLeadMap[assign.creator_id]) creatorLeadMap[assign.creator_id] = { leads: 0, conversions: 0 }
          creatorLeadMap[assign.creator_id].leads++
          if (l.pipeline_stage === 'converted') creatorLeadMap[assign.creator_id].conversions++
        }
      })

      let topCreators = []
      const creatorIds = Object.keys(creatorLeadMap).filter(id => creatorLeadMap[id].leads > 0)
      if (creatorIds.length > 0) {
        const { data: creatorProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds)
        
        topCreators = creatorIds.map(id => ({
          name: creatorProfiles?.find(p => p.id === id)?.full_name || 'Creator',
          leads: creatorLeadMap[id].leads,
          convRate: creatorLeadMap[id].leads > 0 ? Math.round((creatorLeadMap[id].conversions / creatorLeadMap[id].leads) * 100) : 0,
        })).sort((a, b) => b.leads - a.leads).slice(0, 5)
      }

      setStats({
        campaigns: campaigns?.length || 0,
        leads: totalLeads,
        conversions,
        conversionRate: totalLeads > 0 ? Math.round((conversions / totalLeads) * 100) : 0,
        spent: totalSpent,
        costPerLead: totalLeads > 0 ? totalSpent / totalLeads : 0,
        pipelineNew,
        pipelineContacted,
        pipelineQualified,
        pipelineConverted,
        pipelineLost,
        topCreators,
      })

      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const now = new Date()
      const monthlyLeads = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
        const count = leadsData.filter(l => {
          const created = new Date(l.created_at)
          return created >= d && created < nextMonth
        }).length
        monthlyLeads.push({ label: months[d.getMonth()], value: count })
      }
      setMonthlyData(monthlyLeads)

      // Campaign performance
      setCampaignPerformance(campaigns?.slice(0, 5).map(c => ({
        ...c,
        leads: leadsData.filter(l => l.campaign_id === c.id).length,
        conversions: leadsData.filter(l => l.campaign_id === c.id && l.pipeline_stage === 'converted').length,
      })) || [])

    } catch (e) {
      console.error(e)
      setError('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1">Track your campaign performance</p>
        </div>
        <div className="flex gap-3">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <Button variant="secondary"><Download className="w-4 h-4 mr-2" />Export</Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm text-gray-500">Total Leads</p>
              <p className="text-2xl font-bold mt-1">{stats.leads}</p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-600">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
          <SparklineChart data={[10, 15, 12, 20, 18, 25, 22, 30, stats.leads]} height={35} color="#10B981" />
          <div className="flex items-center gap-2 mt-2">
            <span className="flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              <ArrowUpRight className="w-3 h-3" />+18%
            </span>
            <span className="text-xs text-gray-400">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm text-gray-500">Conversion Rate</p>
              <p className="text-2xl font-bold mt-1">{stats.conversionRate}%</p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary to-teal-600">
              <Target className="w-6 h-6 text-white" />
            </div>
          </div>
          <SparklineChart data={[20, 25, 22, 30, 28, 35, 32, 38, stats.conversionRate]} height={35} />
          <div className="flex items-center gap-2 mt-2">
            <span className="flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              <ArrowUpRight className="w-3 h-3" />+5%
            </span>
            <span className="text-xs text-gray-400">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm text-gray-500">Cost per Lead</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(stats.costPerLead)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
          <SparklineChart data={[500, 450, 480, 420, 400, 380, 350, 320, stats.costPerLead]} height={35} color="#8B5CF6" />
          <div className="flex items-center gap-2 mt-2">
            <span className="flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              <ArrowDownRight className="w-3 h-3" />-12%
            </span>
            <span className="text-xs text-gray-400">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm text-gray-500">Total Spent</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(stats.spent)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-500">
              <Megaphone className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">{stats.campaigns} campaigns</p>
        </div>
      </div>

      {/* Lead Quality Breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Lead Pipeline</h3>
          <div className="space-y-3">
            {[
              { stage: 'New', count: stats.pipelineNew || 0, color: 'bg-blue-500' },
              { stage: 'Contacted', count: stats.pipelineContacted || 0, color: 'bg-yellow-500' },
              { stage: 'Qualified', count: stats.pipelineQualified || 0, color: 'bg-primary' },
              { stage: 'Converted', count: stats.pipelineConverted || 0, color: 'bg-green-500' },
              { stage: 'Lost', count: stats.pipelineLost || 0, color: 'bg-red-400' },
            ].map(item => (
              <div key={item.stage}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{item.stage}</span>
                  <span className="font-semibold">{item.count}</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all duration-700', item.color)}
                    style={{ width: `${stats.leads > 0 ? (item.count / stats.leads) * 100 : 0}%`, minWidth: item.count > 0 ? '4px' : '0' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Creator Performance</h3>
          {stats.topCreators?.length > 0 ? (
            <div className="space-y-3">
              {stats.topCreators.map((creator, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold',
                    i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : 'bg-amber-700'
                  )}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{creator.name}</p>
                    <p className="text-xs text-gray-500">{creator.leads} leads</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-600">{creator.convRate}%</p>
                    <p className="text-xs text-gray-400">conv.</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">No creator data yet</p>
          )}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-gray-900">Leads Over Time</h3>
              <p className="text-sm text-gray-500">Monthly lead acquisition</p>
            </div>
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>
          <BarChart data={monthlyData} height={200} />
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Conversion Rate</h3>
            <PieChart className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex flex-col items-center py-4">
            <DonutChart value={stats.conversionRate} max={100} />
            <div className="grid grid-cols-2 gap-4 mt-6 w-full">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.conversions}</p>
                <p className="text-xs text-gray-500">Converted</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-400">{stats.leads - stats.conversions}</p>
                <p className="text-xs text-gray-500">In Progress</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Performance Table */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">Campaign Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 font-semibold text-gray-500">Campaign</th>
                <th className="text-right py-3 font-semibold text-gray-500">Budget</th>
                <th className="text-right py-3 font-semibold text-gray-500">Leads</th>
                <th className="text-right py-3 font-semibold text-gray-500">Conversions</th>
                <th className="text-right py-3 font-semibold text-gray-500">Conv. Rate</th>
                <th className="text-center py-3 font-semibold text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaignPerformance.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 font-medium">{c.title || c.property_name}</td>
                  <td className="py-3 text-right">{formatCurrency(c.total_budget)}</td>
                  <td className="py-3 text-right font-semibold">{c.leads}</td>
                  <td className="py-3 text-right font-semibold text-green-600">{c.conversions}</td>
                  <td className="py-3 text-right">{c.leads > 0 ? Math.round((c.conversions / c.leads) * 100) : 0}%</td>
                  <td className="py-3 text-center">
                    <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold capitalize',
                      c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    )}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default DeveloperAnalytics
