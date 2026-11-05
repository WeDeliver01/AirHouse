import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase, uploadAvatar } from '../../lib/supabase'
import { 
  Card, Button, Input, Textarea, Select, Badge, Avatar, ProgressBar 
} from '../../components/ui'
import { toast } from 'react-hot-toast'
import { 
  User, Camera, Instagram, Youtube, Link as LinkIcon, MapPin, 
  Plus, X, Save, CheckCircle, AlertCircle, Briefcase
} from 'lucide-react'
import { cn } from '../../lib/utils'

const NICHES = [
  'Property Tours',
  'Real Estate',
  'Architecture',
  'Interior Design',
  'Lifestyle',
  'Luxury',
  'Investment',
  'First-time Buyers',
  'Family Homes',
  'Urban Living',
]

const CreatorProfileEditor = () => {
  const { user, profile, creatorProfile, updateProfile, updateCreatorProfile, refreshUserData } = useAuth()
  const fileInputRef = useRef(null)
  
  const [loading, setLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  
  // Basic profile
  const [basicInfo, setBasicInfo] = useState({
    full_name: '',
    bio: '',
    phone: '',
  })
  
  // Creator-specific profile
  const [creatorInfo, setCreatorInfo] = useState({
    instagram_handle: '',
    tiktok_handle: '',
    youtube_handle: '',
    follower_count: '',
    location: '',
    niche: [],
    portfolio_urls: [],
    rate_card: {
      instagram_reel: '',
      instagram_post: '',
      tiktok_video: '',
      youtube_video: '',
    },
  })
  
  const [newPortfolioUrl, setNewPortfolioUrl] = useState('')

  // Load existing data
  useEffect(() => {
    if (profile) {
      setBasicInfo({
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        phone: profile.phone || '',
      })
    }
    
    if (creatorProfile) {
      setCreatorInfo({
        instagram_handle: creatorProfile.instagram_handle || '',
        tiktok_handle: creatorProfile.tiktok_handle || '',
        youtube_handle: creatorProfile.youtube_handle || '',
        follower_count: creatorProfile.follower_count?.toString() || '',
        location: creatorProfile.location || '',
        niche: creatorProfile.niche || [],
        portfolio_urls: creatorProfile.portfolio_urls || [],
        rate_card: creatorProfile.rate_card || {
          instagram_reel: '',
          instagram_post: '',
          tiktok_video: '',
          youtube_video: '',
        },
      })
    }
  }, [profile, creatorProfile])

  // Calculate profile completion
  const calculateCompletion = () => {
    const fields = [
      basicInfo.full_name,
      basicInfo.bio,
      basicInfo.phone,
      creatorInfo.instagram_handle || creatorInfo.tiktok_handle || creatorInfo.youtube_handle,
      creatorInfo.follower_count,
      creatorInfo.location,
      creatorInfo.niche.length > 0,
      creatorInfo.portfolio_urls.length > 0,
      profile?.avatar_url,
    ]
    const filled = fields.filter(Boolean).length
    return Math.round((filled / fields.length) * 100)
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB')
      return
    }

    setUploadingAvatar(true)
    try {
      const avatarUrl = await uploadAvatar(user.id, file)
      await refreshUserData()
      toast.success('Profile photo updated!')
    } catch (error) {
      console.error('Avatar upload error:', error)
      toast.error(error.message || 'Failed to upload photo', { duration: 5000 })
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const toggleNiche = (niche) => {
    const current = creatorInfo.niche
    if (current.includes(niche)) {
      setCreatorInfo(prev => ({ ...prev, niche: current.filter(n => n !== niche) }))
    } else if (current.length < 5) {
      setCreatorInfo(prev => ({ ...prev, niche: [...current, niche] }))
    } else {
      toast.error('Maximum 5 niches allowed')
    }
  }

  const addPortfolioUrl = () => {
    if (!newPortfolioUrl.trim()) return
    
    // Basic URL validation
    try {
      new URL(newPortfolioUrl)
    } catch {
      toast.error('Please enter a valid URL')
      return
    }

    if (creatorInfo.portfolio_urls.length >= 10) {
      toast.error('Maximum 10 portfolio links allowed')
      return
    }

    setCreatorInfo(prev => ({
      ...prev,
      portfolio_urls: [...prev.portfolio_urls, newPortfolioUrl.trim()]
    }))
    setNewPortfolioUrl('')
  }

  const removePortfolioUrl = (index) => {
    setCreatorInfo(prev => ({
      ...prev,
      portfolio_urls: prev.portfolio_urls.filter((_, i) => i !== index)
    }))
  }

  const updateRateCard = (key, value) => {
    setCreatorInfo(prev => ({
      ...prev,
      rate_card: { ...prev.rate_card, [key]: value }
    }))
  }

  const handleSave = async () => {
    setLoading(true)

    try {
      // Update basic profile
      await updateProfile({
        full_name: basicInfo.full_name,
        bio: basicInfo.bio,
        phone: basicInfo.phone,
      })

      // Update creator profile
      const creatorData = {
        instagram_handle: creatorInfo.instagram_handle || null,
        tiktok_handle: creatorInfo.tiktok_handle || null,
        youtube_handle: creatorInfo.youtube_handle || null,
        follower_count: creatorInfo.follower_count ? parseInt(creatorInfo.follower_count) : null,
        location: creatorInfo.location || null,
        niche: creatorInfo.niche,
        portfolio_urls: creatorInfo.portfolio_urls,
        rate_card: creatorInfo.rate_card,
      }

      const { error } = await supabase
        .from('creator_profiles')
        .update(creatorData)
        .eq('user_id', user.id)

      if (error) throw error

      await refreshUserData()
      toast.success('Profile saved successfully')
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Failed to save profile')
    } finally {
      setLoading(false)
    }
  }

  const completion = calculateCompletion()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Edit Profile</h1>
          <p className="text-text-secondary mt-1">
            Complete your profile to get matched with campaigns
          </p>
        </div>
        <Button variant="primary" onClick={handleSave} isLoading={loading}>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>

      {/* Profile Completion */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Profile Completion</h3>
          <span className={cn(
            'text-sm font-semibold',
            completion >= 80 ? 'text-success' : completion >= 50 ? 'text-warning' : 'text-danger'
          )}>
            {completion}%
          </span>
        </div>
        <ProgressBar value={completion} max={100} showValue={false} />
        <p className="text-xs text-text-secondary mt-2">
          {completion < 80 
            ? 'Complete your profile to appear in creator searches and get invited to campaigns.'
            : 'Great job! Your profile is looking good.'}
        </p>
      </Card>

      {/* Avatar & Basic Info */}
      <Card>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Basic Information
        </h2>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <Avatar 
                name={basicInfo.full_name || 'User'} 
                src={profile?.avatar_url} 
                size="xl" 
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors"
              >
                {uploadingAvatar ? (
                  <span className="animate-spin">⟳</span>
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <p className="text-xs text-text-secondary mt-2">Click to upload</p>
          </div>

          {/* Basic Fields */}
          <div className="flex-1 space-y-4">
            <Input
              label="Display Name"
              value={basicInfo.full_name}
              onChange={(e) => setBasicInfo(prev => ({ ...prev, full_name: e.target.value }))}
              placeholder="Your name or brand name"
            />
            <Textarea
              label="Bio"
              value={basicInfo.bio}
              onChange={(e) => setBasicInfo(prev => ({ ...prev, bio: e.target.value }))}
              placeholder="Tell developers about yourself, your style, and experience..."
              rows={3}
            />
            <Input
              label="Phone Number"
              value={basicInfo.phone}
              onChange={(e) => setBasicInfo(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="+27 XX XXX XXXX"
            />
          </div>
        </div>
      </Card>

      {/* Social Profiles */}
      <Card>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Instagram className="w-5 h-5 text-primary" />
          Social Profiles
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="relative">
            <Instagram className="absolute left-3 top-9 w-5 h-5 text-pink-500" />
            <Input
              label="Instagram"
              value={creatorInfo.instagram_handle}
              onChange={(e) => setCreatorInfo(prev => ({ ...prev, instagram_handle: e.target.value }))}
              placeholder="@yourusername"
              className="pl-10"
            />
          </div>
          <div className="relative">
            <span className="absolute left-3 top-9 text-lg">🎵</span>
            <Input
              label="TikTok"
              value={creatorInfo.tiktok_handle}
              onChange={(e) => setCreatorInfo(prev => ({ ...prev, tiktok_handle: e.target.value }))}
              placeholder="@yourusername"
              className="pl-10"
            />
          </div>
          <div className="relative">
            <Youtube className="absolute left-3 top-9 w-5 h-5 text-red-500" />
            <Input
              label="YouTube"
              value={creatorInfo.youtube_handle}
              onChange={(e) => setCreatorInfo(prev => ({ ...prev, youtube_handle: e.target.value }))}
              placeholder="YourChannel"
              className="pl-10"
            />
          </div>
          <Input
            label="Total Follower Count"
            type="number"
            value={creatorInfo.follower_count}
            onChange={(e) => setCreatorInfo(prev => ({ ...prev, follower_count: e.target.value }))}
            placeholder="Combined followers across platforms"
          />
        </div>

        <div className="mt-4">
          <div className="relative">
            <MapPin className="absolute left-3 top-9 w-5 h-5 text-text-secondary" />
            <Input
              label="Location"
              value={creatorInfo.location}
              onChange={(e) => setCreatorInfo(prev => ({ ...prev, location: e.target.value }))}
              placeholder="City, Province"
              className="pl-10"
            />
          </div>
        </div>
      </Card>

      {/* Niche & Expertise */}
      <Card>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-primary" />
          Niche & Expertise
        </h2>

        <div>
          <label className="label">Content Niches (select up to 5)</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {NICHES.map((niche) => (
              <button
                key={niche}
                type="button"
                onClick={() => toggleNiche(niche)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                  creatorInfo.niche.includes(niche)
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
                )}
              >
                {niche}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Portfolio */}
      <Card>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-primary" />
          Portfolio Links
        </h2>

        <div className="space-y-3">
          {creatorInfo.portfolio_urls.map((url, index) => (
            <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-button">
              <LinkIcon className="w-4 h-4 text-text-secondary flex-shrink-0" />
              <a 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex-1 text-sm text-primary hover:underline truncate"
              >
                {url}
              </a>
              <button
                onClick={() => removePortfolioUrl(index)}
                className="p-1 text-danger hover:bg-danger-soft rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          <div className="flex gap-2">
            <Input
              value={newPortfolioUrl}
              onChange={(e) => setNewPortfolioUrl(e.target.value)}
              placeholder="https://your-portfolio-link.com"
              className="flex-1"
              onKeyPress={(e) => e.key === 'Enter' && addPortfolioUrl()}
            />
            <Button variant="secondary" onClick={addPortfolioUrl}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-text-secondary">
            Add links to your best work: Instagram posts, TikToks, YouTube videos, etc.
          </p>
        </div>
      </Card>

      {/* Rate Card */}
      <Card>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          💰 Rate Card
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          Set your base rates. These are estimates - final rates are negotiated per campaign.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <Input
            label="Instagram Reel (ZAR)"
            type="number"
            value={creatorInfo.rate_card.instagram_reel}
            onChange={(e) => updateRateCard('instagram_reel', e.target.value)}
            placeholder="e.g., 5000"
          />
          <Input
            label="Instagram Post (ZAR)"
            type="number"
            value={creatorInfo.rate_card.instagram_post}
            onChange={(e) => updateRateCard('instagram_post', e.target.value)}
            placeholder="e.g., 3000"
          />
          <Input
            label="TikTok Video (ZAR)"
            type="number"
            value={creatorInfo.rate_card.tiktok_video}
            onChange={(e) => updateRateCard('tiktok_video', e.target.value)}
            placeholder="e.g., 4000"
          />
          <Input
            label="YouTube Video (ZAR)"
            type="number"
            value={creatorInfo.rate_card.youtube_video}
            onChange={(e) => updateRateCard('youtube_video', e.target.value)}
            placeholder="e.g., 10000"
          />
        </div>
      </Card>

      {/* Save Button (Bottom) */}
      <div className="flex justify-end">
        <Button variant="primary" onClick={handleSave} isLoading={loading}>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  )
}

export default CreatorProfileEditor
