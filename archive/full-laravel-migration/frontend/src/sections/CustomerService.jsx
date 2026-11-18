import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Headphones,
  Mail,
  MapPin,
  MessageCircle,
} from "lucide-react";
import { COMPANY } from "../config/company";
import { openSupportEmail, supportMailto, WHATSAPP_HREF } from "../lib/supportContact";
import { useAuth } from "../portal/lib/AuthProvider";
import { notifySuccess, notifyWarning } from "../portal/lib/notify";

const TOPICS = [
  "Food order",
  "Shop order",
  "Airport ride",
  "Payment",
  "Account",
  "Other",
];

const fieldClass = (bad) =>
  `mt-1.5 w-full bg-white border rounded-xl px-4 py-2.5 text-brand-dark text-sm focus:outline-none focus:ring-2 transition-all ${
    bad
      ? "border-brand-red focus:border-brand-red focus:ring-brand-red/15"
      : "border-brand-border focus:border-brand-orange focus:ring-brand-orange/15"
  }`;

function EmailForm() {
  const { user, profile } = useAuth();
  const [name, setName] = useState("");
  const [reply, setReply] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [invalid, setInvalid] = useState({});

  useEffect(() => {
    if (profile?.fullName) setName((v) => v || profile.fullName);
    if (user?.email) setReply((v) => v || user.email);
  }, [profile?.fullName, user?.email]);

  async function submit(e) {
    e.preventDefault();

    const missing = [];
    const nextInvalid = {};
    if (!name.trim()) {
      missing.push("your name");
      nextInvalid.name = true;
    }
    if (!reply.trim()) {
      missing.push("your email");
      nextInvalid.reply = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reply.trim())) {
      missing.push("a valid email address");
      nextInvalid.reply = true;
    }
    if (!message.trim()) {
      missing.push("your message");
      nextInvalid.message = true;
    }
    setInvalid(nextInvalid);

    if (missing.length) {
      await notifyWarning(
        "Please complete all fields",
        missing.length === 1
          ? `Add ${missing[0]} before sending.`
          : `Add ${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]} before sending.`
      );
      return;
    }

    const { href, subject, body } = supportMailto({ name, reply, topic, message });
    openSupportEmail(href);

    const copied = [`To: ${COMPANY.email}`, `Subject: ${subject}`, "", body].join("\n");
    try {
      await navigator.clipboard.writeText(copied);
    } catch {
      /* clipboard may be blocked */
    }

    setSent(true);
    notifySuccess(
      "Email ready to send",
      `Your mail app should open to ${COMPANY.email}. If it does not, the message was copied so you can paste it.`
    );
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start justify-center min-h-80 py-4">
        <span className="w-12 h-12 rounded-2xl bg-linear-to-br from-brand-orange to-brand-red flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-white" strokeWidth={2.25} />
        </span>
        <h3 className="text-2xl font-black tracking-tight text-brand-black mt-4">
          Your message is ready
        </h3>
        <p className="text-sm text-brand-grey mt-2 leading-relaxed">
          Your email app should open addressed to{" "}
          <span className="font-bold text-brand-orange">{COMPANY.email}</span>.
          Send it from there and we will get back to you.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-6 text-sm font-bold text-brand-orange hover:underline cursor-pointer"
        >
          Write another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-bold text-brand-dark">Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setInvalid((v) => ({ ...v, name: false }));
            }}
            placeholder="Full name"
            className={fieldClass(invalid.name)}
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-brand-dark">Your email</span>
          <input
            type="email"
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              setInvalid((v) => ({ ...v, reply: false }));
            }}
            placeholder="you@email.com"
            className={fieldClass(invalid.reply)}
          />
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-bold text-brand-dark">Topic</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TOPICS.map((item) => {
            const active = topic === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setTopic(item)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                  active
                    ? "bg-linear-to-r from-brand-orange to-brand-red text-white"
                    : "bg-brand-muted text-brand-dark border border-brand-border hover:border-brand-orange/40"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="text-xs font-bold text-brand-dark">Message</span>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setInvalid((v) => ({ ...v, message: false }));
          }}
          placeholder="Tell us what happened. Include your booking or order code if you have one."
          className={`${fieldClass(invalid.message)} resize-y min-h-24`}
        />
      </label>

      <button
        type="submit"
        className="mt-5 inline-flex items-center justify-center gap-2 w-full rounded-2xl py-3.5 text-sm font-black text-white bg-linear-to-r from-brand-orange to-brand-red shadow-md shadow-brand-orange/25 hover:shadow-lg transition-shadow cursor-pointer"
      >
        Send email
        <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}

