import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  UtensilsCrossed,
  MapPin,
  Shield,
  Clock,
  BadgeCheck,
  Flame,
  Bike,
} from "lucide-react";
import PhoneMockup from "../components/PhoneMockup";
import MarketplaceCategories from "./MarketplaceCategories";
import MobileMarketplaceHome from "./MobileMarketplaceHome";

// Value props, not vanity metrics — every claim here matches a real feature in
// the backend (15 km delivery radius, SSE live tracking, STC Pay proof flow).
const stats = [
  { value: "15 km", label: "Delivery radius" },
  { value: "Live GPS", label: "Order tracking" },
  { value: "STC Pay", label: "Secure payments" },
  { value: "24/7", label: "Customer support" },
];

const highlights = [
  {
    Icon: UtensilsCrossed,
    title: "Real restaurant kitchens",
    desc: "Menus come straight from verified partner restaurants — what you see is what they cook.",
  },
  {
    Icon: MapPin,
    title: "Tracked door to door",
    desc: "Follow your rider on live GPS from the moment your order leaves the kitchen.",
  },
  {
    Icon: Shield,
    title: "Verified payments",
    desc: "Pay by STC Pay transfer, upload your receipt, and we verify it before dispatch.",
  },
];

const easeOut = [0.22, 1, 0.36, 1];

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
            Now delivering food across Riyadh
          </motion.div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight text-brand-black leading-[1.05]">
            Craving something?{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-orange to-brand-red">
              It's on its way.
            </span>
          </h1>

          <p className="text-brand-grey text-base md:text-lg leading-relaxed max-w-lg">
            Alabiq brings Riyadh's best kitchens to your doorstep. Browse real
            menus from verified partner restaurants, pay securely with STC Pay,
            and watch your order arrive on live GPS — hot, fresh, and right on
            time.
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
                placeholder="Search restaurants or dishes..."
                aria-label="Search restaurants or dishes"
                className="w-full bg-transparent text-brand-dark placeholder-brand-grey text-sm focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-8 py-3.5 rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-95 cursor-pointer shadow-md shadow-brand-orange/25 whitespace-nowrap"
            >
              Find Food
            </button>
          </form>

          <MarketplaceCategories />

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/services/food"
              className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-7 py-3.5 rounded-xl transition-all duration-300 hover:scale-[1.02] cursor-pointer shadow-md shadow-brand-orange/20"
            >
              Order Food Now
            </Link>
            <a
              href="#how-it-works"
              className="text-brand-dark hover:text-brand-orange font-bold text-sm px-5 py-3.5 rounded-xl border border-brand-border hover:border-brand-orange/30 transition-colors"
            >
              See How It Works
            </a>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 w-full max-w-xl">
            {highlights.map(({ Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 + i * 0.12, duration: 0.5, ease: easeOut }}
                className="bg-white/70 backdrop-blur-sm border border-brand-border rounded-2xl p-4"
              >
                <span className="w-9 h-9 rounded-xl bg-brand-warm border border-brand-orange/15 flex items-center justify-center mb-3">
                  <Icon className="w-4.5 h-4.5 text-brand-orange" strokeWidth={2.2} />
                </span>
                <p className="text-sm font-black text-brand-black leading-tight">{title}</p>
                <p className="text-xs text-brand-grey font-medium mt-1.5 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="flex flex-wrap gap-6 sm:gap-8 pt-4 border-t border-brand-border w-full max-w-xl">
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

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.5 }}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 lg:left-auto lg:right-6 lg:translate-x-0 z-30 flex items-center gap-2.5 bg-white border border-brand-border rounded-2xl px-4 py-3 shadow-xl"
          >
            <span className="w-9 h-9 rounded-xl bg-brand-orange/10 flex items-center justify-center">
              <BadgeCheck className="w-5 h-5 text-brand-orange" strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-xs font-black text-brand-black leading-tight">Verified partners</p>
              <p className="text-[10px] text-brand-grey mt-0.5">Every restaurant is vetted</p>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="absolute bottom-0 inset-x-0 pointer-events-none" aria-hidden="true">
        <div className="max-w-7xl mx-auto px-6 md:px-16 lg:px-20 pb-5 flex items-center justify-center gap-8 text-[11px] font-bold uppercase tracking-widest text-brand-grey/70">
          <span className="inline-flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-brand-orange" strokeWidth={2.2} />
            Fresh from the kitchen
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5">
            <Bike className="w-3.5 h-3.5 text-brand-orange" strokeWidth={2.2} />
            Riders on standby
          </span>
          <span className="hidden md:inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-brand-orange" strokeWidth={2.2} />
            Open late, every day
          </span>
        </div>
      </div>
    </section>
  );
};

export default Hero;
