export default function AuthHeader({ onBack, showBack = true }) {
  return (
    <div className="auth-header">
      {showBack ? (
        <button
          type="button"
          className="auth-header__back"
          onClick={onBack}
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span />
      )}

      <img className="auth-header__logo" src="/mappia-new-logo.png" alt="Alabiq" />

      <span />
    </div>
  );
}
