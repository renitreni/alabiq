// ---------------------------------------------------------------------
// Admin — All User Accounts (passenger, driver, merchant, admin).
// Full CRUD: view, filter, change role, deactivate/reactivate, reset password.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  User,
  UserCheck,
  ShieldCheck,
  Lock,
  RotateCcw,
  UserX,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download,
} from 'lucide-react';
import { api } from '../lib/api';
import { notifySuccess, notifyError, confirmAction } from '../lib/notify';
import { Card, Badge, Spinner, inputClass, btnPrimary, btnGhost } from '../components/ui';
import { toCsv, downloadCsv } from '../lib/csv';

const ROLE_OPTIONS = [
  { value: 'passenger', label: 'Passenger' },
  { value: 'driver', label: 'Driver' },
  { value: 'merchant', label: 'Merchant' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
];

function StatusBadge({ status }) {
  if (status === 'disabled') {
    return (
      <Badge variant="destructive" className="gap-1">
        <UserX className="w-3 h-3" />
        Disabled
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="gap-1">
      <UserCheck className="w-3 h-3" />
      Active
    </Badge>
  );
}

function PasswordModal({ password, email, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 animate-in fade-in zoom-in-95">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-brand-orange" />
          </div>
          <div>
            <h3 className="text-lg font-black text-brand-black">Password for {email}</h3>
            <p className="text-sm text-brand-grey mt-1">
              This is shown once and is not stored anywhere. Copy it now and give it to them
              privately, then have them change it on first login.
            </p>
          </div>
        </div>
        <div className="bg-brand-surface border border-brand-border rounded-xl p-4 mb-4">
          <code className="font-mono text-base break-all select-all text-brand-dark" id="generated-password">
            {password}
          </code>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(password).then(
                () => notifySuccess('Password copied'),
                () => notifyError('Could not copy. Select the text and copy it by hand.')
              );
            }}
            className={btnGhost + ' flex-1'}
          >
            Copy Password
          </button>
          <button type="button" onClick={onClose} className={btnPrimary + ' flex-1'}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleSelect({ user, onChange, disabled }) {
  return (
    <select
      value={user.role}
      onChange={(e) => onChange(user.id, e.target.value)}
      disabled={disabled}
      className={inputClass + ' py-1.5 text-sm w-full'}
    >
      {ROLE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export default function AccountsView() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [limit] = useState(50);
  const [passwordModal, setPasswordModal] = useState(null);
  const [savingRole, setSavingRole] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminListUsers({
        page,
        limit,
        search: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      });
      setUsers(res.users || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch {
      // Error already shown by api client
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, roleFilter, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRoleChange = async (userId, newRole) => {
    const user = users.find((u) => u.id === userId);
    if (!user || user.role === newRole) return;

    setSavingRole(userId);
    try {
      await api.adminUpdateUserRole(userId, newRole);
      notifySuccess(`Role updated to ${newRole}`);
      loadUsers();
    } catch {
      // Error already shown by api client
    } finally {
      setSavingRole(null);
    }
  };

  const handleDeactivate = async (user) => {
    const confirmed = await confirmAction({
      title: 'Deactivate Account',
      text: 'Are you sure you want to deactivate ' + (user.full_name || user.email) + '? They will not be able to sign in.',
      confirmText: 'Deactivate',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      await api.adminDeactivateUser(user.id);
      notifySuccess('Account deactivated');
      loadUsers();
    } catch {
      // Error already shown
    }
  };

  const handleReactivate = async (user) => {
    const confirmed = await confirmAction({
      title: 'Reactivate Account',
      text: 'Reactivate ' + (user.full_name || user.email) + '? They will be able to sign in again.',
      confirmText: 'Reactivate',
    });
    if (!confirmed) return;

    try {
      await api.adminReactivateUser(user.id);
      notifySuccess('Account reactivated');
      loadUsers();
    } catch {
      // Error already shown
    }
  };

  const handleResetPassword = async (user) => {
    const confirmed = await confirmAction({
      title: 'Reset Password',
      text: 'Generate a new password for ' + (user.full_name || user.email) + '? The new password will be shown once and cannot be retrieved again.',
      confirmText: 'Reset Password',
      variant: 'warning',
    });
    if (!confirmed) return;

    try {
      const res = await api.adminResetUserPassword(user.id);
      setPasswordModal({ password: res.password, email: res.email });
      notifySuccess('Password reset - shown below');
    } catch {
      // Error already shown
    }
  };

  const handleExport = () => {
    const csv = toCsv(
      users.map((u) => ({
        Email: u.email,
        Name: u.full_name || '',
        Role: u.role,
        Status: u.status,
        'Super Admin': u.is_super_admin ? 'Yes' : 'No',
        'Driver Approved': u.driver_approved ? 'Yes' : 'No',
        'Driver Verification': u.driver_verification_status || '',
        Mobile: u.mobile_number || '',
        WhatsApp: u.whatsapp_number || '',
        Created: u.created_at ? new Date(u.created_at).toLocaleString() : '',
        'Last Login': u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '',
        'Env Managed': u.env_managed ? 'Yes' : 'No',
      }))
    );
    downloadCsv(csv, 'accounts-' + new Date().toISOString().split('T')[0] + '.csv');
    notifySuccess('Exported to CSV');
  };

  const currentUserId = users.find((u) => u.email === 'ferdzsabado@alabiq.com' || u.email === 'ferdz@alabiq.com' || u.email === 'prynz@alabiq.com')?.id;

  return (
    <div className="space-y-4">
      {/* Header with search, filters, export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 max-w-md">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputClass + ' pl-10 pr-4'}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className={inputClass + ' w-36'}
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className={inputClass + ' w-36'}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button type="button" onClick={handleExport} className={btnGhost} title="Export to CSV">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
      <Card className="overflow-hidden">
        {loading && users.length === 0 ? (
          <div className="p-8 text-center">
            <Spinner className="mx-auto mb-2" size="lg" />
            <p className="text-brand-grey">Loading accounts...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <User className="w-12 h-12 text-brand-grey mx-auto mb-3" />
            <p className="text-brand-grey">No accounts found matching your filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-brand-grey border-b border-brand-border bg-brand-surface uppercase text-xs font-bold tracking-wider">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4 hidden md:table-cell">Role</th>
                    <th className="py-3 px-4 hidden lg:table-cell">Status</th>
                    <th className="py-3 px-4 hidden xl:table-cell">Badges</th>
                    <th className="py-3 px-4 hidden xl:table-cell">Contact</th>
                    <th className="py-3 px-4 hidden 2xl:table-cell">Created</th>
                    <th className="py-3 px-4 hidden 2xl:table-cell">Last Login</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className={`border-b last:border-0 border-brand-border hover:bg-brand-orange/5 ${user.status === 'disabled' ? 'opacity-70' : ''} transition-colors`}
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-black text-brand-black">{user.full_name || '—'}</p>
                          <p className="text-brand-grey truncate max-w-xs">{user.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell">
                        <RoleSelect
                          user={user}
                          onChange={handleRoleChange}
                          disabled={savingRole === user.id || user.env_managed}
                        />
                        {savingRole === user.id && <Loader2 className="w-4 h-4 animate-spin text-brand-orange inline-block ml-1" />}
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <StatusBadge status={user.status} />
                      </td>
                      <td className="py-3 px-4 hidden xl:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {user.is_super_admin && (
                            <Badge variant="secondary" className="gap-1" title="Super Admin">
                              <ShieldCheck className="w-3 h-3" />
                              Super
                            </Badge>
                          )}
                          {user.env_managed && (
                            <Badge variant="outline" className="gap-1" title="Managed by environment variables">
                              <AlertCircle className="w-3 h-3" />
                              Env
                            </Badge>
                          )}
                          {user.role === 'driver' && user.driver_approved && (
                            <Badge variant="success" className="gap-1" title="Driver Approved">
                              <UserCheck className="w-3 h-3" />
                              Approved
                            </Badge>
                          )}
                          {user.role === 'driver' && !user.driver_approved && user.driver_verification_status && (
                            <Badge variant="warning" className="gap-1" title={'Driver: ' + user.driver_verification_status}>
                              <AlertCircle className="w-3 h-3" />
                              {user.driver_verification_status}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 hidden xl:table-cell">
                        <div className="text-brand-grey space-y-1">
                          {user.mobile_number && (
                            <p className="truncate max-w-xs" title={user.mobile_number}>{user.mobile_number}</p>
                          )}
                          {user.whatsapp_number && (
                            <p className="truncate max-w-xs text-brand-orange" title={user.whatsapp_number}>
                              {user.whatsapp_number}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 hidden 2xl:table-cell text-brand-grey whitespace-nowrap">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4 hidden 2xl:table-cell text-brand-grey whitespace-nowrap">
                        {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {user.status === 'active' && !user.env_managed && user.id !== currentUserId && (
                            <button
                              type="button"
                              onClick={() => handleDeactivate(user)}
                              className="p-2 rounded-xl text-brand-grey hover:text-brand-red hover:bg-brand-red/10 transition-colors"
                              title="Deactivate account"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )}
                          {user.status === 'disabled' && !user.env_managed && (
                            <button
                              type="button"
                              onClick={() => handleReactivate(user)}
                              className="p-2 rounded-xl text-brand-grey hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Reactivate account"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          {!user.env_managed && (
                            <button
                              type="button"
                              onClick={() => handleResetPassword(user)}
                              className="p-2 rounded-xl text-brand-grey hover:text-brand-orange hover:bg-brand-orange/10 transition-colors"
                              title="Reset password"
                            >
                              <Lock className="w-4 h-4" />
                            </button>
                          )}
                          {user.env_managed && (
                            <span className="p-2 rounded-xl text-brand-grey" title="Managed by environment variables">
                              <AlertCircle className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-brand-border">
                <div className="text-sm text-brand-grey">
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} accounts
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className={btnGhost + ' px-3 py-1.5'}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-brand-dark px-2">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || loading}
                    className={btnGhost + ' px-3 py-1.5'}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Password Modal */}
      {passwordModal && (
        <PasswordModal
          password={passwordModal.password}
          email={passwordModal.email}
          onClose={() => setPasswordModal(null)}
        />
      )}
    </div>
  );
}
