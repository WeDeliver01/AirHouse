import { useState, useEffect } from 'react'
import { Button, Input, Badge } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { toast } from 'react-hot-toast'
import { Settings, Globe, Bell, Shield, Database, Palette, Save, UserPlus, Copy, Trash2} from 'lucide-react'
import PaymentModeCard from './PaymentModeCard'
import IdentityVerificationCard from './IdentityVerificationCard'
import SecuritySettings from '../../components/SecuritySettings'

const AdminSettings = () => {
  const { isSuperAdmin } = useAuth()
  const [settings, setSettings] = useState({
    platformName: 'AirHouse',
    supportEmail: 'support@airhouse.co.za',
    emailNotifications: true,
    newUserNotification: true,
    newCampaignNotification: true,
    newLeadNotification: false,
    requireEmailVerification: true,
    maxLoginAttempts: 5,
    sessionTimeout: 30,
    allowCreatorSignups: true,
    allowDeveloperSignups: true,
    maintenanceMode: false,
    defaultCampaignDuration: 3,
    minCampaignBudget: 10000,
    maxCampaignBudget: 500000,
  })
  const [invites, setInvites] = useState([])
  const [superAdmins, setSuperAdmins] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  useEffect(() => {
    if (isSuperAdmin) {
      fetchInvites()
      fetchSuperAdmins()
    }
  }, [isSuperAdmin])

  const fetchInvites = async () => {
    const { data } = await supabase
      .from('admin_invites')
      .select('*')
      .order('created_at', { ascending: false })
    setInvites(data || [])
  }

  const fetchSuperAdmins = async () => {
    const { data } = await supabase
      .from('super_admins')
      .select('*')
      .order('created_at', { ascending: false })
    setSuperAdmins(data || [])
  }

  const generateInviteCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let code = ''
    for (let i = 0; i < 24; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const createInvite = async () => {
    setInviteLoading(true)
    try {
      const code = generateInviteCode()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const { error } = await supabase.from('admin_invites').insert({
        invite_code: code,
        email_restriction: inviteEmail || null,
        expires_at: expiresAt.toISOString()
      })

      if (error) throw error

      toast.success('Invite link created!')
      setInviteEmail('')
      fetchInvites()
    } catch (e) {
      console.error(e)
      toast.error('Failed to create invite')
    } finally {
      setInviteLoading(false)
    }
  }

  const copyInviteLink = (code) => {
    const link = `${window.location.origin}/admin/invite/${code}`
    navigator.clipboard.writeText(link)
    toast.success('Invite link copied!')
  }

  const deleteInvite = async (id) => {
    await supabase.from('admin_invites').delete().eq('id', id)
    toast.success('Invite deleted')
    fetchInvites()
  }

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    toast.success('Settings saved successfully')
  }

  const ToggleSetting = ({ label, description, settingKey, danger = false }) => (
    <label className={`flex items-center justify-between p-3 rounded border ${danger ? 'bg-error-container/40 border-error/30' : 'bg-surface border-outline-variant'}`}>
      <div>
        <p className={`font-label-lg text-label-lg ${danger ? 'text-error' : 'text-on-surface'}`}>{label}</p>
        <p className={`font-body-sm text-body-sm ${danger ? 'text-error/80' : 'text-on-surface-variant'}`}>{description}</p>
      </div>
      <input
        type="checkbox"
        checked={settings[settingKey]}
        onChange={(e) => updateSetting(settingKey, e.target.checked)}
        className="w-5 h-5 rounded accent-primary"
      />
    </label>
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface flex items-center gap-2">
          <Settings className="w-7 h-7 text-primary" />
          Platform Settings
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">Configure global platform settings, fees, and admin access.</p>
      </div>

      {isSuperAdmin && (
        <>
          <SecuritySettings required />
          <PaymentModeCard />
          <IdentityVerificationCard />

          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="font-headline-md text-headline-md text-on-surface">Super Admins</h2>
              <Badge variant="warning" className="ml-2">Super Admin Only</Badge>
            </div>
            <div className="space-y-3">
              {superAdmins.map(admin => (
                <div key={admin.id} className="flex items-center justify-between p-3 bg-surface border border-outline-variant rounded">
                  <div>
                    <p className="font-label-lg text-label-lg text-on-surface">{admin.email}</p>
                    <p className="font-label-md text-label-md text-on-surface-variant">Added by: {admin.granted_by} | {new Date(admin.created_at).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={admin.is_active ? 'success' : 'secondary'}>
                    {admin.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ))}
              {superAdmins.length === 0 && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">No super admins found</p>
              )}
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
            <div className="flex items-center gap-2 mb-6">
              <UserPlus className="w-5 h-5 text-primary" />
              <h2 className="font-headline-md text-headline-md text-on-surface">Invite Super Admin</h2>
              <Badge variant="warning" className="ml-2">Super Admin Only</Badge>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Restrict to email (optional)"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Button variant="primary" onClick={createInvite} disabled={inviteLoading}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Generate Invite Link
                </Button>
              </div>
              <p className="font-label-md text-label-md text-on-surface-variant">Invite links expire after 7 days and can only be used once. Leave email empty to allow anyone with the link to register.</p>

              {invites.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h3 className="font-label-lg text-label-lg text-on-surface uppercase tracking-wider">Active Invites</h3>
                  {invites.map(invite => {
                    const isExpired = new Date(invite.expires_at) < new Date()
                    return (
                      <div key={invite.id} className="flex items-center justify-between p-3 bg-surface border border-outline-variant rounded">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="font-data-mono text-data-mono bg-surface-container-highest text-on-surface px-2 py-1 rounded truncate max-w-[200px]">
                              {invite.invite_code}
                            </code>
                            {invite.is_used ? (
                              <Badge variant="secondary">Used</Badge>
                            ) : isExpired ? (
                              <Badge variant="error">Expired</Badge>
                            ) : (
                              <Badge variant="success">Active</Badge>
                            )}
                          </div>
                          <p className="font-label-md text-label-md text-on-surface-variant mt-1">
                            {invite.email_restriction ? `For: ${invite.email_restriction}` : 'Open invite'}
                            {' | '}Expires: {new Date(invite.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {!invite.is_used && !isExpired && (
                            <Button variant="ghost" size="sm" onClick={() => copyInviteLink(invite.invite_code)}>
                              <Copy className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => deleteInvite(invite.id)}>
                            <Trash2 className="w-4 h-4 text-error" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <div className="flex items-center gap-2 mb-6">
          <Globe className="w-5 h-5 text-primary" />
          <h2 className="font-headline-md text-headline-md text-on-surface">General</h2>
        </div>
        <div className="space-y-4">
          <Input label="Platform Name" value={settings.platformName} onChange={(e) => updateSetting('platformName', e.target.value)} />
          <Input label="Support Email" type="email" value={settings.supportEmail} onChange={(e) => updateSetting('supportEmail', e.target.value)} />
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <div className="flex items-center gap-2 mb-6">
          <Bell className="w-5 h-5 text-primary" />
          <h2 className="font-headline-md text-headline-md text-on-surface">Notifications</h2>
        </div>
        <div className="space-y-4">
          <ToggleSetting label="Email Notifications" description="Send email notifications for important events" settingKey="emailNotifications" />
          <ToggleSetting label="New User Alerts" description="Notify admins when new users register" settingKey="newUserNotification" />
          <ToggleSetting label="New Campaign Alerts" description="Notify admins when campaigns are created" settingKey="newCampaignNotification" />
          <ToggleSetting label="New Lead Alerts" description="Notify admins for every new lead (high volume)" settingKey="newLeadNotification" />
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="font-headline-md text-headline-md text-on-surface">Security</h2>
        </div>
        <div className="space-y-4">
          <ToggleSetting label="Require Email Verification" description="Users must verify email before accessing platform" settingKey="requireEmailVerification" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Max Login Attempts" type="number" value={settings.maxLoginAttempts} onChange={(e) => updateSetting('maxLoginAttempts', parseInt(e.target.value))} helperText="Before temporary lockout" />
            <Input label="Session Timeout (minutes)" type="number" value={settings.sessionTimeout} onChange={(e) => updateSetting('sessionTimeout', parseInt(e.target.value))} helperText="Inactive session duration" />
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <div className="flex items-center gap-2 mb-6">
          <Database className="w-5 h-5 text-primary" />
          <h2 className="font-headline-md text-headline-md text-on-surface">Platform Access</h2>
        </div>
        <div className="space-y-4">
          <ToggleSetting label="Allow Creator Signups" description="New creators can register on the platform" settingKey="allowCreatorSignups" />
          <ToggleSetting label="Allow Developer Signups" description="New developers can register on the platform" settingKey="allowDeveloperSignups" />
          <ToggleSetting label="Maintenance Mode" description="Only admins can access the platform" settingKey="maintenanceMode" danger />
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <div className="flex items-center gap-2 mb-6">
          <Palette className="w-5 h-5 text-primary" />
          <h2 className="font-headline-md text-headline-md text-on-surface">Campaign Defaults</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="Default Duration (months)" type="number" value={settings.defaultCampaignDuration} onChange={(e) => updateSetting('defaultCampaignDuration', parseInt(e.target.value))} />
          <Input label="Minimum Budget (R)" type="number" value={settings.minCampaignBudget} onChange={(e) => updateSetting('minCampaignBudget', parseInt(e.target.value))} />
          <Input label="Maximum Budget (R)" type="number" value={settings.maxCampaignBudget} onChange={(e) => updateSetting('maxCampaignBudget', parseInt(e.target.value))} />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="secondary">Reset to Defaults</Button>
        <Button variant="primary" onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" />
          Save Settings
        </Button>
      </div>
    </div>
  )
}

export default AdminSettings
