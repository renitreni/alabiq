// Shared rules for document / proof uploads (PDF and common image formats only).

export const UPLOAD_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

export const UPLOAD_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];

export const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export const UPLOAD_FORMATS_HINT =
  'Accepted: PDF, JPG, or PNG. Word, Publisher, and other document types are not allowed.';

export const LOGO_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const LOGO_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
export const LOGO_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
export const LOGO_FORMATS_HINT = 'JPG, PNG, or WebP. Max 2 MB.';
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const MENU_IMAGE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
export const MENU_IMAGE_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
export const MENU_IMAGE_ACCEPT = '.jpg,.jpeg,.png,image/jpeg,image/png';
export const MENU_IMAGE_FORMATS_HINT = 'JPG or PNG only. Max 2 MB. No PDF or documents.';

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

const EXT_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

function fileExtension(name) {
  const i = String(name || '').lastIndexOf('.');
  return i >= 0 ? String(name).slice(i).toLowerCase() : '';
}

export function resolveUploadMimeType(file) {
  const ext = fileExtension(file?.name);
  if (file?.type && UPLOAD_ALLOWED_MIME_TYPES.includes(file.type)) return file.type;
  return EXT_TO_MIME[ext] || file?.type || '';
}

export function validateUploadFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };

  const ext = fileExtension(file.name);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: 'Word, Publisher, and other office documents are not accepted. Please upload a PDF, JPG, or PNG.',
    };
  }

  if (ext && !UPLOAD_ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      error: 'Only PDF, JPG, and PNG files are accepted.',
    };
  }

  const mimeType = resolveUploadMimeType(file);
  if (!mimeType || !UPLOAD_ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      ok: false,
      error: 'Only PDF, JPG, and PNG files are accepted.',
    };
  }

  return { ok: true, mimeType };
}

export function validateLogoFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };

  const ext = fileExtension(file.name);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: 'Office documents are not accepted. Please upload a JPG, PNG, or WebP image.',
    };
  }

  if (ext && !LOGO_ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, error: 'Only JPG, PNG, and WebP images are accepted.' };
  }

  const mimeType =
    file.type && LOGO_ALLOWED_MIME_TYPES.includes(file.type)
      ? file.type
      : {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
        }[ext] || file.type || '';

  if (!mimeType || !LOGO_ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { ok: false, error: 'Only JPG, PNG, and WebP images are accepted.' };
  }

  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: 'Logo must be 2 MB or smaller.' };
  }

  return { ok: true, mimeType };
}

export function validateMenuImageFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };

  const ext = fileExtension(file.name);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: 'Documents are not accepted. Please upload a JPG or PNG image.',
    };
  }

  if (ext && !MENU_IMAGE_ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, error: 'Only JPG and PNG images are accepted.' };
  }

  const mimeType =
    file.type && MENU_IMAGE_ALLOWED_MIME_TYPES.includes(file.type)
      ? file.type
      : {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
        }[ext] || file.type || '';

  if (!mimeType || !MENU_IMAGE_ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { ok: false, error: 'Only JPG and PNG images are accepted.' };
  }

  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: 'Image must be 2 MB or smaller.' };
  }

  return { ok: true, mimeType };
}
