import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import { Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import PublicLayout from '@/components/PublicLayout';
import ErrorBoundary from '@/components/ErrorBoundary';

const Login = lazy(() => import('@/pages/Login'));
const AdminLogin = lazy(() => import('@/pages/AdminLogin'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Home = lazy(() => import('@/pages/Home'));
const CountryEntry = lazy(() => import('@/pages/CountryEntry'));
const Landing = lazy(() => import('@/pages/public/Landing'));
const PublicPlans = lazy(() => import('@/pages/public/Plans'));
const HowItWorks = lazy(() => import('@/pages/public/HowItWorks'));
const About = lazy(() => import('@/pages/public/About'));
const FAQ = lazy(() => import('@/pages/public/FAQ'));
const Contact = lazy(() => import('@/pages/public/Contact'));
const ChitPlanFlyer = lazy(() => import('@/pages/public/ChitPlanFlyer'));
const PrivacyPolicy = lazy(() => import('@/pages/public/PrivacyPolicy'));
const TermsOfService = lazy(() => import('@/pages/public/TermsOfService'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const MemberDashboard = lazy(() => import('@/pages/MemberDashboard'));
const ChitPlans = lazy(() => import('@/pages/ChitPlans'));
const ChitGroups = lazy(() => import('@/pages/ChitGroups'));
const Members = lazy(() => import('@/pages/Members'));
const Payments = lazy(() => import('@/pages/Payments'));
const MyPayments = lazy(() => import('@/pages/MyPayments'));
const MyChits = lazy(() => import('@/pages/MyChits'));
const MyDividends = lazy(() => import('@/pages/MyDividends'));
const MyProfile = lazy(() => import('@/pages/MyProfile'));
const Receipt = lazy(() => import('@/pages/Receipt'));
const Winners = lazy(() => import('@/pages/Winners'));
const Reports = lazy(() => import('@/pages/Reports'));
const AuditLog = lazy(() => import('@/pages/AuditLog'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const AdminReminders = lazy(() => import('@/pages/AdminReminders'));
const AuctionPlan = lazy(() => import('@/pages/AuctionPlan'));
const BrowsePlans = lazy(() => import('@/pages/BrowsePlans'));
const PlanRequests = lazy(() => import('@/pages/PlanRequests'));
const AdminLiveAuction = lazy(() => import('@/pages/AdminLiveAuction'));
const LiveAuction = lazy(() => import('@/pages/LiveAuction'));

const RouteFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  // Show loading spinner while checking auth
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Render the main app
  return (
    <ErrorBoundary>
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/plans" element={<PublicPlans />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/about" element={<About />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/chit-plan" element={<ChitPlanFlyer />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
        </Route>
        <Route path="/in" element={<CountryEntry country="IN" />} />
        <Route path="/ca" element={<CountryEntry country="CA" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route path="/app" element={<Home />} />
          <Route element={<Layout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/plans" element={<ChitPlans />} />
            <Route path="/admin/groups" element={<ChitGroups />} />
            <Route path="/admin/auction-plan" element={<AuctionPlan />} />
            <Route path="/admin/live-auction" element={<AdminLiveAuction />} />
            <Route path="/admin/members" element={<Members />} />
            <Route path="/admin/plan-requests" element={<PlanRequests />} />
            <Route path="/admin/payments" element={<Payments />} />
            <Route path="/admin/winners" element={<Winners />} />
            <Route path="/admin/reports" element={<Reports />} />
            <Route path="/admin/audit" element={<AuditLog />} />
            <Route path="/admin/notifications" element={<Notifications />} />
            <Route path="/admin/reminders" element={<AdminReminders />} />
            <Route path="/dashboard" element={<MemberDashboard />} />
            <Route path="/browse-plans" element={<BrowsePlans />} />
            <Route path="/my-chits" element={<MyChits />} />
            <Route path="/live-auction" element={<LiveAuction />} />
            <Route path="/payments" element={<MyPayments />} />
            <Route path="/dividends" element={<MyDividends />} />
            <Route path="/profile" element={<MyProfile />} />
            <Route path="/receipt/:id" element={<Receipt />} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
