import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'react-hot-toast'

export const useUsers = (options = {}) => {
  const { role, status, limit = 50 } = options
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('profiles')
        .select(`
          *,
          creator_profiles (*)
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (role) {
        query = query.eq('role', role)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError
      setUsers(data || [])
    } catch (err) {
      console.error('Error fetching users:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [role, status, limit])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const updateUser = async (userId, updates) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single()

      if (error) throw error

      setUsers(users.map(u => u.id === userId ? { ...u, ...data } : u))
      toast.success('User updated successfully')
      return data
    } catch (err) {
      console.error('Error updating user:', err)
      toast.error('Failed to update user')
      throw err
    }
  }

  const verifyUser = async (userId) => {
    return updateUser(userId, { is_verified: true })
  }

  const suspendUser = async (userId) => {
    return updateUser(userId, { is_suspended: true })
  }

  const reactivateUser = async (userId) => {
    return updateUser(userId, { is_suspended: false })
  }

  const deleteUser = async (userId) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId)

      if (error) throw error

      setUsers(users.filter(u => u.id !== userId))
      toast.success('User deleted')
    } catch (err) {
      console.error('Error deleting user:', err)
      toast.error('Failed to delete user')
      throw err
    }
  }

  return {
    users,
    loading,
    error,
    refetch: fetchUsers,
    updateUser,
    verifyUser,
    suspendUser,
    reactivateUser,
    deleteUser,
  }
}

export default useUsers
