// ---------------------------------------------------------------------
// DataTableToolbar - Pagination, page size, and row count display.
// ---------------------------------------------------------------------
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function DataTableToolbar({
  page = 1,
  totalPages = 1,
  total = 0,
  limit = 25,
  onPageChange,
  onLimitChange,
  onFirstPage,
  onLastPage,
  onPrevPage,
  onNextPage,
  hasPrevPage = page > 1,
  hasNextPage = page < totalPages,
  loading = false,
  showPageSize = true,
  pageSizeOptions = [10, 25, 50, 100],
  className,
  showRowRange = true,
}) {
  const startRow = total > 0 ? (page - 1) * limit + 1 : 0;
  const endRow = Math.min(page * limit, total);

  return (
    <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/30', className)}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
        {showRowRange && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {total > 0 ? (
              <>
                Showing <span className="font-medium">{startRow.toLocaleString()}</span> to{' '}
                <span className="font-medium">{endRow.toLocaleString()}</span> of{' '}
                <span className="font-medium">{total.toLocaleString()}</span> results
              </>
            ) : (
              'No results found'
            )}
          </span>
        )}

        {showPageSize && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Rows per page:
            <select
              value={limit}
              onChange={(event) => onLimitChange?.(Number(event.target.value))}
              disabled={loading}
              className="h-8 px-2 py-1 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" onClick={onFirstPage || (() => onPageChange?.(1))} disabled={!hasPrevPage || loading} aria-label="First page" title="First page">
          <ChevronsLeft className="w-4 h-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={onPrevPage || (() => onPageChange?.(page - 1))} disabled={!hasPrevPage || loading} aria-label="Previous page" title="Previous page">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="flex items-center justify-center px-3 text-sm font-medium text-foreground min-w-[88px]">
          Page <span className="tabular-nums ml-1">{page}</span> of <span className="tabular-nums ml-1">{totalPages || 1}</span>
        </span>
        <Button type="button" variant="outline" size="icon" onClick={onNextPage || (() => onPageChange?.(page + 1))} disabled={!hasNextPage || loading} aria-label="Next page" title="Next page">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={onLastPage || (() => onPageChange?.(totalPages || 1))} disabled={!hasNextPage || loading} aria-label="Last page" title="Last page">
          <ChevronsRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function DataTablePaginationSimple({
  page,
  totalPages,
  onPageChange,
  loading,
  maxVisiblePages = 5,
  className,
}) {
  if (totalPages <= 1) return null;

  const half = Math.floor(maxVisiblePages / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(totalPages, start + maxVisiblePages - 1);
  if (end - start + 1 < maxVisiblePages) {
    start = Math.max(1, end - maxVisiblePages + 1);
  }

  const pages = [];
  for (let i = start; i <= end; i += 1) pages.push(i);

  return (
    <nav className={cn('flex items-center gap-1', className)} aria-label="Pagination">
      <Button type="button" variant="outline" size="icon" onClick={() => onPageChange(page - 1)} disabled={page <= 1 || loading} aria-label="Previous page">
        <ChevronLeft className="w-4 h-4" />
      </Button>
      {pages.map((currentPage) => (
        <Button
          key={currentPage}
          type="button"
          variant={currentPage === page ? 'default' : 'outline'}
          size="sm"
          onClick={() => onPageChange(currentPage)}
          disabled={loading}
          aria-label={`Page ${currentPage}`}
          aria-current={currentPage === page ? 'page' : undefined}
        >
          {currentPage}
        </Button>
      ))}
      <Button type="button" variant="outline" size="icon" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || loading} aria-label="Next page">
        <ChevronRight className="w-4 h-4" />
      </Button>
    </nav>
  );
}
