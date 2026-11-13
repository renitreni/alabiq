import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const promos = [
  {
    src: "/promo/all-in-one-app.png",
    alt: "Alabiq All-in-One Delivery App",
    title: "All-in-One Food Delivery App",
    desc: "Riyadh's best restaurants, live tracking, and secure payments — unified in one smart platform.",
    tags: ["Food Delivery", "Live Tracking"],
  },
  {
    src: "/promo/smarter-way-to-move.png",
    alt: "Alabiq, ready for a smarter way to eat",
    title: "Smarter Way to Eat",
    desc: "Now live in Riyadh. Order from your favourite restaurants and get it delivered hot and fresh.",
    tags: ["Live in Riyadh"],
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (index) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      delay: index * 0.12,
      ease: "easeOut",
    },
  }),
};

const PromoBanners = () => {
  return (
    <section
      id="promo"
      className="relative w-full bg-white px-8 md:px-20 py-24 border-t border-brand-border overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute -top-24 right-0 w-[420px] h-[420px] rounded-full bg-brand-orange/6 blur-[100px]" />
        <div className="absolute bottom-0 -left-24 w-[320px] h-[320px] rounded-full bg-brand-red/5 blur-[80px]" />
      </div>

      <div className="max-w-7xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
          className="text-center max-w-2xl mx-auto mb-14 md:mb-16"
        >
          <span className="inline-flex items-center gap-1.5 text-brand-orange text-sm font-bold tracking-widest uppercase">
            <Sparkles className="w-4 h-4" strokeWidth={2.5} />
            Live in Riyadh
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-brand-black tracking-tight mt-3 leading-tight">
            A first look at{" "}
            <span className="text-brand-orange">Alabiq</span>
          </h2>
          <p className="text-brand-grey text-base md:text-lg mt-4 leading-relaxed">
            Food delivery from Riyadh's favourite kitchens — ordered, paid,
            and tracked in one app.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
          {promos.map((promo, index) => (
            <motion.article
              key={promo.title}
              custom={index}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="group flex flex-col bg-brand-muted border border-brand-border rounded-3xl overflow-hidden transition-all duration-300 hover:border-brand-orange/25 hover:shadow-xl hover:shadow-brand-orange/8"
            >
              <div className="relative aspect-[16/10] bg-linear-to-br from-brand-warm via-white to-brand-orange/5 overflow-hidden">
                <img
                  src={promo.src}
                  alt={promo.alt}
                  className="absolute inset-0 w-full h-full object-contain p-4 sm:p-6 transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </div>

              <div className="flex flex-col flex-1 gap-3 p-6 md:p-7 bg-white border-t border-brand-border">
                <h3 className="text-xl md:text-2xl font-black text-brand-black tracking-tight leading-snug">
                  {promo.title}
                </h3>
                <p className="text-brand-grey text-sm md:text-base leading-relaxed">
                  {promo.desc}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {promo.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-brand-warm text-brand-orange border border-brand-orange/15"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PromoBanners;
