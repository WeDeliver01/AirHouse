import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Button, LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatCurrency} from '../../lib/utils'
import { 
  Megaphone, Search, MapPin, DollarSign, Building2,
  ArrowRight, Briefcase, Sparkles
} from 'lucide-react'

const Campaigns = () => {
  const { isAuthenticated, isCreator } = useAuth()
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState([])
  const [filter, setFilter] = useState({ search: '', location: '' })
  const [error, setError] = useState(null)

  useEffect(() => { fetchCampaigns() }, [])

  const fetchCampaigns = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select(`*, developer:profiles!developer_id(full_name, company_name, avatar_url)`)
        .eq('status', 'open')
        .order('created_at', { ascending: false })

      if (error) throw error
      setCampaigns(data || [])
    } catch (e) {
      console.error(e)
      setError('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  const filteredCampaigns = campaigns.filter(c => {
    if (filter.search && !c.title?.toLowerCase().includes(filter.search.toLowerCase()) &&
        !c.property_name?.toLowerCase().includes(filter.search.toLowerCase())) return false
    if (filter.location && !c.property_location?.toLowerCase().includes(filter.location.toLowerCase())) return false
    return true
  })

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>
  if (error) return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12"><ErrorState message={error} onRetry={fetchCampaigns} /></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat bg-campaigns-hero"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-gray-50" />
        <div className="relative px-4 sm:px-6 lg:px-8 pt-10 pb-20 sm:pt-16 sm:pb-28 max-w-7xl mx-auto">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md rounded-full px-4 py-1.5 mb-4">
              <Sparkles className="w-4 h-4 text-emerald-300" />
              <span className="text-white/90 text-xs sm:text-sm font-medium">{campaigns.length} campaigns available</span>
            </div>
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-3">
              Find Your Next <span className="text-emerald-300">Campaign</span>
            </h1>
            <p className="text-white/75 text-sm sm:text-base lg:text-lg max-w-lg">
              Browse property marketing campaigns, apply to create content, and earn money generating real leads.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-8 sm:mt-10">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl sm:rounded-2xl p-3 sm:p-5 text-center">
              <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-300 mx-auto mb-1 sm:mb-2" />
              <p className="text-xl sm:text-3xl font-bold text-white">{campaigns.length}</p>
              <p className="text-[10px] sm:text-sm text-white/60">Open</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl sm:rounded-2xl p-3 sm:p-5 text-center">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-300 mx-auto mb-1 sm:mb-2" />
              <p className="text-lg sm:text-3xl font-bold text-white">{formatCurrency(campaigns.reduce((s, c) => s + (parseFloat(c.creator_budget) || 0), 0))}</p>
              <p className="text-[10px] sm:text-sm text-white/60">Budget</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl sm:rounded-2xl p-3 sm:p-5 text-center">
              <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-300 mx-auto mb-1 sm:mb-2" />
              <p className="text-xl sm:text-3xl font-bold text-white">{new Set(campaigns.map(c => c.property_location?.split(',')[0])).size}</p>
              <p className="text-[10px] sm:text-sm text-white/60">Locations</p>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 sm:-mt-10 relative z-10">
        <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-lg border border-gray-100 flex flex-col sm:flex-row gap-3 mb-6 sm:mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            <input
              type="text" placeholder="Search campaigns..."
              value={filter.search} onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
              className="w-full pl-9 sm:pl-10 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-lg sm:rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            <input
              type="text" placeholder="Location..."
              value={filter.location} onChange={(e) => setFilter(f => ({ ...f, location: e.target.value }))}
              className="w-full pl-9 sm:pl-10 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-lg sm:rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {filteredCampaigns.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 pb-12">
            {filteredCampaigns.map(campaign => (
              <Link
                key={campaign.id}
                to={isCreator ? `/creator/campaigns/${campaign.id}` : isAuthenticated ? `/campaigns/${campaign.id}` : `/login`}
                className="block"
              >
                <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 group h-full">
                  <div className="h-36 sm:h-44 bg-gradient-to-br from-primary/10 to-accent/15 relative overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Building2 className="w-14 h-14 sm:w-16 sm:h-16 text-primary/20 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                    <div className="absolute top-3 right-3">
                      <span className="px-2.5 py-1 bg-emerald-500 text-white text-[10px] sm:text-xs font-semibold rounded-full shadow-sm">
                        Open
                      </span>
                    </div>
                    {campaign.property_type && (
                      <div className="absolute top-3 left-3">
                        <span className="px-2.5 py-1 bg-white/90 backdrop-blur text-gray-700 text-[10px] sm:text-xs font-medium rounded-full">
                          {campaign.property_type}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4 sm:p-5">
                    <h3 className="font-bold text-gray-900 text-base sm:text-lg group-hover:text-primary transition-colors leading-snug mb-1">
                      {campaign.title || campaign.property_name}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{campaign.property_location}</span>
                    </p>

                    <div className="flex items-center gap-2.5 mt-3 sm:mt-4 pb-3 sm:pb-4 border-b border-gray-100">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold text-gray-600 shrink-0">
                        {campaign.developer?.company_name?.charAt(0) || campaign.developer?.full_name?.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{campaign.developer?.company_name || campaign.developer?.full_name}</p>
                        <p className="text-[10px] sm:text-xs text-gray-400">Developer</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 sm:pt-4">
                      <div>
                        <p className="text-lg sm:text-xl font-bold text-emerald-600">{formatCurrency(campaign.creator_budget)}</p>
                        <p className="text-[10px] sm:text-xs text-gray-400">Creator Budget</p>
                      </div>
                      <div className="flex items-center gap-1 text-primary font-semibold text-xs sm:text-sm">
                        Apply <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-12 sm:p-16 text-center border border-gray-100 mb-12">
            <EmptyState
              icon={Megaphone}
              title="No campaigns found"
              description="Check back later for new opportunities."
              action={!isAuthenticated ? () => window.location.href = '/register?role=creator' : undefined}
              actionLabel={!isAuthenticated ? 'Sign Up as Creator' : undefined}
            />
          </div>
        )}

        {!isAuthenticated && campaigns.length > 0 && (
          <div className="mb-12 bg-gradient-to-r from-primary/5 to-accent/10 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center border border-primary/20">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Ready to start earning?</h2>
            <p className="text-sm sm:text-base text-gray-500 mb-5 sm:mb-6">Sign up as a creator to apply to these campaigns</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register?role=creator">
                <Button variant="primary" size="lg" className="w-full sm:w-auto">Sign Up as Creator</Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto">Login</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Campaigns
