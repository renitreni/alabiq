export default function MobileSplashScreen() {
  return (
    <div className="splash-screen">
      <div className="splash-screen__content">
        <img src="/alabiq-icon.png" alt="" className="splash-screen__logo" />
        <span className="splash-screen__wordmark">
          ALA<span className="splash-screen__wordmark--orange">BIQ</span>
        </span>
      </div>
    </div>
  );
}