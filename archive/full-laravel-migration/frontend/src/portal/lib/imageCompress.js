// ---------------------------------------------------------------------
// Client-side image downscaling for anything we put in Supabase storage.
//
// Payment proofs, driver documents and avatars are all camera shots or
// screenshots straight off a phone: 8 to 12 megapixels, several MB each, for
// something a human only ever reads at a few hundred pixels wide. This landed
// while the project was on the Supabase free tier, where a 1 GB ceiling made it
// an outage risk; on Pro it is a cost one. Either way, uploading the originals
// pays for detail nobody looks at and costs the user their mobile data twice.
//
// The re-encode deliberately keeps the source mime type. The signed upload URL
// is already bound to a path whose extension came from the original filename,
// and the backend validated that mime against its allowlist, so switching a
// PNG to JPEG here would leave the stored object's content disagreeing with
// its name.
// ---------------------------------------------------------------------

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

// Below this there is nothing worth reclaiming, and re-encoding would only
// throw away quality. Also the early exit that keeps a second pass cheap when
// a caller has already compressed.
const SKIP_BELOW_BYTES = 400 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image'));
    };
    img.src = url;
  });
}

/**
 * Downscale an image file so its longest edge is at most MAX_DIMENSION.
 * Returns the original file untouched for non-images, small files, images
 * already within bounds, or if anything at all goes wrong: a slightly larger
 * upload is always better than a failed one.
 */
export async function compressImage(file) {
  if (!file || !file.type?.startsWith('image/')) return file;
  // GIFs would lose their animation, SVGs are vectors and already tiny.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    if (scale === 1) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, file.type, JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name, { type: file.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}
