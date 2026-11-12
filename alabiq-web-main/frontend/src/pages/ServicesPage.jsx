import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  UtensilsCrossed,
  ShoppingBag,
  PlaneTakeoff,
  ArrowRight,
  Search,
  Bike,
  Clock3,
  MapPin,
  Sparkles,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../sections/Footer";
import LogoGrid from "../sections/Logo";
import { MarketingListingCard } from "../components/MarketingListingCard";
import {
  useMarketingPartners,
  useMarketingStores,
  MARKETING_ETA_SHORT,
} from "../lib/useMarketingPartners";
import { notifyMenuUnavailable } from "../portal/lib/notify";
import { deliveryFeeFromLabel } from "../portal/lib/constants";

const PREVIEW = 8;

const CATEGORIES = [
  {
    id: "food",
    title: "Food",
    subtitle: "Restaurants near you",
    to: "/food",
    hash: "#food",
    Icon: UtensilsCrossed,
    accent: "from-brand-orange to-brand-red",
  },
  {
    id: "shop",
    title: "Shop",
    subtitle: "Stores & essentials",
    to: "/shop",
    hash: "#shop",
    Icon: ShoppingBag,
    accent: "from-orange-400 to-brand-orange",
  },
  {
    id: "rides",
    title: "Rides",
    subtitle: "Airport pick & drop",
    to: "/book",
    hash: "#rides",
    Icon: PlaneTakeoff,
    accent: "from-brand-red to-orange-500",
  },
];

const STEPS = [
  { Icon: Search, title: "Browse", desc: "Pick food, a store, or an airport ride." },
  { Icon: ShoppingBag, title: "Order or book", desc: "Pay in the app — fare and totals are shown first." },
  { Icon: MapPin, title: "Track live", desc: "Follow the kitchen, the rider, or your driver." },
];

function ListingRail({ listings, loading, failed = false, ctaLabel, onOpen, emptyText }) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-[min(78vw,280px)] shrink-0 md:w-auto bg-white border border-brand-border rounded-3xl overflow-hidden animate-pulse"
          >
            <div className="h-40 bg-brand-surface" />
            <div className="p-4 space-y-2">
              <div className="h-4 bg-brand-surface rounded w-2/3" />
              <div className="h-3 bg-brand-surface rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // A failed request is NOT an empty catalogue. Rendering emptyText for both
  // told visitors there were no partners whenever the API was unreachable or
  // the vertical was switched off at the backend (SHOP_ENABLED).
  if (failed) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-border bg-white px-5 py-10 text-center">
        <p className="text-sm font-bold text-brand-dark">Listings could not be loaded right now</p>
        <p className="text-sm text-brand-grey font-medium mt-1">
          This is a problem on our side, not an empty catalogue. Please try again shortly.
        </p>
      </div>
    );
  }

  if (!listings.length) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-border bg-white px-5 py-10 text-center">
        <p className="text-sm text-brand-grey font-medium">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-5 md:overflow-visible md:pb-0 no-scrollbar">
      {listings.slice(0, PREVIEW).map((listing, index) => (
        <div
          key={listing.id}
          className="snap-start shrink-0 w-[min(78vw,280px)] sm:w-[300px] md:w-auto md:min-w-0"
        >
          <MarketingListingCard
            listing={listing}
            index={index}
            ctaLabel={ctaLabel}
            onOpen={onOpen}
          />
        </div>
      ))}
    </div>
  );
}

