import { useCallback, useEffect, useState } from 'react'
import { CreditCard, Landmark } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getPaymentsMode } from '../../lib/manualPayments'
import { Button, Badge } from '../../components/ui'
import { toast } from 'react-hot-toast'

/**
 * Switch between collecting money by bank transfer and collecting it by card.
 *
 * The platform ships in manual mode: a developer transfers the money and an
 * operator confirms it against the bank statement. Card mode is only safe
 * once a provider is integrated and its webhooks are verified, so the toggle
 * warns rather than simply flipping.
 *
 * The write is a super-admin-only database function and every change is
 * audited; this card is only the control surface.
 */
const PaymentModeCard = () => {
  const [mode, setMode] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    setMode(await getPaymentsMode())
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const apply = async (next) => {
    setSaving(true)
    try {
      const { error } = await supabase.rpc('set_platform_setting', {
        p_key: 'payments_mode',
        p_value: JSON.stringify(next),
      })
      if (error) throw error
      setMode(next)
      setConfirming(false)
      toast.success(
        next === 'manual'
          ? 'Collecting payments by bank transfer'
          : 'Card payments enabled',
      )
    } catch (err) {
      toast.error(err.message?.replace(/^.*?:\s*/, '') || 'Could not change the payment mode')
    } finally {
      setSaving(false)
    }
  }

  if (!mode) return null

  const isManual = mode === 'manual'

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
      <div className="flex items-center gap-2 mb-4">
        {isManual ? (
          <Landmark className="w-5 h-5 text-primary" />
        ) : (
          <CreditCard className="w-5 h-5 text-primary" />
        )}
        <h2 className="font-title-lg text-title-lg text-on-surface">How payments are collected</h2>
        <Badge variant={isManual ? 'default' : 'success'}>
          {isManual ? 'Bank transfer' : 'Card payments'}
        </Badge>
      </div>

      <p className="font-body-md text-body-md text-on-surface-variant mb-4">
        {isManual
          ? 'Developers transfer funds and quote a reference. An operator confirms each payment against the bank statement before the campaign is funded.'
          : 'Developers pay by card through the configured provider. Funds are credited when the provider confirms the payment by signed webhook.'}
      </p>

      {confirming ? (
        <div className="bg-surface-container-low border border-outline-variant rounded p-md">
          <p className="font-body-md text-body-md text-on-surface mb-3">
            {isManual
              ? 'Only switch to card payments once the provider integration is live, its webhook signature is verified, and a test payment has reconciled. Until then card payments will fail.'
              : 'Switching back to bank transfer stops card collection. Payments already in flight with the provider will still settle.'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={saving}
              onClick={() => apply(isManual ? 'gateway' : 'manual')}
            >
              {isManual ? 'Enable card payments' : 'Switch to bank transfer'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          {isManual ? 'Enable card payments' : 'Switch to bank transfer'}
        </Button>
      )}
    </div>
  )
}

export default PaymentModeCard
