// ---------------------------------------------------------------------
// Admin — who has the portal, and who has been signing in (0043).
// Visible to and usable by every admin: the backend super-admin tier was
// removed, so the list, login activity and every mutation below work for
// any admin (self-deactivation and the last super admin are still refused
// server-side).
//
// Two sections, the two halves of the same question:
//   Admins        — the CRUD: create, edit, promote, deactivate, reset.
//   Login activity— the log: who signed in, when, and from where.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  ShieldX,
  Plus,
  Pencil,
  KeyRound,
  RefreshCw,
  Search,
  Download,
  Lock,
  UserCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { MAX_NAME_LENGTH } from '../lib/fieldValidation';
import { notifySuccess, notifyError } from '../lib/notify';
import { toCsv, downloadCsv } from '../lib/csv';
import { Card, Field, Badge, Spinner, inputClass, btnPrimary, btnGhost } from '../components/ui';
import PasswordInput from '../components/PasswordInput';

const EMPTY_ADMIN = {
  email: '',
  full_name: '',
  mobile_number: '',
  whatsapp_number: '',
  is_super_admin: false,
};

function fmtWhen(ts) {
  if (!ts) return '--';
  return new Date(ts).toLocaleString();
}

// A generated password is shown once and never again — we do not store it.
// It gets its own panel rather than a toast so it cannot be dismissed by
// the next notification before it has been written down.
function ResetPasswordModal({ email, onClose, onSave }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return setError('Password is required.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password.length > 128) return setError('Password must be at most 128 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setError('');
    setSaving(true);
    try {
      await onSave(password);
      onClose();
    } catch {
      /* error surfaced by api client */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 animate-in fade-in zoom-in-95">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-brand-orange" />
          </div>
          <div>
            <h3 className="text-lg font-black text-brand-black">Reset password for {email}</h3>
            <p className="text-sm text-brand-grey mt-1">
              Enter a new password for this admin account.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
              {error}
            </p>
          )}
          <Field label="New password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Enter new password"
              required
              hasError={!!error}
            />
          </Field>
          <Field label="Confirm password">
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Confirm new password"
              required
              hasError={!!error}
            />
          </Field>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={btnGhost + ' flex-1'}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={btnPrimary + ' flex-1'}>
              {saving ? 'Saving...' : 'Reset password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminForm({ initial, isNew, busy, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function submit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) return notifyError('Name is required.');
    if (isNew && !form.email.trim()) return notifyError('Email is required.');
    if (isNew && !form.password) return notifyError('Password is required.');
    if (isNew && form.password.length < 8) return notifyError('Password must be at least 8 characters.');
    if (isNew && form.password.length > 128) return notifyError('Password must be at most 128 characters.');
    const payload = {
      full_name: form.full_name.trim(),
      mobile_number: form.mobile_number.trim() || null,
      whatsapp_number: form.whatsapp_number.trim() || null,
      is_super_admin: !!form.is_super_admin,
    };
    if (isNew) {
      payload.email = form.email.trim().toLowerCase();
      payload.password = form.password;
    }
    return onSave(payload);
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-4">
        <h3 className="font-semibold">{isNew ? 'New admin' : `Edit ${initial.full_name}`}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {isNew && (
            <Field label="Email">
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={set('email')}
                placeholder="name@alabiq.com"
                required
              />
            </Field>
          )}
          <Field label="Full name">
            <input className={inputClass} value={form.full_name} onChange={set('full_name')} required maxLength={MAX_NAME_LENGTH} />
          </Field>
          <Field label="Mobile">
            <input className={inputClass} value={form.mobile_number} onChange={set('mobile_number')} />
          </Field>
          <Field label="WhatsApp">
            <input className={inputClass} value={form.whatsapp_number} onChange={set('whatsapp_number')} />
          </Field>
        </div>

        {isNew && (
          <Field label="Password">
            <PasswordInput
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
              placeholder="Enter password (min 8 chars)"
              required
            />
          </Field>
        )}

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.is_super_admin}
            onChange={set('is_super_admin')}
          />
          <span className="text-sm">
            <span className="font-medium">Super admin</span>
            <span className="block text-gray-500">
              Can manage other admins and change platform settings. Give this to as few people as
              possible.
            </span>
          </span>
        </label>

        {isNew && (
          <p className="text-sm text-gray-500">
            Enter a password for the new admin account. If the email already belongs to an account,
            that account is promoted to admin and its password is reset to the value you provide.
          </p>
        )}

        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? 'Saving...' : isNew ? 'Create admin' : 'Save changes'}
          </button>
          <button type="button" className={btnGhost} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

