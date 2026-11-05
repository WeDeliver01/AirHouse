export const BADGE_DEFS = [
  {
    id: 'first_campaign',
    title: 'First Campaign',
    description: 'Completed your first campaign for a developer.',
    icon: 'campaign',
    accent: 'bg-primary-container/30 text-on-primary-container border-primary-container',
    requires: (s) => s.campaignsCompleted >= 1,
    progress: (s) => Math.min(s.campaignsCompleted, 1),
    target: 1,
  },
  {
    id: 'lead_generator',
    title: 'Lead Generator',
    description: 'Generated 10+ qualified leads from your content.',
    icon: 'trending_up',
    accent: 'bg-secondary-container text-on-secondary-container border-secondary-container',
    requires: (s) => s.totalLeads >= 10,
    progress: (s) => Math.min(s.totalLeads, 10),
    target: 10,
  },
  {
    id: 'rising_star',
    title: 'Rising Star',
    description: 'Maintain a reliability score of 90 or above.',
    icon: 'star',
    accent: 'bg-tertiary-fixed text-on-tertiary-fixed-variant border-tertiary-fixed-dim',
    requires: (s) => s.reliabilityScore >= 90,
    progress: (s) => Math.min(s.reliabilityScore, 90),
    target: 90,
  },
  {
    id: 'top_earner',
    title: 'Top Earner',
    description: 'Earned R10,000 or more in lifetime payouts.',
    icon: 'payments',
    accent: 'bg-secondary-fixed text-on-secondary-fixed border-secondary-fixed-dim',
    requires: (s) => s.totalEarnings >= 10000,
    progress: (s) => Math.min(s.totalEarnings, 10000),
    target: 10000,
  },
  {
    id: 'speed_demon',
    title: 'Speed Demon',
    description: 'Average response time under 24 hours.',
    icon: 'bolt',
    accent: 'bg-primary-fixed text-on-primary-fixed-variant border-primary-fixed-dim',
    requires: (s) => s.avgResponseHours != null && s.avgResponseHours < 24,
    progress: (s) =>
      s.avgResponseHours == null ? 0 : Math.max(0, Math.min(24, 24 - s.avgResponseHours)),
    target: 24,
  },
  {
    id: 'perfectionist',
    title: 'Perfectionist',
    description: '100% content approval rate on first submission.',
    icon: 'verified',
    accent: 'bg-secondary-container text-on-secondary-container border-secondary-container',
    requires: (s) => s.totalSubmissions > 0 && s.contentApprovalRate >= 100,
    progress: (s) => s.contentApprovalRate,
    target: 100,
  },
  {
    id: 'consistent',
    title: 'Consistent Pro',
    description: 'Complete 5 campaigns to demonstrate consistency.',
    icon: 'workspace_premium',
    accent: 'bg-tertiary-fixed text-on-tertiary-fixed-variant border-tertiary-fixed-dim',
    requires: (s) => s.campaignsCompleted >= 5,
    progress: (s) => Math.min(s.campaignsCompleted, 5),
    target: 5,
  },
  {
    id: 'partner',
    title: 'Trusted Partner',
    description: 'Maintain 95+ reliability across 10 campaigns.',
    icon: 'shield_person',
    accent: 'bg-primary-container/30 text-on-primary-container border-primary-container',
    requires: (s) => s.campaignsCompleted >= 10 && s.reliabilityScore >= 95,
    progress: (s) => Math.min(s.campaignsCompleted, 10),
    target: 10,
  },
]

export const DEFAULT_BADGE_STATS = {
  reliabilityScore: 100,
  campaignsCompleted: 0,
  totalLeads: 0,
  totalEarnings: 0,
  contentApprovalRate: 100,
  totalSubmissions: 0,
  avgResponseHours: null,
}

export const computeBadges = (stats) => {
  const merged = { ...DEFAULT_BADGE_STATS, ...stats }
  return BADGE_DEFS.map((b) => ({
    ...b,
    unlocked: b.requires(merged),
    pct: Math.round((b.progress(merged) / b.target) * 100),
  }))
}
