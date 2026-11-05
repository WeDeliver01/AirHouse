import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase, uploadAvatar } from '../../lib/supabase'
import { Button, Input, Textarea, Avatar, LoadingSpinner } from '../../components/ui'
import { toast } from 'react-hot-toast'
import { User, Camera, Building2, Phone, Mail, Save } from 'lucide-react'
import { cn } from '../../lib/utils'

const DeveloperProfileEditor = () => {
  const { user, profile, updateProfile, refreshUserData } = useAuth()
  const fileInputRef = useRef(null)
  
  const [loading, setLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  
  const [formData, setFormData] = useState({
    full_name: '',
    company_name: '',
    bio: '',
    phone: '',
  })

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        company_name: profile.company_name || '',
        bio: profile.bio || '',
        phone: profile.phone || '',
      })
    }
  }, [profile])

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    // Allow up to 10MB for high quality images
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

  const handleSave = async () => {
    setLoading(true)
    try {
      await updateProfile(formData)
      toast.success('Profile saved successfully')
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Failed to save profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Profile</h1>
          <p className="text-gray-500 mt-1">Update your company information</p>
        </div>
        <Button variant="primary" onClick={handleSave} isLoading={loading}>
          <Save className="w-4 h-4 mr-2" />Save Changes
        </Button>
      </div>

      {/* Profile Photo */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Profile Photo
        </h2>

        <div className="flex items-center gap-6">
          <div className="relative">
            <Avatar 
              name={formData.full_name || formData.company_name || 'User'} 
              src={profile?.avatar_url} 
              size="xl" 
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute bottom-0 right-0 w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors shadow-lg"
            >
              {uploadingAvatar ? (
                <span className="animate-spin text-sm">⟳</span>
              ) : (
                <Camera className="w-5 h-5" />
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
          <div>
            <p className="font-medium text-gray-900">Company Logo / Profile Photo</p>
            <p className="text-sm text-gray-500 mt-1">
              Upload a high-quality image. Supports JPG, PNG up to 10MB.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-primary hover:underline mt-2"
            >
              Click to upload
            </button>
          </div>
        </div>
      </div>

      {/* Company Information */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Company Information
        </h2>

        <div className="space-y-4">
          <Input
            label="Company Name"
            value={formData.company_name}
            onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
            placeholder="Your company name"
          />
          
          <Input
            label="Contact Person"
            value={formData.full_name}
            onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
            placeholder="Primary contact name"
          />

          <Textarea
            label="Company Bio"
            value={formData.bio}
            onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
            placeholder="Tell creators about your company and the types of properties you develop..."
            rows={4}
          />

          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative">
              <Phone className="absolute left-3 top-9 w-5 h-5 text-gray-400" />
              <Input
                label="Phone Number"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+27 XX XXX XXXX"
                className="pl-10"
              />
            </div>
            
          </div>

        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button variant="primary" onClick={handleSave} isLoading={loading}>
          <Save className="w-4 h-4 mr-2" />Save Changes
        </Button>
      </div>
    </div>
  )
}

export default DeveloperProfileEditor
