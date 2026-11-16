/**
 * Enquiry form answers: the options a visitor chooses from, and how the
 * stored answers read back to the developer.
 *
 * Kept in one place so the public form and the developer's lead view always
 * agree on what a stored value means.
 */

/** What the visitor is after. Apartments are usually rented, sometimes bought. */
export const LEAD_INTENTS = [
  { value: 'rent', label: 'Rent' },
  { value: 'buy', label: 'Buy' },
]

export const INTEREST_LEVELS = {
  buy: [
    { value: 'hot', label: 'Ready to buy - actively looking' },
    { value: 'warm', label: 'Interested - exploring options' },
    { value: 'cold', label: 'Just browsing - future plans' },
  ],
  rent: [
    { value: 'hot', label: 'Ready to move in - actively looking' },
    { value: 'warm', label: 'Interested - exploring options' },
    { value: 'cold', label: 'Just browsing - future plans' },
  ],
}

export const TIMELINE_OPTIONS = {
  buy: [
    { value: 'immediate', label: 'Immediately' },
    { value: '1-3months', label: '1-3 months' },
    { value: '3-6months', label: '3-6 months' },
    { value: '6-12months', label: '6-12 months' },
    { value: '12+months', label: '12+ months' },
  ],
  rent: [
    { value: 'immediate', label: 'Immediately' },
    { value: 'within-1month', label: 'Within a month' },
    { value: '1-3months', label: '1-3 months' },
    { value: '3+months', label: 'More than 3 months' },
  ],
}

export const TIMELINE_LABEL = {
  buy: 'When are you looking to buy?',
  rent: 'When would you like to move in?',
}

export const BUDGET_FIELD = {
  buy: { label: 'Budget Range (Optional)', placeholder: 'e.g., R1.5M - R2M' },
  rent: { label: 'Monthly Budget (Optional)', placeholder: 'e.g., R7,000 - R9,000 per month' },
}

/**
 * Default intent for a listing. Short-term stays have their own form; a
 * listing marked for sale is a purchase; apartments are usually rented.
 */
export const defaultIntentFor = ({ listingCategory, propertyType } = {}) => {
  if (listingCategory === 'long_term_rental') return 'rent'
  if (propertyType === 'apartment') return 'rent'
  return 'buy'
}

const labelFor = (options, value) => options.find((o) => o.value === value)?.label || value

/**
 * Turn a lead's stored `notes` into labelled rows for display.
 *
 * Campaign enquiries store JSON ({ intent, timeline, budget, message });
 * enquiries from a property's own page store the message as plain text.
 */
export const describeLeadNotes = (notes) => {
  if (!notes) return []

  let parsed = null
  try {
    parsed = JSON.parse(notes)
  } catch {
    parsed = null
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return String(notes).trim() ? [{ label: 'Message', value: String(notes).trim() }] : []
  }

  const intent = parsed.intent === 'rent' ? 'rent' : 'buy'
  const rows = []
  if (parsed.intent) {
    rows.push({ label: 'Looking to', value: labelFor(LEAD_INTENTS, parsed.intent) })
  }
  if (parsed.timeline) {
    rows.push({
      label: intent === 'rent' ? 'Move-in' : 'Buying timeline',
      value: labelFor([...TIMELINE_OPTIONS[intent], ...TIMELINE_OPTIONS.buy], parsed.timeline),
    })
  }
  if (parsed.budget) {
    rows.push({ label: intent === 'rent' ? 'Monthly budget' : 'Budget', value: parsed.budget })
  }
  if (parsed.message) {
    rows.push({ label: 'Message', value: parsed.message })
  }
  return rows
}

/** Interest level as the visitor saw it. */
export const describeInterest = (level, notes) => {
  let intent = 'buy'
  try {
    if (JSON.parse(notes || '{}')?.intent === 'rent') intent = 'rent'
  } catch {
    /* plain-text notes */
  }
  return labelFor(INTEREST_LEVELS[intent], level || 'warm')
}
