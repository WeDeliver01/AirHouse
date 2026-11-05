/**
 * Supabase stand-in for end-to-end tests.
 *
 * Intercepts the REST, auth, RPC and storage calls the application makes and
 * serves them from an in-memory dataset, so the journeys exercise the real
 * React application without a live project or network access.
 *
 * This deliberately does NOT reimplement Row Level Security. The access rules
 * are tested for real against PostgreSQL in `npm run test:db`; duplicating
 * them here in JavaScript would prove only that the mock agrees with itself.
 * What these tests cover is the part the database suite cannot reach: routing,
 * guards, forms, validation messages and the state a user actually sees.
 */

const PROJECT = 'https://stub.supabase.co'

/** A fresh dataset per test, so tests cannot leak state into each other. */
export function seedData() {
  return {
    profiles: [
      {
        id: 'dev-1', email: 'dev@example.com', role: 'developer',
        full_name: 'Dev One', company_name: 'Atlas Property', is_verified: true,
        is_super_admin: false, avatar_url: null,
      },
      {
        id: 'creator-1', email: 'creator@example.com', role: 'creator',
        full_name: 'Thandi Mokoena', is_verified: true, is_super_admin: false,
        avatar_url: null,
      },
      {
        id: 'admin-1', email: 'admin@example.com', role: 'admin',
        full_name: 'Ops Admin', is_verified: true, is_super_admin: true,
        avatar_url: null,
      },
    ],
    creator_profiles: [
      {
        id: 'cp-1', user_id: 'creator-1', niche: ['property'],
        instagram_handle: 'thandi', follower_count: 25000,
        location: 'Cape Town', reliability_score: 96, campaigns_completed: 4,
        total_leads_generated: 38,
      },
    ],
    campaigns: [
      {
        id: 'camp-1', developer_id: 'dev-1', title: 'Sea Point Launch',
        property_name: 'The Atlantic', property_location: 'Sea Point',
        property_type: 'apartment', status: 'active',
        description: 'Luxury apartments with ocean views.',
        total_budget: 100000, platform_fee: 25000, creator_budget: 75000,
        escrow_amount: 75000, amount_paid_out: 0,
        escrow_wallet_id: 'wallet-escrow-1', funded_at: '2026-10-01T09:00:00Z',
        referral_code: 'SEAPOINT', property_images: [], brochure_urls: [],
        key_selling_points: ['Ocean views', 'Secure parking'],
        created_at: '2026-09-20T09:00:00Z',
        developer: { full_name: 'Dev One', company_name: 'Atlas Property', avatar_url: null },
      },
      {
        id: 'camp-2', developer_id: 'dev-1', title: 'Draft Campaign',
        property_name: 'The Draft', status: 'draft',
        total_budget: 50000, platform_fee: 12500, creator_budget: 37500,
        escrow_amount: 0, amount_paid_out: 0, escrow_wallet_id: null,
        funded_at: null, referral_code: 'DRAFT1', property_images: [],
        created_at: '2026-10-15T09:00:00Z',
        developer: { full_name: 'Dev One', company_name: 'Atlas Property', avatar_url: null },
      },
    ],
    campaign_assignments: [
      { id: 'assign-1', campaign_id: 'camp-1', creator_id: 'creator-1', status: 'active' },
    ],
    campaign_applications: [
      {
        id: 'app-1', campaign_id: 'camp-1', creator_id: 'creator-1',
        status: 'pending', pitch: 'I shoot property reels in Cape Town.',
        created_at: '2026-10-05T09:00:00Z',
      },
    ],
    content_submissions: [
      {
        id: 'sub-1', assignment_id: 'assign-1', content_type: 'reel',
        status: 'pending', payment_amount: 2500,
        content_url: 'https://example.com/reel', created_at: '2026-10-20T09:00:00Z',
      },
    ],
    leads: [
      {
        id: 'lead-1', campaign_id: 'camp-1', creator_id: 'creator-1',
        lead_name: 'Sipho Dlamini', lead_email: 'sipho@example.com',
        lead_phone: '0821234567', status: 'new', pipeline_stage: 'new',
        interest_level: 'hot', consent_given: true,
        created_at: '2026-10-22T09:00:00Z',
      },
    ],
    wallets: [
      { id: 'wallet-dev-1', user_id: 'dev-1', wallet_type: 'developer', balance: 0, pending_balance: 0, total_earned: 0, total_withdrawn: 0 },
      { id: 'wallet-creator-1', user_id: 'creator-1', wallet_type: 'creator', balance: 4500, pending_balance: 0, total_earned: 4500, total_withdrawn: 0 },
      { id: 'wallet-escrow-1', user_id: 'dev-1', wallet_type: 'escrow', balance: 75000, pending_balance: 0 },
    ],
    wallet_transactions: [
      {
        id: 'wt-1', wallet_id: 'wallet-creator-1', transaction_type: 'escrow_release',
        amount: 4500, net_amount: 4500, balance_before: 0, balance_after: 4500,
        description: 'Content approved', reference_number: 'REL-camp-1-aaa',
        created_at: '2026-10-21T09:00:00Z',
      },
    ],
    payment_intents: [],
    platform_settings: [
      { key: 'payments_mode', value: 'manual' },
      { key: 'platform_fee_rate', value: 0.25 },
      { key: 'payout_fee_rate', value: 0.03 },
      { key: 'min_payout_amount', value: 100 },
      { key: 'require_mfa_for_admins', value: false },
    ],
    contracts: [
      {
        id: 'contract-1', campaign_id: 'camp-1', creator_id: 'creator-1',
        developer_id: 'dev-1', status: 'signed', version: 1,
        signed_at: '2026-10-02T09:00:00Z',
      },
    ],
    disputes: [
      {
        id: 'dispute-1', campaign_id: 'camp-1', raised_by: 'creator-1',
        status: 'open', title: 'Payment not released',
        dispute_type: 'payment', created_at: '2026-10-25T09:00:00Z',
      },
    ],
    dispute_messages: [],
    creator_tracking_links: [
      {
        id: 'link-1', assignment_id: 'assign-1', campaign_id: 'camp-1',
        creator_id: 'creator-1', tracking_code: 'TRK-SEAPOINT-01',
        full_url: 'https://airhouse.co.za/lead/camp-1?ref=TRK-SEAPOINT-01',
        clicks: 120, leads: 7, conversions: 1,
      },
    ],
    notifications: [],
    messages: [],
    super_admins: [{ id: 'sa-1', user_id: 'admin-1', is_active: true }],
  }
}

