import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    question: "What is Alabiq?",
    answer:
      "Alabiq is an all-in-one app for Riyadh. Order food from local restaurants, shop everyday essentials, send packages, and book airport pick & drop rides, all with real-time tracking and Smart Rewards.",
  },
  {
    question: "Is the airport transfer rate fixed?",
    answer:
      "Yes, our rates are fully transparent. Whether you're arriving or departing, prices range from 80 to 100 SR depending on the terminal, with no hidden charges, ever.",
  },
  {
    question: "Which districts in Riyadh do you cover?",
    answer:
      "We're currently active in Malaz, Sulamania, Olaya, and Batha, and constantly expanding to serve more areas soon.",
  },
  {
    question: "Can I track my order in real-time?",
    answer:
      "Absolutely. Once your order or ride is confirmed, you can track your driver's exact location via live GPS integration inside the app.",
  },
];

const FAQItem = ({ question, answer, isOpen, onToggle }) => {
  return (
    <div className="border-b border-brand-border last:border-0">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full py-6 flex items-center justify-between gap-6 text-left group"
      >
        <span
          className={`text-base md:text-lg font-bold tracking-tight transition-colors duration-200 ${
            isOpen ? "text-brand-orange" : "text-brand-black group-hover:text-brand-dark"
          }`}
        >
          {question}
        </span>

        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200 ${
            isOpen
              ? "bg-linear-to-br from-brand-orange to-brand-red text-white shadow-md shadow-brand-orange/25"
              : "border border-brand-border text-brand-grey group-hover:border-brand-orange/30 group-hover:text-brand-orange"
          }`}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-6 text-sm md:text-base leading-relaxed text-brand-grey max-w-2xl">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section
      id="faq"
      className="w-full bg-white px-8 md:px-20 py-24 border-t border-brand-border"
    >
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <span className="text-brand-orange text-sm font-bold tracking-widest uppercase">
            FAQ
          </span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-2">
            Know{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-orange to-brand-red">
              Alabiq.
            </span>
          </h2>
          <p className="text-brand-grey text-base mt-4 font-medium max-w-xl mx-auto">
            Quick answers about what the app does, where it works, and how it helps
            you across Riyadh.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="bg-white rounded-3xl px-6 md:px-10 border border-brand-border shadow-sm shadow-brand-orange/5"
        >
          {faqs.map((faq, index) => (
            <FAQItem
              key={index}
              {...faq}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </motion.div>

        <p className="text-center text-sm text-brand-grey mt-8 font-medium">
          Still need help?{" "}
          <Link
            to="/support"
            className="font-bold text-brand-orange hover:underline"
          >
            Contact customer service →
          </Link>
        </p>
      </div>
    </section>
  );
};

export default FAQ;
