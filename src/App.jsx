import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { PageLoader } from './components/ui'
import { PublicLayout, DashboardLayout, ProtectedRoute } from './components/layout'

// Public Pages
import Home from './pages/public/Home'
import Login from './pages/public/Login'
import Register from './pages/public/Register'
import ForgotPassword from './pages/public/ForgotPassword'
import ResetPassword from './pages/public/ResetPassword'
import AuthCallback from './pages/public/AuthCallback'
import Campaigns from './pages/public/Campaigns'
import CreatorProfile from './pages/public/CreatorProfile'
import Marketplace from './pages/public/Marketplace'
import LeadCapture from './pages/public/LeadCapture'

// Creator Pages
import CreatorDashboard from './pages/creator/Dashboard'
import CreatorEarnings from './pages/creator/Earnings'
import CreatorScorecard from './pages/creator/Scorecard'
import CreatorProfileEditor from './pages/creator/ProfileEditor'
import ContentSubmission from './pages/creator/ContentSubmission'
import CreatorWallet from './pages/creator/Wallet'
import CreatorApplications from './pages/creator/Applications'
import CreatorActiveCampaigns from './pages/creator/ActiveCampaigns'
import CreatorSettings from './pages/creator/Settings'
import PayoutRequest from './pages/creator/PayoutRequest'
import CreatorVerification from './pages/creator/Verification'
import CreatorAchievements from './pages/creator/Achievements'
import CreatorProperties from './pages/creator/Properties'
import CreatorPropertyDetail from './pages/creator/PropertyDetail'

// Developer Pages
import DeveloperDashboard from './pages/developer/Dashboard'
import DeveloperLeads from './pages/developer/Leads'
import DeveloperAnalytics from './pages/developer/Analytics'
import CampaignWizard from './pages/developer/CampaignWizard'
import CreatorBrowser from './pages/developer/CreatorBrowser'
import MyFavorites from './pages/developer/MyFavorites'
import MyCampaigns from './pages/developer/MyCampaigns'
import CampaignApplications from './pages/developer/CampaignApplications'
import DeveloperWallet from './pages/developer/Wallet'
import DeveloperSettings from './pages/developer/Settings'
import DeveloperProfileEditor from './pages/developer/ProfileEditor'
import FundCampaign from './pages/developer/FundCampaign'
import ContentReview from './pages/developer/ContentReview'
import CostPerLead from './pages/developer/CostPerLead'
import CreatorRankings from './pages/developer/CreatorRankings'
import ROIDashboard from './pages/developer/ROIDashboard'
import DeveloperReviews from './pages/developer/Reviews'
import Properties from './pages/developer/Properties'
import PropertyEditor from './pages/developer/PropertyEditor'
import DeveloperAssignments from './pages/developer/Assignments'
import AssignmentDetail from './pages/developer/AssignmentDetail'

// Shared Pages
import CampaignDetail from './pages/shared/CampaignDetail'
import Disputes from './pages/shared/Disputes'
import DisputeDetail from './pages/shared/DisputeDetail'
import Contracts from './pages/shared/Contracts'
import Messages from './pages/shared/Messages'
import Help from './pages/shared/Help'
import TransactionInvoiceDetail from './pages/shared/TransactionInvoiceDetail'

// Legal Pages
import LegalIndex from './pages/legal/LegalIndex'
import TermsOfService from './pages/legal/TermsOfService'
import PrivacyPolicy from './pages/legal/PrivacyPolicy'
import CookiePolicy from './pages/legal/CookiePolicy'
import RefundPolicy from './pages/legal/RefundPolicy'
import AcceptableUsePolicy from './pages/legal/AcceptableUsePolicy'
import CreatorAgreement from './pages/legal/CreatorAgreement'
import DeveloperAgreement from './pages/legal/DeveloperAgreement'
import PAIAManual from './pages/legal/PAIAManual'

// Dev-only Pages (gated behind import.meta.env.DEV at registration time)
import DesignPreview from './pages/dev/DesignPreview'

// Admin Pages
import AdminDashboard from './pages/admin/Dashboard'
import AdminUsers from './pages/admin/Users'
import AdminVerification from './pages/admin/Verification'
import AdminCampaigns from './pages/admin/Campaigns'
import AdminLeads from './pages/admin/Leads'
import AdminSettings from './pages/admin/Settings'
import AdminFinancials from './pages/admin/Financials'
import AdminPaymentConfirmations from './pages/admin/PaymentConfirmations'
import AdminPayments from './pages/admin/Payments'
import AdminAnalytics from './pages/admin/Analytics'
import AdminInvite from './pages/public/AdminInvite'

function App() {
  const { initialized } = useAuth()
  if (!initialized) return <PageLoader />

  return (
    <Routes>
      {/* PUBLIC */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/marketplace" element={<Marketplace />} />
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
  )
}

export default App
