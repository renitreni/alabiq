import AuthMobileLayout from '../AuthMobileLayout';
import AuthButton from '../AuthButton';
import { MailFilledIcon } from '../icons';

export default function MobileConfirmationSentScreen({ email, onGoToLogin }) {
  return (
    <AuthMobileLayout showBack={false}>
      <div className="auth-icon-header"><MailFilledIcon /></div>
      <h1 className="auth-title auth-title-center">Almost there</h1>
      <p className="auth-subtitle auth-subtitle-center">
        We sent a confirmation link to <strong>{email}</strong>. Confirm it, then sign in to start using Alabiq.
      </p>
      <AuthButton type="button" icon={null} onClick={onGoToLogin}>Go to sign in</AuthButton>
    </AuthMobileLayout>
  );
}