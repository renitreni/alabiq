import { COMPANY } from '../config/company';

export const WHATSAPP_HREF = `${COMPANY.whatsappUrl}?text=${encodeURIComponent(
  'Hi Alabiq, I need some help.',
)}`;

export function openWhatsApp() {
  window.open(WHATSAPP_HREF, '_blank', 'noopener,noreferrer');
}

export function supportMailto({ name, reply, topic, message }) {
  const subject = topic
    ? `Customer service: ${topic}`
    : 'Customer service';
  const body = [
    message.trim(),
    '',
    name ? `Name: ${name}` : '',
    reply ? `Reply to: ${reply}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    href:
      `mailto:${COMPANY.email}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`,
    subject,
    body,
  };
}

export function openSupportEmail(href) {
  const link = document.createElement('a');
  link.href = href;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
