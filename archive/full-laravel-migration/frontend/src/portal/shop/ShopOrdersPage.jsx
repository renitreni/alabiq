// ---------------------------------------------------------------------
// Ecommerce — order history: /shop/orders
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { fmtSAR, shopStatusMeta, shopPaymentMeta, TONE_CLASSES } from '../lib/constants';
import { PortalShell, Card, Spinner, btnPrimary } from '../components/ui';

function Pill({ tone, children }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

export default function ShopOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .shopOrders()
      .then((d) => setOrders(d.orders || []))
      .catch((e) => setError(e.message));
  }, []);

  if (!orders && !error) {
    return (
      <PortalShell title="My shop orders">
        <div className="flex justify-center py-16">
          <Spinner className="!w-8 !h-8" />
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="My shop orders" onBack={() => navigate('/shop')}>
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {orders && orders.length === 0 && (
        <Card className="p-8 text-center">
          <ShoppingBag className="w-8 h-8 text-brand-grey/40 mx-auto mb-3" />
          <p className="font-bold text-brand-black">No orders yet</p>
          <Link to="/shop" className={btnPrimary + ' mt-4 inline-flex'}>
            Start shopping
          </Link>
        </Card>
      )}

      <div className="space-y-3">
        {(orders || []).map((o) => {
          const status = shopStatusMeta(o.status);
          const payment = shopPaymentMeta(o.payment_status);
          return (
            <Link key={o.order_code} to={`/shop/track/${o.order_code}`} className="block">
              <Card className="p-4 hover:border-brand-orange/40 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-brand-black truncate">
                      {o.merchants?.name || 'Store'}
                    </p>
                    <p className="text-xs font-mono text-brand-grey mt-0.5">{o.order_code}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Pill tone={status.tone}>{status.label}</Pill>
                      <Pill tone={payment.tone}>{payment.label}</Pill>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-brand-black">{fmtSAR(o.total)}</p>
                    <p className="text-xs text-brand-grey mt-0.5">
                      {new Date(o.created_at).toLocaleDateString()}
                    </p>
                    <ChevronRight className="w-4 h-4 text-brand-grey inline-block mt-1" />
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </PortalShell>
  );
}
