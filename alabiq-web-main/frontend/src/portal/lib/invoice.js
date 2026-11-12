// ---------------------------------------------------------------------
// Client-side PDF invoice / receipt generation (spec section 6).
//
// Once a Food Delivery order is delivered or a Pick & Drop trip is
// completed, the customer can download a branded PDF invoice. Everything
// is generated in the browser from the order/booking the customer already
// owns — no card data is ever involved, only the safe transaction summary.
//
// Layout (professional A4): logo + company block, invoice number (derived
// from the order code + date), order number, customer name, contact
// number, delivery address, itemized lines WITH drink sizes and quantity,
// price breakdown (subtotal / delivery fee / discount / total), payment
// method + status, date & time, driver name, and a QR code that links
// back to the live order-tracking page.
//
// The invoice is rendered as an HTML template, rasterized with html2canvas,
// and placed into a jsPDF page. We do it this way (instead of jsPDF's
// vector doc.text) because jsPDF's built-in fonts can't render Arabic; the
// browser shapes Arabic + applies RTL/bidi natively, so mixed Arabic/Latin
// addresses (common in KSA) render correctly. jsPDF, html2canvas and
// qrcode are dynamically imported so they only load when a PDF is
// actually generated.
// ---------------------------------------------------------------------
import { COMPANY } from '../../config/company';
import { formatAddressDetail } from './address';
import { vatLabel } from './constants';

const ORANGE = '#FF7E21';
const DARK = '#1F2937';
const GREY = '#6B7280';
const GREEN = '#16A34A';
const RED = '#DC2626';
const LINE = '#E5E7EB';
const SOFT = '#F9FAFB';

// A font stack that includes Arabic-capable families so Arabic addresses
// render (the browser falls back to a system Arabic font otherwise).
const FONT_STACK =
  "'Segoe UI', 'Helvetica Neue', Arial, 'Noto Sans Arabic', 'Segoe UI Arabic', Tahoma, sans-serif";

const money = (n, currency = 'SAR') => `${currency} ${Number(n ?? 0).toFixed(2)}`;

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Invoice number derived from the order code + date — stable for the same
// order (re-downloading yields the same number), e.g. INV-20260723-4F7KQ2.
function invoiceNumber(code, dateISO) {
  const d = new Date(dateISO || Date.now());
  const day = Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
  const suffix = String(code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-8) || 'SM';
  return `INV-${day.replace(/-/g, '')}-${suffix}`;
}

// Brand pin logo as an inline SVG (self-contained: no asset fetch, so
// html2canvas rasterizes it reliably offline).
const LOGO_SVG = `
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C7.9 2 4.5 5.4 4.5 9.5c0 5.6 6.6 11.7 6.9 12a1 1 0 0 0 1.3 0c.3-.3 6.9-6.4 6.9-12C19.5 5.4 16.1 2 12 2z" fill="${ORANGE}"/>
    <circle cx="12" cy="9.5" r="3.1" fill="#fff"/>
  </svg>`;

