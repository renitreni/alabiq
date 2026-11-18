// Shared upload validation for proofs and driver documents (PDF + JPG/PNG only).

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

const BLOCKED_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.docm',
  '.dot',
  '.dotx',
  '.pub',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.rtf',
  '.odt',
  '.pages',
]);

function fileExtension(name) {
  const i = String(name || '').lastIndexOf('.');
  return i >= 0 ? String(name).slice(i).toLowerCase() : '';
}

function resolveMimeType(fileName, mimeType) {
  const ext = fileExtension(fileName);
  const extMime = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
  }[ext];
  if (mimeType && ALLOWED_MIME_TYPES.includes(mimeType)) return mimeType;
  return extMime || mimeType || null;
}

// Proofs + driver documents (PDF + JPG/PNG). For storefront merchant images use
// validateImageFile (logos) / validateMenuImageFile (menu photos) below.
function validateUploadFile({ fileName, mimeType }) {
  const ext = fileExtension(fileName);

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: 'Word, Publisher, and other office documents are not accepted. Please upload a PDF, JPG, or PNG.',
    };
  }

  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: 'Only PDF, JPG, and PNG files are accepted.' };
  }

  const resolved = resolveMimeType(fileName, mimeType);
  if (!resolved || !ALLOWED_MIME_TYPES.includes(resolved)) {
    return { ok: false, error: 'Only PDF, JPG, and PNG files are accepted.' };
  }

  return { ok: true, mimeType: resolved };
}

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function validateImageFile({ fileName, mimeType }) {
  const ext = fileExtension(fileName);

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: 'Word, Publisher, and other office documents are not accepted. Please upload a JPG, PNG, or WebP image.',
    };
  }

  if (ext && !IMAGE_EXTENSIONS.has(ext)) {
    return { ok: false, error: 'Only JPG, PNG, and WebP images are accepted.' };
  }

  const extMime = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }[ext];
  const resolved =
    mimeType && IMAGE_MIME_TYPES.includes(mimeType) ? mimeType : extMime || mimeType || null;

  if (!resolved || !IMAGE_MIME_TYPES.includes(resolved)) {
    return { ok: false, error: 'Only JPG, PNG, and WebP images are accepted.' };
  }

  return { ok: true, mimeType: resolved };
}

const MENU_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'];
const MENU_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

function validateMenuImageFile({ fileName, mimeType }) {
  const ext = fileExtension(fileName);

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: 'Documents are not accepted. Please upload a JPG or PNG image.',
    };
  }

  if (ext && !MENU_IMAGE_EXTENSIONS.has(ext)) {
    return { ok: false, error: 'Only JPG and PNG images are accepted.' };
  }

  const extMime = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  }[ext];
  const resolved =
    mimeType && MENU_IMAGE_MIME_TYPES.includes(mimeType) ? mimeType : extMime || mimeType || null;

  if (!resolved || !MENU_IMAGE_MIME_TYPES.includes(resolved)) {
    return { ok: false, error: 'Only JPG and PNG images are accepted.' };
  }

  return { ok: true, mimeType: resolved };
}

module.exports = {
  ALLOWED_MIME_TYPES,
  validateUploadFile,
  validateImageFile,
  validateMenuImageFile,
};
