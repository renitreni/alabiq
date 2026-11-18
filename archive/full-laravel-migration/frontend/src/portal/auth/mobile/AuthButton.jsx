import { ArrowRightIcon } from './icons';

export default function AuthButton({
  children,
  icon = <ArrowRightIcon />,
  type = 'button',
  disabled = false,
  onClick,
}) {
  return (
    <button
      type={type}
      className="auth-button auth-button--primary"
      onClick={onClick}
      disabled={disabled}
    >
      <span>{children}</span>
      {icon}
    </button>
  );
}
