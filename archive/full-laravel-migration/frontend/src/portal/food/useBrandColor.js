// ---------------------------------------------------------------------
// Derive a restaurant's brand color from its logo, so the menu page can
// dress itself in the partner's own scheme (Jollibee red, Chowking red,
// etc.) instead of one hard-coded orange for everyone.
//
// There is no brand_color column, so we read the dominant, saturated color
// out of the logo image at runtime. If the image can't be sampled (no logo,
// a CORS-tainted canvas, a load error) we fall back to the platform orange,
// so the page always has a sensible scheme.
// ---------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';

const FALLBACK = { r: 255, g: 126, b: 33 }; // brand orange

function clamp(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbStr({ r, g, b }, alpha) {
  return alpha == null ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mix(color, target, amount) {
  return {
    r: clamp(color.r + (target - color.r) * amount),
    g: clamp(color.g + (target - color.g) * amount),
    b: clamp(color.b + (target - color.b) * amount),
  };
}

// Relative luminance — decides whether white or near-black text reads on the
// color, so a bright yellow brand (Tianlala) still gets legible copy.
function luminance({ r, g, b }) {
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function paletteFrom(base) {
  const lum = luminance(base);
  return {
    base,
    color: rgbStr(base),
    // A darker end for the cover gradient — always readable behind white text.
    dark: rgbStr(mix(base, 0, lum > 0.5 ? 0.55 : 0.35)),
    // Soft tints for chips and surfaces.
    soft: rgbStr(base, 0.12),
    softer: rgbStr(base, 0.08),
    ring: rgbStr(base, 0.4),
    // Text color that sits on a solid fill of `base`.
    textOn: lum > 0.6 ? '#1F2937' : '#FFFFFF',
    isLight: lum > 0.6,
  };
}

function extractDominant(img) {
  const size = 36;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);

  let data;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    // Tainted canvas (logo served without CORS headers) — give up gracefully.
    return null;
  }

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Skip near-white, near-black and washed-out (low-saturation) pixels — a
    // logo's background and outlines, never its identity color.
    if (max > 238 && min > 238) continue;
    if (max < 22) continue;
    if (max - min < 28) continue;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const entry = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
    entry.r += r;
    entry.g += g;
    entry.b += b;
    entry.n += 1;
    buckets.set(key, entry);
  }

  let best = null;
  for (const entry of buckets.values()) {
    if (!best || entry.n > best.n) best = entry;
  }
  if (!best || best.n < 3) return null;
  return { r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n) };
}

export function useBrandColor(logoUrl) {
  const [base, setBase] = useState(null);

  useEffect(() => {
    setBase(null);
    if (!logoUrl) return undefined;
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!alive) return;
      const found = extractDominant(img);
      if (found) setBase(found);
    };
    img.onerror = () => {};
    img.src = logoUrl;
    return () => {
      alive = false;
    };
  }, [logoUrl]);

  return useMemo(() => paletteFrom(base || FALLBACK), [base]);
}
