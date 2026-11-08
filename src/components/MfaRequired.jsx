import SecuritySettings from './SecuritySettings'

/**
 * Shown instead of an admin screen when a privileged account has no second
 * factor enrolled. It offers the enrolment flow directly rather than sending
 * the operator away to find it.
 */
const MfaRequired = () => (
  <div className="max-w-2xl mx-auto py-10 px-4">
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-gray-900">
        Set up two-factor authentication to continue
      </h1>
      <p className="text-gray-500 mt-2">
        Admin accounts can approve payments and change other people&rsquo;s access, so a
        second factor is required before you can use them. It takes about a minute.
      </p>
    </div>
    <SecuritySettings required />
  </div>
)

export default MfaRequired
