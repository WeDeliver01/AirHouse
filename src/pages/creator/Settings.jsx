import { useState} from 'react'
import { useAuth } from '../../context/AuthContext'
import { Button} from '../../components/ui'
import SecuritySettings from '../../components/SecuritySettings'
import { toast } from 'react-hot-toast'
import { 
  Settings, Bell, Shield, Eye, Lock, 
  Trash2, Download, CheckCircle, AlertCircle
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

const CreatorSettings = () => {
  const { user, profile, updatePassword } = useAuth()
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: false,
    newCampaignAlerts: true,
    applicationUpdates: true,
    paymentAlerts: true,
    marketingEmails: false,
    profilePublic: true,
    showEarnings: false,
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

  const handleExportData = () => {
    toast.success('Your data export will be sent to your email')
  }

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      toast.error('Please contact support to delete your account')
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account preferences</p>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
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
            description="Receive updates via email"
          />
          <ToggleSwitch
            enabled={settings.pushNotifications}
            onChange={() => handleToggle('pushNotifications')}
            label="Push Notifications"
            description="Browser and mobile notifications"
          />
          <ToggleSwitch
            enabled={settings.newCampaignAlerts}
            onChange={() => handleToggle('newCampaignAlerts')}
            label="New Campaign Alerts"
            description="Get notified when new campaigns match your profile"
          />
          <ToggleSwitch
            enabled={settings.applicationUpdates}
            onChange={() => handleToggle('applicationUpdates')}
            label="Application Updates"
            description="Status changes on your applications"
          />
          <ToggleSwitch
            enabled={settings.paymentAlerts}
            onChange={() => handleToggle('paymentAlerts')}
            label="Payment Alerts"
            description="Notifications about payments and earnings"
          />
          <ToggleSwitch
            enabled={settings.marketingEmails}
            onChange={() => handleToggle('marketingEmails')}
            label="Marketing Emails"
            description="Tips, news, and promotional content"
          />
        </div>
      </div>

      {/* Privacy */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Eye className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Privacy</h2>
            <p className="text-sm text-gray-500">Control your profile visibility</p>
          </div>
        </div>

        <div className="space-y-3">
          <ToggleSwitch
            enabled={settings.profilePublic}
            onChange={() => handleToggle('profilePublic')}
            label="Public Profile"
            description="Allow developers to find and view your profile"
          />
          <ToggleSwitch
            enabled={settings.showEarnings}
            onChange={() => handleToggle('showEarnings')}
            label="Show Earnings History"
            description="Display your earnings on your public profile"
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
                <p className="text-sm text-gray-500">Update your password regularly for security</p>
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
                isLoading={loading}
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

      {/* Data & Account */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Settings className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Data & Account</h2>
            <p className="text-sm text-gray-500">Manage your data and account</p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleExportData}
            className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-gray-600" />
              <div className="text-left">
                <p className="font-medium text-gray-900">Export My Data</p>
                <p className="text-sm text-gray-500">Download all your data</p>
              </div>
            </div>
          </button>

          <button
            onClick={handleDeleteAccount}
            className="w-full flex items-center justify-between p-4 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-5 h-5 text-red-600" />
              <div className="text-left">
                <p className="font-medium text-red-700">Delete Account</p>
                <p className="text-sm text-red-500">Permanently delete your account and data</p>
              </div>
            </div>
            <AlertCircle className="w-5 h-5 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreatorSettings
