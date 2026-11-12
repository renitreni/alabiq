import React from "react";
import { motion } from "framer-motion";
import {
  Clock,
  MapPin,
  PlaneTakeoff,
  Shield,
  ShoppingBag,
  Smartphone,
  Sparkles,
  UtensilsCrossed,
  Zap,
} from "lucide-react";

const steps = [
  {
    step: "01",
    Icon: Smartphone,
    title: "Download & sign in",
    desc: "Get the app on iOS or Android. Create your account in under a minute.",
    tags: ["Free app", "Quick setup"],
    accent: "from-brand-orange to-brand-red",
  },
  {
    step: "02",
    Icon: Sparkles,
    title: "Choose what you need",
    desc: "Pick from food delivery, online shopping, or airport pick & drop, all in one place.",
    services: [
      { Icon: UtensilsCrossed, label: "Food" },
      { Icon: ShoppingBag, label: "Shop" },
      { Icon: PlaneTakeoff, label: "Ride" },
    ],
    accent: "from-orange-400 to-brand-orange",
  },
  {
    step: "03",
    Icon: MapPin,
    title: "Track it live",
    desc: "Follow your order on the map with real-time updates until it reaches your door.",
    tags: ["Live GPS", "Instant alerts"],
    accent: "from-brand-red to-orange-500",
  },
];

const perks = [
  { Icon: Zap, label: "Fast delivery" },
  { Icon: MapPin, label: "Live tracking" },
  { Icon: Shield, label: "Secure payments" },
  { Icon: Clock, label: "24/7 support" },
];

const cardVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: (index) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: 0.15 + index * 0.12,
      ease: "easeOut",
    },
  }),
};

const HowItWorks = () => {
  return (
    <section
      id="how-it-works"
      className="relative w-full bg-white px-8 md:px-20 py-24 border-t border-brand-border overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-20 right-0 w-[460px] h-[460px] bg-brand-orange/6 rounded-full blur-[110px]" />
        <div className="absolute bottom-0 -left-24 w-[320px] h-[320px] bg-brand-red/5 rounded-full blur-[90px]" />
      </div>

      <div className="max-w-7xl mx-auto relative">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-10 mb-12 md:mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="max-w-xl"
          >
            <span className="text-brand-orange text-sm font-bold tracking-widest uppercase">
              How It Works
            </span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-2 leading-tight">
              Your daily essentials,{" "}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-orange to-brand-red">
                three easy steps.
              </span>
            </h2>
            <p className="text-brand-grey text-sm md:text-base mt-4 font-medium leading-relaxed">
              No complicated menus or long forms. Just open the app, place your
              order, and watch it come to you.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-wrap gap-3 lg:justify-end"
          >
            {perks.map(({ Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-warm border border-brand-orange/15 text-brand-dark text-xs font-bold"
              >
                <Icon className="w-3.5 h-3.5 text-brand-orange" strokeWidth={2.5} />
                {label}
              </span>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="relative bg-brand-muted/80 border border-brand-border rounded-[2rem] p-6 md:p-10 lg:p-12"
        >
          <div
            className="hidden lg:block absolute top-[4.25rem] left-[12%] right-[12%] h-px bg-linear-to-r from-brand-orange/20 via-brand-orange/50 to-brand-red/20"
            aria-hidden="true"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-6">
            {steps.map((item, index) => (
              <motion.div
                key={item.step}
                custom={index}
                variants={cardVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                className="relative flex flex-col"
              >
                <div className="flex justify-center mb-6 lg:mb-8">
                  <div
                    className={`relative z-10 w-14 h-14 rounded-2xl bg-linear-to-br ${item.accent} flex items-center justify-center shadow-lg shadow-brand-orange/25 ring-4 ring-brand-muted`}
                  >
                    <item.Icon className="w-7 h-7 text-white" strokeWidth={2} />
                  </div>
                </div>

                <div className="flex-1 bg-white border border-brand-border rounded-3xl p-6 md:p-7 shadow-sm transition-all duration-300 hover:border-brand-orange/25 hover:shadow-xl hover:shadow-brand-orange/8 group">
                  <div className="absolute top-5 right-5 text-5xl font-black text-brand-orange/8 group-hover:text-brand-orange/15 transition-colors select-none pointer-events-none">
                    {item.step}
                  </div>

                  <span className="inline-block text-[10px] font-black uppercase tracking-widest text-brand-orange mb-3">
                    Step {item.step}
                  </span>

                  <h3 className="text-xl font-black text-brand-black tracking-tight mb-2 pr-8">
                    {item.title}
                  </h3>

                  <p className="text-brand-grey text-sm leading-relaxed mb-5">
                    {item.desc}
                  </p>

                  {item.services && (
                    <div className="flex flex-wrap gap-2">
                      {item.services.map(({ Icon, label }) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-warm border border-brand-orange/10 text-xs font-bold text-brand-dark"
                        >
                          <Icon className="w-3.5 h-3.5 text-brand-orange" strokeWidth={2.25} />
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.tags && (
                    <div className="flex flex-wrap gap-2">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] font-bold text-brand-grey bg-brand-surface px-3 py-1.5 rounded-lg border border-brand-border"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-6 h-1 w-12 rounded-full bg-linear-to-r from-brand-orange to-brand-red opacity-40 group-hover:opacity-100 group-hover:w-16 transition-all duration-300" />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorks;
