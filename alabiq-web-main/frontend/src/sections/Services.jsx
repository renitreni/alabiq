import React from 'react';
import { motion } from 'framer-motion';
import { UtensilsCrossed, ShoppingBag, PlaneTakeoff, ArrowRight } from 'lucide-react';
import LogoGrid from './Logo';

const servicesData = [
  {
    id: 1,
    Icon: UtensilsCrossed,
    title: "Food Delivery",
    desc: "Order from the best local restaurants and fast food chains with lightning-fast delivery to your doorstep.",
    tag: "Popular",
    link: "/services/food",
    accent: "from-brand-orange to-brand-red",
  },
  {
    id: 2,
    Icon: ShoppingBag,
    title: "E-Commerce Shop",
    desc: "Browse trending products, daily essentials, and tech gadgets. Seamless shopping experience guaranteed.",
    tag: "New",
    link: "/services/shop",
    accent: "from-orange-400 to-brand-orange",
  },
  {
    id: 3,
    Icon: PlaneTakeoff,
    title: "Pick & Drop",
    desc: "Hassle-free airport transfers. Book a reliable ride from your house straight to the airport, or from the airport back to your home.",
    tag: "Premium",
    link: "/services/pick-drop",
    accent: "from-brand-red to-orange-500",
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: (index) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      delay: index * 0.15,
      ease: "easeOut",
    },
  }),
};

const Services = () => {
  return (
    <section id="features" className="w-full bg-brand-muted px-8 md:px-20 py-24 border-t border-brand-border scroll-mt-24">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center md:text-left mb-16 max-w-2xl"
        >
          <span className="text-brand-orange text-sm font-bold tracking-widest uppercase">
            Marketplace
          </span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-2 leading-tight">
            Shop food, groceries &amp; more — <br className="hidden md:block" />
            <span className="text-brand-orange">delivered to your door.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {servicesData.map((service, index) => (
            <motion.a
              key={service.id}
              href={service.link}
              custom={index}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              className="group relative bg-white border border-brand-border rounded-3xl p-8 flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-orange/25 hover:shadow-xl hover:shadow-brand-orange/10"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300 from-brand-orange to-brand-red" />

              <div className="flex items-start justify-between mb-6">
                <div
                  className={`w-14 h-14 rounded-2xl bg-linear-to-br ${service.accent} flex items-center justify-center shadow-lg shadow-brand-orange/20 group-hover:scale-105 transition-transform duration-300`}
                >
                  <service.Icon className="w-7 h-7 text-white" strokeWidth={2} />
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-brand-warm text-brand-orange rounded-full border border-brand-orange/15">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                  {service.tag}
                </span>
              </div>

              <h3 className="text-xl font-black text-brand-black mb-3 tracking-tight group-hover:text-brand-orange transition-colors">
                {service.title}
              </h3>

              <p className="text-brand-grey text-sm leading-relaxed mb-8 font-medium flex-1">
                {service.desc}
              </p>

              <span className="inline-flex items-center gap-2 text-sm font-bold text-brand-dark group-hover:text-brand-orange transition-colors">
                Explore Service
                <ArrowRight
                  className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-300"
                  strokeWidth={2.5}
                />
              </span>
            </motion.a>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <a
            href="/services"
            className="inline-flex items-center gap-2 text-sm font-bold text-brand-orange hover:text-brand-red transition-colors"
          >
            See all services
            <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
          </a>
        </motion.div>
      </div>

      <LogoGrid />
    </section>
  );
};

export default Services;
