// ---------------------------------------------------------------------
// DataTable Column Types - Built-in renderers for common column types.
// ---------------------------------------------------------------------
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function formatCurrency(value, currency = 'SAR') {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (Number.isNaN(number)) return '-';
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency,
    minimumFractionDigits: number % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatDate(value, options = {}) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

export function formatDateTime(value, options = {}) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

export function formatRelativeTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 45) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(value);
}

export function formatPhone(value) {
  if (!value) return '-';
  return String(value).replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
}

export function truncateText(text, maxLength = 50) {
  if (text === null || text === undefined || text === '') return '-';
  const value = String(text);
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

export function getBadgeTone(value, badgeMap = {}) {
  if (badgeMap[value]) return badgeMap[value];

  const lower = String(value || '').toLowerCase();
  if (['active', 'verified', 'approved', 'completed', 'delivered', 'paid', 'success'].includes(lower)) return 'success';
  if (['pending', 'waiting', 'processing', 'preparing', 'out_for_delivery', 'submitted'].includes(lower)) return 'warning';
  if (['rejected', 'cancelled', 'failed', 'error', 'disabled', 'banned', 'expired'].includes(lower)) return 'danger';
  if (['info', 'driver'].includes(lower)) return 'info';
  return 'neutral';
}

function badgeVariantForTone(tone) {
  if (tone === 'success') return 'success';
  if (tone === 'warning') return 'warning';
  if (tone === 'danger') return 'destructive';
  if (tone === 'neutral' || tone === 'info') return 'secondary';
  return 'secondary';
}

export const ColumnRenderers = {
  text: ({ value, column }) => {
    const maxWidth = column.maxWidth || 300;
    const truncated = truncateText(value, Math.floor(maxWidth / 7));
    return (
      <span className={cn('truncate block', column.className)} style={{ maxWidth }} title={String(value || '')}>
        {truncated}
      </span>
    );
  },

  email: ({ value, column }) => {
    if (!value) return '-';
    const maxWidth = column.maxWidth || 300;
    return (
      <a href={`mailto:${value}`} className={cn('truncate block text-primary hover:underline', column.className)} style={{ maxWidth }} title={value}>
        {truncateText(value, Math.floor(maxWidth / 7))}
      </a>
    );
  },

  phone: ({ value, column }) => (
    <span className={cn('truncate block', column.className)} style={{ maxWidth: column.maxWidth || 200 }} title={value || ''}>
      {formatPhone(value)}
    </span>
  ),

  currency: ({ value, column }) => (
    <span className={cn('font-mono tabular-nums text-right', column.className)} title={formatCurrency(value, column.currency)}>
      {formatCurrency(value, column.currency)}
    </span>
  ),

  date: ({ value, column }) => (
    <span className={cn('font-mono whitespace-nowrap', column.className)} title={formatDateTime(value)}>
      {column.format === 'relative' ? formatRelativeTime(value) : formatDate(value)}
    </span>
  ),

  datetime: ({ value, column }) => (
    <span className={cn('font-mono whitespace-nowrap', column.className)} title={formatDateTime(value)}>
      {formatDateTime(value)}
    </span>
  ),

  badge: ({ value, column }) => {
    const tone = getBadgeTone(value, column.badgeMap);
    return (
      <Badge variant={badgeVariantForTone(tone)} className={cn('whitespace-nowrap', column.className)}>
        {column.badgeLabel?.[value] || String(value || '-')}
      </Badge>
    );
  },

  boolean: ({ value, column }) => (
    <span className={cn('font-medium', value ? 'text-green-700' : 'text-gray-400', column.className)}>
      {value ? 'Yes' : 'No'}
    </span>
  ),

  image: ({ value, column }) => {
    if (!value) return '-';
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="block" title="Open image">
        <img
          src={value}
          alt=""
          className={cn('rounded object-cover', column.className)}
          style={{
            width: column.imageWidth || 60,
            height: column.imageHeight || 40,
            maxWidth: column.maxWidth,
          }}
          loading="lazy"
        />
      </a>
    );
  },

  actions: ({ row, column }) => {
    const actions = column.actions || [];
    if (!actions.length) return null;

    if (actions.length <= 2 && !column.useDropdown) {
      return (
        <div className="flex items-center gap-1">
          {actions.map((action, index) => (
            <Button
              key={action.label || index}
              type="button"
              variant={action.variant || 'ghost'}
              size="icon"
              onClick={() => action.onClick?.(row, action)}
              disabled={typeof action.disabled === 'function' ? action.disabled(row) : action.disabled}
              title={action.label}
              aria-label={action.label}
            >
              {action.icon && <action.icon className="w-4 h-4" />}
            </Button>
          ))}
        </div>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Row actions">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          {actions.map((action, index) => (
            <DropdownMenuItem
              key={action.label || index}
              onSelect={() => action.onClick?.(row, action)}
              disabled={typeof action.disabled === 'function' ? action.disabled(row) : action.disabled}
              className={cn((action.destructive || action.variant === 'destructive') && 'text-red-600 focus:bg-red-50')}
            >
              {action.icon && <action.icon className="mr-2 h-4 w-4" />}
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },

  custom: ({ value, row, column }) => {
    if (typeof column.render === 'function') return column.render(value, row, column);
    return String(value ?? '-');
  },
};

export const DefaultColumnConfig = {
  text: { type: 'text', sortable: true, filterable: true, filterType: 'text' },
  email: { type: 'email', sortable: true, filterable: true, filterType: 'text' },
  phone: { type: 'phone', sortable: false, filterable: false },
  currency: { type: 'currency', sortable: true, filterable: false, currency: 'SAR' },
  date: { type: 'date', sortable: true, filterable: true, filterType: 'date' },
  datetime: { type: 'datetime', sortable: true, filterable: true, filterType: 'date' },
  badge: { type: 'badge', sortable: true, filterable: true, filterType: 'select' },
  boolean: { type: 'boolean', sortable: true, filterable: true, filterType: 'boolean' },
  image: { type: 'image', sortable: false, filterable: false },
  actions: { type: 'actions', sortable: false, filterable: false, width: '120px', sticky: 'right' },
  custom: { type: 'custom', sortable: false, filterable: false },
};

export function createColumn(key, overrides = {}) {
  // Two call shapes exist in the admin views: createColumn('col_key', {...})
  // and the object form createColumn({ key: 'col_key', ... }). Normalize the
  // object form here so every view keeps working.
  if (key !== null && typeof key === 'object') {
    overrides = key;
    key = key.key;
  }
  const type =
    overrides.type ||
    (typeof overrides.render === 'function' || typeof overrides.cell === 'function'
      ? 'custom'
      : 'text');
  const defaults = DefaultColumnConfig[type] || DefaultColumnConfig.text;
  // Some views pass a row-only `cell` callback instead of the `render`
  // (value, row, column) callback DataTableCell actually reads — bridge it.
  const { cell, ...rest } = overrides;
  const render =
    typeof rest.render === 'function'
      ? rest.render
      : typeof cell === 'function'
        ? (value, row, column) => cell(row, column)
        : undefined;
  return {
    key,
    header:
      overrides.header ||
      String(key).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    ...defaults,
    ...rest,
    ...(render ? { render } : {}),
  };
}

export const ColumnPresets = {
  id: createColumn('id', { header: 'ID', type: 'text', width: '80px', maxWidth: 120, sticky: 'left', className: 'font-mono text-xs' }),
  email: createColumn('email', { header: 'Email', type: 'email', width: '250px', maxWidth: 280, sticky: 'left' }),
  name: createColumn('full_name', { header: 'Name', type: 'text', width: '200px', maxWidth: 240 }),
  role: createColumn('role', {
    header: 'Role',
    type: 'badge',
    width: '120px',
    badgeMap: {
      passenger: 'neutral',
      driver: 'info',
      merchant: 'warning',
      admin: 'success',
    },
  }),
  status: createColumn('status', {
    header: 'Status',
    type: 'badge',
    width: '120px',
    badgeMap: {
      active: 'success',
      disabled: 'danger',
      pending: 'warning',
      suspended: 'danger',
      approved: 'success',
      rejected: 'danger',
      verified: 'success',
    },
  }),
  createdAt: createColumn('created_at', { header: 'Created', type: 'date', width: '140px', format: 'relative' }),
  updatedAt: createColumn('updated_at', { header: 'Updated', type: 'date', width: '140px', format: 'relative' }),
  lastLogin: createColumn('last_login_at', { header: 'Last Login', type: 'date', width: '140px', format: 'relative' }),
  amount: createColumn('amount', { header: 'Amount', type: 'currency', width: '130px' }),
  actions: (actions) => createColumn('actions', { header: 'Actions', type: 'actions', actions, width: '120px', sticky: 'right' }),
};
