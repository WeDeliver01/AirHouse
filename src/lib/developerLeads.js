import { supabase } from './supabase'

/**
 * Which leads belong to a developer.
 *
 * A lead reaches a developer by one of two routes:
 *   - a campaign enquiry (/lead/:campaignId), stored with `campaign_id`;
 *   - a direct enquiry from the property's own public page (/:slug), stored
 *     with `property_id` and no campaign (migration 031).
 *
 * Developer pages used to filter on `campaign_id` alone, so every direct
 * property enquiry was invisible. Build lead queries through these helpers
 * so both routes are always included.
 */

/** Ids of the properties this developer owns. */
export async function fetchDeveloperPropertyIds(developerId) {
  const { data, error } = await supabase
    .from('properties')
    .select('id')
    .eq('developer_id', developerId)
  if (error) throw error
  return (data || []).map((p) => p.id)
}

/** True when there is nothing a lead could belong to. */
export function isEmptyLeadScope({ campaignIds = [], propertyIds = [] }) {
  return campaignIds.length === 0 && propertyIds.length === 0
}

/**
 * PostgREST `or` filter matching leads from any of the given campaigns or
 * properties. Callers must check isEmptyLeadScope first.
 */
export function leadScopeFilter({ campaignIds = [], propertyIds = [] }) {
  const parts = []
  if (campaignIds.length) parts.push(`campaign_id.in.(${campaignIds.join(',')})`)
  if (propertyIds.length) parts.push(`property_id.in.(${propertyIds.join(',')})`)
  return parts.join(',')
}

/** Restrict a `from('leads')` query to the developer's campaigns and properties. */
export function scopeLeadsQuery(query, scope) {
  return query.or(leadScopeFilter(scope))
}

/** Embed fragment giving a lead's property title, for direct enquiries. */
export const LEAD_PROPERTY_EMBED = 'property:properties(id, title)'

/** Human label for where a lead came from. */
export function leadSourceLabel(lead, fallback = 'Direct enquiry') {
  return (
    lead?.campaign?.title ||
    lead?.campaign?.property_name ||
    lead?.campaigns?.title ||
    lead?.campaigns?.property_name ||
    (lead?.property?.title ? `${lead.property.title} (direct)` : null) ||
    fallback
  )
}
