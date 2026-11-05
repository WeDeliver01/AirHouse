import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'
import toast from 'react-hot-toast'
import {
  uploadVerificationFile,
  submitVerificationRequest,
  fetchLatestVerificationRequest,
} from '../../lib/verification'

const CREATOR_CONTENT_TYPES = [
  { id: 'reels',     label: 'Instagram Reels',  icon: 'movie' },
  { id: 'tiktok',    label: 'TikTok Videos',    icon: 'music_video' },
  { id: 'youtube',   label: 'YouTube Content',  icon: 'smart_display' },
  { id: 'photo',     label: 'Photography',      icon: 'photo_camera' },
  { id: 'blog',      label: 'Blog Posts',       icon: 'article' },
  { id: 'drone',     label: 'Drone Footage',    icon: 'flight' },
  { id: 'tours',     label: 'Virtual Tours',    icon: '360' },
  { id: 'live',      label: 'Live Streaming',   icon: 'videocam' },
]

const DEVELOPER_PROPERTY_TYPES = [
  { id: 'apartments', label: 'Apartments',       icon: 'apartment' },
  { id: 'houses',     label: 'Houses',           icon: 'house' },
  { id: 'townhouses', label: 'Townhouses',       icon: 'holiday_village' },
  { id: 'commercial', label: 'Commercial',       icon: 'corporate_fare' },
  { id: 'mixed',      label: 'Mixed-Use',        icon: 'domain' },
  { id: 'luxury',     label: 'Luxury Estates',   icon: 'villa' },
  { id: 'student',    label: 'Student Housing',  icon: 'school' },
  { id: 'retire',     label: 'Retirement Living',icon: 'elderly' },
]

const BUDGET_RANGES = [
  'Under R5,000', 'R5,000 - R15,000', 'R15,000 - R50,000',
  'R50,000 - R100,000', 'R100,000+',
]

const ProgressBar = ({ steps, currentStep }) => (
  <div className="mb-8">
    <div className="flex gap-2 mb-3">
      {steps.map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-colors duration-300',
            i <= currentStep ? 'bg-primary' : 'bg-surface-container-high'
          )}
        />
      ))}
    </div>
    <div className="flex justify-between font-label-md text-label-md text-on-surface-variant">
      <span>Step {currentStep + 1} of {steps.length}</span>
      <span className="text-primary font-semibold">{steps[currentStep]}</span>
    </div>
  </div>
)

const InputField = ({ label, helper, error, ...props }) => (
  <div className="flex flex-col gap-1">
    <label className="font-label-md text-label-md text-on-surface">{label}</label>
    <input
      {...props}
      className={cn(
        'w-full h-11 px-3 bg-surface-container-lowest border rounded font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 transition-shadow',
        error
          ? 'border-error focus:border-error focus:ring-error'
          : 'border-outline-variant focus:border-primary focus:ring-primary'
      )}
    />
    {(error || helper) && (
      <p className={cn('font-label-md text-label-md mt-1', error ? 'text-error' : 'text-on-surface-variant')}>
        {error || helper}
      </p>
    )}
  </div>
)

