import './auth.css';
import AuthHeader from './AuthHeader';
import AuthFooter from './AuthFooter';

// Shared shell for every auth screen: back arrow + logo header, card, footer links.
export default function AuthMobileLayout({ onBack, children, showBack = true }) {
  return (
    <div className="auth-mobile-layout">
      <div className="auth-mobile-content">
        <AuthHeader onBack={onBack} showBack={showBack} />
        <div className="auth-card">{children}</div>
      </div>
      <AuthFooter />
    </div>
  );
}