const USERS = {
  'dev@example.com': { id: 'dev-1', role: 'developer' },
  'creator@example.com': { id: 'creator-1', role: 'creator' },
  'admin@example.com': { id: 'admin-1', role: 'admin' },
}

/** Parse PostgREST filter params such as `id=eq.camp-1` into predicates. */
function buildFilters(searchParams) {
  const filters = []
  for (const [key, raw] of searchParams.entries()) {
    if (['select', 'order', 'limit', 'offset', 'apikey'].includes(key)) continue
    const [op, ...rest] = raw.split('.')
    const value = rest.join('.')
    filters.push({ column: key, op, value })
  }
  return filters
}

function matches(row, filters) {
  return filters.every(({ column, op, value }) => {
    const actual = row?.[column]
    switch (op) {
      case 'eq':   return String(actual) === value
      case 'neq':  return String(actual) !== value
      case 'is':   return value === 'null' ? actual == null : String(actual) === value
      case 'in': {
        const list = value.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''))
        return list.includes(String(actual))
      }
      case 'gt':   return Number(actual) > Number(value)
      case 'gte':  return Number(actual) >= Number(value)
      case 'lt':   return Number(actual) < Number(value)
      case 'lte':  return Number(actual) <= Number(value)
      case 'like':
      case 'ilike': {
        const pattern = value.replace(/\*/g, '').replace(/%/g, '').toLowerCase()
        return String(actual ?? '').toLowerCase().includes(pattern)
      }
      default: return true
    }
  })
}

/**
 * Install the mock on a page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {string|null} options.signedInAs email of the user to sign in, or null
 * @param {object} options.data           dataset override
 */
