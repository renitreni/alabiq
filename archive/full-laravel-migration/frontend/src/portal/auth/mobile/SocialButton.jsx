import { GoogleIcon, FacebookIcon } from './icons';

const ICONS = {
  google: GoogleIcon,
  facebook: FacebookIcon,
};

const LABELS = {
  google: 'Google',
  facebook: 'Facebook',
};

export function SocialButton({ provider, onClick }) {
  const Icon = ICONS[provider];
  return (
    <button type="button" className="auth-social-button" onClick={onClick}>
      <Icon />
      <span>{LABELS[provider]}</span>
    </button>
  );
}

export function SocialButtonRow({ onGoogle, onFacebook }) {
  return (
    <div className="auth-social-row">
      <SocialButton provider="google" onClick={onGoogle} />
      <SocialButton provider="facebook" onClick={onFacebook} />
    </div>
  );
}
