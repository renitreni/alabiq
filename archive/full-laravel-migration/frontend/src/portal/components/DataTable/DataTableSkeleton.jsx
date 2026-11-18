// ---------------------------------------------------------------------
// DataTableSkeleton - Loading skeleton for DataTable
// ---------------------------------------------------------------------
import { cn } from '@/lib/utils';

export function DataTableSkeleton({
  columns,
  rows = 5,
  hasSelection = false,
  className,
}) {
  const visibleColumns = columns.filter(c => c.hidden !== true);
  const colCount = visibleColumns.length + (hasSelection ? 1 : 0);

  return (
    <div className={cn('animate-pulse', className)}>
      <table className="w-full min-w-max" role="table">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            {hasSelection && (
              <th className="px-4 py-3 border-b border-border" style={{ width: '56px' }}>
                <div className="h-4 w-4 rounded border bg-muted" />
              </th>
            )}
            {visibleColumns.map((column, index) => (
              <th
                key={column.key || index}
                className="px-4 py-3 text-left border-b border-border"
                style={{
                  width: column.width,
                  minWidth: column.minWidth,
                  maxWidth: column.maxWidth,
                }}
              >
                <div className="h-4 w-3/4 bg-muted rounded" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border">
              {hasSelection && (
                <td className="px-4 py-3" style={{ width: '56px' }}>
                  <div className="h-4 w-4 rounded border bg-muted" />
                </td>
              )}
              {visibleColumns.map((_, colIndex) => (
                <td key={colIndex} className="px-4 py-3">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataTableEmptyState({
  icon: Icon,
  title = 'No data found',
  description = 'There are no records to display.',
  action,
  className,
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12',
        className
      )}
    >
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        {Icon && <Icon className="w-8 h-8 text-muted-foreground" />}
      </div>
      <p className="font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  );
}

export function DataTableErrorState({
  error,
  onRetry,
  className,
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12 text-destructive',
        className
      )}
    >
      <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="font-semibold text-foreground">Failed to load data</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{error}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}