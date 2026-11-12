import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMarketingPartners } from '../lib/useMarketingPartners';
import { deliveryFeeFromLabel, fmtSAR, FOOD_MIN_ORDER } from '../portal/lib/constants';
import { notifyMenuUnavailable } from '../portal/lib/notify';
import FoodRestaurantCard, { FoodRestaurantCardSkeleton } from '../pages/services/food/FoodRestaurantCard';

function compactSar(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return n % 1 === 0 ? `SAR ${n}` : fmtSAR(n);
}

export default function PopularNearYou() {
  const navigate = useNavigate();
  const railRef = useRef(null);
  const { partners, loading, failed, delivery, minOrder } = useMarketingPartners();

  const minOrderAmount = Number.isFinite(Number(minOrder)) ? Number(minOrder) : FOOD_MIN_ORDER;
  const minOrderLabel = `Min. ${compactSar(minOrderAmount)}`;
  const preview = partners.slice(0, 12);

  function openRestaurant(listing) {
    if (listing.hasMenu) {
      navigate(`/food/r/${listing.id}`);
      return;
    }
    notifyMenuUnavailable(listing.name);
  }

  function slide(dir) {
    const el = railRef.current;
    if (!el) return;
    const step = Math.max(220, Math.round(el.clientWidth * 0.75));
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  if (!loading && failed) return null;
  if (!loading && preview.length === 0) return null;

  return (
    <section className="w-full bg-white border-y border-brand-border py-10 sm:py-14 px-6 md:px-16 lg:px-20">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-brand-orange text-xs font-bold tracking-widest uppercase">Marketplace</p>
            <h2 className="text-2xl sm:text-3xl font-black text-brand-black tracking-tight mt-1">
              Popular near you
            </h2>
            <p className="text-sm text-brand-grey font-medium mt-1.5 max-w-lg">
              Browse partner restaurants and stores with live prices, delivery fees, and one-tap ordering.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label="Slide back"
              onClick={() => slide(-1)}
              className="w-9 h-9 rounded-full border border-brand-border bg-white flex items-center justify-center text-brand-dark hover:border-brand-orange/40 hover:text-brand-orange cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Slide forward"
              onClick={() => slide(1)}
              className="w-9 h-9 rounded-full border border-brand-border bg-white flex items-center justify-center text-brand-dark hover:border-brand-orange/40 hover:text-brand-orange cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={railRef}
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 no-scrollbar overscroll-x-contain"
        >
          {loading &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="shrink-0 snap-start w-[min(68vw,210px)] sm:w-[min(78vw,250px)]">
                <FoodRestaurantCardSkeleton />
              </div>
            ))}

          {!loading &&
            preview.map((listing) => (
              <div key={listing.id} className="shrink-0 snap-start w-[min(68vw,210px)] sm:w-[min(78vw,250px)]">
                <FoodRestaurantCard
                  listing={{
                    ...listing,
                    fee: listing.fee ? `${listing.fee} delivery` : listing.fee,
                  }}
                  minOrderLabel={minOrderLabel}
                  favorite={false}
                  onToggleFavorite={() => {}}
                  onOpen={openRestaurant}
                />
              </div>
            ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-6 flex flex-wrap items-center gap-3"
        >
          <Link
            to="/services/food"
            className="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-black text-sm px-6 py-3 rounded-xl shadow-md shadow-brand-orange/20 transition-colors"
          >
            Browse marketplace
            <ArrowRight className="w-4 h-4" />
          </Link>
          {!loading && partners.length > 0 && (
            <span className="text-xs font-bold text-brand-grey">
              {partners.length} partners · delivery {deliveryFeeFromLabel(delivery) || 'from checkout'}
            </span>
          )}
        </motion.div>
      </div>
    </section>
  );
}