// Build the invoice as an HTML string (self-contained inline styles). Address
// and name fields get dir="auto" so the browser orders Arabic runs RTL.
function invoiceHtml({
  docTitle,
  code,
  invoiceNo,
  dateISO,
  serviceLabel,
  customerName,
  contactNumber,
  deliveryAddress,
  driverName,
  provider,
  summaryTitle,
  lineItems,
  totals,
  grandTotal,
  currency = 'SAR',
  paymentStatus,
  paymentMethod,
  reference,
  qrDataUrl,
  trackUrl,
}) {
  const status = String(paymentStatus).toLowerCase();
  const paid = status === 'paid' || status === 'verified';
  const statusColor = paid ? GREEN : status.includes('refund') ? GREY : RED;

  // Right-hand header meta: invoice no / order no / date & time.
  const headMeta = [
    { label: 'Invoice no.', value: invoiceNo },
    { label: 'Order no.', value: code },
    { label: 'Date & time', value: fmtDate(dateISO) },
    { label: 'Service', value: serviceLabel },
  ].map((r) => `
    <div style="display:flex;justify-content:space-between;gap:14px;margin-bottom:5px;">
      <span style="font-size:11px;color:${GREY};white-space:nowrap;">${esc(r.label)}</span>
      <span dir="auto" style="font-size:12px;font-weight:700;color:${DARK};text-align:right;">${esc(r.value ?? '—')}</span>
    </div>`).join('');

  // Customer block: name / contact number / delivery address.
  const customerRows = [
    { label: 'Contact number', value: contactNumber },
    { label: 'Delivery address', value: deliveryAddress },
  ].filter((r) => r.value).map((r) => `
    <div style="margin-top:7px;">
      <div style="font-size:10px;font-weight:700;color:${GREY};letter-spacing:0.05em;text-transform:uppercase;">${esc(r.label)}</div>
      <div dir="auto" style="font-size:12px;color:${DARK};margin-top:1px;line-height:1.45;">${esc(r.value)}</div>
    </div>`).join('');

  const providerHtml = provider?.name ? `
    <div style="font-size:10px;font-weight:700;color:${GREY};margin-top:12px;letter-spacing:0.05em;">SERVICE PROVIDER</div>
    <div dir="auto" style="font-size:12px;font-weight:700;color:${DARK};margin-top:2px;">${esc(provider.name)}</div>` : '';

  const driverHtml = driverName ? `
    <div style="font-size:10px;font-weight:700;color:${GREY};margin-top:12px;letter-spacing:0.05em;">DRIVER</div>
    <div dir="auto" style="font-size:12px;font-weight:700;color:${DARK};margin-top:2px;">${esc(driverName)}</div>` : '';

  // Items table: description (with size), qty, unit price, amount.
  const itemsHtml = (lineItems || []).map((item, i) => `
    <tr style="background:${i % 2 ? SOFT : '#fff'};">
      <td dir="auto" style="padding:9px 12px;font-size:12.5px;color:${DARK};border-bottom:1px solid ${LINE};">
        ${esc(item.label)}${item.size ? `
          <span style="display:inline-block;margin-left:6px;padding:1px 7px;border:1px solid ${ORANGE};border-radius:9px;font-size:9.5px;font-weight:700;color:${ORANGE};vertical-align:1px;">${esc(item.size)}</span>` : ''}
      </td>
      <td style="padding:9px 12px;font-size:12.5px;color:${DARK};text-align:center;border-bottom:1px solid ${LINE};white-space:nowrap;">${item.quantity != null ? esc(item.quantity) : ''}</td>
      <td style="padding:9px 12px;font-size:12.5px;color:${DARK};text-align:right;border-bottom:1px solid ${LINE};white-space:nowrap;">${item.unitPrice != null ? esc(money(item.unitPrice, currency)) : ''}</td>
      <td style="padding:9px 12px;font-size:12.5px;font-weight:700;color:${DARK};text-align:right;border-bottom:1px solid ${LINE};white-space:nowrap;">${item.amount != null ? esc(money(item.amount, currency)) : ''}</td>
    </tr>`).join('');

  const totalsHtml = (totals || []).map((row) => `
    <div style="display:flex;justify-content:space-between;gap:40px;font-size:12.5px;color:${row.accent ? GREEN : GREY};margin-bottom:6px;">
      <span>${esc(row.label)}</span>
      <span style="font-weight:600;">${row.accent ? '−' : ''}${esc(money(row.amount, currency))}</span>
    </div>`).join('');

  const qrHtml = qrDataUrl ? `
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="${qrDataUrl}" width="86" height="86" style="display:block;border:1px solid ${LINE};border-radius:8px;" alt="QR code" />
      <div>
        <div style="font-size:11px;font-weight:700;color:${DARK};">Scan to view this order</div>
        <div style="font-size:9.5px;color:${GREY};margin-top:3px;max-width:190px;word-break:break-all;line-height:1.5;">${esc(trackUrl || '')}</div>
      </div>
    </div>` : '';

  return `
    <div style="width:794px;box-sizing:border-box;padding:42px 48px;background:#fff;color:${DARK};font-family:${FONT_STACK};">
      <!-- Header: logo + company block, doc title + numbers -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;">
        <div>
          <div style="display:flex;align-items:center;gap:10px;">
            ${LOGO_SVG}
            <div style="font-size:26px;font-weight:800;color:${DARK};line-height:1;">Smart <span style="color:${ORANGE};">Mappia</span></div>
          </div>
          <div style="font-size:11px;color:${GREY};margin-top:10px;line-height:1.6;">
            ${esc(COMPANY.websiteDisplay)}<br>${esc(COMPANY.email)} · ${esc(COMPANY.phoneDisplay)}<br>${esc(COMPANY.address.full)}
          </div>
        </div>
        <div style="text-align:right;min-width:250px;">
          <div style="font-size:24px;font-weight:800;color:${ORANGE};letter-spacing:0.02em;">${esc(docTitle)}</div>
          <div style="margin-top:10px;">${headMeta}</div>
        </div>
      </div>

      <div style="border-top:2px solid ${ORANGE};margin:20px 0 22px;"></div>

      <!-- Billed to + provider/driver -->
      <div style="display:flex;justify-content:space-between;gap:24px;">
        <div style="flex:1.2;">
          <div style="font-size:10px;font-weight:700;color:${GREY};letter-spacing:0.05em;">BILLED TO</div>
          <div dir="auto" style="font-size:15px;font-weight:700;color:${DARK};margin-top:3px;">${esc(customerName || 'Alabiq customer')}</div>
          ${customerRows}
        </div>
        <div style="flex:1;">
          ${providerHtml}
          ${driverHtml}
        </div>
      </div>

      <!-- Items -->
      <div style="font-size:14px;font-weight:700;color:${DARK};margin-top:26px;">${esc(summaryTitle)}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:10px;border:1px solid ${LINE};border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:${DARK};">
            <th style="padding:9px 12px;font-size:10px;font-weight:700;color:#fff;letter-spacing:0.06em;text-align:left;">DESCRIPTION</th>
            <th style="padding:9px 12px;font-size:10px;font-weight:700;color:#fff;letter-spacing:0.06em;text-align:center;width:52px;">QTY</th>
            <th style="padding:9px 12px;font-size:10px;font-weight:700;color:#fff;letter-spacing:0.06em;text-align:right;width:110px;">UNIT PRICE</th>
            <th style="padding:9px 12px;font-size:10px;font-weight:700;color:#fff;letter-spacing:0.06em;text-align:right;width:110px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <!-- Price breakdown -->
      <div style="margin-top:18px;display:flex;justify-content:flex-end;">
        <div style="width:46%;">
          ${totalsHtml}
          <div style="display:flex;justify-content:space-between;gap:40px;background:${ORANGE};color:#fff;font-weight:800;font-size:15px;padding:11px 14px;border-radius:6px;margin-top:6px;box-sizing:border-box;">
            <span>TOTAL</span><span>${esc(money(grandTotal, currency))}</span>
          </div>
        </div>
      </div>

      <!-- Payment strip -->
      <div style="margin-top:24px;border:1px solid ${LINE};border-radius:8px;display:flex;">
        <div style="flex:1;padding:13px 14px;">
          <div style="font-size:10px;font-weight:700;color:${GREY};letter-spacing:0.05em;">PAYMENT STATUS</div>
          <div style="font-size:14px;font-weight:800;color:${statusColor};margin-top:5px;">${esc(paid ? 'PAID' : String(paymentStatus || '—').toUpperCase())}</div>
        </div>
        <div style="flex:1;padding:13px 14px;border-left:1px solid ${LINE};">
          <div style="font-size:10px;font-weight:700;color:${GREY};letter-spacing:0.05em;">PAYMENT METHOD</div>
          <div style="font-size:13px;font-weight:700;color:${DARK};margin-top:5px;">${esc(paymentMethod || '—')}</div>
        </div>
        <div style="flex:1;padding:13px 14px;border-left:1px solid ${LINE};">
          <div style="font-size:10px;font-weight:700;color:${GREY};letter-spacing:0.05em;">TRANSACTION REF</div>
          <div dir="auto" style="font-size:12px;color:${DARK};margin-top:5px;word-break:break-all;">${esc(reference || code || '—')}</div>
        </div>
      </div>

      <!-- Footer: QR + thank you -->
      <div style="border-top:1px solid ${LINE};margin-top:30px;padding-top:16px;display:flex;justify-content:space-between;align-items:center;gap:24px;">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:${ORANGE};">Thank you for choosing Alabiq!</div>
          <div style="font-size:9.5px;color:${GREY};margin-top:6px;line-height:1.6;max-width:360px;">
            This is a system-generated document. All payments are monitored 24/7 and processed
            through secure, PCI-compliant channels. No card details are stored.
          </div>
        </div>
        ${qrHtml}
      </div>
    </div>`;
}

