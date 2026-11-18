// ---------------------------------------------------------------------
// Homepage store grid. Every card is a live merchant from
// GET /api/shop/stores — list one in admin and it appears here, delist it
// and it is gone.
// ---------------------------------------------------------------------
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { useMarketingStores } from "../lib/useMarketingPartners";
import { deliveryFeeFromLabel } from "../portal/lib/constants";
import MarketingListingGrid from "../components/MarketingListingCard";

const Shop = () => {
  const navigate = useNavigate();
  const { partners: stores, total, loading, failed, delivery } = useMarketingStores();

  const unknown = loading || failed;
  const stats = [
    { value: unknown ? "—" : String(total), label: "Partner stores" },
    { value: (unknown ? null : deliveryFeeFromLabel(delivery)) ?? "—", label: "Delivery" },
  ];

  return (
    <section
      id="shop"
      className="relative w-full bg-brand-muted px-8 md:px-20 py-24 border-t border-brand-border overflow-hidden"
    >
      <div
        className="absolute top-0 right-0 w-[520px] h-[520px] bg-brand-orange/5 rounded-full blur-[120px] pointer-events-none"
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
              <ShoppingBag className="w-4 h-4" strokeWidth={2.5} />
              Alabiq E-commerce
            </span>

            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-3 leading-tight">
              Groceries from trusted stores.{" "}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-orange to-brand-red">
                At your doorstep.
              </span>
            </h2>

            <p className="text-brand-grey text-sm md:text-base mt-4 font-medium leading-relaxed">
              Browse products from listed partner stores near you, with live
              delivery tracking.
            </p>

            <Link
              to="/shop"
              className="inline-flex items-center gap-2 mt-5 text-sm font-bold text-brand-orange hover:gap-3 transition-all"
            >
              See all stores
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
                <p className="text-2xl md:text-3xl font-black text-brand-black">
                  {stat.value}
                </p>
                <p className="text-brand-grey text-xs font-semibold uppercase tracking-wider mt-0.5">
                  {stat.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        <MarketingListingGrid
          listings={stores}
          loading={loading}
          failed={failed}
          columns="sm:grid-cols-2 lg:grid-cols-3"
          ctaLabel="Shop Now"
          onOpen={(store) => navigate(`/shop/s/${store.id}`)}
          emptyText="No stores are listed yet. New partners appear here the moment they go live."
        />
      </div>
    </section>
  );
};

export default Shop;
