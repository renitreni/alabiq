import React from 'react';
import { motion } from 'framer-motion';
// Live listed restaurants, the same source the grid uses. A partner is
// onboarded in the admin portal and appears in both places at once.
import { useMarketingPartners } from '../lib/useMarketingPartners';

const PartnerCard = ({ partner }) => (
  <div className="group relative shrink-0 mx-5 sm:mx-7 md:mx-8 z-0 hover:z-20 transition-[transform,z-index] duration-300">
    <div className="w-36 h-36 sm:w-40 sm:h-40 md:w-44 md:h-44 lg:w-48 lg:h-48 flex items-center justify-center bg-white border border-brand-border rounded-3xl p-6 sm:p-7 transition-all duration-300 ease-out group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-brand-orange/15 group-hover:border-brand-orange/30">
      {/* Already a usable src: admin-uploaded logos are absolute Supabase
          Storage URLs. Prefixing "/" here would produce "/https://...". */}
      <img
        src={partner.logo}
        alt={`${partner.name} logo`}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  </div>
);

const LogoGrid = () => {
  const { partners } = useMarketingPartners();
  // A logo wall needs logos. A listed partner whose admin has not uploaded
  // artwork yet is still on the grid below — it just cannot be in the wall.
  const withLogos = partners.filter((p) => p.logo);

  // Doubled on purpose: the partner-marquee keyframe in index.css translates
  // 0 -> -50%, so exactly two copies make the loop seamless. Changing this to
  // 3x without editing that keyframe will make the track visibly jump.
  const marqueeItems = [...withLogos, ...withLogos];

  // An empty band with a heading over it reads as a broken page, so the whole
  // section stands down until there is something to show.
  if (!withLogos.length) return null;

  return (
    <div className="mt-24 max-w-7xl mx-auto">
      <div className="relative flex items-center justify-center mb-12">
        <div className="absolute inset-x-0 h-px bg-linear-to-r from-transparent via-brand-border to-transparent" />
        <span className="relative bg-brand-muted px-5 text-brand-orange text-sm font-bold tracking-widest uppercase">
          Featured Restaurant Partners
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative"
      >
        <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-linear-to-r from-brand-muted to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-linear-to-l from-brand-muted to-transparent z-10 pointer-events-none" />

        <div className="overflow-hidden py-10 sm:py-12">
          {/* Keyed on the count so that when admin-featured partners merge in,
              the track remounts and restarts from offset 0 instead of holding a
              -50% offset that no longer matches its new width. */}
          <div key={withLogos.length} className="partner-marquee-track flex w-max items-center">
            {marqueeItems.map((partner, index) => (
              <PartnerCard key={`${partner.id}-${index}`} partner={partner} />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LogoGrid;
