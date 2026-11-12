import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Clock, MapPin, Shield, Sparkles, ArrowRight } from "lucide-react";
import CustomDropdown from "../components/CustomDropdown";
import { Field } from "../portal/components/ui";
import { AIRPORTS, fareBreakdown, airportDropdownOptions } from "../portal/lib/constants";
import {
  DirectionToggle,
  FareSummary,
  LegalConsentNote,
} from "../components/booking/BookingUI";

const FARE = fareBreakdown();
const DISTRICTS = ["Malaz", "Sulamania", "Olaya", "Batha"];

const AIRPORT_OPTIONS = airportDropdownOptions();
const DISTRICT_OPTIONS = DISTRICTS.map((dist) => ({ value: dist, label: `${dist} District` }));

const perks = [
  { Icon: MapPin, text: "Olaya, Sulamania, Malaz & Batha" },
  { Icon: Shield, text: "Fixed rates, no hidden fees" },
  { Icon: Clock, text: "24/7 secure app access" },
];

const PickDrop = () => {
  const [serviceType, setServiceType] = useState("house_to_airport");
  const [airportId, setAirportId] = useState(AIRPORTS[0].id);
  const [district, setDistrict] = useState("Olaya");

  const bookUrl = useMemo(() => {
    const params = new URLSearchParams({
      direction: serviceType,
      airport: airportId,
      district,
    });
    return `/book?${params.toString()}`;
  }, [serviceType, airportId, district]);

  return (
    <section id="pick-drop" className="w-full bg-brand-muted px-6 md:px-16 lg:px-20 py-20 md:py-28 border-t border-brand-border relative overflow-hidden">
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-brand-orange/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-brand-orange/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 text-brand-orange text-xs font-bold tracking-widest uppercase bg-brand-warm border border-brand-orange/20 rounded-full px-3 py-1">
              <Sparkles size={14} />
              Premium Airport Transfer
            </span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-5 leading-[1.1]">
              Book your airport<br />
              <span className="text-brand-orange">Pick & Drop</span> in seconds
            </h2>
            <p className="text-brand-grey text-base md:text-lg mt-5 leading-relaxed max-w-lg">
              Door-to-terminal rides across Riyadh. Choose your direction, see your fare instantly, and book with confidence.
            </p>

            <div className="mt-8 grid gap-3">
              {perks.map(({ Icon, text }) => (
                <div key={text} className="flex items-center gap-3 bg-white/70 border border-brand-border rounded-xl px-4 py-3">
                  <span className="w-8 h-8 rounded-lg bg-brand-warm text-brand-orange flex items-center justify-center shrink-0">
                    <Icon size={16} />
                  </span>
                  <span className="text-brand-dark text-sm font-medium">{text}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 hidden lg:flex items-center gap-3 text-sm text-brand-grey">
              <span className="flex items-center gap-1.5 font-bold text-brand-dark">
                <span className="w-6 h-6 rounded-full bg-brand-orange text-white text-xs flex items-center justify-center">1</span>
                Estimate
              </span>
              <ArrowRight size={14} />
              <span className="flex items-center gap-1.5 font-bold text-brand-dark">
                <span className="w-6 h-6 rounded-full bg-brand-surface text-brand-grey text-xs flex items-center justify-center border border-brand-border">2</span>
                Book
              </span>
              <ArrowRight size={14} />
              <span className="flex items-center gap-1.5 font-bold text-brand-dark">
                <span className="w-6 h-6 rounded-full bg-brand-surface text-brand-grey text-xs flex items-center justify-center border border-brand-border">3</span>
                Track live
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="bg-white border border-brand-border rounded-3xl shadow-xl shadow-brand-orange/5 overflow-visible"
          >
            <div className="px-6 md:px-8 pt-7 pb-5 border-b border-brand-border bg-gradient-to-br from-brand-warm/80 to-white">
              <h3 className="text-lg font-black text-brand-black tracking-tight">Quick fare estimate</h3>
              <p className="text-xs text-brand-grey mt-1">Select your trip and the price updates instantly</p>
            </div>

            <div className="px-6 md:px-8 py-6 space-y-6 overflow-visible">
              <div>
                <p className="text-[10px] font-bold text-brand-grey uppercase tracking-widest mb-3">Trip direction</p>
                <DirectionToggle value={serviceType} onChange={setServiceType} variant="inline" />
              </div>

              <div className="grid sm:grid-cols-2 gap-4 overflow-visible">
                <Field label="Airport terminal">
                  <CustomDropdown
                    value={airportId}
                    onChange={setAirportId}
                    options={AIRPORT_OPTIONS}
                    allowEmpty={false}
                  />
                </Field>
                <Field label="Your district">
                  <CustomDropdown
                    value={district}
                    onChange={setDistrict}
                    options={DISTRICT_OPTIONS}
                    allowEmpty={false}
                  />
                </Field>
              </div>

              <FareSummary fare={FARE} />
            </div>

            <div className="px-6 md:px-8 pb-7">
              <LegalConsentNote className="mb-3" />
              <Link
                to={bookUrl}
                className="flex w-full items-center justify-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-black py-4 rounded-xl transition-all duration-300 shadow-lg shadow-brand-orange/25 text-sm cursor-pointer group"
              >
                Continue to booking
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <p className="text-center text-[11px] text-brand-grey mt-3">
                Takes about 2 minutes · Pay securely via STC Pay
              </p>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};

export default PickDrop;
