import { useCallback, useEffect, useState } from 'react'
import { Shield, ShieldCheck, Smartphone, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'react-hot-toast'

import {
  hasVerifiedFactor, listFactors, startEnrollment, unenroll, verifyEnrollment,
} from '../lib/mfa'
import { Button, Badge } from './ui'

/**
 * Two-factor authentication settings.
 *
 * Shared by the creator, developer and admin settings pages so there is one
 * implementation rather than three. Privileged accounts are required to hold
 * a factor; everyone else is encouraged to.
 */
const SecuritySettings = ({ required = false }) => {
  const [factors, setFactors] = useState([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { totp } = await listFactors()
      setFactors(totp)
    } catch (err) {
      console.error('Could not list MFA factors:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const verified = factors.filter((f) => f.status === 'verified')

  const begin = async () => {
    setBusy(true)
    try {
      setEnrolling(await startEnrollment('Authenticator app'))
    } catch (err) {
      toast.error(err.message || 'Could not start enrolment')
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error('Enter the 6-digit code from your authenticator app')
      return
    }
    setBusy(true)
    try {
      await verifyEnrollment(enrolling.factorId, code)
      toast.success('Two-factor authentication is on')
      setEnrolling(null)
      setCode('')
      load()
    } catch (err) {
      toast.error(err.message || 'That code was not accepted')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (factorId) => {
    setBusy(true)
    try {
      await unenroll(factorId)
      toast.success('Authenticator removed')
      load()
    } catch (err) {
      toast.error(err.message || 'Could not remove the authenticator')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
          {verified.length > 0 ? (
            <ShieldCheck className="w-5 h-5 text-green-600" />
          ) : (
            <Shield className="w-5 h-5 text-green-600" />
          )}
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            Two-factor authentication
            {verified.length > 0 ? (
              <Badge variant="success">On</Badge>
            ) : (
              <Badge variant={required ? 'danger' : 'default'}>Off</Badge>
            )}
          </h2>
          <p className="text-sm text-gray-500">
            A code from your phone, in addition to your password.
          </p>
        </div>
      </div>

      {required && verified.length === 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            Your account can approve payments and change other people&rsquo;s access, so
            two-factor authentication is required. Set it up to keep using admin features.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : enrolling ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Scan this with Google Authenticator, Authy, 1Password or any authenticator
            app, then enter the 6-digit code it shows.
          </p>

          {enrolling.qrCode && (
            <img
              src={enrolling.qrCode}
              alt="QR code for setting up two-factor authentication"
              className="w-44 h-44 self-start border border-gray-200 rounded-lg bg-white"
            />
          )}

          {enrolling.secret && (
            <div className="text-sm">
              <p className="text-gray-500 mb-1">Or enter this key manually:</p>
              <code className="font-mono text-gray-900 break-all">{enrolling.secret}</code>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="mfa-code">
                6-digit code
              </label>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-36 rounded-lg border border-gray-200 px-3 py-2 font-mono tracking-widest"
                placeholder="000000"
              />
            </div>
            <Button variant="primary" onClick={finish} isLoading={busy}>
              Turn on
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEnrolling(null)
                setCode('')
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : verified.length > 0 ? (
        <div className="flex flex-col gap-3">
          {verified.map((factor) => (
            <div
              key={factor.id}
              className="flex items-center justify-between gap-3 p-4 bg-gray-50 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">
                    {factor.friendly_name || 'Authenticator app'}
                  </p>
                  <p className="text-sm text-gray-500">
                    Added {new Date(factor.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button variant="ghost" onClick={() => remove(factor.id)} disabled={busy}>
                <Trash2 className="w-4 h-4 mr-1" />
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" onClick={begin} disabled={busy}>
            Add another device
          </Button>
        </div>
      ) : (
        <Button variant="primary" onClick={begin} isLoading={busy}>
          Set up two-factor authentication
        </Button>
      )}
    </div>
  )
}

export default SecuritySettings
export { hasVerifiedFactor }