const TextareaField = ({ label, helper, ...props }) => (
  <div className="flex flex-col gap-1">
    <label className="font-label-md text-label-md text-on-surface">{label}</label>
    <textarea
      {...props}
      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:border-primary focus:ring-primary transition-shadow resize-none"
    />
    {helper && <p className="font-label-md text-label-md text-on-surface-variant mt-1">{helper}</p>}
  </div>
)

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FileDropField = ({ label, helper, accept, file, onSelect, icon = 'cloud_upload' }) => {
  const inputRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    if (!file || typeof file === 'string' || !file.type?.startsWith('image/')) {
      setPreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleFiles = (files) => {
    if (!files || files.length === 0) return
    onSelect(files[0])
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="font-label-md text-label-md text-on-surface">{label}</label>
      <div
        className={cn(
          'relative flex items-center gap-4 p-4 rounded-lg border-2 border-dashed transition-colors',
          file
            ? 'border-primary/40 bg-primary-fixed/40'
            : 'border-outline-variant bg-surface-container-lowest hover:border-outline'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="w-16 h-16 rounded object-cover border border-outline-variant"
          />
        ) : (
          <div className="w-16 h-16 rounded bg-surface-container flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[28px]">{icon}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          {file ? (
            <>
              <p className="font-label-md text-label-md text-on-surface truncate">{file.name}</p>
              <p className="font-label-md text-label-md text-on-surface-variant mt-0.5">
                {formatBytes(file.size)}
              </p>
            </>
          ) : (
            <>
              <p className="font-label-md text-label-md text-on-surface">No file selected</p>
              {helper && (
                <p className="font-label-md text-label-md text-on-surface-variant mt-0.5">
                  {helper}
                </p>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 px-3 h-9 rounded border border-outline-variant text-on-surface hover:border-primary/50 hover:text-primary transition-colors font-label-md text-label-md"
        >
          <span className="material-symbols-outlined text-[16px]">upload_file</span>
          {file ? 'Replace' : 'Choose'}
        </button>
      </div>
    </div>
  )
}

const CheckboxCardGrid = ({ options, selected, onChange }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {options.map(option => {
      const isSel = selected.includes(option.id)
      return (
        <label
          key={option.id}
          className={cn(
            'relative flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all',
            isSel
              ? 'border-primary bg-primary-fixed text-primary'
              : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-outline'
          )}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={isSel}
            onChange={() => {
              const updated = isSel
                ? selected.filter(s => s !== option.id)
                : [...selected, option.id]
              onChange(updated)
            }}
          />
          <span
            className="material-symbols-outlined text-[28px]"
            style={isSel ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            {option.icon}
          </span>
          <span className={cn('font-label-md text-label-md text-center leading-tight', isSel && 'font-semibold')}>
            {option.label}
          </span>
          {isSel && (
            <span className="material-symbols-outlined absolute top-1.5 right-1.5 text-primary text-[16px]">
              check_circle
            </span>
          )}
        </label>
      )
    })}
  </div>
)

const OnboardingWizard = ({ role, profile, onComplete }) => {
  const { user, updateProfile } = useAuth()
  const isCreator = role === 'creator'
  const steps = isCreator
    ? ['Profile', 'Skills & Expertise', 'Identity Check', 'All Set!']
    : ['Profile', 'Your Properties', 'Identity Check', 'All Set!']
  const completionStep = steps.length - 1
  const verificationStep = steps.length - 2

  const [currentStep, setCurrentStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    fullName: profile?.full_name || '',
    bio: profile?.bio || '',
    location: profile?.location || '',
    avatarUrl: profile?.avatar_url || '',
    companyName: profile?.company_name || '',
    contentTypes: [],
    specialties: '',
    instagramHandle: '',
    tiktokHandle: '',
    youtubeHandle: '',
    propertyTypes: [],
    targetAreas: '',
    budgetRange: '',
    idDocumentType: isCreator ? 'national_id' : 'company_registration',
    idDocumentFile: null,
    selfieFile: null,
    applicantNotes: '',
  })

  const [verification, setVerification] = useState({
    submitting: false,
    submittedRequest: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    if (!user?.id) return undefined
    fetchLatestVerificationRequest(user.id).then((existing) => {
      if (cancelled) return
      if (existing && existing.status === 'pending') {
        setVerification((prev) => ({ ...prev, submittedRequest: existing }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const updateField = (field, value) => setData(prev => ({ ...prev, [field]: value }))

  const hasVerificationSubmission = Boolean(verification.submittedRequest)
  const canSubmitVerification =
    Boolean(data.idDocumentFile) && Boolean(data.selfieFile) && !verification.submitting

  const canProceed = () => {
    if (currentStep === 0) {
      if (isCreator) return data.fullName.trim() && data.bio.trim()
      return data.fullName.trim() && data.bio.trim() && data.companyName.trim()
    }
    if (currentStep === verificationStep) {
      return hasVerificationSubmission
    }
    return true
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) setCurrentStep(prev => prev + 1)
  }

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1)
  }

  const handleSubmitVerification = async () => {
    if (!user?.id) {
      toast.error('You must be signed in to submit verification documents.')
      return
    }
    if (!data.idDocumentFile || !data.selfieFile) {
      toast.error('Please upload both an ID document and a selfie.')
      return
    }
    setVerification((prev) => ({ ...prev, submitting: true, error: null }))
    try {
      const idPath = await uploadVerificationFile(
        user.id,
        'id_document',
        data.idDocumentFile,
      )
      const selfiePath = await uploadVerificationFile(
        user.id,
        'selfie',
        data.selfieFile,
      )
      const submitted = await submitVerificationRequest({
        userId: user.id,
        targetLevel: 'basic',
        idDocumentPath: idPath,
        idDocumentType: data.idDocumentType,
        selfiePath,
        applicantNotes: data.applicantNotes,
      })
      setVerification({ submitting: false, submittedRequest: submitted, error: null })
      toast.success('Verification submitted — our team will review it shortly.')
    } catch (err) {
      console.error('Verification submission error:', err)
      const message = err?.message || 'Failed to submit verification. Please try again.'
      setVerification((prev) => ({ ...prev, submitting: false, error: message }))
      toast.error(message)
    }
  }

  const handleComplete = async () => {
    setSaving(true)
    try {
      const updates = {
        full_name: data.fullName,
        bio: data.bio,
      }
      if (data.avatarUrl) updates.avatar_url = data.avatarUrl
      if (!isCreator) updates.company_name = data.companyName
      await updateProfile(updates)
      onComplete()
    } catch (err) {
      console.error('Onboarding save error:', err)
      toast.error('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const renderCreatorStep1 = () => (
    <div className="space-y-5">
      <div className="mb-6">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">Complete your profile</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Let developers get to know you better.
        </p>
      </div>
      <InputField
        label="Full Name"
        placeholder="Enter your full name"
        value={data.fullName}
        onChange={(e) => updateField('fullName', e.target.value)}
      />
      <TextareaField
        label="Bio"
        placeholder="Tell developers about yourself and your content creation experience…"
        value={data.bio}
        onChange={(e) => updateField('bio', e.target.value)}
        rows={4}
      />
      <div className="grid sm:grid-cols-2 gap-4">
        <InputField
          label="Location"
          placeholder="e.g. Johannesburg, South Africa"
          value={data.location}
          onChange={(e) => updateField('location', e.target.value)}
        />
        <InputField
          label="Avatar URL"
          placeholder="https://example.com/photo.jpg"
          value={data.avatarUrl}
          onChange={(e) => updateField('avatarUrl', e.target.value)}
          helper="Optional — paste a link to your profile photo"
        />
      </div>
    </div>
  )

  const renderCreatorStep2 = () => (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">Your skills & expertise</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Help us match you with the right campaigns.
        </p>
      </div>

      <div>
        <label className="font-label-md text-label-md text-on-surface block mb-3">
          Content types you create
        </label>
        <CheckboxCardGrid
          options={CREATOR_CONTENT_TYPES}
          selected={data.contentTypes}
          onChange={(val) => updateField('contentTypes', val)}
        />
      </div>

      <InputField
        label="Specialties"
        placeholder="e.g. Real estate, Lifestyle, Luxury properties"
        value={data.specialties}
        onChange={(e) => updateField('specialties', e.target.value)}
        helper="Comma-separated list of your content specialties"
      />

      <div className="grid sm:grid-cols-3 gap-4">
        <InputField
          label="Instagram Handle"
          placeholder="@yourhandle"
          value={data.instagramHandle}
          onChange={(e) => updateField('instagramHandle', e.target.value)}
        />
        <InputField
          label="TikTok Handle"
          placeholder="@yourhandle"
          value={data.tiktokHandle}
          onChange={(e) => updateField('tiktokHandle', e.target.value)}
        />
        <InputField
          label="YouTube Channel"
          placeholder="@yourchannel"
          value={data.youtubeHandle}
          onChange={(e) => updateField('youtubeHandle', e.target.value)}
        />
      </div>
    </div>
  )

  const renderDeveloperStep1 = () => (
    <div className="space-y-5">
      <div className="mb-6">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">Complete your profile</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Tell us about your company.
        </p>
      </div>
      <InputField
        label="Company Name"
        placeholder="Enter your company name"
        value={data.companyName}
        onChange={(e) => updateField('companyName', e.target.value)}
      />
      <InputField
        label="Full Name"
        placeholder="Enter your full name"
        value={data.fullName}
        onChange={(e) => updateField('fullName', e.target.value)}
      />
      <TextareaField
        label="Bio"
        placeholder="Describe your company and what kind of properties you develop…"
        value={data.bio}
        onChange={(e) => updateField('bio', e.target.value)}
        rows={4}
      />
      <InputField
        label="Location"
        placeholder="e.g. Cape Town, South Africa"
        value={data.location}
        onChange={(e) => updateField('location', e.target.value)}
      />
    </div>
  )

  const renderDeveloperStep2 = () => (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">About your properties</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Help us understand your marketing needs.
        </p>
      </div>

      <div>
        <label className="font-label-md text-label-md text-on-surface block mb-3">
          Property types you market
        </label>
        <CheckboxCardGrid
          options={DEVELOPER_PROPERTY_TYPES}
          selected={data.propertyTypes}
          onChange={(val) => updateField('propertyTypes', val)}
        />
      </div>

      <InputField
        label="Target Areas"
        placeholder="e.g. Sandton, Rosebank, Midrand"
        value={data.targetAreas}
        onChange={(e) => updateField('targetAreas', e.target.value)}
        helper="Areas where your properties are located"
      />

      <div>
        <label className="font-label-md text-label-md text-on-surface block mb-3">
          Typical campaign budget
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {BUDGET_RANGES.map(range => (
            <button
              key={range}
              type="button"
              onClick={() => updateField('budgetRange', range)}
              className={cn(
                'px-3 py-2.5 rounded-lg border-2 font-label-md text-label-md transition-colors',
                data.budgetRange === range
                  ? 'border-primary bg-primary-fixed text-primary'
                  : 'border-outline-variant text-on-surface-variant hover:border-outline'
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const renderVerificationStep = () => {
    const submitted = verification.submittedRequest
    return (
      <div className="space-y-6">
        <div className="mb-2">
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Identity check</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Upload an ID document and a quick selfie. Our trust &amp; safety team reviews these
            before granting verified status — files are stored privately and only visible to admins.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-xl border border-secondary/40 bg-secondary-container/40 p-5 flex items-start gap-3">
            <span className="material-symbols-outlined text-secondary text-[22px] mt-0.5">
              hourglass_top
            </span>
            <div>
              <h3 className="font-label-lg text-label-lg text-on-secondary-container">
                Verification submitted
              </h3>
              <p className="font-body-sm text-body-sm text-on-secondary-container mt-1">
                Your documents were uploaded on{' '}
                {new Date(submitted.submitted_at).toLocaleString()}. We'll email you when a
                reviewer makes a decision — usually within 1–2 business days.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="font-label-md text-label-md text-on-surface block mb-2">
                {isCreator ? 'ID document type' : 'Document type'}
              </label>
              <select
                value={data.idDocumentType}
                onChange={(e) => updateField('idDocumentType', e.target.value)}
                className="w-full h-11 px-3 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {isCreator ? (
                  <>
                    <option value="national_id">National ID</option>
                    <option value="passport">Passport</option>
                    <option value="drivers_license">Driver&apos;s licence</option>
                  </>
                ) : (
                  <>
                    <option value="company_registration">Company registration document</option>
                    <option value="director_id">Director&apos;s ID</option>
                    <option value="passport">Passport</option>
                  </>
                )}
              </select>
            </div>

            <FileDropField
              label="ID document"
              helper="Photo or scan, max 10MB. JPG, PNG, WebP or PDF."
              accept="image/jpeg,image/png,image/webp,application/pdf"
              file={data.idDocumentFile}
              onSelect={(file) => updateField('idDocumentFile', file)}
              icon="badge"
            />

            <FileDropField
              label="Liveness selfie"
              helper="A clear, recent photo of your face. Avoid sunglasses or hats."
              accept="image/jpeg,image/png,image/webp"
              file={data.selfieFile}
              onSelect={(file) => updateField('selfieFile', file)}
              icon="photo_camera"
            />

            <TextareaField
              label="Anything reviewers should know? (optional)"
              placeholder="e.g. My legal name on the ID is different from my creator name…"
              value={data.applicantNotes}
              onChange={(e) => updateField('applicantNotes', e.target.value)}
              rows={3}
            />

            {verification.error && (
              <p className="font-body-sm text-body-sm text-error">{verification.error}</p>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmitVerification}
                disabled={!canSubmitVerification}
                className="inline-flex items-center gap-2 bg-primary text-on-primary font-label-lg text-label-lg px-6 h-11 rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {verification.submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">
                      progress_activity
                    </span>
                    Uploading…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                    Submit for review
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  const renderCompletionStep = () => (
    <div className="text-center py-4 sm:py-6">
      <div className="w-20 h-20 bg-secondary-container rounded-full flex items-center justify-center mx-auto mb-5">
        <span className="material-symbols-outlined text-on-secondary-container text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>
          celebration
        </span>
      </div>
      <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">You're all set!</h2>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto mb-8">
        {isCreator
          ? "Your profile is ready. Start exploring campaigns, apply to opportunities, and earn by creating amazing content."
          : "Your profile is ready. Create your first campaign, find talented creators, and start generating leads."}
      </p>
      <div className="bg-surface-container-low rounded-xl p-5 sm:p-6 max-w-md mx-auto mb-8 text-left">
        <h3 className="font-label-lg text-label-lg text-on-surface mb-3">What you can do now</h3>
        <ul className="space-y-2.5">
          {(isCreator
            ? [
                'Browse and apply to available campaigns',
                'Share your unique referral links',
                'Track your leads and earnings',
                'Get paid for every qualified lead',
              ]
            : [
                'Create your first marketing campaign',
                'Browse and invite talented creators',
                'Track leads in real-time',
                'Manage your campaign budget and ROI',
              ]
          ).map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-secondary text-[20px] flex-shrink-0 mt-0.5">check_circle</span>
              <span className="font-body-sm text-body-sm text-on-surface">{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={handleComplete}
        disabled={saving}
        className="inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container font-label-lg text-label-lg px-8 h-12 rounded-lg hover:bg-secondary-fixed disabled:opacity-60 disabled:cursor-not-allowed transition-colors min-w-[220px] justify-center"
      >
        {saving ? (
          <>
            <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
            Saving…
          </>
        ) : (
          <>
            {isCreator ? 'Go to Dashboard' : 'Create Your First Campaign'}
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </>
        )}
      </button>
    </div>
  )

  const renderStep = () => {
    if (currentStep === completionStep) return renderCompletionStep()
    if (currentStep === verificationStep) return renderVerificationStep()
    if (isCreator) return currentStep === 0 ? renderCreatorStep1() : renderCreatorStep2()
    return currentStep === 0 ? renderDeveloperStep1() : renderDeveloperStep2()
  }

  return (
    <div className="min-h-[60vh] flex items-start justify-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-4">
          <span className="font-label-md text-label-md text-primary uppercase tracking-wider">
            {isCreator ? 'Creator Setup' : 'Developer Setup'}
          </span>
        </div>

        <ProgressBar steps={steps} currentStep={currentStep} />

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 sm:p-8 ambient-shadow">
          {renderStep()}

          {currentStep < completionStep && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-outline-variant">
              {currentStep > 0 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface px-4 h-11 rounded transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Back
                </button>
              ) : <div />}
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
                className="inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container font-label-lg text-label-lg px-6 h-11 rounded hover:bg-secondary-fixed disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next Step
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OnboardingWizard