// Render the HTML off-screen, rasterize it, and save it as a one-page A4 PDF.
async function buildInvoice(model) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff;z-index:-1;';
  try {
    const [{ default: html2canvas }, { jsPDF }, qrDataUrl] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
      // QR linking back to the order's tracking page (best-effort: the
      // invoice still renders without it if generation fails).
      model.trackUrl
        ? import('qrcode')
            .then((QR) =>
              (QR.default || QR).toDataURL(model.trackUrl, {
                width: 172,
                margin: 1,
                color: { dark: DARK, light: '#FFFFFF' },
              })
            )
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    host.innerHTML = invoiceHtml({ ...model, qrDataUrl });
    document.body.appendChild(host);

    // Make sure any web fonts are ready so Arabic shapes before we rasterize.
    if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }

    const canvas = await html2canvas(host.firstElementChild, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height / canvas.width) * imgW;
    const img = canvas.toDataURL('image/png');

    if (imgH <= pageH) {
      doc.addImage(img, 'PNG', 0, 0, imgW, imgH);
    } else {
      // Taller than one page — tile the single image across pages.
      let position = 0;
      let remaining = imgH;
      while (remaining > 0) {
        doc.addImage(img, 'PNG', 0, position, imgW, imgH);
        remaining -= pageH;
        if (remaining > 0) {
          doc.addPage();
          position -= pageH;
        }
      }
    }
    doc.save(model.fileName);
  } catch (err) {
    console.error('invoice generation failed:', err);
    if (typeof window !== 'undefined') window.alert('Could not generate the PDF. Please try again.');
  } finally {
    if (host.parentNode) document.body.removeChild(host);
  }
}

