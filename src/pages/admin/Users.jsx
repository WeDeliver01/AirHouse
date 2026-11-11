import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Modal, ModalFooter, LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatDate, formatRelativeTime } from '../../lib/utils'
import { toast } from 'react-hot-toast'
import { 
  Users, Search, Eye, CheckCircle, XCircle, Download, Mail
} from 'lucide-react'
import { cn } from '../../lib/utils'

const AdminUsers = () => {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({ total: 0, creators: 0, developers: 0, verified: 0 })
  const [filter, setFilter] = useState({ role: '', verified: '', search: '' })
  const [error, setError] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers(data || [])
      
      setStats({
        total: data?.length || 0,
        creators: data?.filter(u => u.role === 'creator').length || 0,
        developers: data?.filter(u => u.role === 'developer').length || 0,
        verified: data?.filter(u => u.is_verified).length || 0,
      })
    } catch (e) {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const updateVerification = async (userId, verified) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: verified })
        .eq('id', userId)
      if (error) throw error
      toast.success(verified ? 'User verified' : 'Verification removed')
      fetchUsers()
      setShowDetailModal(false)
    } catch (e) {
      toast.error('Failed to update user')
    }
  }

  const filteredUsers = users.filter(u => {
    if (filter.role && u.role !== filter.role) return false
    if (filter.verified === 'yes' && !u.is_verified) return false
    if (filter.verified === 'no' && u.is_verified) return false
    if (filter.search && !u.full_name?.toLowerCase().includes(filter.search.toLowerCase()) &&
        !u.email?.toLowerCase().includes(filter.search.toLowerCase())) return false
    return true
  })

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>
  if (error) return <ErrorState message={error} onRetry={fetchUsers} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">User Management</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">Manage all platform users — creators, developers and admins.</p>
        </div>
        <Button variant="secondary"><Download className="w-4 h-4 mr-2" />Export</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Users</span>
            <Users className="w-5 h-5 text-primary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.total}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Creators</span>
            <Users className="w-5 h-5 text-secondary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.creators}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Developers</span>
            <Users className="w-5 h-5 text-tertiary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.developers}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Verified</span>
            <CheckCircle className="w-5 h-5 text-secondary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.verified}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
          <input
            type="text" placeholder="Search by name or email..."
            value={filter.search} onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <select value={filter.role} onChange={(e) => setFilter(f => ({ ...f, role: e.target.value }))}
          className="px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary">
          <option value="">All Roles</option>
          <option value="creator">Creators</option>
          <option value="developer">Developers</option>
          <option value="admin">Admins</option>
        </select>
        <select value={filter.verified} onChange={(e) => setFilter(f => ({ ...f, verified: e.target.value }))}
          className="px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary">
          <option value="">All Status</option>
          <option value="yes">Verified</option>
          <option value="no">Unverified</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                <th className="py-3 px-md font-medium">User</th>
                <th className="py-3 px-md font-medium">Role</th>
                <th className="py-3 px-md font-medium">Status</th>
                <th className="py-3 px-md font-medium">Joined</th>
                <th className="py-3 px-md font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant/60">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-surface transition-colors">
                  <td className="py-3 px-md">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-surface-container-highest rounded-full flex items-center justify-center font-bold text-on-surface uppercase">
                        {user.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-label-lg text-label-lg text-on-surface">{user.full_name}</p>
                        <p className="font-label-md text-label-md text-on-surface-variant">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-md">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded font-label-md text-label-md capitalize',
                      user.role === 'admin' ? 'bg-error-container text-on-error-container' :
                      user.role === 'developer' ? 'bg-secondary-container text-on-secondary-fixed' :
                      'bg-primary-container/20 text-primary'
                    )}>{user.role}</span>
                  </td>
                  <td className="py-3 px-md">
                    {user.is_verified ? (
                      <span className="flex items-center gap-1 text-secondary font-label-md text-label-md">
                        <CheckCircle className="w-4 h-4" />Verified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-on-surface-variant font-label-md text-label-md">
                        <XCircle className="w-4 h-4" />Pending
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-md text-on-surface-variant font-data-mono text-data-mono">{formatRelativeTime(user.created_at)}</td>
                  <td className="py-3 px-md text-right">
                    <Button variant="secondary" size="sm" onClick={() => { setSelectedUser(user); setShowDetailModal(true) }}>
                      <Eye className="w-4 h-4 mr-1" />View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && (
          <EmptyState icon={Users} title="No users found" description="There are no users matching your filters." />
        )}
      </div>

      {/* User Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title="User Details" size="lg">
        {selectedUser && (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 bg-primary/20 rounded-2xl flex items-center justify-center text-3xl font-bold text-primary">
                {selectedUser.full_name?.charAt(0)}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900">{selectedUser.full_name}</h3>
                <p className="text-gray-500">{selectedUser.email}</p>
                <div className="flex gap-2 mt-2">
                  <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold capitalize',
                    selectedUser.role === 'admin' ? 'bg-red-100 text-red-700' :
                    selectedUser.role === 'developer' ? 'bg-blue-100 text-blue-700' :
                    'bg-purple-100 text-purple-700'
                  )}>{selectedUser.role}</span>
                  {selectedUser.is_verified ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Verified</span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Unverified</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-xs text-gray-500">Phone</p>
                <p className="font-semibold">{selectedUser.phone || 'Not provided'}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-xs text-gray-500">Joined</p>
                <p className="font-semibold">{formatDate(selectedUser.created_at)}</p>
              </div>
              {selectedUser.company_name && (
                <div className="bg-gray-50 p-4 rounded-xl col-span-2">
                  <p className="text-xs text-gray-500">Company</p>
                  <p className="font-semibold">{selectedUser.company_name}</p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t flex gap-3">
              {selectedUser.is_verified ? (
                <Button variant="danger" onClick={() => updateVerification(selectedUser.id, false)}>
                  <XCircle className="w-4 h-4 mr-2" />Remove Verification
                </Button>
              ) : (
                <Button variant="primary" onClick={() => updateVerification(selectedUser.id, true)}>
                  <CheckCircle className="w-4 h-4 mr-2" />Verify User
                </Button>
              )}
              <a href={`mailto:${selectedUser.email}`}>
                <Button variant="secondary"><Mail className="w-4 h-4 mr-2" />Send Email</Button>
              </a>
            </div>
          </div>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDetailModal(false)}>Close</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}

export default AdminUsers
