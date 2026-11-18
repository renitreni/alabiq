import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UtensilsCrossed,
  MapPin,
  Search,
  ShoppingCart,
  Home,
  Package,
  User,
  Flame,
  Clock,
  Bike,
  UserCircle,
  Check,
  Sparkles,
  Star,
  ChevronDown,
  Signal,
  BatteryFull,
  Phone,
} from "lucide-react";
import { restaurants, flashingRestaurants } from "../data/restaurants";

// Shop screen intentionally absent: the Shop vertical is feature-flagged off
// (SHOP_ENABLED), so the mockup only demos the live surface — food delivery.
const screens = [
  { id: "food", label: "Food", Icon: UtensilsCrossed },
  { id: "track", label: "Live Tracking", Icon: MapPin },
];

const categories = [
  { label: "Food", Icon: UtensilsCrossed, active: true },
  { label: "Deals", Icon: Flame, active: false },
];

const bottomNavItems = [
  { Icon: Home, label: "Home", active: true },
  { Icon: Search, label: "Search", active: false },
  { Icon: Package, label: "Orders", active: false },
  { Icon: User, label: "Profile", active: false },
];

function FoodScreen() {
  const [flashIndex, setFlashIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFlashIndex((prev) => (prev + 1) % flashingRestaurants.length);
    }, 1600);
    return () => clearInterval(timer);
  }, []);

  const flash = flashingRestaurants[flashIndex];

  return (
    <div className="flex flex-col h-full bg-brand-muted text-brand-dark overflow-hidden">
      <div className="relative h-36 mx-3 mt-1 rounded-2xl overflow-hidden shrink-0 shadow-sm">
        <AnimatePresence mode="wait">
          <motion.div
            key={flash.name}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="absolute inset-0"
            style={{ backgroundColor: flash.bg }}
          >
            <img
              src={flash.image}
              alt={flash.name}
              className={`absolute inset-0 w-full h-full ${
                flash.cover ? "object-cover" : "object-contain p-3"
              }`}
            />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-linear-to-t from-brand-black/45 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 p-4 flex flex-col justify-end pointer-events-none">
          {/* Illustrative, like the rest of this mockup — but it still has to
              be a claim we would honour. We do not deliver free. */}
          <span className="text-[10px] font-bold uppercase tracking-wider text-white bg-brand-orange px-2 py-0.5 rounded-full mb-1.5 w-fit shadow-sm">
            Fast delivery
          </span>
          <p className="text-sm font-black leading-tight text-white drop-shadow">
            {flash.name}: {flash.tagline}
          </p>
        </div>
      </div>

      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <p className="text-[11px] text-brand-grey">Deliver to</p>
            <p className="text-sm font-bold text-brand-black flex items-center gap-1">
              Riyadh, Al Olaya
              <ChevronDown className="w-3.5 h-3.5 text-brand-grey" strokeWidth={2.5} />
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-brand-orange flex items-center justify-center shadow-md shadow-brand-orange/25">
            <ShoppingCart className="w-5 h-5 text-white" strokeWidth={2.25} />
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-white border border-brand-border rounded-2xl px-4 py-3 shadow-sm">
          <Search className="w-4 h-4 text-brand-grey shrink-0" strokeWidth={2} />
          <span className="text-brand-grey text-sm">Search restaurants...</span>
        </div>
      </div>

      <div className="flex gap-2 px-3 mb-3">
        {categories.map((cat) => (
          <span
            key={cat.label}
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full whitespace-nowrap ${
              cat.active
                ? "bg-brand-orange text-white shadow-md shadow-brand-orange/25"
                : "bg-white text-brand-grey border border-brand-border"
            }`}
          >
            <cat.Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
            {cat.label}
          </span>
        ))}
      </div>

      <div className="px-3 mb-2 flex items-center gap-1.5">
        <Flame className="w-4 h-4 text-brand-orange" strokeWidth={2.25} />
        <p className="text-sm font-black text-brand-black">Popular near you</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 space-y-3 pb-3">
        {restaurants.map((r) => (
          <div
            key={r.name}
            className="flex gap-3 bg-white border border-brand-border rounded-2xl p-2.5 shadow-sm"
          >
            <div
              className="relative w-20 h-20 rounded-xl shrink-0 overflow-hidden"
              style={{ backgroundColor: r.bg }}
            >
              <img
                src={r.image}
                alt={r.name}
                className={`w-full h-full ${r.cover ? "object-cover" : "object-contain p-1.5"}`}
              />
            </div>
            <div className="flex-1 min-w-0 py-0.5">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-brand-black truncate">{r.name}</p>
                <span className="text-[9px] font-bold bg-brand-warm text-brand-orange px-1.5 py-0.5 rounded-full shrink-0">
                  {r.tag}
                </span>
              </div>
              <p className="text-xs text-brand-grey">{r.cuisine}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="inline-flex items-center gap-1 text-xs text-brand-orange font-black">
                  <Star className="w-3.5 h-3.5 fill-brand-orange" strokeWidth={0} />
                  {r.rating}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-brand-grey">
                  <Clock className="w-3.5 h-3.5" strokeWidth={2} />
                  {r.timeShort}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-around py-3 border-t border-brand-border bg-white shrink-0">
        {bottomNavItems.map((item) => (
          <item.Icon
            key={item.label}
            className={`w-5 h-5 ${
              item.active ? "text-brand-orange" : "text-brand-grey/50"
            }`}
            strokeWidth={item.active ? 2.25 : 2}
          />
        ))}
      </div>
    </div>
  );
}

function TrackScreen() {
  return (
    <div className="flex flex-col h-full bg-brand-muted text-brand-dark overflow-hidden">
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-brand-black flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-brand-orange" strokeWidth={2.25} />
              Order on the way!
            </p>
            <p className="text-xs text-brand-grey mt-0.5">Chowking • #SM-2847</p>
          </div>
          <div className="bg-brand-warm text-brand-orange text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border border-brand-orange/20">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
            LIVE
          </div>
        </div>
      </div>

      <div className="relative mx-3 flex-1 rounded-2xl overflow-hidden border border-brand-border min-h-0 shadow-sm">
        <div className="absolute inset-0 bg-linear-to-br from-brand-warm via-brand-surface to-white" />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 300 400"
          preserveAspectRatio="none"
        >
          <path
            d="M50 340 Q120 280 180 200 T280 80"
            fill="none"
            stroke="var(--color-brand-orange)"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.9"
          />
          <circle cx="50" cy="340" r="10" fill="var(--color-brand-orange)" />
          <circle cx="280" cy="80" r="10" fill="var(--color-brand-red)" />
        </svg>

        <motion.div
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute top-[35%] left-[55%] w-12 h-12 rounded-full bg-brand-orange/15 border-2 border-brand-orange flex items-center justify-center shadow-md shadow-brand-orange/20"
        >
          <Bike className="w-6 h-6 text-brand-orange" strokeWidth={2.25} />
        </motion.div>

        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 border border-brand-border shadow-sm">
          <p className="text-[10px] text-brand-grey">Est. arrival</p>
          <p className="text-2xl font-black text-brand-orange">8 min</p>
        </div>
      </div>

      <div className="mx-3 mt-3 bg-white border border-brand-border rounded-2xl p-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-brand-warm flex items-center justify-center border border-brand-orange/20">
            <UserCircle className="w-7 h-7 text-brand-orange" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-brand-black">Ahmed is delivering</p>
            <p className="text-xs text-brand-grey">Delivery rider • 2 min away</p>
          </div>
          <button className="bg-brand-orange text-white p-2.5 rounded-xl shadow-md shadow-brand-orange/25">
            <Phone className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="mt-4 flex gap-1">
          {["Preparing", "On the way", "Delivered"].map((step, i) => (
            <div key={step} className="flex-1">
              <div
                className={`h-2 rounded-full ${i < 2 ? "bg-brand-orange" : "bg-brand-surface"}`}
              />
              <p
                className={`text-[9px] mt-1.5 font-semibold ${
                  i < 2 ? "text-brand-black" : "text-brand-grey"
                }`}
              >
                {step}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="h-4 shrink-0" />
    </div>
  );
}

const screenComponents = {
  food: FoodScreen,
  track: TrackScreen,
};

const PhoneMockup = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % screens.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const ActiveScreen = screenComponents[screens[activeIndex].id];

  return (
    <div className="relative w-full max-w-[480px] mx-auto lg:max-w-none">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[85%] bg-brand-orange/20 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute top-1/4 right-0 w-32 h-32 bg-orange-400/10 rounded-full blur-[60px] pointer-events-none" />

      <motion.div
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="relative flex flex-col items-center"
      >
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute -top-2 right-0 sm:right-4 z-30 bg-white text-brand-dark rounded-2xl px-4 py-3 shadow-xl border border-brand-border flex items-center gap-3 max-w-[200px]"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-orange flex items-center justify-center shrink-0 shadow-sm shadow-brand-orange/25">
            <Check className="w-5 h-5 text-white" strokeWidth={3} />
          </div>
          <div>
            <p className="text-xs font-black leading-tight">Order confirmed!</p>
            <p className="text-[10px] text-brand-grey mt-0.5">Arriving in 8 min</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7 }}
          className="absolute left-0 sm:-left-6 top-[30%] z-30 bg-white border border-brand-border rounded-2xl px-5 py-4 shadow-xl hidden md:block"
        >
          <p className="text-xs text-brand-grey font-medium">Average delivery</p>
          <p className="text-3xl font-black text-brand-black mt-1">~30 min</p>
          <p className="text-[10px] text-brand-orange font-bold mt-1">Within 15 km radius</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.9 }}
          className="absolute right-0 sm:-right-4 bottom-[28%] z-30 bg-brand-orange rounded-2xl px-5 py-4 shadow-2xl shadow-brand-orange/40 hidden md:block"
        >
          <p className="text-white text-3xl font-black leading-none flex items-center gap-2">
            Live
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
          </p>
          <p className="text-white/60 text-[10px] mt-1.5">GPS tracking on every order</p>
        </motion.div>

        <div
          className="relative w-full max-w-[255px] sm:max-w-[380px] lg:max-w-[400px] xl:max-w-[420px] mx-auto"
          style={{ perspective: "1200px" }}
        >
          <motion.div
            whileHover={{ rotateY: -6, rotateX: 3, scale: 1.02 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="relative"
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className="absolute -inset-[3px] rounded-[3.25rem] bg-linear-to-br from-brand-orange via-orange-400/50 to-brand-orange/20 opacity-80" />

            <div className="relative bg-linear-to-b from-brand-dark to-brand-black rounded-[3.15rem] p-[10px] shadow-[0_40px_80px_-20px_rgba(17,24,39,0.35)]">
              <div className="absolute top-[18px] left-1/2 -translate-x-1/2 z-30 w-[100px] h-[28px] bg-brand-black rounded-full border border-brand-border/20 flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
                <div className="w-12 h-1.5 rounded-full bg-white/15" />
              </div>

              <div className="relative bg-brand-light rounded-[2.75rem] overflow-hidden border border-brand-border/30">
                <div className="flex items-center justify-between px-7 pt-4 pb-2 text-[11px] text-brand-grey font-medium bg-brand-light">
                  <span className="text-brand-black font-semibold">9:41</span>
                  <div className="flex gap-2 items-center text-[10px] text-brand-dark">
                    <Signal className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>5G</span>
                    <BatteryFull className="w-4 h-4" strokeWidth={2} />
                  </div>
                </div>

                <div className="h-[390px] sm:h-[560px] lg:h-[580px] relative overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={screens[activeIndex].id}
                      initial={{ opacity: 0, scale: 0.96, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -12 }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                      className="absolute inset-0"
                    >
                      <ActiveScreen />
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="flex justify-center py-3 bg-brand-light">
                  <div className="w-28 h-1 rounded-full bg-brand-border" />
                </div>
              </div>
            </div>

            <div className="absolute right-[-4px] top-28 w-1.5 h-14 bg-brand-dark rounded-r-md" />
            <div className="absolute left-[-4px] top-24 w-1.5 h-8 bg-brand-dark rounded-l-md" />
            <div className="absolute left-[-4px] top-36 w-1.5 h-14 bg-brand-dark rounded-l-md" />
          </motion.div>
        </div>

        <div className="flex items-center gap-2 mt-8 p-1.5 bg-white border border-brand-border rounded-2xl shadow-sm">
          {screens.map((screen, i) => {
            const TabIcon = screen.Icon;
            return (
              <button
                key={screen.id}
                onClick={() => setActiveIndex(i)}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer ${
                  i === activeIndex
                    ? "bg-brand-orange text-white shadow-md shadow-brand-orange/25 scale-105"
                    : "text-brand-grey hover:text-brand-dark hover:bg-brand-surface"
                }`}
                aria-label={`Show ${screen.label} screen`}
              >
                <TabIcon
                  className="w-4 h-4"
                  strokeWidth={i === activeIndex ? 2.25 : 2}
                />
                {screen.label}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

export default PhoneMockup;
