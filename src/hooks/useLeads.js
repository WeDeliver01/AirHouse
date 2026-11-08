import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'react-hot-toast'

export const useLeads = (options = {}) => {
  const { campaignId, status, limit = 100 } = options
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('leads')
        .select(`
          *,
          campaign:campaigns (id, title, developer_id),
          creator:creator_profiles (
            id,
            user:profiles (full_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (campaignId) {
        query = query.eq('campaign_id', campaignId)
      }

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError
      setLeads(data || [])
    } catch (err) {
      console.error('Error fetching leads:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [campaignId, status, limit])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const updateLeadStatus = async (leadId, newStatus) => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', leadId)
        .select()
        .single()

      if (error) throw error

      setLeads(leads.map(l => l.id === leadId ? { ...l, ...data } : l))
      toast.success('Lead status updated')
      return data
    } catch (err) {
      console.error('Error updating lead:', err)
      toast.error('Failed to update lead')
      throw err
    }
  }

  const deleteLead = async (leadId) => {
    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId)

      if (error) throw error

      setLeads(leads.filter(l => l.id !== leadId))
      toast.success('Lead deleted')
    } catch (err) {
      console.error('Error deleting lead:', err)
      toast.error('Failed to delete lead')
      throw err
    }
  }

  // Calculate stats
  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    qualified: leads.filter(l => l.status === 'qualified').length,
    converted: leads.filter(l => l.status === 'converted').length,
    lost: leads.filter(l => l.status === 'lost').length,
    conversionRate: leads.length > 0 
      ? Math.round((leads.filter(l => l.status === 'converted').length / leads.length) * 100) 
      : 0,
  }

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Campaign', 'Status', 'Date']
    const rows = leads.map(l => [
      l.lead_name,
      l.lead_email,
      l.lead_phone || '',
      l.campaign?.title || '',
      l.status,
      new Date(l.created_at).toLocaleDateString(),
    ])

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return {
    leads,
    loading,
    error,
    stats,
    refetch: fetchLeads,
    updateLeadStatus,
    deleteLead,
    exportToCSV,
  }
}

export default useLeads
