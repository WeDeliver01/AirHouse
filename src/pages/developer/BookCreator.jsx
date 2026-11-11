import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ShoppingCart, Plus, Minus, Trash2, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button, LoadingSpinner, ErrorState } from '../../components/ui'
import { listCreatorRateCard, computeCheckoutTotals, PLATFORMS, DELIVERABLE_TYPES } from '../../lib/pricing'
import {
  getOrCreateDraftCart, addCartItem, updateCartItemQuantity,
  removeCartItem, cartSubtotalCents, checkoutCart,
} from '../../lib/cart'

const platformLabel = (v) => PLATFORMS.find((p) => p.value === v)?.label || v
const typeLabel = (v) => DELIVERABLE_TYPES.find((d) => d.value === v)?.label || v

/**
 * Purchase a video collaboration: pick deliverables from a creator's rate
 * card, build a cart, and check out. Checkout books the campaign and raises
 * the funding request in one call -- see cart.js / checkout_campaign_cart().
 */
const BookCreator = () => {
  const { creatorId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creator, setCreator] = useState(null)
  const [rateCard, setRateCard] = useState([])
  const [cart, setCart] = useState(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [title, setTitle] = useState('')
  const [propertyName, setPropertyName] = useState('')
  const [propertyLocation, setPropertyLocation] = useState('')

  useEffect(() => { load() }, [creatorId])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: creatorRow, error: creatorError } = await supabase
        .from('creator_profiles')
        .select('*, user:profiles!user_id(id, full_name, avatar_url, is_verified)')
        .eq('user_id', creatorId)
        .single()
      if (creatorError) throw creatorError
      setCreator(creatorRow)

      const [cards, draftCart] = await Promise.all([
        listCreatorRateCard(creatorId),
        getOrCreateDraftCart(creatorId),
      ])
      setRateCard(cards)
      setCart(draftCart)
    } catch (e) {
      console.error(e)
      setError('Could not load this creator’s rate card')
    } finally {
      setLoading(false)
    }
  }

  const refreshCart = async () => {
    const updated = await getOrCreateDraftCart(creatorId)
    setCart(updated)
  }

  const handleAdd = async (rateCardItem) => {
    try {
      await addCartItem(cart.id, rateCardItem, 1)
      await refreshCart()
    } catch (e) {
      toast.error(e.message || 'Could not add that to the cart')
    }
  }

  const handleQuantity = async (item, delta) => {
    const next = item.quantity + delta
    try {
      if (next <= 0) {
        await removeCartItem(item.id)
      } else {
        await updateCartItemQuantity(item.id, next)
      }
      await refreshCart()
    } catch (e) {
      toast.error(e.message || 'Could not update the cart')
    }
  }

  const subtotalCents = cart ? cartSubtotalCents(cart) : 0
  const totals = computeCheckoutTotals(subtotalCents / 100)

  const handleCheckout = async () => {
    if (!title.trim()) {
      toast.error('Give the campaign a title')
      return
    }
    if (subtotalCents <= 0) {
      toast.error('Add at least one deliverable to the cart')
      return
    }
    setCheckingOut(true)
    try {
      const result = await checkoutCart(cart.id, { title, propertyName, propertyLocation })
      toast.success('Campaign booked. Follow the payment instructions to confirm it.')
      navigate(`/developer/campaigns/${result.campaign_id}/funding`)
    } catch (e) {
      toast.error(e.message || 'Checkout failed')
    } finally {
      setCheckingOut(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" />Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Book {creator?.user?.full_name}</h1>
        <p className="text-gray-500 mt-1">Add deliverables to your cart, then check out to book this collaboration.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          <h2 className="font-semibold text-gray-900">Rate Card</h2>
          {rateCard.length === 0 && (
            <p className="text-sm text-gray-500">This creator hasn't published any prices yet.</p>
          )}
          {rateCard.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-500">{platformLabel(item.platform)} &middot; {typeLabel(item.deliverable_type)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900">
                  R {(item.unit_price_cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                </span>
                <Button variant="secondary" onClick={() => handleAdd(item)}>
                  <Plus className="w-4 h-4 mr-1" />Add
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-gray-900">Cart</h2>
            </div>

            {(!cart?.items || cart.items.length === 0) && (
              <p className="text-sm text-gray-500">Your cart is empty.</p>
            )}

            <div className="space-y-2">
              {(cart?.items || []).map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{item.label}</p>
                    <p className="text-gray-500">
                      R {(item.unit_price_cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })} each
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleQuantity(item, -1)} className="p-1 hover:bg-gray-100 rounded">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center">{item.quantity}</span>
                    <button onClick={() => handleQuantity(item, 1)} className="p-1 hover:bg-gray-100 rounded">
                      <Plus className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleQuantity(item, -item.quantity)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {subtotalCents > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>R {totals.subtotal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-gray-400 text-xs">
                  <span>of which platform fee (2.7%)</span>
                  <span>R {totals.platformFee.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900 pt-1">
                  <span>Total due</span>
                  <span>R {totals.total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900">Checkout</h2>
            <input
              type="text"
              placeholder="Campaign title *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
            />
            <input
              type="text"
              placeholder="Property name"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
            />
            <input
              type="text"
              placeholder="Property location"
              value={propertyLocation}
              onChange={(e) => setPropertyLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
            />
            <Button
              variant="primary"
              className="w-full"
              onClick={handleCheckout}
              isLoading={checkingOut}
              disabled={subtotalCents <= 0}
            >
              Checkout & Pay
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookCreator
