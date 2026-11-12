import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import PhoneMockup from "../components/PhoneMockup";
import MarketplaceCategories from "./MarketplaceCategories";
import MobileMarketplaceHome from "./MobileMarketplaceHome";

const stats = [
  { value: "500+", label: "Restaurants & stores" },
  { value: "15 min", label: "Avg. delivery" },
  { value: "50k+", label: "Orders delivered" },
];

// 2xl (1536px): phones and tablets — including iPad Pro landscape (~1366px) —
// get the storefront. Laptops and desktops keep the marketing hero + phone mockup.
function useDesktopUp() {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1536px)").matches : true
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1536px)");
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return matches;
}

const Hero = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const desktop = useDesktopUp();

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/services/food?q=${encodeURIComponent(q)}` : "/services/food");
  };

  if (!desktop) {
    return <MobileMarketplaceHome />;
  }

  return (
    <section
      id="home"
      className="relative w-full min-h-screen bg-brand-light flex items-center px-6 md:px-16 lg:px-20 pt-28 pb-16 overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full bg-brand-orange/8 blur-[120px]" />
        <div className="absolute bottom-0 -left-40 w-[420px] h-[420px] rounded-full bg-brand-red/5 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,126,33,0.08),transparent)]" />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-8 w-full max-w-7xl mx-auto items-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex flex-col items-start gap-5 lg:gap-6 order-2 lg:order-1"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="inline-flex items-center gap-2 bg-brand-warm border border-brand-orange/20 px-4 py-2 rounded-full text-brand-orange text-xs font-bold tracking-widest uppercase"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-orange" />
            </span>
            Your marketplace, delivered
          </motion.div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight text-brand-black leading-[1.05]">
            Shop food, groceries{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-orange to-brand-red">
              &amp; more
            </span>{" "}
            — delivered fast.
          </h1>

          <p className="text-brand-grey text-base md:text-lg leading-relaxed max-w-lg">
            Browse restaurants and stores, add to cart, and track every order live.
            Food, essentials, and airport rides — all in one app.
          </p>

          <form
            onSubmit={submitSearch}
            className="w-full max-w-xl flex flex-col sm:flex-row gap-3 p-1.5 rounded-2xl bg-white border border-brand-border shadow-lg shadow-brand-orange/5 focus-within:ring-2 focus-within:ring-brand-dark/40 focus-within:border-brand-dark"
          >
            <div className="flex items-center gap-3 px-4 flex-1 min-h-12">
              <svg
                className="w-5 h-5 text-brand-grey shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
                />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search restaurants, stores, or products..."
                aria-label="Search restaurants, stores, or products"
                className="w-full bg-transparent text-brand-dark placeholder-brand-grey text-sm focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-8 py-3.5 rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-95 cursor-pointer shadow-md shadow-brand-orange/25 whitespace-nowrap"
            >
              Search
            </button>
          </form>

          <MarketplaceCategories />

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/services/food"
              className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-7 py-3.5 rounded-xl transition-all duration-300 hover:scale-[1.02] cursor-pointer shadow-md shadow-brand-orange/20"
            >
              Start Shopping
            </Link>
            <Link
              to="/book"
              className="text-brand-dark hover:text-brand-orange font-bold text-sm px-5 py-3.5 rounded-xl border border-brand-border hover:border-brand-orange/30 transition-colors"
            >
              Book a ride
            </Link>
          </div>

          <div className="flex flex-wrap gap-6 sm:gap-8 pt-2 border-t border-brand-border w-full max-w-xl">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-black text-brand-black">{stat.value}</p>
                <p className="text-brand-grey text-xs font-medium uppercase tracking-wider mt-0.5">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="relative w-full flex justify-center lg:justify-end order-1 lg:order-2 py-4 lg:py-8"
        >
          <PhoneMockup />
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
