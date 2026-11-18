export default function AuthDivider({ label = 'OR' }) {
  return (
    <div className="auth-divider">
      <span className="auth-divider__line" />
      <span className="auth-divider__label">{label}</span>
      <span className="auth-divider__line" />
    </div>
  );
}