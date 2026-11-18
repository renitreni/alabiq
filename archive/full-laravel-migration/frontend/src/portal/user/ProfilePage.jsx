// ---------------------------------------------------------------------
// My Profile — /profile
// Edit personal info (name, phones, delivery address), upload a profile
// picture, and change password through the Alabiq API. Saves PATCH
// /api/auth/profile then refreshes the AuthProvider profile so the navbar
// picks the changes up instantly.
// ---------------------------------------------------------------------
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, User, Phone, MapPin, Mail, KeyRound, Save, History, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthProvider';
import { MAX_NAME_LENGTH } from '../lib/fieldValidation';
import { uploadProofFile } from '../lib/gatewayClient';
import { compressImage } from '../lib/imageCompress';
import { notifySuccess, notifyError, confirmAction } from '../lib/notify';
import { getPasswordValidationError } from '../lib/passwordValidation';
import { PortalShell, Card, Field, Spinner, inputClass, btnPrimary, btnGhost } from '../components/ui';

function initialsOf(name, email) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase();
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    fullName: profile?.fullName || '',
    mobile: profile?.mobile || '',
    whatsapp: profile?.whatsapp || '',
    address: profile?.address || '',
  });
  const [savingInfo, setSavingInfo] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const email = user?.email || '';
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function saveInfo(e) {
    e.preventDefault();
    setSavingInfo(true);
    try {
      await api.updateProfile({
        full_name: form.fullName.trim() || null,
        mobile_number: form.mobile.trim() || null,
        whatsapp_number: form.whatsapp.trim() || null,
        address: form.address.trim() || null,
      });
      await refreshProfile();
      notifySuccess('Profile updated', 'Your information was saved.');
    } catch {
      /* api.js already showed the error popup */
    } finally {
      setSavingInfo(false);
    }
  }

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    try {
      // Downscale before the size check, not after: a straight-off-the-camera
      // photo is comfortably over the limit at full resolution but well under
      // it once resized, and rejecting it would be pointless.
      const image = await compressImage(file);
      const { bucket, path, token, publicUrl, maxBytes } = await api.avatarSignedUrl({
        file_name: image.name,
        mime_type: image.type,
      });
      if (image.size > maxBytes) throw new Error('The image is too large (max 5 MB).');
      await uploadProofFile(bucket, path, token, image);
      await api.updateProfile({ avatar_url: publicUrl });
      setAvatarPreview(publicUrl);
      await refreshProfile();
      notifySuccess('Photo updated', 'Your profile picture was saved.');
    } catch (err) {
      if (err?.message && !err.status) notifyError(err.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveSecurity(e) {
    e.preventDefault();
    const wantsPassword = password.length > 0;
    if (!wantsPassword) return;
    // Shared rule. This used to be a bare `< 6`, which was looser than both
    // signup and the admin-issued merchant passwords (8, lib/validate.js) —
    // and was historically looser than the server-side rule. A
    // merchant handed a compliant password could immediately downgrade it.
    if (wantsPassword) {
      const validationError = getPasswordValidationError(password);
      if (validationError) {
        notifyError(validationError);
        return;
      }
    }
    if (wantsPassword && password !== password2) {
      notifyError('Passwords do not match.');
      return;
    }
    setSavingSecurity(true);
    try {
      await api.changePassword(password);
      setPassword('');
      setPassword2('');
      notifySuccess(
        'Account updated',
        'Your password was changed. Please sign in again on this device.'
      );
      await signOut();
    } catch (err) {
      notifyError(err.message || 'Could not update your account.');
    } finally {
      setSavingSecurity(false);
    }
  }

  // Both app stores require an in-app way to delete an account. The server
  // refuses while a trip or order is still running and explains why, so the
  // error popup api.js raises is the right thing for the user to read.
  async function deleteAccount() {
    const confirmed = await confirmAction({
      title: 'Delete your account?',
      text: 'This removes your profile, contact details and saved addresses, and cannot be undone. Records of past payments are kept in anonymised form as required by tax law.',
      confirmText: 'Delete permanently',
      danger: true,
      requireText: 'DELETE',
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      await api.deleteAccount();
      notifySuccess('Account deleted', 'Your account has been removed.');
      await signOut();
      navigate('/', { replace: true });
    } catch {
      /* api.js already showed the error popup */
    } finally {
      setDeleting(false);
    }
  }

  const avatarUrl = avatarPreview || profile?.avatarUrl || null;

  return (
    <PortalShell title="My profile" subtitle="Manage your account" onBack={() => navigate('/home')}>
      <div className="max-w-2xl mx-auto space-y-5 pb-10">
        <Card className="p-6 flex flex-col sm:flex-row items-center gap-5">
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-brand-orange to-brand-red flex items-center justify-center ring-4 ring-brand-orange/15">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-2xl font-black">
                  {initialsOf(profile?.fullName, user?.email)}
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-brand-orange text-white flex items-center justify-center shadow-lg cursor-pointer hover:bg-brand-orange/90 disabled:opacity-60"
              title="Change photo"
            >
              {uploadingAvatar ? (
                <Spinner className="!w-4 !h-4 !border-white/40 !border-t-white" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={pickAvatar}
            />
          </div>
          <div className="text-center sm:text-left min-w-0">
            <p className="font-black text-brand-black text-xl truncate">
              {profile?.fullName || 'Add your name'}
            </p>
            <p className="text-sm text-brand-grey truncate">{user?.email}</p>
            <button
              type="button"
              onClick={() => navigate('/transactions')}
              className={btnGhost + ' !py-2 !px-3.5 !text-xs mt-3'}
            >
              <History className="w-3.5 h-3.5" /> Order history
            </button>
          </div>
        </Card>

        <Card className="p-6">
          <p className="font-black text-brand-black mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-brand-orange" /> Personal information
          </p>
          <form onSubmit={saveInfo} className="space-y-3">
            <Field label="Full name">
              <input value={form.fullName} onChange={set('fullName')} className={inputClass} placeholder="Your name" maxLength={MAX_NAME_LENGTH} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Mobile number">
                <div className="relative">
                  <Phone className="w-4 h-4 text-brand-grey absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input value={form.mobile} onChange={set('mobile')} className={inputClass + ' !pl-10'} placeholder="05XXXXXXXX" />
                </div>
              </Field>
              <Field label="WhatsApp number">
                <div className="relative">
                  <Phone className="w-4 h-4 text-brand-grey absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input value={form.whatsapp} onChange={set('whatsapp')} className={inputClass + ' !pl-10'} placeholder="05XXXXXXXX" />
                </div>
              </Field>
            </div>
            <Field label="Delivery address">
              <div className="relative">
                <MapPin className="w-4 h-4 text-brand-grey absolute left-3.5 top-3.5" />
                <textarea
                  value={form.address}
                  onChange={set('address')}
                  rows={2}
                  className={inputClass + ' !pl-10 resize-none'}
                  placeholder="Building, street, district, city"
                />
              </div>
            </Field>
            <button type="submit" disabled={savingInfo} className={btnPrimary + ' w-full'}>
              {savingInfo ? <Spinner className="!border-white/40 !border-t-white" /> : (<><Save className="w-4 h-4" /> Save changes</>)}
            </button>
          </form>
        </Card>

        <Card className="p-6" id="settings">
          <p className="font-black text-brand-black mb-4 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-brand-orange" /> Account &amp; security
          </p>
          <form onSubmit={saveSecurity} className="space-y-3">
            <Field label="Email address (contact support to change)">
              <div className="relative">
                <Mail className="w-4 h-4 text-brand-grey absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input type="email" value={email} disabled className={inputClass + ' !pl-10 opacity-70'} />
              </div>
            </Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="New password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Leave blank to keep"
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  className={inputClass}
                  placeholder="Repeat the password"
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <button type="submit" disabled={savingSecurity} className={btnPrimary + ' w-full'}>
              {savingSecurity ? <Spinner className="!border-white/40 !border-t-white" /> : (<><Save className="w-4 h-4" /> Update account</>)}
            </button>
          </form>
        </Card>

        <Card className="p-6 border-red-200">
          <p className="font-black text-red-600 mb-2 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Delete account
          </p>
          <p className="text-sm text-brand-grey mb-4">
            Permanently delete your account and personal data. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={deleteAccount}
            disabled={deleting}
            className={btnGhost + ' w-full !text-red-600 hover:!bg-red-50 disabled:opacity-50'}
          >
            {deleting ? <Spinner /> : (<><Trash2 className="w-4 h-4" /> Delete my account</>)}
          </button>
        </Card>
      </div>
    </PortalShell>
  );
}
