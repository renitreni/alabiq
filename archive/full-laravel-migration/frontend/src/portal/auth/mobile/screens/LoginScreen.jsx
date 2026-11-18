import AuthMobileLayout from '../AuthMobileLayout';
import AuthInput from '../AuthInput';
import AuthButton from '../AuthButton';
import { LockIcon, EyeIcon, EyeOffIcon } from '../icons';

export default function MobileLoginScreen({
  email, setEmail, password, setPassword,
  showPassword, setShowPassword,
  fieldErrors = {}, bannerError, busy, onSubmit, onGoToSignUp, onForgotPassword,
}) {
  return (
    <AuthMobileLayout showBack={false}>
      <h1 className="auth-title">Welcome Back</h1>
      <p className="auth-subtitle">Enter your credentials to access your account</p>

      {bannerError && (
        <div className="auth-field__error" style={{ marginBottom: 16 }}>{bannerError}</div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <AuthInput
          id="email" label="Email Address" type="email"
          value={email} onChange={setEmail} autoComplete="username"
          error={fieldErrors.email}
        />
        <AuthInput
          id="password" label="Password" icon={<LockIcon />}
          type={showPassword ? 'text' : 'password'}
          value={password} onChange={setPassword} autoComplete="current-password"
          error={fieldErrors.password}
          rightAction={{
            icon: showPassword ? <EyeOffIcon /> : <EyeIcon />,
            label: showPassword ? 'Hide password' : 'Show password',
            onClick: () => setShowPassword((v) => !v),
          }}
        />
        {onForgotPassword && (
          <button type="button" className="auth-link-center" onClick={onForgotPassword}>
            Forgot password?
          </button>
        )}

        <AuthButton type="submit" icon={null} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </AuthButton>
      </form>

      <p className="auth-switch">
        Don't have an account?{' '}
        <button type="button" className="auth-switch__link" onClick={onGoToSignUp}>Sign Up</button>
      </p>
    </AuthMobileLayout>
  );
}