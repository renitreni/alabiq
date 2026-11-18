// ---------------------------------------------------------------------
// DataTable - Main component with optional server-side data fetching.
// ---------------------------------------------------------------------
import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { toCsv, downloadCsv } from '@/portal/lib/csv';

import { DataTableHeader } from './DataTableHeader';
import { DataTableToolbar } from './DataTableToolbar';
import { DataTableRow } from './DataTableRow';
import { DataTableHeaderCell, DataTableSelectionHeader } from './DataTableCell';
import { DataTableSkeleton, DataTableEmptyState, DataTableErrorState } from './DataTableSkeleton';
import { useDataTable } from './useDataTable';

export function DataTable({
  columns,
  data: controlledData,
  fetchFn,
  rowKey = 'id',
  loading: controlledLoading = false,
  error: controlledError = null,
  onRetry,
  page: controlledPage = 1,
  totalPages: controlledTotalPages = 1,
  total: controlledTotal = 0,
  limit: controlledLimit = 25,
  onPageChange,
  onLimitChange,
  hasNextPage: controlledHasNextPage,
  hasPrevPage: controlledHasPrevPage,
  nextPage: controlledNextPage,
  prevPage: controlledPrevPage,
  firstPage: controlledFirstPage,
  lastPage: controlledLastPage,
  sortBy: controlledSortBy,
  sortOrder: controlledSortOrder,
  onSort,
  filters: controlledFilters = {},
  onFiltersChange,
  onClearFilters,
  search: controlledSearch = '',
  onSearchChange,
  selectedRows: controlledSelectedRows,
  onSelectionChange,
  selectable = false,
  selectionMode = 'multiple',
  expandable = false,
  expandedRows,
  onToggleExpand,
  renderExpanded,
  onExport,
  exportFilename = 'export',
  showExport = true,
  showHeader = true,
  showToolbar = true,
  showPagination = true,
  showPageSize = true,
  showSearch = true,
  showFilters = true,
  showColumnPicker = true,
  filterFields = [],
  maxHeight,
  stickyHeader = true,
  emptyMessage = 'No data found',
  emptyIcon,
  containerClassName,
  tableClassName,
  headerClassName,
  toolbarClassName,
  serverSide = true,
  initialPage = 1,
  initialLimit = 25,
  initialSortBy = 'created_at',
  initialSortOrder = 'desc',
  initialFilters = {},
  initialSearch = '',
  debounceMs = 300,
  onError,
  onRowClick,
}) {
  const managed = typeof fetchFn === 'function';
  const table = useDataTable({
    fetchFn,
    initialPage,
    initialLimit,
    initialSortBy,
    initialSortOrder,
    initialFilters,
    initialSearch,
    serverSide,
    debounceMs,
    onError,
  });

  const data = managed ? table.data : controlledData || [];
  const loading = managed ? table.loading : controlledLoading;
  const error = managed ? table.error : controlledError;
  const page = managed ? table.page : controlledPage;
  const totalPages = managed ? table.totalPages : controlledTotalPages;
  const total = managed ? table.total : controlledTotal;
  const limit = managed ? table.limit : controlledLimit;
  const hasNextPage = managed ? table.hasNextPage : controlledHasNextPage ?? page < totalPages;
  const hasPrevPage = managed ? table.hasPrevPage : controlledHasPrevPage ?? page > 1;
  const nextPage = managed ? table.nextPage : controlledNextPage;
  const prevPage = managed ? table.prevPage : controlledPrevPage;
  const firstPage = managed ? table.firstPage : controlledFirstPage;
  const lastPage = managed ? table.lastPage : controlledLastPage;
  const sortBy = managed ? table.sortBy : controlledSortBy;
  const sortOrder = managed ? table.sortOrder : controlledSortOrder;
  const filters = managed ? table.filters : controlledFilters;
  const search = managed ? table.search : controlledSearch;

  const [localSelectedRows, setLocalSelectedRows] = useState(new Set());
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const selectedRows = controlledSelectedRows || localSelectedRows;
  const updateSelectedRows = useCallback((buildNext) => {
    const next = buildNext(selectedRows);
    if (onSelectionChange) onSelectionChange(next);
    else setLocalSelectedRows(next);
  }, [onSelectionChange, selectedRows]);

  const isColumnVisible = useCallback((columnKey) => !hiddenColumns.has(columnKey), [hiddenColumns]);
  const toggleColumnVisibility = useCallback((columnKey) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) next.delete(columnKey);
      else next.add(columnKey);
      return next;
    });
  }, []);

  const visibleColumnDefs = useMemo(() =>
    columns.filter((column) => column.hidden !== true && column.type !== 'selection' && isColumnVisible(column.key)),
    [columns, isColumnVisible]
  );

  const visibleRowKeys = useMemo(() => data.map((row) => row[rowKey]), [data, rowKey]);
  const allRowsSelected = selectable && visibleRowKeys.length > 0 && visibleRowKeys.every((key) => selectedRows.has(key));
  const someRowsSelected = selectable && visibleRowKeys.some((key) => selectedRows.has(key)) && !allRowsSelected;

  const handleToggleSelectAll = useCallback(() => {
    updateSelectedRows((prevSelected) => {
      const next = new Set(prevSelected);
      if (allRowsSelected) {
        visibleRowKeys.forEach((key) => next.delete(key));
      } else {
        visibleRowKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  }, [allRowsSelected, updateSelectedRows, visibleRowKeys]);

  const handleRowSelect = useCallback((rowKeyValue) => {
    updateSelectedRows((prevSelected) => {
      const next = new Set(prevSelected);
      if (next.has(rowKeyValue)) {
        next.delete(rowKeyValue);
      } else {
        if (selectionMode === 'single') next.clear();
        next.add(rowKeyValue);
      }
      return next;
    });
  }, [selectionMode, updateSelectedRows]);

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport(data, visibleColumnDefs);
      return;
    }

    const csvColumns = visibleColumnDefs
      .filter((column) => column.type !== 'actions')
      .map((column) => ({ key: column.key, header: column.header }));
    const csv = toCsv(data, csvColumns);
    downloadCsv(`${exportFilename}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }, [data, exportFilename, onExport, visibleColumnDefs]);

  const handleSort = managed ? table.setSort : onSort;
  const handleFiltersChange = managed ? table.setFilters : onFiltersChange;
  const handleClearFilters = managed ? table.clearFilters : onClearFilters;
  const handleSearchChange = managed ? table.setSearch : onSearchChange;
  const handleLimitChange = managed ? table.setLimit : onLimitChange;
  const handleRetry = onRetry || (managed ? table.refresh : undefined);

  const renderTable = () => (
    <div className={cn('overflow-x-auto', maxHeight && 'overflow-y-auto')} style={{ maxHeight }}>
      <table className={cn('w-full min-w-max', tableClassName)} role="grid" aria-label="Data table">
        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
          <tr className="bg-muted/50 border-b border-border">
            {selectable && (
              <DataTableSelectionHeader
                onToggleSelectAll={handleToggleSelectAll}
                selected={allRowsSelected}
                indeterminate={someRowsSelected}
                disabled={data.length === 0}
              />
            )}
            {visibleColumnDefs.map((column) => (
              <DataTableHeaderCell
                key={column.key}
                column={column}
                onSort={handleSort}
                sortedColumn={sortBy}
                sortOrder={sortOrder}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={visibleColumnDefs.length + (selectable ? 1 : 0)} className="p-0">
                <DataTableEmptyState icon={emptyIcon} title={emptyMessage} />
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => {
              const rowKeyValue = row[rowKey];
              const isSelected = selectedRows.has(rowKeyValue);
              const isExpanded = expandable && expandedRows?.has(rowKeyValue);

              return (
                <DataTableRow
                  key={rowKeyValue}
                  row={row}
                  rowIndex={rowIndex}
                  columns={visibleColumnDefs}
                  rowKey={rowKeyValue}
                  selected={isSelected}
                  onSelect={handleRowSelect}
                  selectable={selectable}
                  expandable={expandable}
                  expanded={isExpanded}
                  onClick={onRowClick}
                  onToggleExpand={() => onToggleExpand?.(rowKeyValue)}
                  renderExpanded={renderExpanded}
                />
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  if (loading && data.length === 0) {
    return (
      <div className={cn('overflow-hidden rounded-xl', containerClassName)}>
        <DataTableSkeleton columns={visibleColumnDefs} rows={5} hasSelection={selectable} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('overflow-hidden rounded-xl', containerClassName)}>
        <DataTableErrorState error={error} onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl overflow-hidden', containerClassName)}>
      {showHeader && (
        <DataTableHeader
          columns={columns}
          search={search}
          onSearchChange={handleSearchChange}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClearFilters={handleClearFilters}
          onToggleColumnVisibility={toggleColumnVisibility}
          isColumnVisible={isColumnVisible}
          onExport={handleExport}
          showSearch={showSearch}
          showFilters={showFilters}
          showColumnPicker={showColumnPicker}
          showExport={showExport}
          filterFields={filterFields}
          loading={loading}
          className={headerClassName}
        />
      )}

      {renderTable()}

      {showToolbar && showPagination && (
        <DataTableToolbar
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={managed ? table.setPage : onPageChange}
          onLimitChange={handleLimitChange}
          onFirstPage={firstPage}
          onLastPage={lastPage}
          onPrevPage={prevPage}
          onNextPage={nextPage}
          hasPrevPage={hasPrevPage}
          hasNextPage={hasNextPage}
          loading={loading}
          showPageSize={showPageSize}
          className={toolbarClassName}
        />
      )}
    </div>
  );
}
