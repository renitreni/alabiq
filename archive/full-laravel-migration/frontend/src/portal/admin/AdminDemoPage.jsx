// ---------------------------------------------------------------------
// /admin/ferdz — the real admin portal rendered against invented data.
//
// No component below this one knows it is a demo: lib/api.js answers every
// /api/admin call from portal/demo/adminFixtures.js while this route is
// open, so nothing is read from or written to the database.
//
// The banner is not decoration. This screen is pixel-identical to the live
// dashboard, and an admin who lands here without it would read the figures
// as real.
// ---------------------------------------------------------------------
import { FlaskConical } from 'lucide-react';
import AdminPage from './AdminPage';

export default function AdminDemoPage() {
  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 bg-amber-400 text-brand-black text-center">
        <FlaskConical className="w-4 h-4 shrink-0" />
        <p className="text-xs sm:text-sm font-bold">
          Demo data. Every figure on this page is made up — nothing here comes from the live system.
        </p>
      </div>
      <AdminPage />
    </div>
  );
}
