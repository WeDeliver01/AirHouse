import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  PageHeader,
  Card,
  Button,
  Chip,
  Icon,
} from '../../components/stitch'
import { LoadingSpinner, ErrorState } from '../../components/ui'
import { cn } from '../../lib/utils'
import { computeBadges } from '../../lib/badges'
import { fetchAvgResponseHours } from '../../lib/reliability'

const Achievements = () => {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({
    reliabilityScore: 100,
    campaignsCompleted: 0,
    totalLeads: 0,
    totalEarnings: 0,
    contentApprovalRate: 100,
    totalSubmissions: 0,
    avgResponseHours: null,
  })

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      const { data: creator } = await supabase
        .from('creator_profiles')
        .select('id, reliability_score, campaigns_completed, total_leads_generated')
        .eq('user_id', user.id)
        .single()

      const { data: wallet } = await supabase
        .from('wallets')
        .select('total_earned')
        .eq('user_id', user.id)
        .eq('wallet_type', 'creator')
        .single()

      const { data: submissions } = await supabase
        .from('content_submissions')
        .select('id, status')
        .eq('creator_id', user.id)

      const totalSubmissions = submissions?.length || 0
      const approvedFirst = submissions?.filter((s) => s.status === 'approved').length || 0
      const approvalRate = totalSubmissions > 0 ? Math.round((approvedFirst / totalSubmissions) * 100) : 100

      const avgResponseHours = await fetchAvgResponseHours(user.id)

      setStats({
        reliabilityScore: creator?.reliability_score || 100,
        campaignsCompleted: creator?.campaigns_completed || 0,
        totalLeads: creator?.total_leads_generated || 0,
        totalEarnings: wallet?.total_earned || 0,
        contentApprovalRate: approvalRate,
        totalSubmissions,
        avgResponseHours,
      })
    } catch (e) {
      console.error(e)
      setError('Failed to load achievements')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  const badges = computeBadges(stats)
  const unlockedCount = badges.filter((b) => b.unlocked).length

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-lg">
      <PageHeader
        eyebrow="Social Proof"
        title="Achievement Badges"
        description="Showcase your trust and performance milestones. Earned badges appear on your public profile to help developers shortlist you."
        actions={
          <>
            <Link to="/creator/scorecard">
              <Button variant="ghost" icon="arrow_back">
                Back to Scorecard
              </Button>
            </Link>
            {profile?.id && (
              <Link to={`/creators/${profile.id}`}>
                <Button variant="secondary" icon="open_in_new">
                  View Public Profile
                </Button>
              </Link>
            )}
          </>
        }
      />

      {/* Summary card */}
      <div className="grid grid-cols-12 gap-gutter">
        <Card className="col-span-12 lg:col-span-8 bg-secondary-container relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 rounded-full pointer-events-none" />
          <div className="relative flex items-center gap-md">
            <div className="w-20 h-20 rounded-full bg-surface-container-lowest border-4 border-surface-container-lowest/40 flex items-center justify-center flex-shrink-0">
              <Icon
                name="workspace_premium"
                size={40}
                className="text-on-secondary-container"
                style={{ fontVariationSettings: "'FILL' 1" }}
              />
            </div>
            <div className="min-w-0">
              <div className="font-label-md text-label-md uppercase tracking-widest text-on-secondary-container/80 mb-xs">
                Verified Creator
              </div>
              <h2 className="font-headline-lg text-headline-lg text-on-secondary-container">
                {unlockedCount} of {badges.length} badges earned
              </h2>
              <p className="font-body-md text-body-md text-on-secondary-container/90 mt-xs max-w-lg">
                Each badge represents a milestone in trust, performance, or social proof — earned automatically as you grow on the platform.
              </p>
            </div>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-4">
          <h4 className="font-label-lg text-label-lg uppercase tracking-widest text-on-surface mb-md border-b border-outline-variant pb-sm">
            Why Badges Matter
          </h4>
          <ul className="flex flex-col gap-sm">
            {[
              { icon: 'visibility', title: 'Higher Visibility', desc: 'Appear higher in developer searches.' },
              { icon: 'handshake', title: 'Premium Access', desc: 'Unlock invitations to top-tier campaigns.' },
              { icon: 'verified_user', title: 'Increased Trust', desc: 'Social proof boosts conversion by ~40%.' },
            ].map((b, i) => (
              <li key={i} className="flex items-start gap-sm">
                <Icon
                  name={b.icon}
                  size={18}
                  className="text-primary mt-xs flex-shrink-0"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                />
                <div>
                  <div className="font-label-lg text-label-lg text-on-surface">{b.title}</div>
                  <div className="font-body-sm text-body-sm text-on-surface-variant">{b.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Badges grid */}
      <Card>
        <div className="flex items-center justify-between mb-md">
          <h3 className="font-headline-md text-headline-md text-on-surface">All Badges</h3>
          <div className="flex items-center gap-sm">
            <Chip tone="success" icon="verified">
              {unlockedCount} earned
            </Chip>
            <Chip tone="neutral" icon="lock">
              {badges.length - unlockedCount} locked
            </Chip>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
          {badges.map((b) => (
            <div
              key={b.id}
              className={cn(
                'rounded p-md flex flex-col items-center text-center border transition-colors',
                b.unlocked
                  ? cn(b.accent)
                  : 'bg-surface-container-low border-outline-variant text-on-surface-variant',
              )}
            >
              <div
                className={cn(
                  'w-16 h-16 rounded-full flex items-center justify-center mb-sm relative',
                  b.unlocked
                    ? 'bg-surface-container-lowest/70'
                    : 'bg-surface-container border border-dashed border-outline-variant',
                )}
              >
                <Icon
                  name={b.unlocked ? b.icon : 'lock'}
                  size={32}
                  className={b.unlocked ? '' : 'text-on-surface-variant'}
                  style={b.unlocked ? { fontVariationSettings: "'FILL' 1" } : undefined}
                />
              </div>
              <div
                className={cn(
                  'font-label-md text-label-md uppercase tracking-wider mb-xs',
                  b.unlocked ? '' : 'text-on-surface-variant',
                )}
              >
                {b.unlocked ? 'Unlocked' : 'Locked'}
              </div>
              <h4
                className={cn(
                  'font-headline-md text-headline-md',
                  b.unlocked ? '' : 'text-on-surface',
                )}
              >
                {b.title}
              </h4>
              <p
                className={cn(
                  'font-body-sm text-body-sm mt-xs',
                  b.unlocked ? '' : 'text-on-surface-variant',
                )}
              >
                {b.description}
              </p>
              {!b.unlocked && (
                <div className="w-full mt-md">
                  <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${b.pct}%` }}
                    />
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                    {b.pct}% to unlock
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* CTA */}
      <Card padding="lg" className="text-center">
        <Icon
          name="rocket_launch"
          size={32}
          className="text-primary mb-sm inline-block"
          style={{ fontVariationSettings: "'FILL' 1" }}
        />
        <h3 className="font-headline-md text-headline-md text-on-surface mb-xs">
          Keep building your reputation
        </h3>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-lg mx-auto mb-md">
          Apply to more campaigns, deliver on time, and watch your badges unlock automatically.
        </p>
        <div className="flex justify-center gap-sm flex-wrap">
          <Link to="/creator/campaigns">
            <Button variant="primary" icon="campaign">
              Find Campaigns
            </Button>
          </Link>
          <Link to="/creator/scorecard">
            <Button variant="ghost" icon="bar_chart">
              View Scorecard
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}

export default Achievements
