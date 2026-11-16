import { describe, it, expect, vi } from 'vitest'
import { saveMyProfile, writeProfileRow, writeCreatorRow, isMissingRpc } from '../profileSave'

const user = { id: 'u1', email: 'creator@example.com', user_metadata: { full_name: 'Meta Name' } }

// A tiny stand-in for the supabase-js query builder. Each table gets a queue of
// results; every awaited chain pops the next one and records what was called.
function fakeSupabase({ rpc, tables = {} } = {}) {
  const calls = []
  const from = (table) => {
    const call = { table, ops: [] }
    calls.push(call)
    const builder = {
      update: (v) => (call.ops.push(['update', v]), builder),
      insert: (v) => (call.ops.push(['insert', v]), builder),
      select: (v) => (call.ops.push(['select', v]), builder),
      eq: (k, v) => (call.ops.push(['eq', k, v]), builder),
      maybeSingle: () => (call.ops.push(['maybeSingle']), builder),
      single: () => {
        throw new Error('.single() must not be used on profile writes')
      },
      then: (resolve, reject) => {
        const next = (tables[table] || []).shift() || { data: [], error: null }
        return Promise.resolve(next).then(resolve, reject)
      },
    }
    return builder
  }
  return {
    calls,
    from,
    rpc: vi.fn(async () => rpc || { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.save_my_profile' } }),
  }
}

describe('isMissingRpc', () => {
  it('recognises PostgREST and Postgres "function missing" errors', () => {
    expect(isMissingRpc({ code: 'PGRST202' })).toBe(true)
    expect(isMissingRpc({ code: '42883' })).toBe(true)
    expect(isMissingRpc({ code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' })).toBe(false)
  })
})

describe('saveMyProfile', () => {
  it('uses the save_my_profile RPC when available', async () => {
    const sb = fakeSupabase({ rpc: { data: { profile: { id: 'u1' } }, error: null } })
    const result = await saveMyProfile(sb, user, { full_name: 'A', role: 'admin' }, { rate_card: { tiktok_video: '11000' } })
    expect(result.profile.id).toBe('u1')
    expect(sb.rpc).toHaveBeenCalledWith('save_my_profile', {
      p_profile: { full_name: 'A' }, // role is never sent
      p_creator: { rate_card: { tiktok_video: '11000' } },
    })
    expect(sb.calls).toHaveLength(0)
  })

  it('surfaces real RPC errors instead of falling back', async () => {
    const sb = fakeSupabase({ rpc: { data: null, error: { code: '42501', message: 'Not authenticated' } } })
    await expect(saveMyProfile(sb, user, { full_name: 'A' })).rejects.toMatchObject({ code: '42501' })
  })

  it('falls back to table writes when the RPC is not deployed', async () => {
    const sb = fakeSupabase({
      tables: {
        profiles: [{ data: [{ id: 'u1', full_name: 'A' }], error: null }],
        creator_profiles: [{ data: [{ user_id: 'u1', location: 'Durban' }], error: null }],
      },
    })
    const result = await saveMyProfile(sb, user, { full_name: 'A' }, { location: 'Durban' })
    expect(result.profile.full_name).toBe('A')
    expect(result.creator_profile.location).toBe('Durban')
  })
})

describe('writeProfileRow', () => {
  it('inserts the row when the update matched nothing and no row exists', async () => {
    const sb = fakeSupabase({
      tables: {
        profiles: [
          { data: [], error: null }, // update -> 0 rows
          { data: null, error: null }, // existence check -> none
          { data: [{ id: 'u1', full_name: 'Meta Name' }], error: null }, // insert
        ],
      },
    })
    const row = await writeProfileRow(sb, user, { bio: 'hi' })
    expect(row.id).toBe('u1')
    const insert = sb.calls[2].ops.find(([op]) => op === 'insert')[1]
    expect(insert).toEqual({ id: 'u1', email: 'creator@example.com', bio: 'hi', full_name: 'Meta Name' })
  })

  it('reports a blocked update clearly when the row exists', async () => {
    const sb = fakeSupabase({
      tables: { profiles: [{ data: [], error: null }, { data: { id: 'u1' }, error: null }] },
    })
    await expect(writeProfileRow(sb, user, { bio: 'hi' })).rejects.toThrow(/refused the update/)
  })

  it('retries without a column the live schema lacks', async () => {
    const sb = fakeSupabase({
      tables: {
        profiles: [
          { data: null, error: { message: "Could not find the 'phone' column of 'profiles' in the schema cache" } },
          { data: [{ id: 'u1', bio: 'hi' }], error: null },
        ],
      },
    })
    const row = await writeProfileRow(sb, user, { bio: 'hi', phone: '1' })
    expect(row.bio).toBe('hi')
    expect(sb.calls[1].ops[0]).toEqual(['update', { bio: 'hi' }])
  })
})

describe('writeCreatorRow', () => {
  it('creates the creator row when it is missing', async () => {
    const sb = fakeSupabase({
      tables: {
        creator_profiles: [
          { data: [], error: null },
          { data: null, error: null },
          { data: [{ user_id: 'u1', location: 'Durban' }], error: null },
        ],
      },
    })
    const row = await writeCreatorRow(sb, user, { location: 'Durban' })
    expect(row.location).toBe('Durban')
  })
})
