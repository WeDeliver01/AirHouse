import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate } from 'k6/metrics'

/**
 * Lead submission under load.
 *
 * This is the revenue path: an enquiry that is dropped is money lost, so the
 * error threshold here is tighter than for browsing.
 *
 * Requires a staging campaign that is accepting leads.
 *   k6 run -e BASE_URL=... -e CAMPAIGN_ID=... -e SUPABASE_URL=... -e ANON_KEY=... load-tests/lead-capture.js
 */

const submitted = new Counter('leads_submitted')
const failures = new Rate('failed_submissions')

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173'
const SUPABASE_URL = __ENV.SUPABASE_URL || ''
const ANON_KEY = __ENV.ANON_KEY || ''
const CAMPAIGN_ID = __ENV.CAMPAIGN_ID || ''

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    // Dropping one enquiry in two hundred is already too many.
    failed_submissions: ['rate<0.005'],
  },
}

export default function submitLead() {
  // Always exercise the page itself; it is what a real visitor loads first.
  const page = http.get(`${BASE_URL}/lead/${CAMPAIGN_ID}`)
  check(page, { 'lead page loads': (r) => r.status === 200 })

  if (!SUPABASE_URL || !ANON_KEY || !CAMPAIGN_ID) {
    // Without credentials this degrades to a page-load test rather than
    // silently reporting a pass it did not earn.
    sleep(1)
    return
  }

  const unique = `${__VU}-${__ITER}-${Date.now()}`
  const payload = JSON.stringify({
    campaign_id: CAMPAIGN_ID,
    lead_name: `Load Test ${unique}`,
    lead_email: `loadtest+${unique}@example.invalid`,
    lead_phone: `082${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`,
    interest_level: 'warm',
    status: 'new',
    pipeline_stage: 'new',
    consent_given: true,
    consent_text: 'Load test consent',
    source_url: `${BASE_URL}/lead/${CAMPAIGN_ID}`,
  })

  const response = http.post(`${SUPABASE_URL}/rest/v1/leads`, payload, {
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      Prefer: 'return=minimal',
    },
  })

  const ok = check(response, {
    'lead accepted': (r) => r.status === 201 || r.status === 204,
  })

  failures.add(!ok)
  if (ok) submitted.add(1)

  sleep(Math.random() * 2 + 1)
}
