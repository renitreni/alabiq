// Cover card — peach panel + orange curve (same as the food marketplace hero).
import { ShoppingBag, UtensilsCrossed } from 'lucide-react';

const COPY = {
  food: {
    kicker: 'Alabiq Food',
    title: 'Your favorites, delivered fast.',
    subtitle: 'Top restaurants in Riyadh, tracked live.',
    Icon: UtensilsCrossed,
  },
  shop: {
    kicker: 'Alabiq Shop',
    title: 'Groceries and essentials, delivered.',
    subtitle: 'Search products, tap a store, and track the order live.',
    Icon: ShoppingBag,
  },
};

export default function ShopHeroBanner({ compact = false, variant = 'shop' }) {
  const copy = COPY[variant] || COPY.shop;
  const Icon = copy.Icon;

  return (
    <section
      className={`relative overflow-hidden rounded-[22px] sm:rounded-[28px] bg-[#FFF1E6] ${
        compact ? 'min-h-[140px]' : 'min-h-[150px] sm:min-h-[220px]'
      }`}
    >
      <div className={`relative z-10 max-w-[58%] ${compact ? 'p-4 sm:p-5' : 'p-4 sm:p-8'}`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-orange">
          {copy.kicker}
        </p>
        <h1
          className={`font-black tracking-tight text-brand-black leading-[1.15] mt-1 ${
            compact ? 'text-xl' : 'text-xl sm:text-3xl'
          }`}
        >
          {copy.title}
        </h1>
        {!compact && (
          <p className="hidden sm:block text-sm text-brand-grey font-medium mt-2 max-w-sm">
            {copy.subtitle}
          </p>
        )}
      </div>
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-[46%]">
        <div className="absolute inset-y-0 right-0 w-full bg-brand-orange rounded-l-[90px] sm:rounded-l-[140px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon
            className={`text-white ${compact ? 'w-11 h-11' : 'w-14 h-14 sm:w-20 sm:h-20'}`}
            strokeWidth={1.75}
          />
        </div>
      </div>
    </section>
  );
}
