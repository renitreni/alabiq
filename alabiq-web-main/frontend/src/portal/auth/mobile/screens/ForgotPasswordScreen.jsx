// mobile/screens/ForgotPasswordScreen.jsx
import { useState } from 'react';
import AuthMobileLayout from '../AuthMobileLayout';
import AuthInput from '../AuthInput';
import AuthButton from '../AuthButton';
import { MailIcon } from '../icons';

export default function MobileForgotPasswordScreen({ onBack, onSubmit }) {
  const [email, setEmail] = useState('');

  return (
    <AuthMobileLayout onBack={onBack}>
      <h1 className="auth-title">Forgot password?</h1>
      <p className="auth-subtitle">
        Enter your email and we will send you a link to choose a new one.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(email);
        }}
      >
        <AuthInput
          id="email"
          label="Email address"
          icon={<MailIcon />}
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
        />

        <AuthButton type="submit" icon={null}>
          Send reset link
        </AuthButton>
      </form>
    </AuthMobileLayout>
  );
}