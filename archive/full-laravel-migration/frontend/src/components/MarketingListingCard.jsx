// ---------------------------------------------------------------------
// One card in a homepage listing grid — restaurants (sections/Restaurants)
// and stores (sections/Shop) share it, because they have to behave
// identically: a listing that is closed right now is not openable anywhere,
// and says when it reopens rather than just dimming.
//
// A CLOSED card renders as a plain div, so there is no click target at all
// rather than a suppressed one, and keyboard and screen-reader users get the
// same answer the dimming gives everyone else. This mirrors the storefront
// grids (portal/shop/StoreHomePage, portal/food/FoodHomePage) on purpose —
// the marketing page is the same promise, made earlier.
// ---------------------------------------------------------------------
import { motion } from 'framer-motion';
import { ArrowRight, Clock, Flame, Star } from 'lucide-react';
import { reopensLabel, todayHoursLabel } from '../portal/lib/storeHours';
import { MAX_GRID_CARDS } from '../lib/useMarketingPartners';

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (index) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: index * 0.08, ease: 'easeOut' },
  }),
};

const tagStyles = {
  'Top Rated': 'bg-brand-orange text-white',
  Popular: 'bg-white/95 text-brand-orange',
  Trending: 'bg-brand-red text-white',
  New: 'bg-green-500 text-white',
};

export function MarketingListingCard({ listing, index, ctaLabel, onOpen }) {
  const closed = listing.isOpen === false;
  const reopens = reopensLabel(listing);
  const hours = todayHoursLabel(listing);

  // A listing with no logo yet still belongs on the grid — it is listed.
  // Its initial stands in until an admin uploads artwork.
  const media = listing.logo ? (
    <img
      src={listing.logo}
      alt={`${listing.name} logo`}
      loading="lazy"
      className={`absolute inset-0 w-full h-full object-contain p-5 sm:p-6 transition-transform duration-500 ${
        closed ? 'grayscale' : 'group-hover:scale-110'
      }`}
    />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center text-5xl font-black text-brand-orange/30">
      {listing.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );

  const inner = (
    <motion.article
      custom={index}
      variants={cardVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
      className={`group relative h-full bg-white border border-brand-border rounded-3xl overflow-hidden transition-all duration-300 ${
        closed
          ? 'opacity-70'
          : 'hover:-translate-y-2 hover:border-brand-orange/30 hover:shadow-2xl hover:shadow-brand-orange/10'
      }`}
    >
      <div className="relative h-44 sm:h-48 bg-white overflow-hidden">
        {media}

        {listing.tag && !closed && (
          <span
            className={`absolute top-4 left-4 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full shadow-md ${
              tagStyles[listing.tag] || 'bg-white/95 text-brand-dark'
            }`}
          >
            {listing.tag}
          </span>
        )}

        {/* No rating until real customers have left one — never a placeholder. */}
        {listing.rating != null && (
          <div className="absolute top-4 right-4 flex items-center gap-1 bg-white/95 backdrop-blur-sm text-brand-black text-xs font-black px-2.5 py-1.5 rounded-full shadow-md">
            <Star className="w-3.5 h-3.5 text-brand-orange fill-brand-orange" strokeWidth={0} />
            {listing.rating}
          </div>
        )}

        {closed && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 px-4 text-center">
            <span className="px-3 py-1 rounded-full bg-white text-brand-dark text-xs font-black uppercase tracking-wider">
              Closed
            </span>
            <span className="text-white text-xs font-bold">{reopens}</span>
          </span>
        )}

        {!closed && (
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-2">
            {hours && (
              <span className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm text-brand-dark text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                <Clock className="w-3.5 h-3.5 text-brand-orange" strokeWidth={2.5} />
                {hours}
              </span>
            )}
            {/* Absent when the fee is unknown. It used to fall back to
                "Free delivery", which we do not offer. */}
            {listing.fee && (
              <span className="text-[10px] font-bold text-white/90 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full shrink-0">
                {listing.fee}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-5 sm:p-6">
        <h3
          className={`text-lg font-black text-brand-black tracking-tight leading-snug mb-1.5 ${
            closed ? '' : 'group-hover:text-brand-orange transition-colors'
          }`}
        >
          {listing.name}
        </h3>
        {listing.tagline && (
          <p className="text-brand-grey text-sm font-medium mb-4 line-clamp-2">{listing.tagline}</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-4 border-t border-brand-border">
          {/* The empty span keeps justify-between pushing the CTA right when a
              listing has no reviews yet. */}
          {listing.reviews ? (
            <span className="inline-flex items-center gap-1 text-xs text-brand-grey font-medium">
              <Flame className="w-3.5 h-3.5 text-brand-orange" strokeWidth={2.5} />
              {listing.reviews} reviews
            </span>
          ) : (
            <span />
          )}
          {/* The reopening time is already on the overlay above; repeating it
              here would say the same thing twice on one card. */}
          {!closed && (
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-orange opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
              {ctaLabel}
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>
    </motion.article>
  );

  if (closed) {
    return (
      <div aria-disabled="true" className="block h-full cursor-not-allowed">
        {inner}
      </div>
    );
  }

  return (
    <button type="button" onClick={() => onOpen(listing)} className="block w-full h-full text-left cursor-pointer">
      {inner}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-brand-border rounded-3xl overflow-hidden animate-pulse">
      <div className="h-44 sm:h-48 bg-brand-surface" />
      <div className="p-5 sm:p-6 space-y-3">
        <div className="h-4 bg-brand-surface rounded w-2/3" />
        <div className="h-3 bg-brand-surface rounded w-1/2" />
        <div className="h-3 bg-brand-surface rounded w-1/3" />
      </div>
    </div>
  );
}

// The grid, its loading state and its empty state in one place, because the
// empty state is the part that is easy to get wrong: with the curated array
// gone, a grid that renders "no partners yet" during the first paint would
// libel a platform that has plenty.
export default function MarketingListingGrid({
  listings,
  loading,
  failed = false,
  columns = 'sm:grid-cols-2 xl:grid-cols-4',
  ctaLabel,
  onOpen,
  emptyText,
}) {
  if (loading) {
    return (
      <div className={`grid grid-cols-1 ${columns} gap-6 lg:gap-7`}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // A failed request is NOT an empty grid. Rendering emptyText here told
  // visitors there were no partners whenever the API was unreachable or the
  // vertical was switched off at the backend (SHOP_ENABLED) — a statement
  // about the business made from a network error, and the reason a listed
  // store "not appearing" took as long as it did to diagnose.
  if (failed) {
    return (
      <div className="rounded-3xl border border-dashed border-brand-border bg-white/60 px-6 py-14 text-center">
        <p className="text-brand-dark text-sm font-bold">Listings could not be loaded right now</p>
        <p className="text-brand-grey text-sm font-medium mt-1">
          This is a problem on our side, not an empty catalogue. Please try again shortly.
        </p>
      </div>
    );
  }

  if (!listings.length) {
    return (
      <div className="rounded-3xl border border-dashed border-brand-border bg-white/60 px-6 py-14 text-center">
        <p className="text-brand-grey text-sm font-medium">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 ${columns} gap-6 lg:gap-7`}>
      {listings.slice(0, MAX_GRID_CARDS).map((listing, index) => (
        <MarketingListingCard
          key={listing.id}
          listing={listing}
          index={index}
          ctaLabel={ctaLabel}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
