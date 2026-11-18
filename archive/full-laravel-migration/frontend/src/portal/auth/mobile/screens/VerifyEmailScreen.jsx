// NOT WIRED UP YET, and blocked on the same thing as the reset screens: the
// platform sends no email. See ForgotPasswordScreen.jsx.
//
// Note this one is blocked twice over. Signup does not just skip the
// verification mail by omission — POST /api/auth/signup creates the user with
// `email_confirm: true` on purpose, so there is no unverified state for an OTP
// to resolve. Wiring this screen means changing the signup contract, not just
// adding SMTP.
import AuthMobileLayout from '../AuthMobileLayout';
import AuthButton from '../AuthButton';
import OtpInput from '../OtpInput';
import { MailFilledIcon, ArrowRightIcon } from '../icons';
import { useState } from 'react';

export default function VerifyEmailScreen({ email, onBack, onVerify, onResend }) {
  const [code, setCode] = useState('');

  return (
    <AuthMobileLayout onBack={onBack}>
      <div className="auth-icon-header">
        <MailFilledIcon />
      </div>
      <h1 className="auth-title auth-title-center">Verify Email</h1>
      <p className="auth-subtitle auth-subtitle-center">
        We sent a 4-digit code to {email || 'your email'}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onVerify(code);
        }}
      >
        <OtpInput length={4} value={code} onChange={setCode} />

        <AuthButton type="submit" icon={<ArrowRightIcon />} disabled={code.length < 4}>
          Verify
        </AuthButton>

        <p className="auth-resend-line">
          Didn't receive a code?{' '}
          <button type="button" className="auth-link-inline" onClick={onResend}>
            Resend
          </button>
        </p>
      </form>
    </AuthMobileLayout>
  );
}