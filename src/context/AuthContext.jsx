import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, handleSupabaseError } from '../lib/supabase'
import { toast } from 'react-hot-toast'
import { recordLogin, recordSignup } from '../lib/siteAnalytics'

// ============================================
// CONFIGURATION
// ============================================

// Check if Supabase is actually configured with real credentials
const checkSupabaseConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return url && key && !url.includes('placeholder') && url.includes('supabase')
}

const IS_PRODUCTION = import.meta.env.PROD
const DEMO_MODE = !checkSupabaseConfig() && !IS_PRODUCTION

const DEMO_PROFILES = {
  developer: {
    id: 'demo-developer-id',
    email: 'developer@demo.com',
    role: 'developer',
    full_name: 'Central Developments',
    company_name: 'Central Developments (Pty) Ltd',
    is_verified: true,
    is_super_admin: false,
    created_at: new Date().toISOString(),
  },
  creator: {
    id: 'demo-creator-id',
    email: 'creator@demo.com',
    role: 'creator',
    full_name: 'Ashley & Refiloe',
    is_verified: true,
    is_super_admin: false,
    created_at: new Date().toISOString(),
  },
}

const DEFAULT_DEMO_ROLE = 'developer'

// ============================================
// CONTEXT
// ============================================

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// ============================================
// PROVIDER
// ============================================

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [creatorProfile, setCreatorProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  // ----------------------------------------
  // Fetch user profile data
  // ----------------------------------------
  const fetchUserData = useCallback(async (userId) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) {
        console.error('Profile fetch error:', profileError)
        return null
      }

      if (profileData) {
        const { data: superAdminData } = await supabase
          .from('super_admins')
          .select('id')
          .eq('email', profileData.email)
          .eq('is_active', true)
          .maybeSingle()

        if (superAdminData) {
          profileData.is_super_admin = true
          profileData.role = 'admin'
        }
      }

      setProfile(profileData)

      if (profileData?.role === 'creator') {
        const { data: creatorData } = await supabase
          .from('creator_profiles')
          .select('*')
          .eq('user_id', userId)
          .single()
        
        setCreatorProfile(creatorData)
      } else {
        setCreatorProfile(null)
      }

      return profileData
    } catch (error) {
      console.error('Error fetching user data:', error)
      return null
    }
  }, [])

  // ----------------------------------------
  // Initialize auth state
  // ----------------------------------------
  useEffect(() => {
    let mounted = true

    const initAuth = async () => {
      // Demo mode initialization
      if (DEMO_MODE) {
        console.log('🔧 Running in DEMO MODE - Supabase not configured')
        if (mounted) {
          const demoProfile = DEMO_PROFILES[DEFAULT_DEMO_ROLE]
          setUser(demoProfile)
          setProfile(demoProfile)
          setLoading(false)
          setInitialized(true)
        }
        return
      }

      // Real Supabase initialization
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Session error:', error)
        }

        if (mounted) {
          if (session?.user) {
            setUser(session.user)
            await fetchUserData(session.user.id)
          }
          setLoading(false)
          setInitialized(true)
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        if (mounted) {
          setLoading(false)
          setInitialized(true)
        }
      }
    }

    initAuth()

    // Skip auth listener in demo mode
    if (DEMO_MODE) {
      return () => { mounted = false }
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event)

        if (!mounted) return

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user)
          // Small delay to let the trigger create the profile
          setTimeout(() => fetchUserData(session.user.id), 500)
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          setCreatorProfile(null)
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user)
        }
      }
    )

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [fetchUserData])

  // ----------------------------------------
  // Sign Up
  // ----------------------------------------
  const ALLOWED_SIGNUP_ROLES = ['creator', 'developer']

  const signUp = async ({ email, password, fullName, role }) => {
    const safeRole = ALLOWED_SIGNUP_ROLES.includes(role) ? role : 'creator'

    if (DEMO_MODE) {
      toast.success('Demo mode: Sign up simulated')
      return { user: DEMO_PROFILES[safeRole] }
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: safeRole,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error

      recordSignup()

      // Check if email confirmation is required
      if (data.user && !data.session) {
        toast.success('Please check your email to verify your account')
      } else if (data.user && data.session) {
        // User was auto-confirmed (email confirmation disabled in Supabase)
        toast.success('Account created successfully!')
        setUser(data.user)
        // Fetch profile after a short delay to allow trigger to complete
        setTimeout(() => fetchUserData(data.user.id), 1000)
      }

      return data
    } catch (error) {
      console.error('SignUp error:', error)
      const message = handleSupabaseError(error)
      toast.error(message)
      throw error
    }
  }

  // ----------------------------------------
  // Sign In
  // ----------------------------------------
  const signIn = async ({ email, password }) => {
    if (DEMO_MODE) {
      const role = email.includes('developer') ? 'developer' : 'creator'
      const demoProfile = DEMO_PROFILES[role]
      setUser(demoProfile)
      setProfile(demoProfile)
      toast.success(`Demo login as ${role}`)
      return { user: demoProfile, session: { user: demoProfile } }
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      recordLogin()
      toast.success('Welcome back!')
      return data
    } catch (error) {
      const message = handleSupabaseError(error)
      toast.error(message)
      throw error
    }
  }

  // ----------------------------------------
  // Sign Out
  // ----------------------------------------
  const signOut = async () => {
    if (DEMO_MODE) {
      setUser(null)
      setProfile(null)
      setCreatorProfile(null)
      toast.success('Signed out')
      return
    }

    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      toast.success('Signed out successfully')
    } catch (error) {
      const message = handleSupabaseError(error)
      toast.error(message)
      throw error
    }
  }

  // ----------------------------------------
  // Password Reset
  // ----------------------------------------
  const resetPassword = async (email) => {
    if (DEMO_MODE) {
      toast.success('Demo mode: Password reset email simulated')
      return
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (error) throw error
      toast.success('Password reset email sent')
    } catch (error) {
      const message = handleSupabaseError(error)
      toast.error(message)
      throw error
    }
  }

  // ----------------------------------------
  // Update Password
  // ----------------------------------------
  const updatePassword = async (newPassword) => {
    if (DEMO_MODE) {
      toast.success('Demo mode: Password updated')
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (error) throw error
      toast.success('Password updated successfully')
    } catch (error) {
      const message = handleSupabaseError(error)
      toast.error(message)
      throw error
    }
  }

  // ----------------------------------------
  // Update Profile
  // ----------------------------------------
  const ALLOWED_PROFILE_FIELDS = ['full_name', 'avatar_url', 'company_name', 'bio', 'phone']

  const updateProfile = async (updates) => {
    const sanitized = {}
    for (const key of ALLOWED_PROFILE_FIELDS) {
      if (key in updates) sanitized[key] = updates[key]
    }

    if (Object.keys(sanitized).length === 0) {
      throw new Error('No valid fields to update')
    }

    if (DEMO_MODE) {
      setProfile(prev => ({ ...prev, ...sanitized }))
      toast.success('Profile updated')
      return { ...profile, ...sanitized }
    }

    if (!user) throw new Error('No user logged in')

    const isMissingRow = (err) =>
      err?.code === 'PGRST116' || err?.message?.includes('Cannot coerce the result to a single JSON object')

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(sanitized)
        .eq('id', user.id)
        .select()
        .single()

      if (error) {
        if (error.message?.includes('column') && error.message?.includes('schema cache')) {
          const match = error.message.match(/'(\w+)' column/)
          const badField = match?.[1]
          if (badField && sanitized[badField] !== undefined) {
            console.warn(`Field '${badField}' not in DB, retrying without it`)
            delete sanitized[badField]
            if (Object.keys(sanitized).length === 0) {
              throw new Error('No valid fields to update')
            }
            const { data: retryData, error: retryError } = await supabase
              .from('profiles')
              .update(sanitized)
              .eq('id', user.id)
              .select()
              .single()
            if (retryError) throw retryError
            setProfile(retryData)
            toast.success('Profile updated')
            return retryData
          }
        }

        // The update matched no row. This happens when the signup trigger
        // that provisions a profiles row failed silently (it never blocks
        // account creation — see handle_new_user() in migration 017) and
        // left this account without one. Create it now rather than
        // forcing the user to contact support over a row they didn't know
        // was missing.
        if (isMissingRow(error)) {
          const fallbackName =
            sanitized.full_name ||
            user.user_metadata?.full_name ||
            user.email?.split('@')[0] ||
            'User'
          const { data: insertedData, error: insertError } = await supabase
            .from('profiles')
            .insert({ id: user.id, email: user.email, ...sanitized, full_name: fallbackName })
            .select()
            .single()
          if (insertError) throw insertError
          setProfile(insertedData)
          toast.success('Profile updated')
          return insertedData
        }

        throw error
      }
      setProfile(data)
      toast.success('Profile updated')
      return data
    } catch (error) {
      const message = handleSupabaseError(error)
      toast.error(message)
      throw error
    }
  }

  // ----------------------------------------
  // Update Creator Profile
  // ----------------------------------------
  const ALLOWED_CREATOR_FIELDS = ['instagram_handle', 'tiktok_handle', 'youtube_handle', 'follower_count', 'niche', 'portfolio_urls', 'past_collaborations', 'rate_card', 'location', 'is_available', 'avg_engagement_rate']

  const updateCreatorProfile = async (updates) => {
    const sanitized = {}
    for (const key of ALLOWED_CREATOR_FIELDS) {
      if (key in updates) sanitized[key] = updates[key]
    }

    if (Object.keys(sanitized).length === 0) {
      throw new Error('No valid fields to update')
    }

    if (DEMO_MODE) {
      setCreatorProfile(prev => ({ ...prev, ...sanitized }))
      toast.success('Creator profile updated')
      return { ...creatorProfile, ...sanitized }
    }

    if (!user || profile?.role !== 'creator') {
      throw new Error('User is not a creator')
    }

    try {
      const { data, error } = await supabase
        .from('creator_profiles')
        .update(sanitized)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) throw error
      setCreatorProfile(data)
      toast.success('Creator profile updated')
      return data
    } catch (error) {
      const message = handleSupabaseError(error)
      toast.error(message)
      throw error
    }
  }

  // ----------------------------------------
  // Refresh User Data
  // ----------------------------------------
  const refreshUserData = async () => {
    if (DEMO_MODE) return
    if (user) {
      await fetchUserData(user.id)
    }
  }

  // ----------------------------------------
  // Context Value
  // ----------------------------------------
  const value = {
    user,
    profile,
    creatorProfile,
    loading,
    initialized,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    updateCreatorProfile,
    refreshUserData,
    isAuthenticated: !!user,
    isCreator: profile?.role === 'creator',
    isDeveloper: profile?.role === 'developer',
    isAdmin: profile?.role === 'admin',
    isSuperAdmin: profile?.is_super_admin === true,
    isDemoMode: DEMO_MODE,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
