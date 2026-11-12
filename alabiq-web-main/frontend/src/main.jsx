import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './portal/lib/AuthProvider.jsx'
import { ViewModeProvider } from './portal/lib/ViewModeProvider.jsx'
import RequireAuth from './portal/components/RequireAuth.jsx'
import PushNotificationPrompt from './portal/components/PushNotificationPrompt.jsx'
import LoginPage from './portal/auth/LoginPage.jsx'
import SignupPage from './portal/auth/SignupPage.jsx'
import ForgotPasswordPage from './portal/auth/ForgotPasswordPage.jsx'
import ResetPasswordPage from './portal/auth/ResetPasswordPage.jsx'
import HomePage from './portal/user/HomePage.jsx'
import BookPage from './portal/user/BookPage.jsx'
import PayPage from './portal/user/PayPage.jsx'
import TrackPage from './portal/user/TrackPage.jsx'
import DriverPage from './portal/driver/DriverPage.jsx'
import MerchantPortal from './portal/merchant/MerchantPortal.jsx'
import AdminPage from './portal/admin/AdminPage.jsx'
import AdminDemoPage from './portal/admin/AdminDemoPage.jsx'
import FoodHomePage from './portal/food/FoodHomePage.jsx'
import RestaurantPage from './portal/food/RestaurantPage.jsx'
import FoodCartPage from './portal/food/FoodCartPage.jsx'
import FoodCheckoutPage from './portal/food/FoodCheckoutPage.jsx'
import FoodTrackPage from './portal/food/FoodTrackPage.jsx'
import FoodOrdersPage from './portal/food/FoodOrdersPage.jsx'
import StoreHomePage from './portal/shop/StoreHomePage.jsx'
import StorePage from './portal/shop/StorePage.jsx'
import ShopCartPage from './portal/shop/ShopCartPage.jsx'
import ShopCheckoutPage from './portal/shop/ShopCheckoutPage.jsx'
import ShopOrdersPage from './portal/shop/ShopOrdersPage.jsx'
import ShopTrackPage from './portal/shop/ShopTrackPage.jsx'
import NotificationsPage from './portal/user/NotificationsPage.jsx'
import TransactionsPage from './portal/user/TransactionsPage.jsx'
import ProfilePage from './portal/user/ProfilePage.jsx'
import PaymentMethodsPage from './portal/user/PaymentMethodsPage.jsx'
import LegalDocPage from './pages/legal/LegalDocPage.jsx'
import HelpCenterPage from './pages/legal/HelpCenterPage.jsx'
import AccountDeletionPage from './pages/legal/AccountDeletionPage.jsx'
import CookiePreferencesPage from './pages/legal/CookiePreferencesPage.jsx'
import ServicesPage from './pages/ServicesPage.jsx'
import SupportPage from './pages/SupportPage.jsx'
import FoodServicePage from './pages/services/FoodServicePage.jsx'
import ShopServicePage from './pages/services/ShopServicePage.jsx'
import PickDropServicePage from './pages/services/PickDropServicePage.jsx'
import { registerServiceWorker } from './portal/lib/pushNotifications.js'
import { installAlertUnlock } from './portal/lib/alertSound.js'

import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAuth } from './portal/lib/AuthProvider.jsx'
import { roleHome } from './portal/lib/constants.js'
import MobileSplashScreen from './portal/auth/mobile/screens/SplashScreen.jsx'

if (import.meta.env.PROD) {
  registerServiceWorker().catch(() => {
    // PWA support is best-effort; the web app remains fully usable without it.
  })
}

// App-wide, not per-screen: the autoplay policy keeps the AudioContext
// suspended until the user interacts, and only three merchant/admin screens
// ever asked it to resume. Every driver, passenger and tracking alert was
// therefore mute with nothing on screen to say why.
installAlertUnlock()

