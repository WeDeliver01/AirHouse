import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/ui'
import SecuritySettings from '../../components/SecuritySettings'
import { toast } from 'react-hot-toast'
import { 
  Settings, Bell, Shield, Building2, CreditCard, Mail, Lock, 
  Trash2, Download, CheckCircle, AlertCircle, Users
} from 'lucide-react'
import { cn } from '../../lib/utils'
import TermsAcceptanceCard from '../../components/TermsAcceptanceCard'

const ToggleSwitch = ({ enabled, onChange, label, description }) => (
  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
    <div>
      <p className="font-medium text-gray-900">{label}</p>
      {description && <p className="text-sm text-gray-500">{description}</p>}
    </div>
    <button
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative w-12 h-6 rounded-full transition-colors',
        enabled ? 'bg-primary' : 'bg-gray-300'
      )}
    >
      <span
        className={cn(
          'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
          enabled ? 'translate-x-7' : 'translate-x-1'
        )}
      />
    </button>
  </div>
)

const DeveloperSettings = () => {
  const { user, profile, updatePassword, updateProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState({
    emailNotifications: true,
    newLeadAlerts: true,
    applicationAlerts: true,
    paymentAlerts: true,
    weeklyReports: true,
    marketingEmails: false,
  })
  const [companyForm, setCompanyForm] = useState({
    company_name: profile?.company_name || '',
    phone: profile?.phone || '',
    bio: profile?.bio || '',
  })
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: '',
  })

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
    toast.success('Setting updated')
  }

  const handleCompanyUpdate = async () => {
    setLoading(true)
    try {
      await updateProfile(companyForm)
    } catch (error) {
      // Error handled in context
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    if (passwordForm.new !== passwordForm.confirm) {
      toast.error('Passwords do not match')
      return
    }
    if (passwordForm.new.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await updatePassword(passwordForm.new)
      setPasswordForm({ current: '', new: '', confirm: '' })
    } catch (error) {
      // Error handled in context
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account and company settings</p>
      </div>

      {/* Company Profile */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Company Profile</h2>
            <p className="text-sm text-gray-500">Update your company information</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input
              type="text"
              value={companyForm.company_name}
              onChange={(e) => setCompanyForm(p => ({ ...p, company_name: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Your company name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={companyForm.phone}
              onChange={(e) => setCompanyForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="+27 123 456 7890"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Bio</label>
            <textarea
              value={companyForm.bio}
              onChange={(e) => setCompanyForm(p => ({ ...p, bio: e.target.value }))}
              rows={3}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              placeholder="Brief description of your company..."
            />
          </div>
          <Button variant="primary" onClick={handleCompanyUpdate} isLoading={loading}>
            Save Changes
          </Button>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Notifications</h2>
            <p className="text-sm text-gray-500">Choose how you want to be notified</p>
          </div>
        </div>

        <div className="space-y-3">
          <ToggleSwitch
            enabled={settings.emailNotifications}
            onChange={() => handleToggle('emailNotifications')}
            label="Email Notifications"
            description="Receive all updates via email"
          />
          <ToggleSwitch
            enabled={settings.newLeadAlerts}
            onChange={() => handleToggle('newLeadAlerts')}
            label="New Lead Alerts"
            description="Get notified when new leads come in"
          />
          <ToggleSwitch
            enabled={settings.applicationAlerts}
            onChange={() => handleToggle('applicationAlerts')}
            label="Creator Applications"
            description="When creators apply to your campaigns"
          />
          <ToggleSwitch
            enabled={settings.paymentAlerts}
            onChange={() => handleToggle('paymentAlerts')}
            label="Payment Alerts"
            description="Notifications about payments and escrow"
          />
          <ToggleSwitch
            enabled={settings.weeklyReports}
            onChange={() => handleToggle('weeklyReports')}
            label="Weekly Reports"
            description="Get a summary of your campaign performance"
          />
          <ToggleSwitch
            enabled={settings.marketingEmails}
            onChange={() => handleToggle('marketingEmails')}
            label="Marketing Emails"
            description="Tips, news, and promotional content"
          />
        </div>
      </div>

      <SecuritySettings required={false} />

      {/* Security */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Security</h2>
            <p className="text-sm text-gray-500">Protect your account</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-medium text-gray-900">Change Password</p>
                <p className="text-sm text-gray-500">Update your password regularly</p>
              </div>
              <Lock className="w-5 h-5 text-gray-400" />
            </div>
            
            <div className="space-y-3">
              <input
                type="password"
                placeholder="Current password"
                value={passwordForm.current}
                onChange={(e) => setPasswordForm(p => ({ ...p, current: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                type="password"
                placeholder="New password"
                value={passwordForm.new}
                onChange={(e) => setPasswordForm(p => ({ ...p, new: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm(p => ({ ...p, confirm: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <Button 
                variant="primary" 
                onClick={handlePasswordChange}
                disabled={!passwordForm.new || !passwordForm.confirm}
              >
                Update Password
              </Button>
            </div>
          </div>

          <div className="p-4 bg-green-50 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Email Verified</p>
                <p className="text-sm text-green-600">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <TermsAcceptanceCard />

      {/* Danger Zone */}
      <div className="bg-white rounded-2xl p-6 border border-red-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-semibold text-red-700">Danger Zone</h2>
            <p className="text-sm text-red-500">Irreversible actions</p>
          </div>
        </div>

        <button
          onClick={() => toast.error('Please contact support to delete your account')}
          className="w-full flex items-center justify-between p-4 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Trash2 className="w-5 h-5 text-red-600" />
            <div className="text-left">
              <p className="font-medium text-red-700">Delete Account</p>
              <p className="text-sm text-red-500">Permanently delete your account and all campaigns</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}

export default DeveloperSettings