async function copyWhatsApp() {
  try {
    await navigator.clipboard.writeText(COMPANY.whatsappDisplay);
    notifySuccess("Number copied", COMPANY.whatsappDisplay);
  } catch {
    notifyWarning("Could not copy", "Please copy the number by hand.");
  }
}

const CustomerService = () => {
  return (
    <section className="relative w-full bg-brand-warm overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-24 right-0 w-[480px] h-[480px] rounded-full bg-brand-orange/12 blur-[120px]" />
        <div className="absolute bottom-0 -left-24 w-[360px] h-[360px] rounded-full bg-brand-red/8 blur-[100px]" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 md:px-10 lg:px-12 pt-14 md:pt-16 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto"
        >
          <span className="inline-flex items-center gap-2 bg-white border border-brand-orange/20 text-brand-orange text-xs font-bold tracking-widest uppercase px-3.5 py-1.5 rounded-full">
            <Headphones className="w-3.5 h-3.5" strokeWidth={2.5} />
            Customer Service
          </span>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-4 leading-tight">
            How can we help?
          </h1>
          <p className="text-brand-grey text-base mt-3 font-medium leading-relaxed">
            Message us on WhatsApp, or send an email. Have your booking or order
            code ready so we can help you faster.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white border border-brand-border px-3.5 py-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-orange" strokeWidth={2.25} />
              <span className="text-xs font-bold text-brand-dark">{COMPANY.hours}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white border border-brand-border px-3.5 py-1.5">
              <MapPin className="w-3.5 h-3.5 text-brand-orange" strokeWidth={2.25} />
              <span className="text-xs font-bold text-brand-dark">{COMPANY.address.line2}</span>
            </div>
          </div>
        </motion.div>

        <div className="mt-10 flex flex-col gap-5">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="bg-white border border-brand-border rounded-[1.75rem] p-5 md:p-6 shadow-sm"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              <span className="w-14 h-14 shrink-0 rounded-2xl bg-[#25D366] flex items-center justify-center shadow-md shadow-[#25D366]/25">
                <MessageCircle className="w-7 h-7 text-white" strokeWidth={2.25} />
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-black tracking-tight text-brand-black">
                    WhatsApp
                  </h2>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-brand-warm text-brand-orange border border-brand-orange/15">
                    Fastest reply
                  </span>
                </div>
                <p className="text-sm text-brand-grey mt-1">
                  Chat with a real person. Most questions are answered in a few minutes.
                </p>
                <a
                  href={WHATSAPP_HREF}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-brand-muted border border-brand-border px-4 py-2.5 hover:border-brand-orange/40 transition-colors"
                >
                  <span className="text-lg md:text-xl font-black tracking-tight text-brand-black">
                    {COMPANY.whatsappDisplay}
                  </span>
                </a>
              </div>

              <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0 md:w-44">
                <a
                  href={WHATSAPP_HREF}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl py-3 px-4 text-sm font-black text-white bg-[#25D366] hover:bg-[#1EBE57] shadow-sm cursor-pointer"
                >
                  Start a chat
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={copyWhatsApp}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl py-3 px-4 text-sm font-bold text-brand-dark bg-brand-muted border border-brand-border hover:border-brand-orange/40 cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-brand-orange" />
                  Copy number
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.14 }}
            className="bg-white border border-brand-border rounded-[1.75rem] p-5 md:p-7 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <span className="w-14 h-14 rounded-2xl bg-linear-to-br from-brand-orange to-brand-red flex items-center justify-center shadow-md shadow-brand-orange/20">
                  <Mail className="w-7 h-7 text-white" strokeWidth={2.25} />
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-black tracking-tight text-brand-black">
                      Email
                    </h2>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-brand-warm text-brand-orange border border-brand-orange/15">
                      Written record
                    </span>
                  </div>
                  <p className="text-sm text-brand-grey mt-1 break-all">
                    {COMPANY.email}
                  </p>
                </div>
              </div>
            </div>

            <EmailForm />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default CustomerService;
