import { describe, expect, it } from 'vitest'

import { defaultIntentFor, describeInterest, describeLeadNotes } from '../leadDetails'

describe('defaultIntentFor', () => {
  it('defaults apartments to renting', () => {
    expect(defaultIntentFor({ propertyType: 'apartment' })).toBe('rent')
  })

  it('still defaults apartments to renting when the legacy category says sale', () => {
    // 029 backfilled every non-stay listing to 'sale', so it is not a signal.
    expect(defaultIntentFor({ listingCategory: 'sale', propertyType: 'apartment' })).toBe('rent')
  })

  it('defaults other listings to buying', () => {
    expect(defaultIntentFor({ propertyType: 'house' })).toBe('buy')
    expect(defaultIntentFor({})).toBe('buy')
  })
})

describe('describeLeadNotes', () => {
  it('reads a rental enquiry back in rental terms', () => {
    const notes = JSON.stringify({ intent: 'rent', timeline: 'within-1month', budget: 'R8,000', message: 'Pets?' })
    expect(describeLeadNotes(notes)).toEqual([
      { label: 'Looking to', value: 'Rent' },
      { label: 'Move-in', value: 'Within a month' },
      { label: 'Monthly budget', value: 'R8,000' },
      { label: 'Message', value: 'Pets?' },
    ])
  })

  it('reads an enquiry from before the rent/buy question as a purchase', () => {
    const notes = JSON.stringify({ timeline: '3-6months', budget: 'R1.5M', message: '' })
    expect(describeLeadNotes(notes)).toEqual([
      { label: 'Buying timeline', value: '3-6 months' },
      { label: 'Budget', value: 'R1.5M' },
    ])
  })

  it('shows a plain-text message from a property page as the message', () => {
    expect(describeLeadNotes('Is parking included?')).toEqual([
      { label: 'Message', value: 'Is parking included?' },
    ])
  })

  it('shows nothing for empty notes', () => {
    expect(describeLeadNotes(null)).toEqual([])
    expect(describeLeadNotes(JSON.stringify({ timeline: '', budget: '', message: '' }))).toEqual([])
  })
})

describe('describeInterest', () => {
  it('uses the wording the visitor saw', () => {
    expect(describeInterest('hot', JSON.stringify({ intent: 'rent' }))).toBe('Ready to move in - actively looking')
    expect(describeInterest('hot', JSON.stringify({ intent: 'buy' }))).toBe('Ready to buy - actively looking')
    expect(describeInterest(null, 'plain text')).toBe('Interested - exploring options')
  })
})
