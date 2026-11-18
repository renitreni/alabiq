// ---------------------------------------------------------------------
// Signed-in user home: /home — the multi-service hub.
// Users land here after sign-in (not directly in Pick & Drop) and choose
// a service. Add new services here as the platform grows.
// ---------------------------------------------------------------------
import { Link } from 'react-router-dom';
import { Plane, UtensilsCrossed, ReceiptText, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/AuthProvider';
import { PortalShell, Card } from '../components/ui';

function QuickLink({ to, icon: Icon, title, subtitle }) {
  return (
    <Card className="p-4 flex items-center justify-between gap-3 hover:border-brand-orange/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-brand-surface flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-brand-grey" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-brand-dark text-sm">{title}</p>
          <p className="text-xs text-brand-grey truncate">{subtitle}</p>
        </div>
      </div>
      <Link to={to} className="text-sm font-bold text-brand-orange shrink-0 flex items-center gap-1">
        Open <ArrowRight className="w-4 h-4" />
      </Link>
    </Card>
  );
}

function ServiceCard({ to, icon: Icon, title, description, cta }) {
  return (
    <Link
      to={to}
      className="block bg-white border border-brand-border rounded-2xl shadow-sm p-6 hover:border-brand-orange/50 hover:shadow-md transition-all group"
    >
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-orange to-brand-red text-white flex items-center justify-center mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <p className="font-black text-brand-black text-lg">{title}</p>
      <p className="text-sm text-brand-grey mt-1">{description}</p>
      <p className="text-sm font-bold text-brand-orange mt-4 flex items-center gap-1.5">
        {cta} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </p>
    </Link>
  );
}

export default function HomePage() {
  const { profile } = useAuth();
  const firstName = (profile?.fullName || '').split(' ')[0];

  return (
    <PortalShell title="Alabiq" subtitle={firstName ? `Welcome back, ${firstName}` : 'What do you need today?'}>
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-black text-brand-black mb-4">Choose a service</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ServiceCard
            to="/book"
            icon={Plane}
            title="Airport Pick & Drop"
            description="Book a ride to or from the airport with a verified driver."
            cta="Book a ride"
          />
          <ServiceCard
            to="/food"
            icon={UtensilsCrossed}
            title="Food Delivery"
            description="Order from local restaurants, delivered to your door."
            cta="Browse restaurants"
          />
        </div>

        <div className="mt-4 space-y-3">
          <QuickLink
            to="/transactions"
            icon={ShieldCheck}
            title="Transaction records"
            subtitle="Secure history & PDF receipts for every order and trip"
          />
          <QuickLink
            to="/food/orders"
            icon={ReceiptText}
            title="My food orders"
            subtitle="Track live orders and reorder favorites"
          />
        </div>
      </div>
    </PortalShell>
  );
}
