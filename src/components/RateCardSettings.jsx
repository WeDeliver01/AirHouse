import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Plus, Trash2, DollarSign } from 'lucide-react'
import { Button } from './ui'
import {
  PLATFORMS, DELIVERABLE_TYPES,
  listMyRateCard, upsertRateCardItem, deleteRateCardItem,
} from '../lib/pricing'

const emptyForm = { platform: 'instagram', deliverableType: 'reel', label: '', unitPrice: '' }

/**
 * A creator's price list: one row per platform + deliverable type. Clients
 * build a cart from these prices when booking a collaboration -- see
 * src/lib/cart.js and supabase/migrations/030_pricing_cart_checkout.sql.
 */
const RateCardSettings = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      setItems(await listMyRateCard())
    } catch (e) {
      toast.error(e.message || 'Could not load your rate card')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!form.unitPrice || Number(form.unitPrice) <= 0) {
      toast.error('Enter a price greater than zero')
      return
    }
    setSaving(true)
    try {
      await upsertRateCardItem(form)
      setForm(emptyForm)
      toast.success('Rate card updated')
      await load()
    } catch (e) {
      toast.error(e.message || 'Could not save that price')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (item) => {
    try {
      await upsertRateCardItem({
        id: item.id,
        platform: item.platform,
        deliverableType: item.deliverable_type,
        label: item.label,
        unitPrice: item.unit_price_cents / 100,
        isActive: !item.is_active,
      })
      await load()
    } catch (e) {
      toast.error(e.message || 'Could not update that price')
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteRateCardItem(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (e) {
      toast.error(e.message || 'Could not remove that price')
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">Rate Card</h2>
          <p className="text-sm text-gray-500">
            Set your price per platform and deliverable. Clients book you by adding these to a cart --
            you receive 97.3% of what they pay; AirHouse keeps a flat 2.7% transaction fee.
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-6">
        {loading && <p className="text-sm text-gray-500">Loading your rate card...</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-gray-500">You haven't set any prices yet. Add one below.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border ${item.is_active ? 'border-gray-100 bg-gray-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
            <div>
              <p className="font-medium text-gray-900 text-sm">{item.label}</p>
              <p className="text-xs text-gray-500">
                {PLATFORMS.find((p) => p.value === item.platform)?.label || item.platform} &middot;{' '}
                {DELIVERABLE_TYPES.find((d) => d.value === item.deliverable_type)?.label || item.deliverable_type}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-900 text-sm">
                R {(item.unit_price_cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
              </span>
              <button onClick={() => handleToggleActive(item)} className="text-xs text-primary hover:underline">
                {item.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => handleDelete(item.id)} className="text-gray-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl">
        <select
          value={form.platform}
          onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
        >
          {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select
          value={form.deliverableType}
          onChange={(e) => setForm((f) => ({ ...f, deliverableType: e.target.value }))}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
        >
          {DELIVERABLE_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <input
          type="text"
          placeholder="Label (e.g. Instagram Reel)"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm sm:col-span-2"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Price (ZAR)"
          value={form.unitPrice}
          onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
        />
        <Button variant="primary" onClick={handleAdd} isLoading={saving}>
          <Plus className="w-4 h-4 mr-1" />Add Price
        </Button>
      </div>
    </div>
  )
}

export default RateCardSettings
