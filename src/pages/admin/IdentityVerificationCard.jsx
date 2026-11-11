import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { getPlatformSetting, setPlatformSetting } from '../../lib/platformSettings'
import { Button, Badge } from '../../components/ui'
import { toast } from 'react-hot-toast'

/**
 * Toggle whether new creators/developers must complete the identity-check
 * step (ID document + liveness selfie upload) during onboarding.
 *
 * Off by default (see migration 032). The write goes through the
 * super-admin-only `set_platform_setting` database function, same as
 * PaymentModeCard, so this component is only the control surface.
 */
const IdentityVerificationCard = () => {
  const [required, setRequired] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setRequired(Boolean(await getPlatformSetting('require_identity_verification', false)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggle = async () => {
    const next = !required
    setSaving(true)
    try {
      await setPlatformSetting('require_identity_verification', next)
      setRequired(next)
      toast.success(
        next
          ? 'Identity check re-enabled for onboarding'
          : 'Identity check disabled for onboarding',
      )
    } catch (err) {
      toast.error(err.message || 'Could not change this setting')
    } finally {
      setSaving(false)
    }
  }

  if (required === null) return null

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
      <div className="flex items-center gap-2 mb-4">
        {required ? (
          <ShieldCheck className="w-5 h-5 text-primary" />
        ) : (
          <ShieldOff className="w-5 h-5 text-primary" />
        )}
        <h2 className="font-title-lg text-title-lg text-on-surface">Identity verification</h2>
        <Badge variant={required ? 'success' : 'secondary'}>
          {required ? 'Required' : 'Disabled'}
        </Badge>
      </div>

      <p className="font-body-md text-body-md text-on-surface-variant mb-4">
        {required
          ? 'Every new creator and developer must upload an ID document and a liveness selfie during onboarding before they can finish setting up their profile.'
          : 'The onboarding wizard skips the ID document and selfie upload step. Turn this back on once the review workflow is ready to handle submissions again.'}
      </p>

      <Button variant="secondary" isLoading={saving} onClick={toggle}>
        {required ? 'Disable identity check' : 'Require identity check'}
      </Button>
    </div>
  )
}

export default IdentityVerificationCard
