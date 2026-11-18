import { Heart, Star, Clock3 } from 'lucide-react';
import { reopensLabel, todayHoursLabel } from '../../../portal/lib/storeHours';
import { cuisineTokens } from './foodCategories';

const tagStyles = {
  'Top Rated': 'bg-brand-red text-white',
  New: 'bg-emerald-500 text-white',
  Trending: 'bg-rose-600 text-white',
  Popular: 'bg-orange-400 text-white',
};

function formatReviewCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k+`;
  return String(n);
}

export default function FoodRestaurantCard({ listing, minOrderLabel, favorite, onToggleFavorite, onOpen }) {
  const closed = listing.isOpen === false;
  const reopens = reopensLabel(listing);
  const hours = todayHoursLabel(listing);
  const cuisines = cuisineTokens(listing.cuisine);
  const reviewLabel = formatReviewCount(listing.reviewCount ?? listing.reviews);

  const media = listing.logo ? (
    <img
      src={listing.logo}
      alt=""
      loading="lazy"
      className={`absolute inset-0 w-full h-full object-contain p-5 transition-transform duration-500 ${
        closed ? 'grayscale' : 'group-hover:scale-105'
      }`}
    />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center text-4xl font-black text-brand-orange/25">
      {listing.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );

  const inner = (
    <article
      className={`group relative h-full bg-white rounded-[22px] overflow-hidden border border-black/[0.04] shadow-[0_10px_30px_rgba(17,24,39,0.06)] transition-all duration-300 ${
        closed ? 'opacity-70' : 'hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(249,115,22,0.12)]'
      }`}
    >
      <div className="relative aspect-[4/3] sm:aspect-[5/4] bg-[#FAFAFA] overflow-hidden">
        {media}

        {listing.tag && !closed && (
          <span
            className={`absolute top-3 left-3 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm ${
              tagStyles[listing.tag] || 'bg-white text-brand-dark'
            }`}
          >
            {listing.tag}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(listing.id);
          }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/95 shadow-sm flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
          aria-label={favorite ? 'Remove from favorites' : 'Save to favorites'}
        >
          <Heart
            className={`w-4 h-4 ${favorite ? 'text-brand-red fill-brand-red' : 'text-brand-grey'}`}
            strokeWidth={2.2}
          />
        </button>

        {closed && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/45 px-4 text-center">
            <span className="px-3 py-1 rounded-full bg-white text-brand-dark text-xs font-black uppercase tracking-wider">
              Closed
            </span>
            {reopens && <span className="text-white text-xs font-bold">{reopens}</span>}
          </span>
        )}
      </div>

      <div className="p-3 sm:p-4">
        <h3 className="text-[14px] sm:text-[15px] font-black text-brand-black tracking-tight truncate">{listing.name}</h3>

        {cuisines.length > 0 && (
          <p className="text-[12px] text-brand-grey font-medium mt-0.5 truncate">{cuisines.join(' • ')}</p>
        )}
        {!cuisines.length && listing.tagline && (
          <p className="text-[12px] text-brand-grey font-medium mt-0.5 line-clamp-1">{listing.tagline}</p>
        )}

        <div className="flex items-center gap-2 mt-2 text-[12px] text-brand-grey font-medium min-w-0">
          {listing.rating != null && (
            <span className="inline-flex items-center gap-1 font-bold text-brand-dark shrink-0">
              <Star className="w-3.5 h-3.5 text-brand-orange fill-brand-orange" strokeWidth={0} />
              {Number(listing.rating).toFixed(1)}
              {reviewLabel && <span className="font-medium text-brand-grey">({reviewLabel})</span>}
            </span>
          )}
          {(hours || (closed && reopens)) && (
            <span className="inline-flex items-center gap-1 min-w-0 truncate">
              <Clock3 className="w-3.5 h-3.5 text-brand-grey shrink-0" strokeWidth={2.2} />
              <span className="truncate">{closed ? reopens : hours}</span>
            </span>
          )}
        </div>

        {(listing.fee || minOrderLabel) && (
          <p className="text-[10px] sm:text-[11px] text-brand-grey font-semibold mt-1.5 sm:mt-2 truncate">
            {[listing.fee, minOrderLabel].filter(Boolean).join(' • ')}
          </p>
        )}
      </div>
    </article>
  );

  if (closed) {
    return (
      <div aria-disabled="true" className="block h-full cursor-not-allowed">
        {inner}
      </div>
    );
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => onOpen(listing)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(listing);
        }
      }}
      className="block w-full h-full text-left cursor-pointer"
    >
      {inner}
    </div>
  );
}

export function FoodRestaurantCardSkeleton() {
  return (
    <div className="bg-white rounded-[22px] overflow-hidden border border-black/[0.04] animate-pulse">
      <div className="aspect-[4/3] sm:aspect-[5/4] bg-brand-surface" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-brand-surface rounded w-2/3" />
        <div className="h-3 bg-brand-surface rounded w-1/2" />
        <div className="h-3 bg-brand-surface rounded w-1/3" />
      </div>
    </div>
  );
}
