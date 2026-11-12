import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Button, Badge, LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatCurrency, formatRelativeTime} from '../../lib/utils'
import { toast } from 'react-hot-toast'
import { 
  Briefcase, Copy, Eye, Upload, TrendingUp, DollarSign, Calendar,
  MapPin, Building2, Link as LinkIcon, CheckCircle, Flag
} from 'lucide-react'

const CreatorActiveCampaigns = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [stats, setStats] = useState({ active: 0, completed: 0, totalEarned: 0, totalLeads: 0 })

  const fetchAssignments = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      const { data: creatorData } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!creatorData) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('campaign_assignments')
        .select(`
          *,
          campaign:campaigns(
            id, title, property_name, property_location, creator_budget,
            start_date, end_date, status, deliverables, content_guidelines,
            developer:profiles!developer_id(full_name, company_name, avatar_url, phone)
          )
        `)
        .eq('creator_id', creatorData.id)
        .order('assigned_at', { ascending: false })

      if (error) throw error

      setAssignments(data || [])
      
      const active = data?.filter(a => a.campaign?.status === 'active' && !a.is_completed).length || 0
      const completed = data?.filter(a => a.is_completed).length || 0
      const totalEarned = data?.reduce((sum, a) => sum + (parseFloat(a.amount_paid) || 0), 0) || 0
      const totalLeads = data?.reduce((sum, a) => sum + (a.leads_generated || 0), 0) || 0
      
      setStats({ active, completed, totalEarned, totalLeads })

    } catch (error) {
      console.error('Error:', error)
      setError('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchAssignments()
  }, [fetchAssignments])

  const copyReferralLink = (assignment) => {
    const link = `${window.location.origin}/lead/${assignment.campaign_id}?ref=${assignment.creator_referral_code}`
    navigator.clipboard.writeText(link)
    toast.success('Referral link copied!')
  }

  const getDeliverableProgress = (assignment) => {
    const deliverables = assignment.campaign?.deliverables || []
    const submitted = assignment.content_submitted || 0
    const approved = assignment.content_approved || 0
    const total = deliverables.length || 1
    return { submitted, approved, total, percent: Math.round((approved / total) * 100) }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>

  if (error) return <ErrorState message={error} onRetry={fetchAssignments} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Active Campaigns</h1>
        <p className="text-gray-500 mt-1">Manage your ongoing campaign assignments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-primary rounded-2xl p-4 text-white">
          <Briefcase className="w-8 h-8 opacity-80 mb-2" />
          <p className="text-3xl font-bold">{stats.active}</p>
          <p className="text-sm opacity-80">Active Campaigns</p>
        </div>
        <div className="bg-green-600 rounded-2xl p-4 text-white">
          <CheckCircle className="w-8 h-8 opacity-80 mb-2" />
          <p className="text-3xl font-bold">{stats.completed}</p>
          <p className="text-sm opacity-80">Completed</p>
        </div>
        <div className="bg-purple-600 rounded-2xl p-4 text-white">
          <TrendingUp className="w-8 h-8 opacity-80 mb-2" />
          <p className="text-3xl font-bold">{stats.totalLeads}</p>
          <p className="text-sm opacity-80">Leads Generated</p>
        </div>
        <div className="bg-secondary rounded-2xl p-4 text-white">
          <DollarSign className="w-8 h-8 opacity-80 mb-2" />
          <p className="text-3xl font-bold">{formatCurrency(stats.totalEarned)}</p>
          <p className="text-sm opacity-80">Total Earned</p>
        </div>
      </div>

      {/* Campaigns List */}
      {assignments.length > 0 ? (
        <div className="space-y-6">
          {assignments.map(assignment => {
            const progress = getDeliverableProgress(assignment)
            const isActive = assignment.campaign?.status === 'active' && !assignment.is_completed
            
            return (
              <div key={assignment.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all">
                {/* Header */}
                <div className="p-6 border-b border-gray-100">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h3 className="font-semibold text-gray-900 text-xl">
                          {assignment.campaign?.title || assignment.campaign?.property_name}
                        </h3>
                        <Badge variant={isActive ? 'success' : assignment.is_completed ? 'primary' : 'secondary'}>
                          {assignment.is_completed ? 'Completed' : assignment.campaign?.status}
                        </Badge>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {assignment.campaign?.property_location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          {assignment.campaign?.developer?.company_name || assignment.campaign?.developer?.full_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Assigned {formatRelativeTime(assignment.assigned_at)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-gray-500">Your Budget</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(assignment.agreed_budget || assignment.campaign?.creator_budget)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Progress & Stats */}
                <div className="p-6 bg-gray-50">
                  <div className="grid md:grid-cols-3 gap-6">
                    {/* Deliverables Progress */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Content Progress</span>
                        <span className="text-sm text-gray-500">{progress.approved}/{progress.total}</span>
                      </div>
                      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{progress.percent}% complete</p>
                    </div>

                    {/* Leads Generated */}
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
                        <TrendingUp className="w-7 h-7 text-green-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-900">{assignment.leads_generated || 0}</p>
                        <p className="text-sm text-gray-500">Leads Generated</p>
                      </div>
                    </div>

                    {/* Amount Earned */}
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center">
                        <DollarSign className="w-7 h-7 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-900">{formatCurrency(assignment.amount_earned || 0)}</p>
                        <p className="text-sm text-gray-500">Earned So Far</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Referral Link */}
                <div className="px-6 py-4 border-t border-gray-100 bg-primary/5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <LinkIcon className="w-5 h-5 text-primary" />
                      <span className="text-sm font-medium text-gray-700">Your Referral Link</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-white px-3 py-2 rounded-lg border border-gray-200 text-gray-600 truncate max-w-xs">
                        {`${window.location.origin}/lead/${assignment.campaign_id}?ref=${assignment.creator_referral_code}`}
                      </code>
                      <Button variant="secondary" size="sm" onClick={() => copyReferralLink(assignment)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap gap-3 justify-end">
                  <Link
                    to={`/creator/disputes?campaign=${assignment.campaign?.id}&assignment=${assignment.id}`}
                    title="Report an issue with this campaign"
                  >
                    <Button variant="secondary" size="sm">
                      <Flag className="w-4 h-4 mr-1" />
                      Report Issue
                    </Button>
                  </Link>
                  <Link to={`/creator/campaigns/${assignment.campaign?.id}`}>
                    <Button variant="secondary" size="sm">
                      <Eye className="w-4 h-4 mr-1" />
                      View Details
                    </Button>
                  </Link>
                  {isActive && (
                    <Link to={`/creator/active/${assignment.id}`}>
                      <Button variant="primary" size="sm">
                        <Upload className="w-4 h-4 mr-1" />
                        Submit Content
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={Briefcase}
          title="No active campaigns"
          description="Apply to campaigns and get accepted to start creating content"
          action={() => window.location.href = '/creator/campaigns'}
          actionLabel="Browse Campaigns"
        />
      )}
    </div>
  )
}

export default CreatorActiveCampaigns
