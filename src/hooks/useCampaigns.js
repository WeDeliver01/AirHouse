import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'react-hot-toast'

export const useCampaigns = (options = {}) => {
  const { developerId, status, limit = 50 } = options
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('campaigns')
        .select(`
          *,
          developer:profiles!developer_id (id, full_name, company_name),
          assignment:campaign_assignments (
            id,
            creator:creator_profiles (
              id,
              user:profiles (full_name)
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (developerId) {
        query = query.eq('developer_id', developerId)
      }

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError
      setCampaigns(data || [])
    } catch (err) {
      console.error('Error fetching campaigns:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [developerId, status, limit])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  const createCampaign = async (campaignData) => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .insert(campaignData)
        .select()
        .single()

      if (error) throw error

      setCampaigns([data, ...campaigns])
      toast.success('Campaign created successfully')
      return data
    } catch (err) {
      console.error('Error creating campaign:', err)
      toast.error('Failed to create campaign')
      throw err
    }
  }

  const updateCampaign = async (campaignId, updates) => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .update(updates)
        .eq('id', campaignId)
        .select()
        .single()

      if (error) throw error

      setCampaigns(campaigns.map(c => c.id === campaignId ? { ...c, ...data } : c))
      toast.success('Campaign updated')
      return data
    } catch (err) {
      console.error('Error updating campaign:', err)
      toast.error('Failed to update campaign')
      throw err
    }
  }

  const updateStatus = async (campaignId, newStatus) => {
    return updateCampaign(campaignId, { status: newStatus })
  }

  const deleteCampaign = async (campaignId) => {
    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId)

      if (error) throw error

      setCampaigns(campaigns.filter(c => c.id !== campaignId))
      toast.success('Campaign deleted')
    } catch (err) {
      console.error('Error deleting campaign:', err)
      toast.error('Failed to delete campaign')
      throw err
    }
  }

  // Calculate stats
  const stats = {
    total: campaigns.length,
    draft: campaigns.filter(c => c.status === 'draft').length,
    open: campaigns.filter(c => c.status === 'open').length,
    active: campaigns.filter(c => c.status === 'active').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    totalBudget: campaigns.reduce((sum, c) => sum + (c.budget || 0), 0),
  }

  return {
    campaigns,
    loading,
    error,
    stats,
    refetch: fetchCampaigns,
    createCampaign,
    updateCampaign,
    updateStatus,
    deleteCampaign,
  }
}

export default useCampaigns
