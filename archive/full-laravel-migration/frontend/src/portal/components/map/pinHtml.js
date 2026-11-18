// Provider-neutral DOM pin factory shared by Google Maps and Mapbox GL.
// Styling lives in index.css (.sm-map-pin*, .sm-map-driver-core).

const BRAND = {
  orange: '#FF7E21',
  dark: '#1F2937',
};

export function resolvePinStyle(marker) {
  if (marker.type === 'driver') {
    return { kind: 'driver', color: BRAND.orange, glyph: '●' };
  }
  if (marker.type === 'passenger' || marker.type === 'client') {
    return { kind: 'passenger', color: '#2563EB', glyph: marker.glyph || 'C' };
  }
  if (marker.type === 'pickup' || marker.glyph === 'P') {
    return { kind: 'pickup', color: BRAND.orange, glyph: marker.glyph || 'P' };
  }
  if (marker.type === 'dropoff' || marker.glyph === 'D') {
    return { kind: 'dropoff', color: BRAND.dark, glyph: marker.glyph || 'D' };
  }
  if (marker.type === 'home' || marker.glyph === 'H') {
    return { kind: 'home', color: BRAND.orange, glyph: 'H' };
  }
  if (marker.type === 'airport' || marker.glyph === 'A') {
    return { kind: 'airport', color: BRAND.dark, glyph: 'A' };
  }
  return {
    kind: 'default',
    color: marker.color || BRAND.orange,
    glyph: marker.glyph || '•',
  };
}

const CAR_SVG =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FF7E21" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-5.4A2 2 0 0 0 13.5 3h-3A2 2 0 0 0 8.7 4.6L6 10l-2.5 1.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2"/>' +
  '<circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>' +
  '</svg>';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function safeColor(color) {
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20})$/.test(String(color)) ? color : BRAND.orange;
}

export function pinSignature(marker) {
  const { kind, color, glyph } = resolvePinStyle(marker);
  return `${kind}|${color}|${glyph}`;
}

function pinInnerHtml(marker) {
  const { kind, color, glyph } = resolvePinStyle(marker);
  const isDriver = kind === 'driver';
  const size = isDriver ? 46 : 36;

  const inner = isDriver
    ? `<div class="sm-map-driver-core">
        <span class="sm-map-driver-heading" data-sm-angle="${Number(marker.heading) || 0}" style="display:inline-flex;transition:transform 0.6s ease;transform:rotate(${Number(marker.heading) || 0}deg)">
          ${CAR_SVG}
        </span>
      </div>`
    : `<span class="sm-map-pin-glyph">${escapeHtml(glyph)}</span>`;

  return `<div class="sm-map-pin sm-map-pin--${kind}" style="--pin-color:${safeColor(color)};--pin-size:${size}px">
      <div class="sm-map-pin-body">${inner}</div>
      <div class="sm-map-pin-tail"></div>
    </div>`;
}

export function buildPinEl(marker) {
  const { kind } = resolvePinStyle(marker);
  const isDriver = kind === 'driver';
  const size = isDriver ? 46 : 36;
  const el = document.createElement('div');
  el.className = `sm-map-pin-wrap ${isDriver ? 'sm-map-pin-wrap--driver' : ''}`;
  el.innerHTML = pinInnerHtml(marker);
  return { el, size, isDriver };
}

export function refreshPinEl(el, marker) {
  el.innerHTML = pinInnerHtml(marker);
}

export function updateDriverHeading(el, heading) {
  const span = el.querySelector('.sm-map-driver-heading');
  if (!span || heading == null) return;

  const prev = Number(span.dataset.smAngle);
  if (!Number.isFinite(prev)) {
    span.dataset.smAngle = String(heading);
    span.style.transform = `rotate(${heading}deg)`;
    return;
  }

  let delta = (heading - prev) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  const next = prev + delta;
  span.dataset.smAngle = String(next);
  span.style.transform = `rotate(${next}deg)`;
}