export async function installSupabaseMock(page, { signedInAs = null, data = null } = {}) {
  const db = data || seedData()
  const state = { db, session: null, rpcCalls: [], inserts: [] }

  if (signedInAs) {
    const user = USERS[signedInAs]
    state.session = {
      access_token: `stub-token-${user.id}`,
      refresh_token: 'stub-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: user.id,
        email: signedInAs,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: { role: user.role },
        created_at: '2026-01-01T00:00:00Z',
      },
    }

    // Seed the session into storage before any application script runs, so
    // the app boots already authenticated rather than flashing the login page.
    await page.addInitScript(
      ([session, projectRef]) => {
        try {
          window.localStorage.setItem(
            `sb-${projectRef}-auth-token`,
            JSON.stringify({ ...session, expires_at: session.expires_at }),
          )
        } catch {
          /* storage unavailable; the auth route mock still answers */
        }
      },
      [state.session, 'stub'],
    )
  }

  const json = (body, status = 200, headers = {}) => ({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', ...headers },
    body: JSON.stringify(body),
  })

  await page.route(`${PROJECT}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      })
    }

    // ---- Auth -------------------------------------------------------------
    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/token')) {
        let body = {}
        try { body = JSON.parse(request.postData() || '{}') } catch { /* ignore */ }
        const user = USERS[body.email]
        if (!user || body.password === 'wrong-password') {
          return route.fulfill(json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400))
        }
        state.session = {
          access_token: `stub-token-${user.id}`,
          refresh_token: 'stub-refresh',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: {
            id: user.id, email: body.email, aud: 'authenticated', role: 'authenticated',
            app_metadata: {}, user_metadata: { role: user.role },
            created_at: '2026-01-01T00:00:00Z',
          },
        }
        return route.fulfill(json(state.session))
      }

      if (path.endsWith('/signup')) {
        let body = {}
        try { body = JSON.parse(request.postData() || '{}') } catch { /* ignore */ }
        const id = `new-${Date.now()}`
        const requested = body.data?.role
        // Mirror the database clamp: anything but developer becomes creator.
        const role = requested === 'developer' ? 'developer' : 'creator'
        state.db.profiles.push({
          id, email: body.email, role, full_name: body.data?.full_name || 'New User',
          is_verified: false, is_super_admin: false,
        })
        return route.fulfill(json({
          id, email: body.email, aud: 'authenticated',
          user_metadata: { role, full_name: body.data?.full_name },
          created_at: new Date().toISOString(),
        }))
      }

      if (path.endsWith('/user')) {
        if (!state.session) return route.fulfill(json({ message: 'Unauthorized' }, 401))
        return route.fulfill(json(state.session.user))
      }

      if (path.endsWith('/logout')) {
        state.session = null
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
      }

      if (path.includes('/factors')) {
        return route.fulfill(json({ totp: [], all: [] }))
      }

      if (path.endsWith('/recover')) {
        return route.fulfill(json({}))
      }

      return route.fulfill(json({}))
    }

    // ---- RPC --------------------------------------------------------------
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop()
      let args = {}
      try { args = JSON.parse(request.postData() || '{}') } catch { /* ignore */ }
      state.rpcCalls.push({ fn, args })

      switch (fn) {
        case 'create_payment_intent': {
          const id = `intent-${state.db.payment_intents.length + 1}`
          const reference = `AH-E2E${state.db.payment_intents.length + 1}`
          state.db.payment_intents.push({
            id, reference, campaign_id: args.p_campaign_id, payer_id: 'dev-1',
            amount_cents: args.p_amount_cents, status: 'awaiting_payment',
            created_at: new Date().toISOString(),
          })
          return route.fulfill(json({
            success: true, payment_intent_id: id, reference,
            amount_cents: args.p_amount_cents, status: 'awaiting_payment',
          }))
        }
        case 'submit_payment_proof':
          return route.fulfill(json({ success: true, status: 'under_review' }))
        case 'confirm_manual_payment':
          return route.fulfill(json({
            success: true, amount_cents: 10000000,
            platform_fee_cents: 2500000, campaign_funds_cents: 7500000,
          }))
        case 'release_campaign_escrow':
          return route.fulfill(json({ success: true, amount: args.p_amount }))
        case 'request_creator_payout':
          return route.fulfill(json({
            success: true, payout_id: 'payout-1', amount: args.p_amount,
            payout_fee: Number((args.p_amount * 0.03).toFixed(2)),
            net_amount: Number((args.p_amount * 0.97).toFixed(2)), status: 'pending',
          }))
        case 'run_reconciliation':
          return route.fulfill(json({
            balanced: true, discrepancies: [],
            position: { cash_held_cents: 10000000, campaign_funds_cents: 7500000, owed_to_creators_cents: 450000 },
          }))
        case 'record_audit_event':
          return route.fulfill(json('audit-1'))
        case 'set_platform_setting': {
          const row = state.db.platform_settings.find((s) => s.key === args.p_key)
          if (row) row.value = JSON.parse(args.p_value)
          return route.fulfill(json(args.p_value))
        }
        default:
          return route.fulfill(json(null))
      }
    }

    // ---- REST -------------------------------------------------------------
    if (path.startsWith('/rest/v1/')) {
      const table = path.replace('/rest/v1/', '').split('?')[0]
      const rows = state.db[table]

      if (!Array.isArray(rows)) {
        return route.fulfill(json([]))
      }

      const wantsSingle = (request.headers().accept || '').includes('vnd.pgrst.object')

      if (method === 'GET') {
        const filtered = rows.filter((row) => matches(row, buildFilters(url.searchParams)))
        if (wantsSingle) {
          return filtered.length
            ? route.fulfill(json(filtered[0]))
            : route.fulfill(json({ code: 'PGRST116', message: 'No rows found' }, 406))
        }
        return route.fulfill(json(filtered))
      }

      if (method === 'POST') {
        let payload = {}
        try { payload = JSON.parse(request.postData() || '{}') } catch { /* ignore */ }
        const items = Array.isArray(payload) ? payload : [payload]
        const created = items.map((item, index) => ({
          id: item.id || `${table}-new-${rows.length + index + 1}`,
          created_at: new Date().toISOString(),
          ...item,
        }))
        rows.push(...created)
        state.inserts.push({ table, rows: created })
        return route.fulfill(json(wantsSingle ? created[0] : created, 201))
      }

      if (method === 'PATCH') {
        let payload = {}
        try { payload = JSON.parse(request.postData() || '{}') } catch { /* ignore */ }
        const filters = buildFilters(url.searchParams)
        const updated = []
        rows.forEach((row, index) => {
          if (matches(row, filters)) {
            rows[index] = { ...row, ...payload }
            updated.push(rows[index])
          }
        })
        return route.fulfill(json(wantsSingle ? updated[0] ?? null : updated))
      }

      if (method === 'DELETE') {
        const filters = buildFilters(url.searchParams)
        const kept = rows.filter((row) => !matches(row, filters))
        state.db[table] = kept
        return route.fulfill(json([]))
      }
    }

    // ---- Storage ----------------------------------------------------------
    if (path.startsWith('/storage/v1/')) {
      if (method === 'POST' || method === 'PUT') {
        return route.fulfill(json({ Key: 'stub/path', path: 'stub/path' }))
      }
      if (path.includes('/sign')) {
        return route.fulfill(json({ signedURL: '/stub-signed-url' }))
      }
      return route.fulfill(json({}))
    }

    return route.fulfill(json({}))
  })

  return state
}

export { PROJECT, USERS }

/**
 * Dismiss the cookie consent banner, which otherwise overlays the page and
 * intercepts clicks. Accepting is the quickest path and mirrors what most
 * visitors do.
 */
export async function dismissCookieBanner(page) {
  const accept = page.getByRole('button', { name: /accept all/i })
  try {
    await accept.waitFor({ state: 'visible', timeout: 3000 })
    await accept.click()
    await accept.waitFor({ state: 'hidden', timeout: 3000 })
  } catch {
    // Banner not shown (already dismissed, or disabled in this build).
  }
}

/** Navigate and clear the consent banner in one step. */
export async function visit(page, path) {
  await page.goto(path)
  await dismissCookieBanner(page)
}
