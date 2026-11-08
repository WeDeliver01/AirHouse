import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  Input,
  Modal,
  PageHeader,
  Skeleton,
} from '../../components/stitch'
import { formatCurrency, formatRelativeTime } from '../../lib/utils'
import {
  CONTRACT_STATUS,
  hashContractTerms,
  signContract,
  verifyContractIntegrity,
} from '../../lib/contracts'
import { toast } from 'react-hot-toast'

export default function Contracts() {
  const { user, profile, creatorProfile, isSuperAdmin } = useAuth()
  const isDeveloper = profile?.role === 'developer'
  const isCreator = profile?.role === 'creator'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [contracts, setContracts] = useState([])
  const [selected, setSelected] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')

  const [showSignModal, setShowSignModal] = useState(false)
  const [hashInfo, setHashInfo] = useState(null)
  const [integrity, setIntegrity] = useState(null)

  // ---------- load ----------
  useEffect(() => {
    if (user?.id) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.role, creatorProfile?.id, isSuperAdmin])

  async function fetchAll() {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('contracts')
        .select(`
          *,
          campaigns(id, title, property_name),
          creator_profiles(id, user_id, profiles:user_id(full_name, avatar_url)),
          developer:developer_id(full_name, avatar_url, company_name)
        `)
        .order('created_at', { ascending: false })

      if (isSuperAdmin) {
        // no extra filter
      } else if (isDeveloper) {
        query = query.eq('developer_id', user.id)
      } else if (isCreator && creatorProfile?.id) {
        query = query.eq('creator_id', creatorProfile.id)
      } else if (isCreator && !creatorProfile?.id) {
        setContracts([])
        setLoading(false)
        return
      }

      const { data, error: qErr } = await query
      if (qErr) throw qErr
      setContracts(data || [])
      if (data?.length && !selected) setSelected(data[0])
    } catch (e) {
      console.error(e)
      setError('Failed to load contracts')
    } finally {
      setLoading(false)
    }
  }

  // Recompute hash + integrity when selected contract changes
  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!selected) {
        setHashInfo(null)
        setIntegrity(null)
        return
      }
      const current = await hashContractTerms(selected)
      if (cancelled) return
      setHashInfo(current)
      if (selected.signed_terms_hash) {
        const v = await verifyContractIntegrity(selected)
        if (!cancelled) setIntegrity(v)
      } else {
        setIntegrity(null)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [selected])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return contracts
    return contracts.filter((c) => c.status === statusFilter)
  }, [contracts, statusFilter])

  function canSign(contract) {
    if (!contract) return false
    if (['signed', 'cancelled', 'expired'].includes(contract.status)) return false
    if (isDeveloper && !contract.developer_signed_at) return true
    if (isCreator && !contract.creator_signed_at) return true
    return false
  }

  async function handleSigned(updated) {
    setSelected(updated)
    setContracts((cs) => cs.map((c) => (c.id === updated.id ? updated : c)))
    setShowSignModal(false)
    toast.success(
      updated.status === 'signed'
        ? 'Contract fully signed and locked'
        : 'Your signature has been recorded',
    )
  }

  // ---------- render ----------
  return (
    <div className="space-y-lg">
      <PageHeader
        eyebrow="Digital Contracts"
        title="Contracts & Agreements"
        description="Each contract is hashed at signing time. Once both parties sign, the terms become immutable and the IP + timestamp + signature are stored on the audit record."
      />

      {/* Filter row */}
      <div className="flex flex-wrap gap-sm">
        {[
          ['all', 'All'],
          ['draft', 'Draft'],
          ['pending_creator', 'Awaiting Creator'],
          ['pending_developer', 'Awaiting Developer'],
          ['signed', 'Signed'],
          ['cancelled', 'Cancelled'],
        ].map(([key, label]) => {
          const active = statusFilter === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={
                'inline-flex items-center gap-xs px-sm py-xs rounded font-label-md text-label-md transition-colors ' +
                (active
                  ? 'bg-secondary text-on-secondary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high')
              }
            >
              {label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
          <Skeleton className="h-96 lg:col-span-1" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      ) : error ? (
        <Card>
          <EmptyState
            icon="error"
            title="Couldn't load contracts"
            description={error}
            action={
              <Button variant="primary" icon="refresh" onClick={fetchAll}>
                Retry
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="description"
            title="No contracts yet"
            description="Contracts appear here once a creator is assigned to a campaign and the developer issues the agreement."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
          {/* List */}
          <div className="lg:col-span-1">
            <Card padding="none" className="overflow-hidden">
              <div className="px-md py-sm border-b border-outline-variant font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                {filtered.length} contract{filtered.length === 1 ? '' : 's'}
              </div>
              <ul className="divide-y divide-outline-variant max-h-[640px] overflow-y-auto">
                {filtered.map((c) => {
                  const status = CONTRACT_STATUS[c.status] || CONTRACT_STATUS.draft
                  const active = selected?.id === c.id
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(c)}
                        className={
                          'w-full text-left p-md hover:bg-surface-container-low transition-colors ' +
                          (active ? 'bg-surface-container-low' : '')
                        }
                      >
                        <div className="flex items-start justify-between gap-sm">
                          <div className="min-w-0">
                            <div className="font-label-lg text-label-lg text-on-surface truncate">
                              {c.title || 'Untitled contract'}
                            </div>
                            <div className="font-body-sm text-body-sm text-on-surface-variant truncate">
                              {c.campaigns?.title || c.campaigns?.property_name || 'Campaign'}
                            </div>
                          </div>
                          <Chip tone={status.tone} icon={status.icon}>
                            {status.label}
                          </Chip>
                        </div>
                        <div className="mt-sm flex items-center justify-between gap-sm font-label-md text-label-md text-on-surface-variant">
                          <span className="font-data-mono">
                            {formatCurrency(c.total_value)}
                          </span>
                          <span>{formatRelativeTime(c.created_at)}</span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </div>

          {/* Detail */}
          <div className="lg:col-span-2">
            {selected ? (
              <ContractDetail
                contract={selected}
                canSign={canSign(selected)}
                hashInfo={hashInfo}
                integrity={integrity}
                onSign={() => setShowSignModal(true)}
              />
            ) : (
              <Card>
                <EmptyState
                  icon="description"
                  title="Select a contract"
                  description="Choose a contract from the list to view its terms, deliverables, and signing status."
                />
              </Card>
            )}
          </div>
        </div>
      )}

      <SignModal
        isOpen={showSignModal}
        onClose={() => setShowSignModal(false)}
        contract={selected}
        role={isDeveloper ? 'developer' : 'creator'}
        onSigned={handleSigned}
      />
    </div>
  )
}

// ============================================
// Contract detail card
// ============================================

function ContractDetail({ contract, canSign, hashInfo, integrity, onSign }) {
  const status = CONTRACT_STATUS[contract.status] || CONTRACT_STATUS.draft
  const deliverables = Array.isArray(contract.deliverables)
    ? contract.deliverables
    : []
  const paymentTerms = contract.payment_terms || {}

  return (
    <Card padding="none">
      <div className="p-md border-b border-outline-variant flex items-start justify-between gap-md">
        <div className="min-w-0">
          <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            {contract.campaigns?.title || contract.campaigns?.property_name}
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface mt-xs">
            {contract.title}
          </h2>
        </div>
        <div className="flex items-center gap-sm shrink-0">
          <Chip tone={status.tone} icon={status.icon}>
            {status.label}
          </Chip>
          {canSign && (
            <Button variant="primary" icon="draw" onClick={onSign}>
              Sign
            </Button>
          )}
        </div>
      </div>

      {/* Key facts */}
      <div className="p-md grid grid-cols-2 md:grid-cols-4 gap-sm">
        <KeyFact icon="payments" label="Total value" value={formatCurrency(contract.total_value)} />
        <KeyFact icon="event" label="Start" value={contract.start_date || 'TBD'} />
        <KeyFact icon="event_busy" label="End" value={contract.end_date || 'TBD'} />
        <KeyFact icon="checklist" label="Deliverables" value={String(deliverables.length)} />
      </div>

      {/* Terms */}
      <div className="px-md pb-md">
        <h3 className="font-headline-md text-headline-md text-on-surface mb-sm">
          Terms & conditions
        </h3>
        <div className="rounded border border-outline-variant bg-surface-container-low p-md font-body-md text-body-md text-on-surface whitespace-pre-wrap max-h-72 overflow-y-auto">
          {contract.terms || 'No terms specified.'}
        </div>
      </div>

      {/* Deliverables */}
      {deliverables.length > 0 && (
        <div className="px-md pb-md">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-sm">
            Deliverables
          </h3>
          <ul className="space-y-xs">
            {deliverables.map((d, i) => (
              <li
                key={i}
                className="flex items-center gap-sm rounded border border-outline-variant bg-surface-container-lowest px-sm py-sm"
              >
                <Icon name="task_alt" size={18} className="text-secondary" />
                <span className="font-body-md text-body-md text-on-surface">
                  {typeof d === 'string' ? d : d.description || JSON.stringify(d)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Payment terms */}
      {Object.keys(paymentTerms).length > 0 && (
        <div className="px-md pb-md">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-sm">
            Payment terms
          </h3>
          <div className="rounded border border-outline-variant bg-surface-container-low p-md grid grid-cols-1 sm:grid-cols-2 gap-sm">
            {Object.entries(paymentTerms).map(([k, v]) => (
              <div key={k}>
                <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                  {String(k).replace(/_/g, ' ')}
                </div>
                <div className="font-body-md text-body-md text-on-surface">
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signing parties */}
      <div className="px-md pb-md grid grid-cols-1 md:grid-cols-2 gap-sm">
        <SigningParty
          role="Developer"
          name={contract.developer?.full_name}
          subtitle={contract.developer?.company_name}
          signedAt={contract.developer_signed_at}
          signature={contract.developer_signature}
          signatureType={contract.developer_signature_type}
          ip={contract.developer_signature_ip}
        />
        <SigningParty
          role="Creator"
          name={contract.creator_profiles?.profiles?.full_name}
          signedAt={contract.creator_signed_at}
          signature={contract.creator_signature}
          signatureType={contract.creator_signature_type}
          ip={contract.creator_signature_ip}
        />
      </div>

      {/* Integrity panel */}
      <div className="px-md pb-md">
        <div
          className={
            'rounded border p-md ' +
            (contract.status === 'signed'
              ? integrity?.ok === false
                ? 'border-error bg-error-container'
                : 'border-secondary bg-secondary-container'
              : 'border-outline-variant bg-surface-container-low')
          }
        >
          <div className="flex items-center gap-sm mb-xs">
            <Icon
              name={
                contract.status === 'signed'
                  ? integrity?.ok === false
                    ? 'gpp_bad'
                    : 'verified'
                  : 'fingerprint'
              }
              size={20}
              className={
                contract.status === 'signed'
                  ? integrity?.ok === false
                    ? 'text-on-error-container'
                    : 'text-on-secondary-container'
                  : 'text-on-surface-variant'
              }
            />
            <span
              className={
                'font-label-lg text-label-lg ' +
                (contract.status === 'signed'
                  ? integrity?.ok === false
                    ? 'text-on-error-container'
                    : 'text-on-secondary-container'
                  : 'text-on-surface')
              }
            >
              {contract.status === 'signed'
                ? integrity?.ok === false
                  ? 'Integrity check FAILED'
                  : 'Cryptographic integrity verified'
                : 'Awaiting full signature'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-xs font-data-mono text-data-mono text-on-surface break-all">
            <div>
              <span className="font-label-md text-label-md text-on-surface-variant block">
                current terms hash
              </span>
              {hashInfo || '—'}
            </div>
            <div>
              <span className="font-label-md text-label-md text-on-surface-variant block">
                signed snapshot hash
              </span>
              {contract.signed_terms_hash || '— (not signed)'}
            </div>
          </div>
          {contract.signed_at && (
            <div className="mt-sm font-label-md text-label-md text-on-surface-variant">
              Locked at {new Date(contract.signed_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function KeyFact({ icon, label, value }) {
  return (
    <div className="rounded border border-outline-variant bg-surface-container-low p-sm">
      <div className="flex items-center gap-xs text-on-surface-variant">
        <Icon name={icon} size={16} />
        <span className="font-label-md text-label-md uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="mt-xs font-headline-md text-headline-md text-on-surface">
        {value}
      </div>
    </div>
  )
}

function SigningParty({ role, name, subtitle, signedAt, signature, signatureType, ip }) {
  const signed = !!signedAt
  return (
    <div
      className={
        'rounded border p-md ' +
        (signed
          ? 'border-secondary bg-secondary-container/40'
          : 'border-outline-variant bg-surface-container-low')
      }
    >
      <div className="flex items-center gap-sm mb-xs">
        <Icon
          name={signed ? 'check_circle' : 'schedule'}
          size={20}
          className={signed ? 'text-secondary' : 'text-on-surface-variant'}
        />
        <span className="font-label-lg text-label-lg text-on-surface">{role}</span>
      </div>
      <div className="font-body-md text-body-md text-on-surface">{name || '—'}</div>
      {subtitle && (
        <div className="font-body-sm text-body-sm text-on-surface-variant">{subtitle}</div>
      )}
      {signed ? (
        <div className="mt-sm pt-sm border-t border-outline-variant space-y-xs">
          {signatureType === 'drawn' && signature?.startsWith('data:image') ? (
            <img
              src={signature}
              alt={`${role} signature`}
              className="max-h-20 bg-surface-container-lowest border border-outline-variant rounded"
            />
          ) : (
            <div className="text-headline-md font-headline-md italic text-on-surface" style={{ fontFamily: 'cursive' }}>
              {signature}
            </div>
          )}
          <div className="font-label-md text-label-md text-on-surface-variant">
            Signed {new Date(signedAt).toLocaleString()}
          </div>
          {ip && (
            <div className="font-data-mono text-data-mono text-on-surface-variant">
              IP {ip}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-sm font-body-sm text-body-sm text-on-surface-variant">
          Pending signature
        </div>
      )}
    </div>
  )
}

// ============================================
// Sign modal — typed + drawn tabs
// ============================================

function SignModal({ isOpen, onClose, contract, role, onSigned }) {
  const [tab, setTab] = useState('typed')
  const [typed, setTyped] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef({ x: 0, y: 0 })
  const hasInkRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      setTab('typed')
      setTyped('')
      setAgreed(false)
      hasInkRef.current = false
    }
  }, [isOpen])

  function getCanvasPos(e) {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const rect = c.getBoundingClientRect()
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
    return {
      x: (x / rect.width) * c.width,
      y: (y / rect.height) * c.height,
    }
  }

  function startDraw(e) {
    e.preventDefault()
    drawingRef.current = true
    lastRef.current = getCanvasPos(e)
  }
  function moveDraw(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = getCanvasPos(e)
    ctx.strokeStyle = '#141b2b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
    hasInkRef.current = true
  }
  function endDraw() {
    drawingRef.current = false
  }
  function clearCanvas() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    hasInkRef.current = false
  }

  // Initialize canvas size on mount/open
  useEffect(() => {
    if (!isOpen || tab !== 'drawn') return
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = 600 * dpr
    c.height = 200 * dpr
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, c.width, c.height)
    hasInkRef.current = false
  }, [isOpen, tab])

  async function submit() {
    if (!contract || !agreed) return
    let signature = ''
    let signatureType = 'typed'
    if (tab === 'typed') {
      signature = typed.trim()
      if (!signature) {
        toast.error('Please type your full legal name')
        return
      }
    } else {
      if (!hasInkRef.current) {
        toast.error('Please draw your signature')
        return
      }
      signature = canvasRef.current.toDataURL('image/png')
      signatureType = 'drawn'
    }
    setSubmitting(true)
    try {
      const updated = await signContract({
        contract,
        signature,
        signatureType,
      })
      onSigned(updated)
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Could not sign contract')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="Sign contract"
      description={
        contract
          ? `Signing as ${role} on "${contract.title}". Your IP, the timestamp, and a SHA-256 hash of the terms will be recorded permanently.`
          : ''
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="draw"
            onClick={submit}
            disabled={submitting || !agreed}
          >
            {submitting ? 'Signing…' : 'Sign and lock'}
          </Button>
        </>
      }
    >
      <div className="space-y-md">
        <div className="rounded border border-outline-variant bg-surface-container-low p-sm flex items-start gap-sm">
          <Icon name="info" size={18} className="text-on-surface-variant mt-xs" />
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            By signing you agree to the contract terms exactly as displayed. After
            both parties sign, the contract becomes immutable — no field can be
            edited and the row cannot be deleted.
          </p>
        </div>

        {/* Tabs */}
        <div className="inline-flex rounded border border-outline-variant bg-surface-container-lowest p-xs">
          {[
            ['typed', 'Type signature', 'keyboard'],
            ['drawn', 'Draw signature', 'gesture'],
          ].map(([key, label, icon]) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={
                  'inline-flex items-center gap-xs px-sm py-xs rounded font-label-md text-label-md transition-colors ' +
                  (active
                    ? 'bg-secondary text-on-secondary'
                    : 'text-on-surface-variant hover:text-on-surface')
                }
              >
                <Icon name={icon} size={16} />
                {label}
              </button>
            )
          })}
        </div>

        {tab === 'typed' ? (
          <div>
            <Input
              label="Full legal name"
              placeholder="e.g. Ashley Baloyi"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            {typed && (
              <div className="mt-sm rounded border border-dashed border-outline-variant p-md text-center bg-surface-container-lowest">
                <div
                  className="text-headline-lg text-on-surface italic"
                  style={{ fontFamily: 'cursive' }}
                >
                  {typed}
                </div>
                <div className="mt-xs font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                  Signature preview
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="rounded border border-outline-variant bg-surface-container-lowest overflow-hidden">
              <canvas
                ref={canvasRef}
                onMouseDown={startDraw}
                onMouseMove={moveDraw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={moveDraw}
                onTouchEnd={endDraw}
                className="w-full h-48 cursor-crosshair touch-none"
                style={{ aspectRatio: '3 / 1' }}
              />
            </div>
            <div className="mt-sm flex items-center justify-between">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Sign with mouse, trackpad, or touchscreen.
              </p>
              <Button variant="ghost" size="sm" icon="restart_alt" onClick={clearCanvas}>
                Clear
              </Button>
            </div>
          </div>
        )}

        <label className="flex items-start gap-sm cursor-pointer select-none">
          <input
            type="checkbox"
            className="mt-1"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="font-body-md text-body-md text-on-surface">
            I have read and accept the contract terms above. I understand this
            signature is legally binding and the record (IP, timestamp, terms hash)
            cannot be altered.
          </span>
        </label>
      </div>
    </Modal>
  )
}
