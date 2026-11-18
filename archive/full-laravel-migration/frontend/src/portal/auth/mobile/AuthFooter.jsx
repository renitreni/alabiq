import { Link } from 'react-router-dom';
import { COMPANY } from '../../../config/company';

// Router links rather than plain hrefs: in the Capacitor WebView a hard navigation
// to https://localhost/privacy-policy leaves the SPA and the asset loader has no
// file to serve for that path.
export default function AuthFooter() {
  return (
    <div className="auth-footer">
      <div className="auth-footer__links">
        <Link to="/privacy-policy">Privacy Policy</Link>
        <Link to="/terms-of-service">Terms of Service</Link>
        <Link to="/help-center">Customer Service</Link>
      </div>
      <div className="auth-footer__copyright">
        © {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
      </div>
    </div>
  );
}
