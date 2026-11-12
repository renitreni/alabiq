// ---------------------------------------------------------------------
// Image upload for merchant logos and catalogue photos.
//
// Uploads straight to the PUBLIC merchant-images bucket via a backend-issued
// signed URL, then hands the stored PUBLIC url up to the form. Needs a saved
// merchant/store id, so on a brand-new record it asks the user to save first.
//
// Logos accept JPG/PNG/WebP; item photos are JPG/PNG only — the same rules the
// merchant portal (uploadFiles.js) and the backend validators enforce.
//
// The signed-URL call is injected rather than hardcoded: food, shop-admin and
// the store-owner portal each have their own endpoint but an identical
// validate -> sign -> upload -> public url flow.
// ---------------------------------------------------------------------
import { useState } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { uploadProofFile } from '../lib/gatewayClient';
import {
  validateLogoFile,
  validateMenuImageFile,
  LOGO_ACCEPT,
  MENU_IMAGE_ACCEPT,
  LOGO_FORMATS_HINT,
  MENU_IMAGE_FORMATS_HINT,
} from '../lib/uploadFiles';
import { Spinner, btnGhost } from './ui';

export default function ImageUploadField({
  kind,
  value,
  onChange,
  getSignedUrl,
  ready = true,
  notReadyHint,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isItem = kind === 'item';
  const validate = isItem ? validateMenuImageFile : validateLogoFile;
  const accept = isItem ? MENU_IMAGE_ACCEPT : LOGO_ACCEPT;
  const hint = isItem ? MENU_IMAGE_FORMATS_HINT : LOGO_FORMATS_HINT;

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setError(null);

    const check = validate(file);
    if (!check.ok) return setError(check.error);

    setBusy(true);
    try {
      const { bucket, path, token, publicUrl, maxBytes } = await getSignedUrl({
        kind,
        file_name: file.name,
        mime_type: check.mimeType,
      });
      if (maxBytes && file.size > maxBytes) {
        throw new Error(`Image too large (max ${Math.floor(maxBytes / 1024 / 1024)} MB).`);
      }
      await uploadProofFile(bucket, path, token, file);
      onChange(publicUrl);
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <p className="text-xs text-brand-grey border border-dashed border-brand-border rounded-xl px-3 py-2.5">
        {notReadyHint || `Save this first, then edit it to upload ${isItem ? 'a photo' : 'a logo'}.`}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-14 h-14 rounded-lg bg-brand-surface border border-brand-border flex items-center justify-center overflow-hidden shrink-0">
        {value ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-5 h-5 text-brand-grey/50" />
        )}
      </div>
      <div className="min-w-0">
        <label className={btnGhost + ' !py-1.5 !px-3 !text-xs cursor-pointer inline-flex'}>
          {busy ? <Spinner className="!w-3.5 !h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
          {value ? 'Replace image' : 'Upload image'}
          <input type="file" accept={accept} onChange={onPick} disabled={busy} className="hidden" />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-2 text-xs font-bold text-brand-grey hover:text-red-600 cursor-pointer"
          >
            Remove
          </button>
        )}
        <p className="text-[11px] text-brand-grey mt-1">{error || hint}</p>
      </div>
    </div>
  );
}
