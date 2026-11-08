// Single source of truth for AirHouse company / legal identity.
// Update [TBC] placeholders before going live — they are intentionally
// greppable.

export const COMPANY = {
  tradingName: 'AirHouse',
  legalName: 'AirHouse',
  regNumber: '2026/101068/07',
  vatNumber: '[TBC — VAT number or "Not VAT-registered"]',
  address: {
    line1: '10 Camellia Avenue',
    suburb: 'Lynnwood',
    city: 'Pretoria',
    postalCode: '0081',
    country: 'South Africa',
  },
  email: {
    support: 'support@airhouse.co.za',
    legal: 'legal@airhouse.co.za',
    privacy: 'privacy@airhouse.co.za',
  },
  phone: '+27 63 901 8835',
  hours: 'Monday–Friday, 09:00–17:00 SAST',
  informationOfficer: '[TBC — full name]',
  jurisdiction: 'Republic of South Africa',
  governingLaw: 'South African law',
  // Bumped per-policy whenever a policy is materially updated.
  // Use ISO date strings so the LegalLayout can render them consistently.
  lastUpdated: {
    terms: '2026-05-15',
    privacy: '2026-05-15',
    cookies: '2026-05-15',
    refunds: '2026-05-15',
    aup: '2026-05-15',
    creatorAgreement: '2026-05-15',
    developerAgreement: '2026-05-15',
    paia: '2026-05-15',
  },
}

export const formatAddress = (a = COMPANY.address) =>
  `${a.line1}, ${a.suburb}, ${a.city}, ${a.postalCode}, ${a.country}`

export const formatLastUpdated = (slug) => {
  const iso = COMPANY.lastUpdated[slug]
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}
