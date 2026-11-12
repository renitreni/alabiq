import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Info,
  Sparkles,
  Lightbulb,
  HelpCircle,
  Headphones,
  LogOut,
  LayoutDashboard,
  UserCircle,
  ShoppingCart,
} from "lucide-react";
import { useAuth } from "../portal/lib/AuthProvider";
import { roleHome } from "../portal/lib/constants";
import { UserMenu } from "../portal/components/ui";
import useScrollToHash from "../hooks/useScrollToHash";

// Absolute paths (not bare "#anchor") since Navbar renders on more than one
// route (/, /services) — a bare hash would try to jump within whatever page
// it's currently on instead of back to the landing page section.
const menuLinks = [
  { name: "Home",         to: "/",              Icon: Home },
  { name: "Services",     to: "/services",      Icon: Sparkles },
  { name: "How It Works", to: "/#how-it-works", Icon: Lightbulb },
  // Follows scroll order: About now sits near the bottom of the landing page,
  // so listing it second sent people to the end of a page they had not read.
  { name: "About",        to: "/#about",        Icon: Info },
  { name: "FAQ",          to: "/#faq",          Icon: HelpCircle },
  { name: "Support",      to: "/support",       Icon: Headphones },
];

function AuthActions({ mobile = false, onNavigate }) {
  const { session, user, profile, role, profileLoading, signOut } = useAuth();

  const wrapClass = mobile
    ? "flex flex-col gap-2"
    : "flex items-center gap-2 shrink-0";

  if (session && profileLoading) {
    return (
      <div className={wrapClass}>
        <span className="text-xs font-bold text-brand-grey px-3 py-2">Loading…</span>
      </div>
    );
  }

  if (session && role) {
    const dashboardPath = role !== "passenger" ? roleHome(role) : null;
    const dashboardLabel =
      role === "admin"
        ? "Admin dashboard"
        : role === "driver"
          ? "Driver dashboard"
          : role === "merchant"
            ? "Business dashboard"
            : null;

    return (
      <div className={wrapClass}>
        {dashboardPath && (
          <Link
            to={dashboardPath}
            onClick={onNavigate}
            className={
              mobile
                ? "flex items-center justify-center gap-2 w-full font-black py-3.5 rounded-2xl text-sm text-brand-dark border border-brand-border cursor-pointer"
                : "inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-bold px-3 py-2 rounded-full cursor-pointer text-brand-dark hover:text-brand-orange hover:bg-orange-50 transition-colors"
            }
          >
            <LayoutDashboard className="w-4 h-4" />
            {mobile ? dashboardLabel : "Dashboard"}
          </Link>
        )}

        {role === "passenger" && (
          <>
            <Link to="/services/food" onClick={onNavigate}>
              {mobile ? (
                <span className="block text-center w-full bg-brand-orange text-white font-black py-4 rounded-2xl text-sm cursor-pointer shadow-lg shadow-brand-orange/25">
                  Order Now
                </span>
              ) : (
                <motion.span
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  className="inline-block whitespace-nowrap bg-brand-orange text-white text-xs font-black px-5 py-3 rounded-full cursor-pointer shadow-md shadow-brand-orange/25 hover:shadow-xl hover:shadow-brand-orange/30 transition-shadow duration-300"
                >
                  Order Now
                </motion.span>
              )}
            </Link>
            <Link to="/book" onClick={onNavigate}>
              {mobile ? (
                <span className="block text-center w-full font-black py-3.5 rounded-2xl text-sm text-brand-dark border border-brand-border cursor-pointer">
                  Book a Ride
                </span>
              ) : (
                <span className="inline-block whitespace-nowrap text-xs font-black px-4 py-3 rounded-full cursor-pointer text-brand-dark border border-brand-border hover:border-brand-orange/40 hover:text-brand-orange transition-colors">
                  Book a Ride
                </span>
              )}
            </Link>
          </>
        )}

        {mobile ? (
          <>
            <Link
              to="/profile"
              onClick={onNavigate}
              className="flex items-center justify-center gap-2 w-full font-black py-3 rounded-2xl text-sm text-brand-dark border border-brand-border cursor-pointer"
            >
              <UserCircle className="w-4 h-4" />
              {profile?.fullName || user?.email?.split("@")[0] || "My Profile"}
            </Link>
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                signOut();
              }}
              className="flex items-center justify-center gap-2 w-full font-black py-3 rounded-2xl text-sm text-brand-grey border border-brand-border cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </>
        ) : (
          // Desktop: avatar + name dropdown (My Profile / Order History /
          // Payment methods / Logout) — same menu as the portal header.
          <UserMenu />
        )}
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <Link
        to="/login"
        onClick={onNavigate}
        className={
          mobile
            ? "block text-center w-full font-black py-3 rounded-2xl text-sm text-brand-dark border border-brand-border cursor-pointer"
            : "whitespace-nowrap text-sm font-bold px-3 py-2 rounded-full cursor-pointer text-brand-dark hover:text-brand-orange transition-colors"
        }
      >
        Log in
      </Link>
      <Link to="/services/food" onClick={onNavigate}>
        {mobile ? (
          <span className="block text-center w-full bg-brand-orange text-white font-black py-4 rounded-2xl text-sm cursor-pointer shadow-lg shadow-brand-orange/25">
            Order Now
          </span>
        ) : (
          <motion.span
            whileHover={{ scale: 1.05, y: -1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            className="inline-block whitespace-nowrap bg-brand-orange text-white text-xs font-black px-5 py-3 rounded-full cursor-pointer shadow-md shadow-brand-orange/25 hover:shadow-xl hover:shadow-brand-orange/30 transition-shadow duration-300"
          >
            Order Now
          </motion.span>
        )}
      </Link>
      <Link
        to="/signup"
        onClick={onNavigate}
        className={
          mobile
            ? "block text-center w-full font-black py-3 rounded-2xl text-sm text-brand-grey border border-brand-border cursor-pointer"
            : "whitespace-nowrap text-sm font-bold px-3 py-2 rounded-full cursor-pointer text-brand-grey hover:text-brand-orange transition-colors"
        }
      >
        Sign up
      </Link>
    </div>
  );
}

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hoveredLink, setHoveredLink] = useState(null);
  const location = useLocation();

  // Navbar is the one component every marketing page shares, so this is
  // where cross-page anchor links (e.g. "About" from /services) get their
  // scroll-into-view behavior.
  useScrollToHash();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
      <motion.nav
        animate={{
          backgroundColor: scrolled
            ? "rgba(255,255,255,0.97)"
            : "rgba(255,255,255,0.80)",
          boxShadow: scrolled
            ? "0 8px 32px rgba(249,115,22,0.10), 0 2px 8px rgba(0,0,0,0.06)"
            : "0 2px 4px rgba(0,0,0,0.04)",
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full h-20 border-b border-brand-border
                   px-6 md:px-20 flex items-center justify-between
                   fixed top-0 left-0 z-50"
      >
        <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="Alabiq home">
          <motion.div
            whileHover={{ scale: 1.1, rotate: -5 }}
            transition={{ type: "spring", stiffness: 320, damping: 14 }}
            className="w-10 h-10 shrink-0 flex items-center justify-center"
          >
            <img
              src="/mappia-icon-transparent.png"
              alt=""
              aria-hidden="true"
              className="w-full h-full object-contain"
            />
          </motion.div>
          <span className="text-lg font-black tracking-tight whitespace-nowrap text-brand-black">
            Smart <span className="text-brand-orange">Mappia</span>
          </span>
        </Link>

        <div className="hidden 2xl:flex items-center gap-1 ml-auto mr-0">
          <ul className="flex items-center gap-0.5 text-sm font-semibold">
            {menuLinks.map((link, index) => {
              const active = link.to === location.pathname;
              return (
              <li key={index}>
                <Link
                  to={link.to}
                  onMouseEnter={() => setHoveredLink(index)}
                  onMouseLeave={() => setHoveredLink(null)}
                  className={`relative flex items-center whitespace-nowrap px-2.5 py-2 rounded-full
                             transition-colors duration-150 ${
                               active
                                 ? "text-brand-orange"
                                 : "text-brand-grey hover:text-brand-orange"
                             }`}
                >
                  {(hoveredLink === index || active) && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 bg-orange-50 rounded-full"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{link.name}</span>
                </Link>
              </li>
              );
            })}
          </ul>

          <span className="w-px h-6 bg-brand-border mx-2" aria-hidden="true" />

          <Link
            to="/services/food"
            title="Browse marketplace"
            aria-label="Browse marketplace"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-orange/10 text-brand-orange hover:bg-brand-orange hover:text-white transition-colors shrink-0"
          >
            <ShoppingCart className="w-4 h-4" />
          </Link>

          <AuthActions />
        </div>

        <div className="flex items-center gap-1 2xl:hidden">
          {location.pathname === "/" && (
            <Link
              to="/shop"
              title="Cart"
              aria-label="Cart"
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-brand-orange hover:bg-orange-50 transition-colors"
            >
              <ShoppingCart className="w-5 h-5" />
            </Link>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
            className="block focus:outline-none z-50 cursor-pointer p-2 rounded-xl hover:bg-orange-50 transition-colors"
          >
            <div className="w-6 h-[18px] flex flex-col justify-between">
              <motion.span
                animate={isOpen ? { rotate: 45, y: 8 } : { rotate: 0, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="block h-0.5 w-full bg-brand-dark rounded-full"
              />
              <motion.span
                animate={isOpen ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.18 }}
                className="block h-0.5 w-full bg-brand-dark rounded-full"
              />
              <motion.span
                animate={isOpen ? { rotate: -45, y: -8 } : { rotate: 0, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="block h-0.5 w-full bg-brand-dark rounded-full"
              />
            </div>
          </button>
        </div>
      </motion.nav>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/30 z-40 2xl:hidden"
            />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
              style={{ willChange: "transform" }}
              className="fixed top-0 right-0 h-full w-72 bg-white
                         rounded-l-3xl z-45 2xl:hidden
                         flex flex-col justify-between shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1
                              bg-gradient-to-r from-brand-orange/50 to-brand-orange
                              rounded-tl-3xl" />

              <div className="pt-28 px-6">
                <ul className="flex flex-col gap-0.5">
                  {menuLinks.map((link, index) => {
                    const active = link.to === location.pathname;
                    return (
                    <li key={index}>
                      <Link
                        to={link.to}
                        onClick={() => setIsOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl
                                   hover:text-brand-orange
                                   hover:bg-orange-50 transition-all duration-150
                                   font-semibold text-base group ${
                                     active
                                       ? "text-brand-orange bg-orange-50"
                                       : "text-brand-grey"
                                   }`}
                      >
                        <link.Icon className="w-5 h-5 text-brand-orange shrink-0" strokeWidth={2} />
                        <span>{link.name}</span>
                        <span className="ml-auto text-brand-orange text-sm
                                         opacity-0 group-hover:opacity-100
                                         transition-opacity duration-150">
                          →
                        </span>
                      </Link>
                    </li>
                    );
                  })}
                </ul>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.38 }}
                className="p-6"
              >
                <AuthActions mobile onNavigate={() => setIsOpen(false)} />
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
