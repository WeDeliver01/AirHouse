import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Button, Badge, LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatCurrency, formatRelativeTime } from '../../lib/utils'
import { toast } from 'react-hot-toast'
import { 
  FileText, Clock, CheckCircle, XCircle, Eye, ArrowRight, 
  Megaphone, MapPin, Calendar, Building2
} from 'lucide-react'
import { cn } from '../../lib/utils'

const STATUS_CONFIG = {
  pending: { label: 'Pending', variant: 'warning', icon: Clock, color: 'text-amber-600 bg-amber-50' },
  accepted: { label: 'Accepted', variant: 'success', icon: CheckCircle, color: 'text-green-600 bg-green-50' },
  rejected: { label: 'Rejected', variant: 'danger', icon: XCircle, color: 'text-red-600 bg-red-50' },
  invited: { label: 'Invited', variant: 'primary', icon: FileText, color: 'text-primary bg-primary/10' },
}

const CreatorApplications = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [applications, setApplications] = useState([])
  const [filter, setFilter] = useState('all')
  const [stats, setStats] = useState({ total: 0, pending: 0, accepted: 0, rejected: 0 })

  const fetchApplications = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      // Get creator profile
      const { data: creatorData } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!creatorData) {
        setLoading(false)
        return
      }

      // Get applications with campaign details
      const { data, error } = await supabase
        .from('campaign_applications')
        .select(`
          *,
          campaign:campaigns(
            id, title, property_name, property_location, creator_budget, 
            start_date, end_date, status, deliverables,
            developer:profiles!developer_id(full_name, company_name, avatar_url)
          )
        `)
        .eq('creator_id', creatorData.id)
        .order('applied_at', { ascending: false })

      if (error) throw error

      setApplications(data || [])
      
      // Calculate stats
      const total = data?.length || 0
      const pending = data?.filter(a => a.status === 'pending').length || 0
      const accepted = data?.filter(a => a.status === 'accepted').length || 0
      const rejected = data?.filter(a => a.status === 'rejected').length || 0
      setStats({ total, pending, accepted, rejected })

    } catch (error) {
      console.error('Error:', error)
      setError('Failed to load applications')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchApplications()
  }, [fetchApplications])

  const withdrawApplication = async (applicationId) => {
    if (!confirm('Are you sure you want to withdraw this application?')) return
    
    try {
      const { error } = await supabase
        .from('campaign_applications')
        .delete()
        .eq('id', applicationId)

      if (error) throw error

      toast.success('Application withdrawn')
      fetchApplications()
    } catch (error) {
      toast.error('Failed to withdraw application')
    }
  }

  const filteredApplications = applications.filter(app => {
    if (filter === 'all') return true
    return app.status === filter
  })

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>

  if (error) return <ErrorState message={error} onRetry={fetchApplications} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Applications</h1>
          <p className="text-gray-500 mt-1">Track the status of your campaign applications</p>
        </div>
        <Link to="/creator/campaigns">
          <Button variant="primary">
            <Megaphone className="w-4 h-4 mr-2" />
            Browse Campaigns
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Applications', value: stats.total, color: 'bg-gray-100', textColor: 'text-gray-700' },
          { label: 'Pending Review', value: stats.pending, color: 'bg-amber-100', textColor: 'text-amber-700' },
          { label: 'Accepted', value: stats.accepted, color: 'bg-green-100', textColor: 'text-green-700' },
          { label: 'Rejected', value: stats.rejected, color: 'bg-red-100', textColor: 'text-red-700' },
        ].map((stat, i) => (
          <div key={i} className={cn('rounded-2xl p-4', stat.color)}>
            <p className={cn('text-2xl font-bold', stat.textColor)}>{stat.value}</p>
            <p className="text-sm text-gray-600">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'pending', 'accepted', 'rejected'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
              filter === status
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
            {status !== 'all' && (
              <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded-full text-xs">
                {applications.filter(a => a.status === status).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Applications List */}
      {filteredApplications.length > 0 ? (
        <div className="space-y-4">
          {filteredApplications.map(app => {
            const statusConfig = STATUS_CONFIG[app.status] || STATUS_CONFIG.pending
            const StatusIcon = statusConfig.icon

            return (
              <div key={app.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all">
                <div className="p-6">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    {/* Campaign Info */}
                    <div className="flex-1">
                      <div className="flex items-start gap-4">
                        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', statusConfig.color)}>
                          <StatusIcon className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-900 text-lg">
                              {app.campaign?.title || app.campaign?.property_name}
                            </h3>
                            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {app.campaign?.property_location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Building2 className="w-4 h-4" />
                              {app.campaign?.developer?.company_name || app.campaign?.developer?.full_name}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              Applied {formatRelativeTime(app.applied_at)}
                            </span>
                          </div>

                          {app.pitch_message && (
                            <p className="mt-3 text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">
                              "{app.pitch_message}"
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Budget & Actions */}
                    <div className="flex flex-col items-end gap-3">
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Budget</p>
                        <p className="text-2xl font-bold text-green-600">
                          {formatCurrency(app.campaign?.creator_budget)}
                        </p>
                        {app.proposed_rate && app.proposed_rate !== app.campaign?.creator_budget && (
                          <p className="text-sm text-gray-500">
                            Your rate: {formatCurrency(app.proposed_rate)}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Link to={`/creator/campaigns/${app.campaign?.id}`}>
                          <Button variant="secondary" size="sm">
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                        </Link>
                        {app.status === 'pending' && (
                          <Button 
                            variant="danger" 
                            size="sm"
                            onClick={() => withdrawApplication(app.id)}
                          >
                            Withdraw
                          </Button>
                        )}
                        {app.status === 'accepted' && (
                          <Link to="/creator/active">
                            <Button variant="primary" size="sm">
                              Go to Campaign
                              <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Response Info for accepted/rejected */}
                {app.responded_at && (
                  <div className={cn(
                    'px-6 py-3 border-t',
                    app.status === 'accepted' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
                  )}>
                    <p className="text-sm">
                      <span className={app.status === 'accepted' ? 'text-green-700' : 'text-red-700'}>
                        {app.status === 'accepted' ? '✓ Accepted' : '✗ Not selected'} 
                      </span>
                      <span className="text-gray-500 ml-2">
                        {formatRelativeTime(app.responded_at)}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title={filter === 'all' ? 'No applications yet' : `No ${filter} applications`}
          description={filter === 'all' 
            ? 'Start applying to campaigns to grow your portfolio'
            : 'Try changing the filter to see other applications'
          }
          action={() => window.location.href = '/creator/campaigns'}
          actionLabel="Browse Campaigns"
        />
      )}
    </div>
  )
}

export default CreatorApplications