// --- Admins -----------------------------------------------------------
function AdminsSection({ admins, loading, onChanged }) {
  // null | 'new' | admin — the same shape FoodAdmin and ShopAdmin use.
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [resetPasswordModal, setResetPasswordModal] = useState(null); // { admin, onSave }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter(
      (a) => a.full_name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q)
    );
  }, [admins, search]);

  async function save(payload) {
    setBusy(true);
    try {
      if (editing === 'new') {
        await api.adminCreateAdmin(payload);
        notifySuccess('Admin created.');
      } else {
        await api.adminUpdateAdmin(editing.id, payload);
        notifySuccess('Admin updated.');
      }
      setEditing(null);
      onChanged();
    } catch {
      /* surfaced by the api client */
    } finally {
      setBusy(false);
    }
  }

  function handleResetPassword(a) {
    setResetPasswordModal({
      admin: a,
      onSave: async (password) => {
        await api.adminResetAdminPassword(a.id, password);
        notifySuccess('Password reset.');
        onChanged();
      },
    });
  }

  async function setActive(a, active) {
    setBusy(true);
    try {
      if (active) await api.adminReactivateAdmin(a.id);
      else await api.adminDeactivateAdmin(a.id);
      notifySuccess(active ? 'Account reactivated.' : 'Account deactivated.');
      onChanged();
    } catch {
      /* surfaced — includes the last-super-admin and ADMIN_EMAILS refusals */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {resetPasswordModal && (
        <ResetPasswordModal
          email={resetPasswordModal.admin.email}
          onClose={() => setResetPasswordModal(null)}
          onSave={resetPasswordModal.onSave}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button type="button" className={btnPrimary} onClick={() => setEditing('new')}>
          <Plus className="w-4 h-4 inline mr-1" />
          New admin
        </button>
      </div>

      {editing && (
        <AdminForm
          initial={editing === 'new' ? EMPTY_ADMIN : { ...EMPTY_ADMIN, ...editing }}
          isNew={editing === 'new'}
          busy={busy}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {loading ? (
        <Card className="p-4">
          <Spinner />
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-4">
          <p className="text-gray-500">Hey! No admins match that search.</p>
        </Card>
      ) : (
        <Card className="p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Tier</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{a.full_name || '--'}</td>
                  <td className="py-2 pr-3 text-gray-600 break-all">{a.email}</td>
                  <td className="py-2 pr-3">
                    {a.is_super_admin ? (
                      <Badge tone="green">Super admin</Badge>
                    ) : (
                      <Badge tone="grey">Admin</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {a.disabled_at ? (
                      <Badge tone="red">Deactivated</Badge>
                    ) : (
                      <Badge tone="green">Active</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex justify-end gap-1 flex-wrap">
                      <button
                        type="button"
                        className={btnGhost}
                        title="Edit"
                        onClick={() => setEditing(a)}
                        disabled={busy}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className={btnGhost}
                        title="Reset password"
                        onClick={() => handleResetPassword(a)}
                        disabled={busy}
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      {a.disabled_at ? (
                        <button
                          type="button"
                          className={btnGhost}
                          title="Reactivate"
                          onClick={() => setActive(a, true)}
                          disabled={busy}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={btnGhost}
                          // env_managed accounts cannot be deactivated cleanly:
                          // the sync guard would lock them out instead. Say so
                          // rather than leaving a button that always fails.
                          title={
                            a.env_managed
                              ? 'Listed in ADMIN_EMAILS — remove it from the server environment first'
                              : 'Deactivate'
                          }
                          onClick={() => setActive(a, false)}
                          disabled={busy || a.env_managed}
                        >
                          <ShieldX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// --- Login activity ---------------------------------------------------
const PAGE_SIZE = 50;

function LoginActivitySection() {
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        api.adminLoginSummary(days),
        api.adminLoginEvents(`?limit=${PAGE_SIZE}&offset=${offset}`),
      ]);
      setSummary(s);
      setEvents(e.events || []);
      setTotal(e.total || 0);
    } catch {
      /* surfaced */
    } finally {
      setLoading(false);
    }
  }, [days, offset]);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    const csv = toCsv(events, [
      { key: 'occurred_at', header: 'When' },
      { key: 'email', header: 'Admin' },
      { key: 'ip', header: 'IP' },
      { key: 'user_agent', header: 'Device' },
    ]);
    downloadCsv(`admin-logins-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const stats = [
    { label: 'Sign-ins', value: summary?.total_logins ?? '--' },
    { label: 'Admins signing in', value: summary?.distinct_admins ?? '--' },
    { label: 'Active last 24h', value: summary?.active_last_24h ?? '--' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-2xl font-semibold mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            className={d === days ? btnPrimary : btnGhost}
            onClick={() => {
              setDays(d);
              setOffset(0);
            }}
          >
            Last {d} days
          </button>
        ))}
        <div className="flex-1" />
        <button type="button" className={btnGhost} onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4 inline mr-1" />
          Refresh
        </button>
        <button type="button" className={btnGhost} onClick={exportCsv} disabled={!events.length}>
          <Download className="w-4 h-4 inline mr-1" />
          CSV
        </button>
      </div>

      {summary?.admins?.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">
            <UserCheck className="w-4 h-4 inline mr-1" />
            Who has been signing in
          </h3>
          <div className="space-y-2">
            {summary.admins.map((a) => (
              <div
                key={a.profile_id || a.email}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span className="font-medium break-all">{a.email}</span>
                <span className="text-gray-500">
                  {a.logins} sign-in{a.logins === 1 ? '' : 's'} &middot; last {fmtWhen(a.last_login)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <Card className="p-4">
          <Spinner />
        </Card>
      ) : events.length === 0 ? (
        <Card className="p-4">
          <p className="text-gray-500">
            No admin sign-ins recorded yet. Rows appear here from the next time an admin logs in.
          </p>
        </Card>
      ) : (
        <Card className="p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Admin</th>
                <th className="py-2 pr-3">IP</th>
                <th className="py-2 pr-3">Device</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtWhen(e.occurred_at)}</td>
                  <td className="py-2 pr-3 break-all">{e.email || '--'}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{e.ip || '--'}</td>
                  <td className="py-2 pr-3 text-xs text-gray-500 max-w-xs truncate" title={e.user_agent}>
                    {e.user_agent || '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            className={btnGhost}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            disabled={offset === 0 || loading}
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <button
            type="button"
            className={btnGhost}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total || loading}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// --- Page -------------------------------------------------------------
export default function AdminsView() {
  const [section, setSection] = useState('admins');
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.adminAdmins();
      setAdmins(res.data || []);
    } catch (err) {
      setLoadError(err.message || 'Failed to load admins');
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          className={section === 'admins' ? btnPrimary : btnGhost}
          onClick={() => setSection('admins')}
        >
          Admins
        </button>
        <button
          type="button"
          className={section === 'activity' ? btnPrimary : btnGhost}
          onClick={() => setSection('activity')}
        >
          Login activity
        </button>
      </div>

      {loadError && (
        <Card className="p-4 border-red-300 bg-red-50">
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 text-red-600 mt-0.5 shrink-0">!</span>
            <div className="text-sm text-red-800">
              <strong>Error loading admins:</strong> {loadError}
              <button
                type="button"
                className="ml-2 text-red-700 underline hover:text-red-900"
                onClick={load}
              >
                Retry
              </button>
            </div>
          </div>
        </Card>
      )}

      {section === 'admins' ? (
        <AdminsSection admins={admins} loading={loading} onChanged={load} />
      ) : (
        <LoginActivitySection />
      )}
    </div>
  );
}
