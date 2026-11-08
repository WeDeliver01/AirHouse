import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { PageLoader } from './components/ui'
import { PublicLayout, DashboardLayout, ProtectedRoute } from './components/layout'

/**
 * Everything behind authentication is loaded on demand.
 *
 * The application previously shipped as one bundle, so an anonymous visitor
 * landing on a lead-capture page downloaded the admin dashboard, the charting
 * library and the PDF generator before anything rendered. Splitting at the
 * route boundary means a visitor fetches only what their page needs.
 */
const AcceptableUsePolicy = lazy(() => import('./pages/legal/AcceptableUsePolicy'))
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'))
const AdminCampaigns = lazy(() => import('./pages/admin/Campaigns'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminFinancials = lazy(() => import('./pages/admin/Financials'))
const AdminInvite = lazy(() => import('./pages/public/AdminInvite'))
const AdminLeads = lazy(() => import('./pages/admin/Leads'))
const AdminPaymentConfirmations = lazy(() => import('./pages/admin/PaymentConfirmations'))
const AdminPayments = lazy(() => import('./pages/admin/Payments'))
const AdminSettings = lazy(() => import('./pages/admin/Settings'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const AdminVerification = lazy(() => import('./pages/admin/Verification'))
const AssignmentDetail = lazy(() => import('./pages/developer/AssignmentDetail'))
const CampaignApplications = lazy(() => import('./pages/developer/CampaignApplications'))
const CampaignDetail = lazy(() => import('./pages/shared/CampaignDetail'))
const CampaignWizard = lazy(() => import('./pages/developer/CampaignWizard'))
const Campaigns = lazy(() => import('./pages/public/Campaigns'))
const ContentReview = lazy(() => import('./pages/developer/ContentReview'))
const ContentSubmission = lazy(() => import('./pages/creator/ContentSubmission'))
const Contracts = lazy(() => import('./pages/shared/Contracts'))
const CookiePolicy = lazy(() => import('./pages/legal/CookiePolicy'))
const CostPerLead = lazy(() => import('./pages/developer/CostPerLead'))
const CreatorAchievements = lazy(() => import('./pages/creator/Achievements'))
const CreatorActiveCampaigns = lazy(() => import('./pages/creator/ActiveCampaigns'))
const CreatorAgreement = lazy(() => import('./pages/legal/CreatorAgreement'))
const CreatorApplications = lazy(() => import('./pages/creator/Applications'))
const CreatorBrowser = lazy(() => import('./pages/developer/CreatorBrowser'))
const CreatorDashboard = lazy(() => import('./pages/creator/Dashboard'))
const CreatorEarnings = lazy(() => import('./pages/creator/Earnings'))
const CreatorProfile = lazy(() => import('./pages/public/CreatorProfile'))
const CreatorProfileEditor = lazy(() => import('./pages/creator/ProfileEditor'))
const CreatorProperties = lazy(() => import('./pages/creator/Properties'))
const CreatorPropertyDetail = lazy(() => import('./pages/creator/PropertyDetail'))
const CreatorRankings = lazy(() => import('./pages/developer/CreatorRankings'))
const CreatorScorecard = lazy(() => import('./pages/creator/Scorecard'))
const CreatorSettings = lazy(() => import('./pages/creator/Settings'))
const CreatorVerification = lazy(() => import('./pages/creator/Verification'))
const CreatorWallet = lazy(() => import('./pages/creator/Wallet'))
const DesignPreview = lazy(() => import('./pages/dev/DesignPreview'))
const DeveloperAgreement = lazy(() => import('./pages/legal/DeveloperAgreement'))
const DeveloperAnalytics = lazy(() => import('./pages/developer/Analytics'))
const DeveloperAssignments = lazy(() => import('./pages/developer/Assignments'))
const DeveloperDashboard = lazy(() => import('./pages/developer/Dashboard'))
const DeveloperLeads = lazy(() => import('./pages/developer/Leads'))
const DeveloperProfileEditor = lazy(() => import('./pages/developer/ProfileEditor'))
const DeveloperReviews = lazy(() => import('./pages/developer/Reviews'))
const DeveloperSettings = lazy(() => import('./pages/developer/Settings'))
const DeveloperWallet = lazy(() => import('./pages/developer/Wallet'))
const DisputeDetail = lazy(() => import('./pages/shared/DisputeDetail'))
const Disputes = lazy(() => import('./pages/shared/Disputes'))
const FundCampaign = lazy(() => import('./pages/developer/FundCampaign'))
const Help = lazy(() => import('./pages/shared/Help'))
const LegalIndex = lazy(() => import('./pages/legal/LegalIndex'))
const Marketplace = lazy(() => import('./pages/public/Marketplace'))
const PublicProperties = lazy(() => import('./pages/public/Properties'))
const Messages = lazy(() => import('./pages/shared/Messages'))
const MyCampaigns = lazy(() => import('./pages/developer/MyCampaigns'))
const MyFavorites = lazy(() => import('./pages/developer/MyFavorites'))
const PAIAManual = lazy(() => import('./pages/legal/PAIAManual'))
const PayoutRequest = lazy(() => import('./pages/creator/PayoutRequest'))
const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy'))
const Properties = lazy(() => import('./pages/developer/Properties'))
const PropertyEditor = lazy(() => import('./pages/developer/PropertyEditor'))
const ROIDashboard = lazy(() => import('./pages/developer/ROIDashboard'))
const RefundPolicy = lazy(() => import('./pages/legal/RefundPolicy'))
const TermsOfService = lazy(() => import('./pages/legal/TermsOfService'))
const TransactionInvoiceDetail = lazy(() => import('./pages/shared/TransactionInvoiceDetail'))

// Public Pages
import Home from './pages/public/Home'
import Login from './pages/public/Login'
import Register from './pages/public/Register'
import ForgotPassword from './pages/public/ForgotPassword'
import ResetPassword from './pages/public/ResetPassword'
import AuthCallback from './pages/public/AuthCallback'
import LeadCapture from './pages/public/LeadCapture'
import GoRedirect from './pages/public/GoRedirect'

// Creator Pages
// Developer Pages
// Shared Pages
// Legal Pages
// Dev-only Pages (gated behind import.meta.env.DEV at registration time)
// Admin Pages
function App() {
  const { initialized } = useAuth()
  if (!initialized) return <PageLoader />

  return (
    // Lazily loaded routes need a fallback while their chunk is fetched.
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* PUBLIC */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/campaigns" element={<ProtectedRoute requireSuperAdmin><Campaigns /></ProtectedRoute>} />
        <Route path="/marketplace" element={<ProtectedRoute requireSuperAdmin><Marketplace /></ProtectedRoute>} />
        <Route path="/properties" element={<PublicProperties />} />
        <Route path="/creators/:creatorId" element={<CreatorProfile />} />
        <Route path="/legal" element={<LegalIndex />} />
        <Route path="/legal/terms" element={<TermsOfService />} />
        <Route path="/legal/privacy" element={<PrivacyPolicy />} />
        <Route path="/legal/cookies" element={<CookiePolicy />} />
        <Route path="/legal/refunds" element={<RefundPolicy />} />
        <Route path="/legal/aup" element={<AcceptableUsePolicy />} />
        <Route path="/legal/creator-agreement" element={<CreatorAgreement />} />
        <Route path="/legal/developer-agreement" element={<DeveloperAgreement />} />
        <Route path="/legal/paia" element={<PAIAManual />} />
      </Route>
      <Route path="/lead/:campaignId" element={<LeadCapture />} />
      <Route path="/go/:token" element={<GoRedirect />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route path="/admin/invite/:code" element={<AdminInvite />} />

      {/* CREATOR */}
      <Route path="/creator" element={<ProtectedRoute allowedRoles={['creator']}><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<CreatorDashboard />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/:campaignId" element={<CampaignDetail />} />
        <Route path="properties" element={<CreatorProperties />} />
        <Route path="properties/:slug" element={<CreatorPropertyDetail />} />
        <Route path="applications" element={<CreatorApplications />} />
        <Route path="active" element={<CreatorActiveCampaigns />} />
        <Route path="active/:assignmentId" element={<ContentSubmission />} />
        <Route path="scorecard" element={<CreatorScorecard />} />
        <Route path="achievements" element={<CreatorAchievements />} />
        <Route path="earnings" element={<CreatorEarnings />} />
        <Route path="wallet" element={<CreatorWallet />} />
        <Route path="wallet/payout" element={<PayoutRequest />} />
        <Route path="wallet/transactions/:txId" element={<TransactionInvoiceDetail backTo="/creator/wallet" />} />
        <Route path="verification" element={<CreatorVerification />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="disputes" element={<Disputes />} />
        <Route path="disputes/:disputeId" element={<DisputeDetail />} />
        <Route path="profile" element={<CreatorProfileEditor />} />
        <Route path="settings" element={<CreatorSettings />} />
      </Route>

      {/* DEVELOPER */}
      <Route path="/developer" element={<ProtectedRoute allowedRoles={['developer']}><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<DeveloperDashboard />} />
        <Route path="campaigns" element={<MyCampaigns />} />
        <Route path="campaigns/new" element={<CampaignWizard />} />
        <Route path="campaigns/:campaignId" element={<CampaignDetail />} />
        <Route path="campaigns/:campaignId/edit" element={<CampaignWizard />} />
        <Route path="campaigns/:campaignId/fund" element={<FundCampaign />} />
        <Route path="campaigns/:campaignId/applications" element={<CampaignApplications />} />
        <Route path="campaigns/:campaignId/content" element={<ContentReview />} />
        <Route path="properties" element={<Properties />} />
        <Route path="properties/new" element={<PropertyEditor />} />
        <Route path="properties/:propertyId/edit" element={<PropertyEditor />} />
        <Route path="creators" element={<CreatorBrowser />} />
        <Route path="favorites" element={<MyFavorites />} />
        <Route path="assignments" element={<DeveloperAssignments />} />
        <Route path="assignments/:assignmentId" element={<AssignmentDetail />} />
        <Route path="leads" element={<DeveloperLeads />} />
        <Route path="leads/:leadId" element={<DeveloperLeads />} />
        <Route path="wallet" element={<DeveloperWallet />} />
        <Route path="wallet/transactions/:txId" element={<TransactionInvoiceDetail backTo="/developer/wallet" />} />
        <Route path="analytics" element={<DeveloperAnalytics />} />
        <Route path="cost-per-lead" element={<CostPerLead />} />
        <Route path="rankings" element={<CreatorRankings />} />
        <Route path="roi" element={<ROIDashboard />} />
        <Route path="reviews" element={<DeveloperReviews />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="disputes" element={<Disputes />} />
        <Route path="disputes/:disputeId" element={<DisputeDetail />} />
        <Route path="profile" element={<DeveloperProfileEditor />} />
        <Route path="settings" element={<DeveloperSettings />} />
      </Route>

      {/* ADMIN - Super Admin Only */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']} requireSuperAdmin><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="verification" element={<AdminVerification />} />
        <Route path="verification/:id" element={<AdminVerification />} />
        <Route path="campaigns" element={<AdminCampaigns />} />
        <Route path="campaigns/:campaignId" element={<CampaignDetail />} />
        <Route path="leads" element={<AdminLeads />} />
        <Route path="financials" element={<AdminFinancials />} />
        <Route path="payment-confirmations" element={<AdminPaymentConfirmations />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="disputes" element={<Disputes />} />
        <Route path="disputes/:disputeId" element={<DisputeDetail />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* SHARED — accessible to any authenticated role */}
      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route path="/messages" element={<Messages />} />
        <Route path="/help" element={<Help />} />
      </Route>

      {/* DEV-ONLY: kitchen-sink design preview, omitted from production builds */}
      {import.meta.env.DEV && (
        <Route path="/_design-preview" element={<DesignPreview />} />
      )}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}

export default App
