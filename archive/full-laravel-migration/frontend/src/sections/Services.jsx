import React from 'react';
import { motion } from 'framer-motion';
import { UtensilsCrossed, MapPin, Shield, Clock, ArrowRight } from 'lucide-react';
import LogoGrid from './Logo';

const foodFeatures = [
  { Icon: MapPin, title: 'Live GPS tracking', desc: 'Watch your rider move from the kitchen to your door in real time.' },
  { Icon: Shield, title: 'Verified payments', desc: 'Pay by STC Pay transfer and upload your receipt — we verify before dispatch.' },
  { Icon: Clock, title: 'Within 15 km', desc: 'We deliver inside a 15 km radius so your food always arrives hot and fresh.' },
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
            Our Services
          </span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-2 leading-tight">
            Riyadh's kitchens,{" "}
            <br className="hidden md:block" />
            <span className="text-brand-orange">delivered to your door.</span>
          </h2>
          <p className="text-brand-grey text-sm md:text-base mt-4 font-medium leading-relaxed">
            Alabiq is a food delivery service built for Riyadh — real restaurant
            menus, secure STC Pay checkout, and live tracking on every order.
          </p>
        </motion.div>

        <div className="max-w-5xl">
          <motion.a
            href="/services/food"
            custom={0}
            variants={cardVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            className="group relative bg-white border border-brand-border rounded-3xl p-8 md:p-10 flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-orange/25 hover:shadow-xl hover:shadow-brand-orange/10"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300 from-brand-orange to-brand-red" />

            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-brand-orange to-brand-red flex items-center justify-center shadow-lg shadow-brand-orange/20 group-hover:scale-105 transition-transform duration-300">
                <UtensilsCrossed className="w-7 h-7 text-white" strokeWidth={2} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-brand-warm text-brand-orange rounded-full border border-brand-orange/15">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                Live now
              </span>
            </div>

            <h3 className="text-2xl font-black text-brand-black mb-3 tracking-tight group-hover:text-brand-orange transition-colors">
              Food Delivery
            </h3>

            <p className="text-brand-grey text-sm md:text-base leading-relaxed mb-8 font-medium max-w-2xl">
              Order from the best local restaurants and fast food chains with
              lightning-fast delivery to your doorstep. Browse full menus, track
              your rider live, and pay securely — all in one place.
            </p>

            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              {foodFeatures.map(({ Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-brand-muted/60 border border-brand-border rounded-2xl p-4"
                >
                  <span className="w-9 h-9 rounded-xl bg-brand-warm border border-brand-orange/15 flex items-center justify-center mb-3">
                    <Icon className="w-4.5 h-4.5 text-brand-orange" strokeWidth={2.2} />
                  </span>
                  <p className="text-sm font-black text-brand-black">{title}</p>
                  <p className="text-xs text-brand-grey font-medium mt-1 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            <span className="inline-flex items-center gap-2 text-sm font-bold text-brand-dark group-hover:text-brand-orange transition-colors">
              Browse restaurants
              <ArrowRight
                className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-300"
                strokeWidth={2.5}
              />
            </span>
          </motion.a>
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