function RootRedirect() {
  const { session, role } = useAuth()
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  if (showSplash) return <MobileSplashScreen />
  if (session && role) return <Navigate to={roleHome(role, '/')} replace />
  return <Navigate to="/login" replace />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ViewModeProvider>
          <Routes>
            <Route path="/" element={Capacitor.isNativePlatform() ? <RootRedirect /> : <App />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            {/* Public on purpose: someone who cannot sign in is exactly who
                needs these. /reset-password does its own gating on the
                PASSWORD_RECOVERY event — a bare session is not enough. */}
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Signed-in users land on the multi-service hub. */}
            <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
            {/* Notification inbox + transaction records (any signed-in user). */}
            <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
            <Route path="/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
            {/* Profile management (any signed-in user). */}
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            {/* Saved cards. List/remove only — a card is added by paying. */}
            <Route path="/payment-methods" element={<RequireAuth><PaymentMethodsPage /></RequireAuth>} />
            {/* Booking is for passengers only — drivers/admins are redirected to their dashboard. */}
            <Route path="/book" element={<RequireAuth role="passenger" redirectWrongRole><BookPage /></RequireAuth>} />
            {/* Payment + tracking stay open by booking code. */}
            <Route path="/pay/:code" element={<PayPage />} />
            <Route path="/track/:code" element={<TrackPage />} />

            <Route path="/driver" element={<RequireAuth role="driver"><DriverPage /></RequireAuth>} />
            {/* MerchantPortal resolves the owner's vertical server-side and
                lazy-loads either the restaurant or the store dashboard. */}
            <Route path="/merchant" element={<RequireAuth role="merchant"><MerchantPortal /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth role="admin"><AdminPage /></RequireAuth>} />
            {/* Same portal, invented data — for showing the product without
                exposing real customers. Admin-only, and the fixtures are
                pulled in on demand so they never ship in the main bundle. */}
            <Route path="/admin/ferdz" element={<RequireAuth role="admin"><AdminDemoPage /></RequireAuth>} />

            {/* Legal — must stay public. Store reviewers open the privacy URL logged
                out, and Play requires a deletion page reachable after uninstalling. */}
            <Route path="/privacy-policy" element={<LegalDocPage kind="privacy" />} />
            <Route path="/terms-of-service" element={<LegalDocPage kind="terms" />} />
            <Route path="/cookie-preferences" element={<CookiePreferencesPage />} />
            <Route path="/help-center" element={<HelpCenterPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/account-deletion" element={<AccountDeletionPage />} />

            {/* Services hub — public, icon cards linking to the 3 dedicated pages below,
                which each carry the full preview content and link into /food, /shop, /book. */}
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/services/food" element={<FoodServicePage />} />
            <Route path="/services/shop" element={<ShopServicePage />} />
            <Route path="/services/pick-drop" element={<PickDropServicePage />} />

            {/* Food Delivery — browsing is public; cart/checkout/orders need sign-in. */}
            <Route path="/food" element={<FoodHomePage />} />
            <Route path="/food/r/:id" element={<RestaurantPage />} />
            <Route path="/food/cart" element={<RequireAuth><FoodCartPage /></RequireAuth>} />
            <Route path="/food/checkout" element={<RequireAuth><FoodCheckoutPage /></RequireAuth>} />
            <Route path="/food/orders" element={<RequireAuth><FoodOrdersPage /></RequireAuth>} />
            <Route path="/food/track/:code" element={<RequireAuth><FoodTrackPage /></RequireAuth>} />

            {/* Ecommerce — same shape as Food: browsing is public; cart/checkout/orders need sign-in.
                Cart and checkout carry the store id in the query string (?s=<storeId>), matching food's ?m=. */}
            <Route path="/shop" element={<StoreHomePage />} />
            <Route path="/shop/s/:id" element={<StorePage />} />
            <Route path="/shop/cart" element={<RequireAuth><ShopCartPage /></RequireAuth>} />
            <Route path="/shop/checkout" element={<RequireAuth><ShopCheckoutPage /></RequireAuth>} />
            <Route path="/shop/orders" element={<RequireAuth><ShopOrdersPage /></RequireAuth>} />
            <Route path="/shop/track/:code" element={<RequireAuth><ShopTrackPage /></RequireAuth>} />
          </Routes>
          <PushNotificationPrompt />
        </ViewModeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
