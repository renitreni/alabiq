import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Deliberately lighter chrome than ServiceDetailLayout: these routes are reached
// from the in-app auth footer as well as the marketing site, and the landing page
// Navbar/Footer would drag the whole marketing surface into the native WebView.
export default function LegalLayout({ title, children }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-brand-light/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="rounded-full p-2 text-brand-grey transition hover:bg-black/5 hover:text-brand-orange"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-black text-brand-black">{title}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-6 pb-16">{children}</main>
    </div>
  );
}
