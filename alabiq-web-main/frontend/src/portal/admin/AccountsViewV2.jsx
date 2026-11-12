// ---------------------------------------------------------------------
// Admin — All User Accounts using DataTable component
// Full CRUD: view, filter, change role, deactivate/reactivate, reset password.
// ---------------------------------------------------------------------
import { useCallback, useMemo, useState } from 'react';
import {
  User,
  UserCheck,
  ShieldCheck,
  Lock,
  RotateCcw,
  UserX,
  AlertCircle,
  Download,
} from 'lucide-react';
import { api } from '../lib/api';
import { notifySuccess, notifyError, confirmAction } from '../lib/notify';
import { DataTable, createColumn } from '../components/DataTable';
import { Badge } from '@/components/ui/badge';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 animate-in fade-in zoom-in-95">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Password for {email}</h3>
            <p className="text-sm text-gray-500 mt-1">
              This is shown once and is not stored anywhere. Copy it now and give it to them
              privately, then have them change it on first login.
            </p>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
          <code className="font-mono text-base break-all select-all" id="generated-password">
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
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Copy Password
          </button>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange/90">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleSelect({ user, onChange, disabled, savingRole }) {
  return (
    <select
      value={user.role}
      onChange={(event) => onChange(user.id, event.target.value)}
      disabled={disabled || savingRole === user.id}
      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
    >
      {ROLE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export default function AccountsViewV2() {
  const [passwordModal, setPasswordModal] = useState(null);
  const [savingRole, setSavingRole] = useState(null);

  // Define columns using the new column system
  const columns = useMemo(() => [
    createColumn('id', { header: 'ID', type: 'text', width: '80px', maxWidth: 120, sticky: 'left', className: 'font-mono text-xs' }),
    createColumn('email', { header: 'Email', type: 'email', width: '250px', maxWidth: 280, sticky: 'left' }),
    createColumn('full_name', { header: 'Name', width: '200px' }),
    createColumn('role', {
      header: 'Role',
      type: 'badge',
      width: '130px',
      badgeMap: {
        passenger: 'neutral',
        driver: 'info',
        merchant: 'warning',
        admin: 'success',
      },
      filterable: true,
      filterType: 'select',
      render: (value, row) => (
        <RoleSelect user={row} onChange={handleRoleChange} disabled={false} savingRole={savingRole} />
      ),
    }),
    createColumn('status', {
      header: 'Status',
      type: 'badge',
      width: '120px',
      badgeMap: {
        active: 'success',
        disabled: 'danger',
      },
      filterable: true,
      filterType: 'select',
    }),
    createColumn('last_login_at', { header: 'Last Login', type: 'date', width: '140px', format: 'relative' }),
    createColumn('actions', {
      header: 'Actions',
      type: 'actions',
      width: '160px',
      sticky: 'right',
      actions: [
        {
          label: 'Reset Password',
          icon: Lock,
          onClick: async (row) => {
            try {
              const res = await api.adminResetUserPassword(row.id);
              setPasswordModal({ password: res.password, email: res.email });
            } catch {
              // Error already shown
            }
          },
        },
        {
          label: 'Deactivate',
          icon: UserX,
          variant: 'destructive',
          onClick: async (row) => {
            const confirmed = await confirmAction({
              title: 'Deactivate Account',
              text: `Are you sure you want to deactivate ${row.full_name || row.email}? They will not be able to sign in.`,
              confirmText: 'Deactivate',
              variant: 'destructive',
            });
            if (!confirmed) return;
            try {
              await api.adminDeactivateUser(row.id);
              notifySuccess('Account deactivated');
            } catch {
              // Error already shown
            }
          },
          disabled: (row) => row.env_managed || row.status === 'disabled',
        },
        {
          label: 'Reactivate',
          icon: RotateCcw,
          onClick: async (row) => {
            const confirmed = await confirmAction({
              title: 'Reactivate Account',
              text: `Reactivate ${row.full_name || row.email}? They will be able to sign in again.`,
              confirmText: 'Reactivate',
            });
            if (!confirmed) return;
            try {
              await api.adminReactivateUser(row.id);
              notifySuccess('Account reactivated');
            } catch {
              // Error already shown
            }
          },
          disabled: (row) => row.env_managed || row.status !== 'disabled',
        },
      ],
    }),
  ], []);

  // Filter fields for the header
  const filterFields = useMemo(() => [
    { key: 'role', label: 'Role', filterType: 'select', options: ROLE_OPTIONS },
    { key: 'status', label: 'Status', filterType: 'select', options: STATUS_OPTIONS },
  ], []);

  // Fetch function for useDataTable
  const fetchUsers = useCallback(async (params) => {
    const queryParams = {
      page: params.page,
      limit: params.limit,
      search: params.search,
      role: params.filters?.role,
      status: params.filters?.status,
    };
    const res = await api.adminListUsers(queryParams);
    return {
      data: (res.users || []).map(userData => ({
        ...userData,
        status: userData.disabled_at ? 'disabled' : 'active',
        env_managed: userData.env_managed,
      })),
      pagination: {
        total: res.total,
        totalPages: res.totalPages,
        page: res.page,
        limit: res.limit,
      },
    };
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.adminUpdateUserRole(userId, newRole);
      notifySuccess(`Role updated to ${newRole}`);
    } catch {
      // Error already shown by api client
    }
  };

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        fetchFn={fetchUsers}
        rowKey="id"
        serverSide={true}
        initialPage={1}
        initialLimit={25}
        initialSortBy="created_at"
        initialSortOrder="desc"
        initialFilters={{ role: '', status: '' }}
        selectable={false}
        expandable={false}
        showExport={true}
        exportFilename="accounts"
        filterFields={filterFields}
        maxHeight="70vh"
        emptyMessage="No accounts found"
        emptyIcon={User}
      />
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