function SectionHead({ eyebrow, title, to, linkLabel }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4 sm:mb-5">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-brand-orange uppercase tracking-widest">{eyebrow}</p>
        <h2 className="text-xl sm:text-2xl font-black text-brand-black tracking-tight mt-1">{title}</h2>
      </div>
      <Link
        to={to}
        className="shrink-0 inline-flex items-center gap-1 text-sm font-bold text-brand-orange hover:gap-2 transition-all"
      >
        {linkLabel}
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

const ServicesPage = () => {
  const navigate = useNavigate();
  const food = useMarketingPartners();
  const shop = useMarketingStores();

  function openRestaurant(listing) {
    if (listing.hasMenu) {
      navigate(`/food/r/${listing.id}`);
      return;
    }
    notifyMenuUnavailable(listing.name);
  }

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark pt-20">
      <Navbar />

      <main>
        <section className="relative overflow-hidden">
          <div
            className="absolute -top-24 right-0 w-72 h-72 bg-brand-orange/10 rounded-full blur-[90px] pointer-events-none"
            aria-hidden="true"
          />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 lg:px-20 pt-8 sm:pt-12 pb-6 sm:pb-8">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
            >
              <span className="inline-flex items-center gap-1.5 text-brand-orange text-xs font-bold tracking-widest uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                Our services
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-brand-black mt-2 leading-tight">
                Order food, shop, or book a ride.
              </h1>
              <p className="text-brand-grey text-sm sm:text-base mt-3 max-w-xl">
                Live restaurants and partner stores in Riyadh — plus airport pick & drop when you need a car.
              </p>
            </motion.div>

            <Link
              to="/food"
              className="mt-5 sm:mt-6 flex items-center gap-3 w-full max-w-xl bg-white border border-brand-border rounded-2xl px-4 py-3.5 shadow-sm hover:border-brand-orange/40 transition-colors"
            >
              <Search className="w-5 h-5 text-brand-grey shrink-0" />
              <span className="text-sm text-brand-grey truncate">Search restaurants and cuisines…</span>
            </Link>

            <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
              {CATEGORIES.map((c) => (
                <a
                  key={c.id}
                  href={c.hash}
                  className="group flex flex-col items-center sm:items-stretch text-center sm:text-left bg-white border border-brand-border rounded-2xl p-3 sm:p-4 hover:border-brand-orange/35 hover:shadow-md hover:shadow-brand-orange/10 transition-all"
                >
                  <span
                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-linear-to-br ${c.accent} flex items-center justify-center shadow-md shadow-brand-orange/20 mb-2 sm:mb-3`}
                  >
                    <c.Icon className="w-5 h-5 text-white" strokeWidth={2} />
                  </span>
                  <span className="text-sm font-black text-brand-black">{c.title}</span>
                  <span className="hidden sm:block text-[11px] text-brand-grey mt-0.5">{c.subtitle}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="food" className="scroll-mt-24 max-w-7xl mx-auto px-4 sm:px-6 md:px-12 lg:px-20 py-8 sm:py-10">
          <SectionHead
            eyebrow="Food delivery"
            title="Restaurants near you"
            to="/food"
            linkLabel="See all"
          />
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-brand-grey mb-4">
            <span>{food.loading || food.failed ? "—" : food.total} partners</span>
            <span className="inline-flex items-center gap-1">
              <Bike className="w-3.5 h-3.5 text-brand-orange" />
              {/* Never "Free delivery": we do not offer it, and the fallback
                  fired hardest exactly when the request had failed. The base
                  fee is also a floor — deliveryPricing adds per-km past the
                  free radius — so it reads "From SAR 10". */}
              {(food.loading || food.failed ? null : deliveryFeeFromLabel(food.delivery)) ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="w-3.5 h-3.5 text-brand-orange" />
              {MARKETING_ETA_SHORT} avg
            </span>
          </div>
          <ListingRail
            listings={food.partners}
            loading={food.loading}
            failed={food.failed}
            ctaLabel="Order now"
            onOpen={openRestaurant}
            emptyText="No restaurants are listed yet. New partners appear here when they go live."
          />
        </section>

        <section id="shop" className="scroll-mt-24 bg-white border-y border-brand-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 lg:px-20 py-8 sm:py-10">
            <SectionHead
              eyebrow="E-commerce"
              title="Shop partner stores"
              to="/shop"
              linkLabel="See all"
            />
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-brand-grey mb-4">
              <span>{shop.loading || shop.failed ? "—" : shop.total} stores</span>
              <span>
                {(shop.loading || shop.failed ? null : deliveryFeeFromLabel(shop.delivery)) ?? "—"}
              </span>
            </div>
            <ListingRail
              listings={shop.partners}
              loading={shop.loading}
              failed={shop.failed}
              ctaLabel="Shop now"
              onOpen={(store) => navigate(`/shop/s/${store.id}`)}
              emptyText="No stores are listed yet. New partners appear here when they go live."
            />
          </div>
        </section>

        <section id="rides" className="scroll-mt-24 max-w-7xl mx-auto px-4 sm:px-6 md:px-12 lg:px-20 py-8 sm:py-10">
          <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-brand-black to-[#1f2937] p-5 sm:p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-6">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-orange/20 rounded-full blur-3xl pointer-events-none" />
            <div className="relative min-w-0 flex-1">
              <span className="inline-flex items-center gap-2 text-brand-orange text-[11px] font-bold uppercase tracking-widest">
                <PlaneTakeoff className="w-3.5 h-3.5" />
                Pick & drop
              </span>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white mt-2 tracking-tight">
                Airport transfers with a fare you see first.
              </h2>
              <p className="text-white/70 text-sm mt-2 max-w-md">
                Door to terminal across Riyadh. Fixed rates, live driver tracking, no surprise extras.
              </p>
            </div>
            <Link
              to="/book"
              className="relative w-full md:w-auto shrink-0 inline-flex items-center justify-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-black text-sm px-6 py-3.5 rounded-xl shadow-lg shadow-brand-orange/25"
            >
              Book a ride
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 lg:px-20 pb-10 sm:pb-12">
          <h2 className="text-lg sm:text-xl font-black text-brand-black mb-4">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="flex sm:flex-col items-start gap-3 bg-white border border-brand-border rounded-2xl p-4"
              >
                <span className="w-10 h-10 rounded-xl bg-brand-warm text-brand-orange flex items-center justify-center shrink-0">
                  <step.Icon className="w-5 h-5" />
                </span>
                <div>
                  <p className="font-black text-brand-black text-sm">
                    {i + 1}. {step.title}
                  </p>
                  <p className="text-xs text-brand-grey mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full bg-brand-muted px-4 sm:px-8 md:px-20 pb-16 sm:pb-24 border-t border-brand-border">
          <LogoGrid />
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ServicesPage;
