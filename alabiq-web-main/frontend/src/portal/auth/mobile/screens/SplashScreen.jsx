export default function MobileSplashScreen() {
  return (
    <div className="splash-screen">
      <div className="splash-screen__content">
        <img src="/mappia-new-logo.png" alt="" className="splash-screen__logo" />
        <span className="splash-screen__wordmark">
          Smart <span className="splash-screen__wordmark--orange">Mappia</span>
        </span>
      </div>
    </div>
  );
}