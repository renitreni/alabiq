// ---------------------------------------------------------------------
// Homepage restaurant grid. Every card is a live merchant from
// GET /api/food/restaurants — list one in admin and it appears here, delist
// it and it is gone. Nothing on this page is written in code any more; see
// lib/useMarketingPartners.js for why that matters.
// ---------------------------------------------------------------------
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { notifyMenuUnavailable } from "../portal/lib/notify";
import { useMarketingPartners, MARKETING_ETA_SHORT } from "../lib/useMarketingPartners";
import { deliveryFeeFromLabel } from "../portal/lib/constants";
import MarketingListingGrid from "../components/MarketingListingCard";

const Restaurants = () => {
  const navigate = useNavigate();
  const { partners, total, loading, failed, delivery } = useMarketingPartners();

  // Counts are real or absent. A dash while the request is in flight beats a
  // round number that turns out to be wrong a second later — and a dash when
  // it FAILED beats "0 partner restaurants", which is a claim about the
  // business rather than about the request.
  const unknown = loading || failed;
  const stats = [
    { value: unknown ? "—" : String(total), label: "Partner restaurants" },
    // Never "Free": the fee is a floor that rises past the free radius, and
    // an unknown fee must render nothing rather than a promise.
    { value: (unknown ? null : deliveryFeeFromLabel(delivery)) ?? "—", label: "Delivery" },
    { value: MARKETING_ETA_SHORT, label: "Avg. delivery" },
  ];

  // The card IS the merchant now, so opening one is a route, not a name
  // match against a second list. A restaurant with an empty menu still shows
  // — it is listed — but says so instead of opening a blank page.
  function openRestaurant(listing) {
    if (listing.hasMenu) {
      navigate(`/food/r/${listing.id}`);
      return;
    }
    notifyMenuUnavailable(listing.name);
  }

  return (
    <section
      id="restaurants"
      className="relative w-full bg-brand-muted px-8 md:px-20 py-24 border-t border-brand-border overflow-hidden"
    >
      <div
        className="absolute top-0 right-0 w-[480px] h-[480px] bg-brand-orange/5 rounded-full blur-[120px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto relative">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-10 mb-14">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl"
          >
            <span className="inline-flex items-center gap-2 text-brand-orange text-sm font-bold tracking-widest uppercase">
              <Sparkles className="w-4 h-4" strokeWidth={2.5} />
              Premium Culinary Partners
            </span>

            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-3 leading-tight">
              KSA's Most Loved Flavors.{" "}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-orange to-brand-red">
                Handpicked For You.
              </span>
            </h2>

            <p className="text-brand-grey text-sm md:text-base mt-4 font-medium leading-relaxed">
              Discover top-rated restaurants with blazing-fast delivery, live
              tracking, and exclusive deals, all in one tap.
            </p>

            <Link
              to="/food"
              className="inline-flex items-center gap-2 mt-5 text-sm font-bold text-brand-orange hover:gap-3 transition-all"
            >
              See all restaurants
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-wrap gap-6 lg:gap-8"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="text-center lg:text-right">
                <p className="text-2xl md:text-3xl font-black text-brand-black">{stat.value}</p>
                <p className="text-brand-grey text-xs font-semibold uppercase tracking-wider mt-0.5">
                  {stat.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        <MarketingListingGrid
          listings={partners}
          loading={loading}
          failed={failed}
          ctaLabel="Order Now"
          onOpen={openRestaurant}
          emptyText="No restaurants are listed yet. New partners appear here the moment they go live."
        />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-16 relative overflow-hidden rounded-3xl"
        >
          <div className="absolute inset-0 bg-linear-to-r from-brand-orange to-brand-red" />
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />

          <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-xl text-center md:text-left">
              <span className="inline-block text-white/80 text-xs font-bold uppercase tracking-widest mb-3">
                Order in seconds
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-white mb-3 tracking-tight">
                Craving something delicious right now?
              </h3>
              <p className="text-white/85 text-sm md:text-base font-medium leading-relaxed">
                Browse live menus, track your rider on the map, and pay in a tap,
                all on Alabiq.
              </p>
            </div>

            <Link
              to="/food"
              className="w-full md:w-auto shrink-0 bg-white hover:bg-brand-warm text-brand-orange font-black text-sm px-8 py-4 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-95 shadow-xl cursor-pointer text-center"
            >
              Browse Restaurants
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Restaurants;
