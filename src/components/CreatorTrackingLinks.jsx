import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getOrCreateTrackingLink } from '../lib/tracking'
import { Card, Button} from '../components/ui'
import { toast } from 'react-hot-toast'
import { 
  Link, Copy, ExternalLink, MousePointer, Users, 
  CheckCircle, Share2
} from 'lucide-react'

const CreatorTrackingLinks = ({ assignmentId }) => {
  const { user } = useAuth()
  const [link, setLink] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (assignmentId) {
      loadTrackingLink()
    }
  }, [assignmentId])

  const loadTrackingLink = async () => {
    try {
      const trackingLink = await getOrCreateTrackingLink(assignmentId)
      setLink(trackingLink)
    } catch (error) {
      console.error('Error loading tracking link:', error)
      toast.error('Failed to load tracking link')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.full_url)
      setCopied(true)
      toast.success('Link copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const shareLink = async () => {
    if (!link) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check out this property!',
          url: link.full_url,
        })
      } catch (e) {
        if (e.name !== 'AbortError') {
          copyToClipboard()
        }
      }
    } else {
      copyToClipboard()
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!link) {
    return (
      <Card className="text-center py-8">
        <Link className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-500">No tracking link available</p>
      </Card>
    )
  }

  const conversionRate = link.clicks > 0 
    ? Math.round((link.leads / link.clicks) * 100) 
    : 0

  return (
    <div className="space-y-6">
      {/* Main Link Card */}
      <Card className="bg-gradient-to-br from-primary/5 to-green-50 border-primary/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white">
            <Link className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Your Tracking Link</h3>
            <p className="text-sm text-gray-500">Use this link across all your social platforms</p>
          </div>
        </div>

        {/* Link Display */}
        <div className="bg-white rounded-xl p-4 border border-gray-200 mb-4">
          <div className="flex items-center gap-3">
            <code className="flex-1 text-sm text-gray-700 truncate font-mono bg-gray-50 px-3 py-2 rounded-lg">
              {link.full_url}
            </code>
            <Button
              variant={copied ? 'primary' : 'secondary'}
              onClick={copyToClipboard}
              className="flex-shrink-0"
            >
              {copied ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button variant="primary" className="flex-1" onClick={shareLink}>
            <Share2 className="w-4 h-4 mr-2" />
            Share Link
          </Button>
          <a href={link.full_url} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="secondary" className="w-full">
              <ExternalLink className="w-4 h-4 mr-2" />
              Preview
            </Button>
          </a>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center py-4">
          <MousePointer className="w-6 h-6 text-blue-500 mx-auto mb-2" />
          <p className="text-2xl font-bold">{link.clicks || 0}</p>
          <p className="text-sm text-gray-500">Clicks</p>
        </Card>
        <Card className="text-center py-4">
          <Users className="w-6 h-6 text-green-500 mx-auto mb-2" />
          <p className="text-2xl font-bold">{link.leads || 0}</p>
          <p className="text-sm text-gray-500">Leads</p>
        </Card>
        <Card className="text-center py-4">
          <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <span className="text-purple-600 text-xs font-bold">%</span>
          </div>
          <p className="text-2xl font-bold">{conversionRate}%</p>
          <p className="text-sm text-gray-500">Conversion</p>
        </Card>
      </div>

      {/* QR Code */}
      <Card>
        <h4 className="font-medium mb-3">QR Code</h4>
        <div className="flex items-center gap-4">
          <div className="bg-white p-3 rounded-xl border border-gray-200">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(link.full_url)}`}
              alt="QR Code"
              className="w-24 h-24"
            />
          </div>
          <div className="text-sm text-gray-600">
            <p className="mb-2">Download or screenshot this QR code to use in:</p>
            <ul className="space-y-1 text-gray-500">
              <li>• Print materials</li>
              <li>• Instagram stories</li>
              <li>• Video content</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Tips */}
      <Card className="bg-blue-50 border-blue-100">
        <h4 className="font-medium text-blue-900 mb-2">💡 Tips for Best Results</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Add this link to your Instagram bio</li>
          <li>• Use "Link in bio" call-to-action in your posts</li>
          <li>• Include the link in story swipe-ups</li>
          <li>• Mention "link in bio" in your video content</li>
        </ul>
      </Card>
    </div>
  )
}

export default CreatorTrackingLinks
