import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UtensilsCrossed, ShoppingBag, Store, Percent } from 'lucide-react';

const CATEGORIES = [
  {
    id: 'food',
    label: 'Food',
    hint: 'Restaurants',
    to: '/services/food',
    Icon: UtensilsCrossed,
    bg: 'bg-orange-50',
    color: 'text-brand-orange',
    ring: 'hover:border-brand-orange/30',
  },
  {
    id: 'groceries',
    label: 'Groceries',
    hint: 'Essentials',
    to: '/services/food?tab=groceries',
    Icon: ShoppingBag,
    bg: 'bg-emerald-50',
    color: 'text-emerald-600',
    ring: 'hover:border-emerald-300',
  },
  {
    id: 'shops',
    label: 'Shops',
    hint: 'Retail',
    to: '/services/food?tab=shops',
    Icon: Store,
    bg: 'bg-violet-50',
    color: 'text-violet-600',
    ring: 'hover:border-violet-300',
  },
  {
    id: 'deals',
    label: 'Deals',
    hint: 'Save more',
    to: '/services/food?tab=deals',
    Icon: Percent,
    bg: 'bg-rose-50',
    color: 'text-rose-600',
    ring: 'hover:border-rose-300',
  },
];

export default function MarketplaceCategories() {
  return (
    <div className="w-full max-w-xl">
      <p className="text-[11px] font-black uppercase tracking-wider text-brand-grey mb-2.5">
        Shop by category
      </p>
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {CATEGORIES.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 + i * 0.06, duration: 0.4 }}
          >
            <Link
              to={cat.to}
              className={`flex flex-col items-center rounded-2xl border border-brand-border bg-white py-3 sm:py-3.5 px-1 transition-all hover:shadow-md hover:-translate-y-0.5 ${cat.ring}`}
            >
              <span className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${cat.bg} ${cat.color} flex items-center justify-center`}>
                <cat.Icon className="w-5 h-5" strokeWidth={2.2} />
              </span>
              <span className="mt-1.5 text-[11px] sm:text-xs font-black text-brand-black text-center leading-tight">
                {cat.label}
              </span>
              <span className="hidden sm:block text-[10px] font-medium text-brand-grey mt-0.5">{cat.hint}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
