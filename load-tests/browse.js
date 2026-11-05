import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

/**
 * Public browsing under load.
 *
 * Models the traffic a launch or a campaign push produces: mostly anonymous
 * visitors reading marketplace and campaign pages.
 */

const failures = new Rate('failed_requests')

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173'

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // warm up
    { duration: '1m', target: 100 },   // normal busy period
    { duration: '30s', target: 300 },  // a spike, e.g. a launch announcement
    { duration: '1m', target: 300 },   // hold the spike
    { duration: '30s', target: 0 },    // recover
  ],
  thresholds: {
    // A visitor waiting longer than a second and a half for a public page
    // will usually leave.
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    failed_requests: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
}

const PAGES = ['/', '/marketplace', '/campaigns', '/legal/privacy']

export default function browse() {
  const page = PAGES[Math.floor(Math.random() * PAGES.length)]
  const response = http.get(`${BASE_URL}${page}`, { tags: { page } })

  const ok = check(response, {
    'status is 200': (r) => r.status === 200,
    'served html': (r) => String(r.headers['Content-Type'] || '').includes('text/html'),
  })

  failures.add(!ok)

  // Visitors read; they do not hammer.
  sleep(Math.random() * 3 + 1)
}
