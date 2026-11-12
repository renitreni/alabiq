export default function AuthInput({
  label,
  icon,
  rightAction,
  forgotLink,
  id,
  error,
  onChange,
  ...inputProps
}) {
  // Unwrap the native event here so every screen can keep passing
  // onChange={(value) => ...} instead of onChange={(e) => ...}
  const handleChange = (e) => {
    if (onChange) onChange(e.target.value);
  };

  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="auth-field">
      {(label || forgotLink) && (
        <div className="auth-field__label-row">
          {label && (
            <label htmlFor={id} className="auth-field__label">
              {label}
            </label>
          )}
          {forgotLink && (
            <button
              type="button"
              className="auth-field__forgot-link"
              onClick={forgotLink.onClick}
            >
              {forgotLink.label}
            </button>
          )}
        </div>
      )}

      <div className={'auth-input-wrap' + (error ? ' auth-input-wrap--error' : '')}>
        {icon && <span className="auth-input-wrap__icon">{icon}</span>}
        <input
          id={id}
          className="auth-input"
          onChange={handleChange}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={errorId}
          {...inputProps}
        />
        {rightAction && (
          <button
            type="button"
            className="auth-input-wrap__action"
            onClick={rightAction.onClick}
            aria-label={rightAction.label}
          >
            {rightAction.icon}
          </button>
        )}
      </div>

      {error && (
        <div id={errorId} className="auth-field__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
