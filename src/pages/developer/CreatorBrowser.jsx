import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Button, LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { toast } from 'react-hot-toast'
import { 
  Users, Search, Star, MapPin, Instagram, TrendingUp,
  Mail, CheckCircle, Heart, ArrowUpRight
} from 'lucide-react'
import { cn } from '../../lib/utils'

const NICHES = ['Lifestyle', 'Property', 'Finance', 'Travel', 'Family', 'Luxury', 'Tech', 'Food']

const CreatorBrowser = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creators, setCreators] = useState([])
  const [stats, setStats] = useState({ total: 0, verified: 0, avgFollowers: 0 })
  const [filter, setFilter] = useState({ niche: '', location: '', search: '', verified: false })
  const [favorites, setFavorites] = useState([])

  useEffect(() => { fetchCreators() }, [])

  const fetchCreators = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('creator_profiles')
        .select(`*, user:profiles!user_id(id, full_name, email, avatar_url, is_verified)`)
        .order('reliability_score', { ascending: false })

      if (error) throw error
      setCreators(data || [])
      
      const verified = data?.filter(c => c.user?.is_verified).length || 0
      const totalFollowers = data?.reduce((s, c) => s + (c.follower_count || 0), 0) || 0
      setStats({
        total: data?.length || 0,
        verified,
        avgFollowers: data?.length ? Math.round(totalFollowers / data.length) : 0,
      })
    } catch (e) {
      setError('Failed to load creators')
      toast.error('Failed to load creators')
    } finally {
      setLoading(false)
    }
  }

  const toggleFavorite = (creatorId) => {
    setFavorites(prev => 
      prev.includes(creatorId) 
        ? prev.filter(id => id !== creatorId)
        : [...prev, creatorId]
    )
  }

  const filteredCreators = creators.filter(c => {
    if (filter.verified && !c.user?.is_verified) return false
    if (filter.niche && !c.niche?.includes(filter.niche)) return false
    if (filter.location && !c.location?.toLowerCase().includes(filter.location.toLowerCase())) return false
    if (filter.search && !c.user?.full_name?.toLowerCase().includes(filter.search.toLowerCase())) return false
    return true
  })

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>
  if (error) return <ErrorState message={error} onRetry={fetchCreators} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Browse Creators</h1>
          <p className="text-gray-500 mt-1">Find the perfect creators for your campaigns</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-primary to-teal-600 rounded-2xl p-5 text-white">
          <Users className="w-8 h-8 opacity-80 mb-2" />
          <p className="text-3xl font-bold">{stats.total}</p>
          <p className="text-sm opacity-80">Total Creators</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white">
          <CheckCircle className="w-8 h-8 opacity-80 mb-2" />
          <p className="text-3xl font-bold">{stats.verified}</p>
          <p className="text-sm opacity-80">Verified</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-5 text-white">
          <TrendingUp className="w-8 h-8 opacity-80 mb-2" />
          <p className="text-3xl font-bold">{stats.avgFollowers.toLocaleString()}</p>
          <p className="text-sm opacity-80">Avg Followers</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text" placeholder="Search creators..."
            value={filter.search} onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select value={filter.niche} onChange={(e) => setFilter(f => ({ ...f, niche: e.target.value }))}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none">
          <option value="">All Niches</option>
          {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <input
          type="text" placeholder="Location..."
          value={filter.location} onChange={(e) => setFilter(f => ({ ...f, location: e.target.value }))}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none w-40"
        />
        <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl cursor-pointer">
          <input type="checkbox" checked={filter.verified} onChange={(e) => setFilter(f => ({ ...f, verified: e.target.checked }))}
            className="rounded border-gray-300 text-primary focus:ring-primary" />
          <span className="text-sm">Verified only</span>
        </label>
      </div>

      {/* Creators Grid */}
      {filteredCreators.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCreators.map(creator => (
            <div key={creator.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all">
              <div className="relative">
                <div className="h-32 bg-gradient-to-br from-primary/10 to-primary/20" />
                <div className="absolute -bottom-10 left-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-primary to-teal-600 rounded-2xl flex items-center justify-center text-2xl font-bold text-white border-4 border-white shadow-lg">
                    {creator.user?.full_name?.charAt(0)}
                  </div>
                </div>
                <button onClick={() => toggleFavorite(creator.id)}
                  className="absolute top-3 right-3 p-2 bg-white/90 rounded-full hover:bg-white transition-colors">
                  <Heart className={cn('w-5 h-5', favorites.includes(creator.id) ? 'fill-red-500 text-red-500' : 'text-gray-400')} />
                </button>
              </div>
              
              <div className="pt-12 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{creator.user?.full_name}</h3>
                      {creator.user?.is_verified && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                    {creator.location && (
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                        <MapPin className="w-4 h-4" />{creator.location}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 bg-amber-100 px-2 py-1 rounded-lg">
                    <Star className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-semibold text-amber-700">{creator.reliability_score || 100}</span>
                  </div>
                </div>

                {/* Niches */}
                {creator.niche && creator.niche.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {creator.niche.slice(0, 3).map((n, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">{n}</span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-100 my-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{(creator.follower_count || 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Followers</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{creator.campaigns_completed || 0}</p>
                    <p className="text-xs text-gray-500">Campaigns</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-primary">{creator.total_leads_generated || 0}</p>
                    <p className="text-xs text-gray-500">Leads</p>
                  </div>
                </div>

                {/* Social links */}
                <div className="flex gap-2 mb-4">
                  {creator.instagram_handle && (
                    <a href={`https://instagram.com/${creator.instagram_handle}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-pink-600 hover:underline">
                      <Instagram className="w-4 h-4" />@{creator.instagram_handle}
                    </a>
                  )}
                </div>

                <div className="flex gap-2">
                  <a href={`mailto:${creator.user?.email}`} className="flex-1">
                    <Button variant="secondary" className="w-full"><Mail className="w-4 h-4 mr-1" />Contact</Button>
                  </a>
                  <Link to={`/developer/creators/${creator.user?.id}/book`} className="flex-1">
                    <Button variant="primary" className="w-full">
                      <ArrowUpRight className="w-4 h-4 mr-1" />Book
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="No creators found"
          description="Try adjusting your filters"
        />
      )}
    </div>
  )
}

export default CreatorBrowser