// --- Public helpers ----------------------------------------------------

const FOOD_METHOD_LABELS = { stcpay: 'STC Pay', tap: 'Card (Tap)', cash: 'Cash on delivery' };

export function downloadFoodInvoice({ order, items, merchant, customerName, driverName }) {
  const dateISO = order.delivered_at || order.created_at;
  const discount = Number(order.discount ?? 0);
  return buildInvoice({
    docTitle: 'INVOICE',
    fileName: `Alabiq-Invoice-${order.order_code}.pdf`,
    code: order.order_code,
    invoiceNo: invoiceNumber(order.order_code, dateISO),
    dateISO,
    serviceLabel: 'Food Delivery',
    customerName,
    contactNumber: order.contact_phone || null,
    deliveryAddress:
      formatAddressDetail({
        street: order.delivery_street,
        building: order.delivery_building,
        address: order.delivery_address,
      }) || null,
    driverName: driverName || null,
    provider: merchant ? { name: merchant.name, address: merchant.address } : null,
    summaryTitle: 'Order summary',
    lineItems: (items || []).map((line) => ({
      label: line.name_snapshot,
      size: line.size_snapshot || null,
      quantity: line.quantity,
      unitPrice: line.unit_price ?? (line.quantity ? line.line_total / line.quantity : null),
      amount: line.line_total,
    })),
    totals: [
      { label: 'Subtotal', amount: order.subtotal },
      { label: 'Delivery charge', amount: order.delivery_fee },
      ...(discount > 0 ? [{ label: 'Discount', amount: discount, accent: true }] : []),
      // Pre-0025 orders carry no VAT — omit the line rather than print 0.00.
      ...(Number(order.vat_amount) > 0
        ? [{ label: vatLabel(order.vat_rate), amount: order.vat_amount }]
        : []),
    ],
    grandTotal: order.total,
    paymentStatus: order.payment_status,
    paymentMethod: FOOD_METHOD_LABELS[order.payment_method] || order.payment_method,
    reference: order.order_code,
    trackUrl: `${window.location.origin}/food/track/${order.order_code}`,
  });
}

export function downloadRideInvoice({ booking, customerName, driverName }) {
  const currency = booking.currency || 'SAR';
  const dateISO = booking.pickup_datetime || booking.created_at;
  return buildInvoice({
    docTitle: 'INVOICE',
    fileName: `Alabiq-Invoice-${booking.booking_code}.pdf`,
    code: booking.booking_code,
    invoiceNo: invoiceNumber(booking.booking_code, dateISO),
    dateISO,
    serviceLabel: 'Airport Pick & Drop',
    customerName,
    contactNumber: booking.passenger_mobile || booking.passenger_whatsapp || null,
    deliveryAddress: null,
    driverName: driverName || null,
    provider: { name: 'Alabiq Transport', address: COMPANY.address.full },
    summaryTitle: 'Trip summary',
    lineItems: [
      {
        label: `Pickup: ${formatAddressDetail({
          street: booking.pickup_street,
          building: booking.pickup_building,
          address: booking.pickup_address,
        }) || '—'}`,
      },
      {
        label: `Drop-off: ${formatAddressDetail({
          street: booking.dropoff_street,
          building: booking.dropoff_building,
          address: booking.dropoff_address,
        }) || '—'}`,
      },
      { label: 'Airport transfer fare', quantity: 1, unitPrice: booking.fare_amount, amount: booking.fare_amount },
    ],
    totals: [
      { label: 'Fare', amount: booking.fare_amount },
      // Pre-0025 bookings carry no VAT — omit the line rather than print 0.00.
      ...(Number(booking.vat_amount) > 0
        ? [{ label: vatLabel(booking.vat_rate), amount: booking.vat_amount }]
        : []),
    ],
    grandTotal: booking.total_amount ?? booking.fare_amount,
    currency,
    paymentStatus: booking.payment_status,
    paymentMethod: booking.payment_method || 'STC Pay',
    reference: booking.booking_code,
    trackUrl: `${window.location.origin}/track/${booking.booking_code}`,
  });
}
