import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import FacebookReelEmbed from "../components/FacebookReelEmbed";
import { activeSponsoredReel } from "../data/promotions";
import { useLiveRestaurantRoute } from "../lib/useLiveRestaurantRoute";
import { notifyMenuUnavailable } from "../portal/lib/notify";

const SponsoredReel = () => {
  // The hook must run before any early return, or React sees a different
  // number of hooks between renders. Harmless while activeSponsoredReel is a
  // module constant (the branch never flips at runtime), but promotions are
  // exactly the kind of value that becomes dynamic later — an admin toggle or
  // a fetch would turn this into "Rendered fewer hooks than expected" and
  // white-screen the landing page. useLiveRestaurantRoute already handles a
  // missing name by resolving to { path: null, loading: false }.
  const promo = activeSponsoredReel;
  const { path: menuPath, loading: menuLoading } = useLiveRestaurantRoute(
    promo?.partnerName
  );

  if (!promo) return null;

  const ctaClassName =
    "inline-flex w-fit items-center justify-center bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-7 py-3.5 rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-md shadow-brand-orange/25 disabled:opacity-60 disabled:pointer-events-none";

  return (
    <section
      id="sponsored-reel"
      className="relative w-full bg-brand-muted px-8 md:px-20 py-24 border-t border-brand-border overflow-hidden"
      aria-label={`${promo.brand} sponsored reel`}
    >
      <div
        className="absolute -left-32 top-1/2 -translate-y-1/2 w-[360px] h-[360px] bg-brand-orange/5 rounded-full blur-[100px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55 }}
            className="order-2 lg:order-1 flex flex-col items-center lg:items-start"
          >
            <div className="relative w-full flex justify-center lg:justify-start">
              <div
                className="absolute -inset-4 rounded-[2.5rem] bg-brand-orange/10 blur-2xl opacity-70 pointer-events-none"
                aria-hidden="true"
              />
              <FacebookReelEmbed
                reelUrl={promo.reelUrl}
                title={`${promo.brand} promo reel`}
              />
            </div>
            <p className="text-center lg:text-left text-brand-grey text-xs mt-5 font-medium max-w-2xl">
              Tap play on the reel to watch here — no need to open Facebook.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="flex flex-col gap-6 order-1 lg:order-2"
          >
            <div className="flex items-center gap-3">
              <img
                src={promo.logo}
                alt={`${promo.brand} logo`}
                className="w-14 h-14 rounded-2xl border border-brand-border bg-white object-contain p-2"
              />
              <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-brand-dark text-white">
                Sponsored
              </span>
            </div>

            <span className="inline-flex items-center gap-2 text-brand-orange text-xs font-bold tracking-widest uppercase">
              <Sparkles className="w-4 h-4" strokeWidth={2.5} />
              {promo.tagline}
            </span>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-brand-black leading-tight">
              {promo.title}{" "}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-orange to-brand-red">
                {promo.titleHighlight}
              </span>
            </h2>

            <p className="text-brand-grey text-base md:text-lg leading-relaxed max-w-lg">
              {promo.description}
            </p>

            {menuPath ? (
              <Link to={menuPath} className={ctaClassName}>
                Order from {promo.brand}
              </Link>
            ) : (
              <button
                type="button"
                className={ctaClassName}
                disabled={menuLoading}
                onClick={() => notifyMenuUnavailable(promo.brand)}
              >
                {menuLoading ? "Loading menu…" : `Order from ${promo.brand}`}
              </button>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default SponsoredReel;
