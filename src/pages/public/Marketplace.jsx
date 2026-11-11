import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  supabase,
  fetchDeveloperFavorites,
  addDeveloperFavorite,
  removeDeveloperFavorite,
} from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, Button, EmptyState, ErrorState, LoadingSpinner } from '../../components/ui'
import { cn, formatNumber, formatCurrency } from '../../lib/utils'
import { SearchX } from 'lucide-react'
import InviteToCampaignModal from '../../components/InviteToCampaignModal'

const NICHES = [
  'Property Tours',
  'Real Estate',
  'Architecture',
  'Interior Design',
  'Lifestyle',
  'Luxury',
  'Investment',
  'First-time Buyers',
  'Family Homes',
  'Urban Living',
]

const PAGE_SIZE = 24

const initialFilters = {
  search: '',
  niches: [],
  minFollowers: '',
  maxFollowers: '',
  minRate: '',
  maxRate: '',
  city: '',
  verifiedOnly: false,
  favoritesOnly: false,
}

const formatRateRange = (min, max) => {
  if (!min && !max) return 'Rate on request'
  if (min && max && min !== max) return `${formatCurrency(min)} – ${formatCurrency(max)}`
  return formatCurrency(min || max)
}

export const CreatorCard = ({
  creator,
  onInvite,
  canInvite,
  isAuthenticated,
  isFavorite = false,
  onToggleFavorite,
  favoriteBusy = false,
  showFavorite = true,
}) => {
  const niches = Array.isArray(creator.niche) ? creator.niche : []
  const profilePath = `/creators/${creator.user_id}`
  const inviteHref = isAuthenticated ? null : '/login'

  const handleHeartClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (favoriteBusy) return
    onToggleFavorite?.(creator)
  }

  return (
    <article className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 flex flex-col group hover:shadow-[0_4px_12px_0_rgba(17,24,39,0.06)] transition-shadow duration-200 h-full relative">
      {showFavorite && (
        <button
          type="button"
          onClick={handleHeartClick}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'Remove from favourites' : 'Save to favourites'}
          title={isFavorite ? 'Remove from favourites' : 'Save to favourites'}
          disabled={favoriteBusy}
          className={cn(
            'absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-colors',
            'bg-surface-container-low/90 hover:bg-surface-container-high border border-outline-variant',
            favoriteBusy && 'opacity-60 cursor-wait'
          )}
        >
          <span
            className={cn(
              'material-symbols-outlined text-[20px]',
              isFavorite ? 'text-error' : 'text-on-surface-variant'
            )}
            style={isFavorite ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            favorite
          </span>
        </button>
      )}
      <div className="flex items-start gap-4 mb-4">
        <Avatar
          src={creator.avatar_url}
          name={creator.full_name}
          size="lg"
          className="rounded-lg w-16 h-16 text-lg shrink-0"
        />
        <div className="flex-1 min-w-0 pr-10">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="font-headline-md text-base font-semibold text-on-surface truncate">
              {creator.full_name || 'Unnamed Creator'}
            </h3>
            {creator.is_verified && (
              <span
                className="material-symbols-outlined text-secondary text-[18px] shrink-0"
                style={{ fontVariationSettings: "'FILL' 1" }}
                title="Verified creator"
              >
                verified
              </span>
            )}
          </div>
          {creator.location && (
            <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
              {creator.location}
            </p>
          )}
          <div className="flex items-center gap-1 mt-1 text-on-surface-variant font-label-md text-label-md">
            <span
              className="material-symbols-outlined text-[15px] text-amber-500"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
            <span>{creator.reliability_score ?? 100}</span>
            <span className="text-outline font-normal">
              · {creator.campaigns_completed || 0} campaigns
            </span>
          </div>
        </div>
      </div>

      {niches.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {niches.slice(0, 3).map((n) => (
            <Badge key={n} variant="secondary" className="text-[11px] capitalize">
              {n}
            </Badge>
          ))}
          {niches.length > 3 && (
            <Badge variant="secondary" className="text-[11px]">+{niches.length - 3}</Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 py-3 border-y border-outline-variant my-2">
        <div>
          <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide">
            Followers
          </p>
          <p className="font-data-mono text-base text-on-surface font-semibold">
            {formatNumber(creator.follower_count || 0)}
          </p>
        </div>
        <div>
          <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide">
            Starting rate
          </p>
          <p className="font-data-mono text-base text-on-surface font-semibold">
            {formatRateRange(creator.min_rate_zar, creator.max_rate_zar)}
          </p>
        </div>
      </div>

      <div className="mt-auto pt-3 flex flex-col gap-2">
        <Link
          to={profilePath}
          className="inline-flex w-full items-center justify-center gap-1.5 bg-primary-container text-on-primary-container font-label-lg text-label-lg py-2 px-4 rounded-lg hover:opacity-90 transition-opacity"
        >
          View Profile
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </Link>
        {canInvite ? (
          <button
            type="button"
            onClick={() => onInvite(creator)}
            className="inline-flex w-full items-center justify-center gap-1.5 bg-primary text-on-primary font-label-lg text-label-lg py-2 px-4 rounded-lg hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Invite to campaign
          </button>
        ) : inviteHref ? (
          <Link
            to={inviteHref}
            className="inline-flex w-full items-center justify-center gap-1.5 bg-surface-container-high text-on-surface font-label-lg text-label-lg py-2 px-4 rounded-lg hover:bg-surface-container-highest transition-colors border border-outline-variant"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Sign in to invite
          </Link>
        ) : null}
      </div>
    </article>
  )
}

const FilterSidebar = ({ filters, setFilters, onReset, canFavorite, favoritesCount }) => {
  const toggleNiche = (n) => {
    setFilters((f) => {
      const exists = f.niches.includes(n)
      return {
        ...f,
        niches: exists ? f.niches.filter((x) => x !== n) : [...f.niches, n],
      }
    })
  }

  const updateField = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setFilters((f) => ({ ...f, [key]: value }))
  }

  return (
    <aside className="w-full lg:w-72 lg:shrink-0">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 lg:sticky lg:top-20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline-md text-lg font-semibold text-on-surface">Filters</h2>
          <button
            type="button"
            onClick={onReset}
            className="text-label-md font-label-md text-primary hover:underline"
          >
            Reset
          </button>
        </div>

        {/* Niches */}
        <div className="mb-5">
          <h3 className="font-label-lg text-label-lg text-on-surface mb-2">Niche</h3>
          <div className="flex flex-wrap gap-1.5">
            {NICHES.map((n) => {
              const active = filters.niches.includes(n)
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleNiche(n)}
                  className={cn(
                    'px-3 py-1 rounded-full text-label-md font-label-md border transition-colors',
                    active
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                  )}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>

        {/* Follower range */}
        <div className="mb-5">
          <h3 className="font-label-lg text-label-lg text-on-surface mb-2">Followers</h3>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              placeholder="Min"
              value={filters.minFollowers}
              onChange={updateField('minFollowers')}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg font-body-sm text-body-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
            <input
              type="number"
              min="0"
              placeholder="Max"
              value={filters.maxFollowers}
              onChange={updateField('maxFollowers')}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg font-body-sm text-body-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </div>

        {/* Price range (ZAR) */}
        <div className="mb-5">
          <h3 className="font-label-lg text-label-lg text-on-surface mb-2">
            Starting rate (ZAR)
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              placeholder="Min"
              value={filters.minRate}
              onChange={updateField('minRate')}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg font-body-sm text-body-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
            <input
              type="number"
              min="0"
              placeholder="Max"
              value={filters.maxRate}
              onChange={updateField('maxRate')}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg font-body-sm text-body-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </div>

        {/* City */}
        <div className="mb-5">
          <h3 className="font-label-lg text-label-lg text-on-surface mb-2">City</h3>
          <input
            type="text"
            placeholder="e.g. Cape Town"
            value={filters.city}
            onChange={updateField('city')}
            className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg font-body-sm text-body-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        {/* Verified */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={updateField('verifiedOnly')}
            className="rounded border-outline-variant text-primary focus:ring-primary"
          />
          <span className="font-label-lg text-label-lg text-on-surface">Verified creators only</span>
        </label>

        {/* Favourites */}
        {canFavorite && (
          <label className="flex items-center gap-2 cursor-pointer mt-3 pt-3 border-t border-outline-variant">
            <input
              type="checkbox"
              checked={filters.favoritesOnly}
              onChange={updateField('favoritesOnly')}
              className="rounded border-outline-variant text-primary focus:ring-primary"
            />
            <span className="font-label-lg text-label-lg text-on-surface flex-1">
              Favourites only
            </span>
            <span className="font-label-md text-label-md text-on-surface-variant">
              {favoritesCount}
            </span>
          </label>
        )}
      </div>
    </aside>
  )
}

const Marketplace = () => {
  const { isAuthenticated, isDeveloper, user } = useAuth()
  const developerId = isDeveloper ? user?.id : null


  const [filters, setFilters] = useState(initialFilters)
  const [inviteCreator, setInviteCreator] = useState(null)
  const [creators, setCreators] = useState([])
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Set of creator user_ids the signed-in developer has favourited
  const [favoriteIds, setFavoriteIds] = useState(() => new Set())
  const [favoritesLoaded, setFavoritesLoaded] = useState(false)
  const [pendingFavorites, setPendingFavorites] = useState(() => new Set())

  // Debounce text inputs so we don't hammer Supabase on every keystroke
  const [debouncedFilters, setDebouncedFilters] = useState(filters)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedFilters(filters), 300)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [filters])

  // Load favourites for the signed-in developer
  useEffect(() => {
    let cancelled = false
    if (!developerId) {
      setFavoriteIds(new Set())
      setFavoritesLoaded(true)
      return () => {}
    }
    setFavoritesLoaded(false)
    fetchDeveloperFavorites(developerId)
      .then((rows) => {
        if (cancelled) return
        setFavoriteIds(new Set(rows.map((r) => r.creator_id)))
        setFavoritesLoaded(true)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load favourites:', err)
        setFavoritesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [developerId])

  // If the user is no longer a developer (e.g. signs out) but the
  // "favourites only" filter was on, clear it so they don't see an empty grid.
  useEffect(() => {
    if (!isDeveloper && filters.favoritesOnly) {
      setFilters((f) => ({ ...f, favoritesOnly: false }))
    }
  }, [isDeveloper, filters.favoritesOnly])

  // We capture `favoriteIds` via a ref so `buildQuery` (and therefore the
  // fetch effect) NEVER takes the favourites set as a dependency. Toggling
  // a single heart must not refetch the whole grid. When the user flips
  // "Favourites only" on/off we still refetch — that is captured via
  // `debouncedFilters.favoritesOnly` already.
  const favoriteIdsRef = useRef(favoriteIds)
  useEffect(() => {
    favoriteIdsRef.current = favoriteIds
  }, [favoriteIds])

  // Trigger a single refetch once favourites finish loading IF the
  // "Favourites only" filter is active — otherwise enabling the filter
  // before the initial favourites fetch returns would leave an empty grid.
  // For all other states this dep is constant, so it never causes refetch.
  const favLoadedKey =
    debouncedFilters.favoritesOnly && isDeveloper && favoritesLoaded
      ? 'loaded'
      : 'pending'

  const buildQuery = useCallback((countMode = false) => {
    let q = supabase.from('creator_marketplace_public').select(
      countMode ? 'creator_profile_id' : '*',
      countMode ? { count: 'exact', head: true } : { count: 'exact' }
    )

    const f = debouncedFilters

    if (f.search.trim()) q = q.ilike('full_name', `%${f.search.trim()}%`)
    if (f.city.trim()) q = q.ilike('location', `%${f.city.trim()}%`)
    if (f.verifiedOnly) q = q.eq('is_verified', true)
    if (f.niches.length > 0) q = q.overlaps('niche', f.niches)

    const minF = Number(f.minFollowers)
    const maxF = Number(f.maxFollowers)
    if (Number.isFinite(minF) && minF > 0) q = q.gte('follower_count', minF)
    if (Number.isFinite(maxF) && maxF > 0) q = q.lte('follower_count', maxF)

    const minR = Number(f.minRate)
    const maxR = Number(f.maxRate)
    if (Number.isFinite(minR) && minR > 0) q = q.gte('min_rate_zar', minR)
    if (Number.isFinite(maxR) && maxR > 0) q = q.lte('min_rate_zar', maxR)

    if (f.favoritesOnly && isDeveloper) {
      // PostgREST `in` requires a non-empty list — short-circuit with an
      // impossible UUID when the developer has no favourites yet so the
      // grid renders as empty rather than ignoring the filter.
      const ids = Array.from(favoriteIdsRef.current)
      q = q.in(
        'user_id',
        ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']
      )
    }

    return q
    // favLoadedKey is intentionally a dependency even though the callback
    // does not read it: it forces the query to rebuild once the favourites
    // list has loaded. ESLint cannot see that, and removing it leaves an
    // empty grid when filtering by favourites.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilters, isDeveloper, favLoadedKey])

  // Reset paging when filters change
  useEffect(() => {
    setPage(0)
  }, [debouncedFilters])

  // Fetch results
  useEffect(() => {
    let cancelled = false
    const fetchPage = async () => {
      const isFirstPage = page === 0
      if (isFirstPage) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      try {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data, error, count } = await buildQuery()
          .order('reliability_score', { ascending: false, nullsFirst: false })
          .order('campaigns_completed', { ascending: false, nullsFirst: false })
          .range(from, to)

        if (cancelled) return
        if (error) throw error

        setTotalCount(count || 0)
        setCreators((prev) => (isFirstPage ? data || [] : [...prev, ...(data || [])]))
      } catch (err) {
        if (cancelled) return
        console.error('Marketplace fetch error:', err)
        setError(err.message || 'Failed to load creators')
      } finally {
        // A `return` inside finally discards any exception still propagating,
        // so guard with a conditional block instead of returning early.
        if (!cancelled) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    }
    fetchPage()
    return () => {
      cancelled = true
    }
  }, [buildQuery, page])

  const resetFilters = () => setFilters(initialFilters)
  const loadMore = () => setPage((p) => p + 1)

  const hasMore = creators.length < totalCount

  const handleToggleFavorite = useCallback(
    async (creator) => {
      const creatorUserId = creator?.user_id
      if (!creatorUserId) return

      // Anonymous or non-developer → prompt sign in
      if (!isAuthenticated) {
        toast(
          (t) => (
            <span className="flex items-center gap-3">
              <span>Sign in to save creators</span>
              <Link
                to="/login"
                onClick={() => toast.dismiss(t.id)}
                className="font-semibold text-primary underline"
              >
                Sign in
              </Link>
            </span>
          ),
          { icon: '🔖' }
        )
        return
      }
      if (!isDeveloper || !developerId) {
        toast.error('Only developer accounts can save favourites.')
        return
      }
      if (pendingFavorites.has(creatorUserId)) return

      const wasFavorite = favoriteIds.has(creatorUserId)
      // When the "Favourites only" filter is active and the developer is
      // unfavouriting, the card disappears from the grid. Snapshot state
      // for rollback so we never need to refetch.
      const removingFromFilteredGrid =
        wasFavorite && debouncedFilters.favoritesOnly && isDeveloper
      let removedCreator = null

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        if (wasFavorite) next.delete(creatorUserId)
        else next.add(creatorUserId)
        return next
      })
      if (removingFromFilteredGrid) {
        setCreators((prev) => {
          const idx = prev.findIndex((c) => c.user_id === creatorUserId)
          if (idx === -1) return prev
          removedCreator = prev[idx]
          const next = prev.slice()
          next.splice(idx, 1)
          return next
        })
        setTotalCount((c) => Math.max(0, c - 1))
      }
      setPendingFavorites((prev) => {
        const next = new Set(prev)
        next.add(creatorUserId)
        return next
      })

      try {
        if (wasFavorite) {
          await removeDeveloperFavorite(developerId, creatorUserId)
        } else {
          await addDeveloperFavorite(developerId, creatorUserId)
        }
      } catch (err) {
        // Roll back on error
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          if (wasFavorite) next.add(creatorUserId)
          else next.delete(creatorUserId)
          return next
        })
        if (removingFromFilteredGrid && removedCreator) {
          setCreators((prev) => {
            if (prev.some((c) => c.user_id === creatorUserId)) return prev
            return [...prev, removedCreator]
          })
          setTotalCount((c) => c + 1)
        }
        console.error('Favourite toggle failed:', err)
        toast.error(
          wasFavorite ? 'Could not remove favourite' : 'Could not save favourite'
        )
      } finally {
        setPendingFavorites((prev) => {
          const next = new Set(prev)
          next.delete(creatorUserId)
          return next
        })
      }
    },
    [
      isAuthenticated,
      isDeveloper,
      developerId,
      favoriteIds,
      pendingFavorites,
      debouncedFilters.favoritesOnly,
    ]
  )

  return (
    <div className="bg-background min-h-[calc(100vh-4rem)]">
      {/* Hero / search */}
      <section className="border-b border-outline-variant bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="max-w-3xl">
            <span className="inline-block font-label-md text-label-md uppercase tracking-wider text-primary bg-primary-fixed px-3 py-1 rounded-full mb-3">
              Creator Marketplace
            </span>
            <h1 className="font-headline-xl text-3xl sm:text-4xl font-bold text-on-surface mb-3">
              Discover vetted property creators
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Browse, filter, and shortlist creators specializing in property
              tours, architecture, lifestyle, and more — across South Africa.
            </p>
          </div>

          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search creators by name…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-full pl-10 pr-4 py-3 bg-surface border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="lg:hidden inline-flex items-center justify-center gap-2 px-4 py-3 border border-outline-variant rounded-lg text-on-surface bg-surface-container-lowest hover:bg-surface-container transition-colors font-label-lg text-label-lg"
            >
              <span className="material-symbols-outlined text-[20px]">tune</span>
              {sidebarOpen ? 'Hide filters' : 'Filters'}
            </button>
            {!isAuthenticated && (
              <Link
                to="/register?role=developer"
                className="hidden sm:inline-flex items-center justify-center gap-2 bg-secondary text-on-secondary px-5 py-3 rounded-lg font-label-lg text-label-lg hover:opacity-90 transition-colors"
              >
                Sign up to invite
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className={cn('lg:block', sidebarOpen ? 'block' : 'hidden')}>
            <FilterSidebar
              filters={filters}
              setFilters={setFilters}
              onReset={resetFilters}
              canFavorite={isDeveloper}
              favoritesCount={favoriteIds.size}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-end justify-between mb-4">
              <h2 className="font-headline-md text-headline-md text-on-surface">
                {loading ? 'Loading creators…' : `${totalCount} creator${totalCount === 1 ? '' : 's'}`}
              </h2>
            </div>

            {error ? (
              <ErrorState
                title="Couldn't load creators"
                message={error}
                onRetry={() => setPage(0)}
              />
            ) : loading ? (
              <div className="flex items-center justify-center py-24">
                <LoadingSpinner size="lg" text="Loading creators…" />
              </div>
            ) : creators.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No creators match your filters"
                description="Try removing some filters or broadening your search."
                action={resetFilters}
                actionLabel="Reset filters"
              />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                  {creators.map((c) => (
                    <CreatorCard
                      key={c.creator_profile_id}
                      creator={c}
                      isAuthenticated={isAuthenticated}
                      canInvite={isDeveloper}
                      onInvite={setInviteCreator}
                      isFavorite={favoriteIds.has(c.user_id)}
                      favoriteBusy={pendingFavorites.has(c.user_id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div className="mt-8 flex justify-center">
                    <Button
                      variant="secondary"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Loading…' : 'Load more creators'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
      <InviteToCampaignModal
        isOpen={!!inviteCreator}
        onClose={() => setInviteCreator(null)}
        creatorUserId={inviteCreator?.user_id}
        creatorName={inviteCreator?.full_name}
        creatorAvatarUrl={inviteCreator?.avatar_url}
      />
    </div>
  )
}

export default Marketplace
