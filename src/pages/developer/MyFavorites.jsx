import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  supabase,
  fetchDeveloperFavorites,
  removeDeveloperFavorite,
} from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { CreatorCard } from '../public/Marketplace'
import { EmptyState, ErrorState, LoadingSpinner } from '../../components/ui'
import { Heart } from 'lucide-react'

const MyFavorites = () => {
  const { user } = useAuth()
  const developerId = user?.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creators, setCreators] = useState([])
  const [favoriteIds, setFavoriteIds] = useState(() => new Set())
  const [pending, setPending] = useState(() => new Set())

  const loadFavorites = useCallback(async () => {
    if (!developerId) return
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchDeveloperFavorites(developerId)
      const ids = rows.map((r) => r.creator_id)
      setFavoriteIds(new Set(ids))

      if (ids.length === 0) {
        setCreators([])
        return
      }

      const { data, error: viewError } = await supabase
        .from('creator_marketplace_public')
        .select('*')
        .in('user_id', ids)

      if (viewError) throw viewError

      // Preserve favourite order (most recently added first)
      const orderIndex = new Map(ids.map((id, idx) => [id, idx]))
      const sorted = (data || []).slice().sort(
        (a, b) =>
          (orderIndex.get(a.user_id) ?? 0) - (orderIndex.get(b.user_id) ?? 0)
      )
      setCreators(sorted)
    } catch (err) {
      console.error('Failed to load favourites:', err)
      setError(err.message || 'Failed to load favourites')
    } finally {
      setLoading(false)
    }
  }, [developerId])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const handleToggleFavorite = useCallback(
    async (creator) => {
      const creatorUserId = creator?.user_id
      if (!creatorUserId || !developerId) return
      if (pending.has(creatorUserId)) return

      // From the favourites view, toggling always means "remove"
      setPending((prev) => {
        const next = new Set(prev)
        next.add(creatorUserId)
        return next
      })

      // Optimistic remove from grid
      const prevCreators = creators
      const prevFavoriteIds = favoriteIds
      setCreators((cs) => cs.filter((c) => c.user_id !== creatorUserId))
      setFavoriteIds((s) => {
        const next = new Set(s)
        next.delete(creatorUserId)
        return next
      })

      try {
        await removeDeveloperFavorite(developerId, creatorUserId)
        toast.success('Removed from favourites')
      } catch (err) {
        console.error('Remove favourite failed:', err)
        toast.error('Could not remove favourite')
        // Roll back
        setCreators(prevCreators)
        setFavoriteIds(prevFavoriteIds)
      } finally {
        setPending((prev) => {
          const next = new Set(prev)
          next.delete(creatorUserId)
          return next
        })
      }
    },
    [developerId, pending, creators, favoriteIds]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-headline-xl text-2xl font-bold text-on-surface">
            My Favourites
          </h1>
          <p className="font-body-md text-on-surface-variant mt-1">
            Creators you've saved. Only you can see this list.
          </p>
        </div>
        <Link
          to="/developer/creators"
          className="inline-flex items-center gap-1.5 bg-primary-container text-on-primary-container font-label-lg px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]">storefront</span>
          Browse creators
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" text="Loading favourites…" />
        </div>
      ) : error ? (
        <ErrorState
          title="Couldn't load favourites"
          message={error}
          onRetry={loadFavorites}
        />
      ) : creators.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No favourites yet"
          description="Save creators while browsing to shortlist them here."
          action={() => {
            window.location.href = '/developer/creators'
          }}
          actionLabel="Browse creators"
        />
      ) : (
        <>
          <div className="text-on-surface-variant font-body-sm text-body-sm">
            {creators.length} saved creator{creators.length === 1 ? '' : 's'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {creators.map((c) => (
              <CreatorCard
                key={c.creator_profile_id}
                creator={c}
                isFavorite={favoriteIds.has(c.user_id)}
                favoriteBusy={pending.has(c.user_id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default MyFavorites
