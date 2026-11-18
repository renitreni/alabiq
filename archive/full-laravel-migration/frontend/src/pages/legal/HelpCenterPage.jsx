import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Headphones, Mail, MessageCircle } from 'lucide-react';
import { COMPANY } from '../../config/company';
import { WHATSAPP_HREF } from '../../lib/supportContact';
import LegalLayout from './LegalLayout';

const CHANNELS = [
  {
    key: 'whatsapp',
    Icon: MessageCircle,
    eyebrow: 'Fastest reply',
    title: 'WhatsApp us',
    value: COMPANY.whatsappDisplay,
    hint: 'Chat with a real person. Most questions are answered within a few minutes.',
    cta: 'Start a chat',
    featured: true,
    href: WHATSAPP_HREF,
  },
  {
    key: 'email',
    Icon: Mail,
    eyebrow: 'Written record',
    title: 'Email us',
    value: COMPANY.email,
    hint: 'Best for receipts, refunds, and anything you want in writing.',
    cta: 'Send an email',
    featured: false,
    href: `mailto:${COMPANY.email}?subject=${encodeURIComponent('Customer service')}`,
  },
];

const FAQS = [
  {
    q: 'How do I book an airport transfer?',
    a: 'Sign in, open Book, choose whether you are heading to or from the airport, pick your district and terminal, then confirm. The fare is fixed and shown before you confirm.',
  },
  {
    q: 'How do I pay?',
    a: 'Pay with a saved card or through the in-app payment options. Your booking or order is confirmed once the payment goes through.',
  },
  {
    q: 'Can I track my driver?',
    a: 'Yes. Once a driver is assigned, the tracking screen shows their position on the live map along with an estimated arrival time.',
  },
  {
    q: 'How do I cancel or get a refund?',
    a: `Message us on WhatsApp or email ${COMPANY.email} with your booking or order code. Cancellations follow our published guidelines and Saudi consumer protection rules.`,
  },
  {
    q: 'How do I delete my account?',
    a: 'Open Profile and use Delete Account at the bottom of the screen. If you have already uninstalled the app, see the account deletion page.',
  },
];

function ChannelCard({ channel }) {
  const Action = channel.href ? 'a' : 'button';
  const actionProps = channel.href
    ? { href: channel.href, target: '_blank', rel: 'noreferrer' }
    : { type: 'button', onClick: channel.onAction };

  return (
    <div
      className={`relative flex flex-col rounded-3xl p-5 border ${
        channel.featured
          ? 'bg-brand-black text-white border-transparent shadow-lg shadow-brand-orange/20'
          : 'bg-white text-brand-black border-brand-border shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            channel.featured
              ? 'bg-[#25D366]'
              : 'bg-linear-to-br from-brand-orange to-brand-red'
          }`}
        >
          <channel.Icon className="w-6 h-6 text-white" strokeWidth={2.25} />
        </span>
        <span
          className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
            channel.featured
              ? 'bg-white/10 text-white/75'
              : 'bg-brand-warm text-brand-orange'
          }`}
        >
          {channel.eyebrow}
        </span>
      </div>

      <h3 className="text-lg font-black tracking-tight mt-4">{channel.title}</h3>
      {channel.href ? (
        <a
          href={channel.href}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 text-sm font-bold text-brand-orange break-all hover:underline"
        >
          {channel.value}
        </a>
      ) : (
        <button
          type="button"
          onClick={channel.onAction}
          className="mt-0.5 text-sm font-bold text-brand-orange break-all hover:underline text-left cursor-pointer"
        >
          {channel.value}
        </button>
      )}
      <p className={`mt-2 text-sm leading-relaxed ${channel.featured ? 'text-white/60' : 'text-brand-grey'}`}>
        {channel.hint}
      </p>

      <Action
        {...actionProps}
        className={`mt-5 inline-flex items-center justify-center gap-2 w-full rounded-2xl py-3 text-sm font-black cursor-pointer ${
          channel.featured
            ? 'bg-linear-to-r from-brand-orange to-brand-red text-white'
            : 'bg-brand-black text-white'
        }`}
      >
        {channel.cta}
        <span>→</span>
      </Action>
    </div>
  );
}

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div className="border-b border-brand-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full py-4 flex items-center justify-between gap-4 text-left"
      >
        <span className={`text-sm font-bold ${open ? 'text-brand-orange' : 'text-brand-black'}`}>
          {q}
        </span>
        <span
          className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-black transition-colors ${
            open
              ? 'bg-linear-to-br from-brand-orange to-brand-red text-white'
              : 'border border-brand-border text-brand-grey'
          }`}
        >
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <p className="pb-4 text-sm leading-relaxed text-brand-grey">{a}</p>
      )}
    </div>
  );
}

export default function HelpCenterPage() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <LegalLayout title="Customer Service">
      <section className="rounded-3xl bg-brand-warm border border-brand-orange/15 p-5 mb-6">
        <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-brand-orange">
          <Headphones className="w-3.5 h-3.5" strokeWidth={2.5} />
          We are here to help
        </p>
        <h2 className="text-2xl font-black text-brand-black mt-2 tracking-tight">
          Need a hand with an order or ride?
        </h2>
        <p className="text-sm text-brand-grey mt-2 leading-relaxed">
          Reach us on WhatsApp or email. Have your booking or order code ready so we can help you faster.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white border border-brand-orange/15 px-3 py-2">
          <Clock className="w-4 h-4 text-brand-orange" strokeWidth={2.25} />
          <span className="text-xs font-bold text-brand-black">{COMPANY.hours}</span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4">
        {CHANNELS.map((channel) => (
          <ChannelCard key={channel.key} channel={channel} />
        ))}
      </section>

      <section className="mt-8 rounded-3xl bg-white border border-brand-border px-5">
        <h2 className="font-black text-brand-black pt-5 pb-1">Quick answers</h2>
        {FAQS.map((faq, index) => (
          <FaqItem
            key={faq.q}
            {...faq}
            open={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? null : index)}
          />
        ))}
      </section>

      <section className="mt-8 space-y-2 text-sm text-brand-grey">
        <h2 className="font-black text-brand-black">Legal</h2>
        <div className="flex flex-wrap gap-4">
          <Link to="/privacy-policy" className="underline hover:text-brand-orange">
            Privacy Policy
          </Link>
          <Link to="/terms-of-service" className="underline hover:text-brand-orange">
            Terms of Service
          </Link>
          <Link to="/account-deletion" className="underline hover:text-brand-orange">
            Delete your account
          </Link>
        </div>
      </section>
    </LegalLayout>
  );
}
