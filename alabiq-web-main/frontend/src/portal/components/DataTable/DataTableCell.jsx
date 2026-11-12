// ---------------------------------------------------------------------
// DataTableCell - Individual cell renderer with type support
// ---------------------------------------------------------------------
import { cn } from '@/lib/utils';
import { ColumnRenderers } from './columnTypes';

export function DataTableCell({ column, row, rowIndex }) {
  const value = row[column.key];
  const renderer = ColumnRenderers[column.type] || ColumnRenderers.text;

  const baseClasses = cn(
    'px-4 py-3 align-top',
    column.className,
    column.sticky === 'left' && 'sticky left-0 z-20 bg-white',
    column.sticky === 'right' && 'sticky right-0 z-20 bg-white'
  );

  const style = {
    width: column.width,
    minWidth: column.minWidth,
    maxWidth: column.maxWidth,
  };

  return (
    <td
      className={baseClasses}
      style={style}
      data-column={column.key}
      data-row-index={rowIndex}
    >
      {typeof column.render === 'function'
        ? column.render(value, row, column)
        : renderer({ value, row, column })}
    </td>
  );
}

export function DataTableHeaderCell({ column, onSort, sortedColumn, sortOrder }) {
  const isSortable = column.sortable !== false;
  const isSorted = sortedColumn === column.key;

  const handleClick = () => {
    if (isSortable && onSort) {
      onSort(column.key);
    }
  };

  const baseClasses = cn(
    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground',
    'bg-muted/50 border-b border-border',
    'select-none',
    isSortable && 'cursor-pointer hover:bg-muted/70 transition-colors',
    column.sticky === 'left' && 'sticky left-0 z-30',
    column.sticky === 'right' && 'sticky right-0 z-30',
    column.headerClassName
  );

  const style = {
    width: column.width,
    minWidth: column.minWidth,
    maxWidth: column.maxWidth,
  };

  return (
    <th
      className={baseClasses}
      style={style}
      scope="col"
      onClick={handleClick}
      aria-sort={isSorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
      data-column={column.key}
    >
      <div className="flex items-center gap-1.5">
        <span>{column.header}</span>
        {isSortable && (
          <span className="flex flex-col items-center justify-center h-4">
            {isSorted && sortOrder === 'asc' ? (
              <svg className="w-3 h-3 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : isSorted && sortOrder === 'desc' ? (
              <svg className="w-3 h-3 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <>
                <svg className="w-3 h-3 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                <svg className="w-3 h-3 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </>
            )}
          </span>
        )}
      </div>
    </th>
  );
}

export function DataTableSelectionHeader({ onToggleSelectAll, selected, indeterminate, disabled }) {
  return (
    <th
      className="px-4 py-3 border-b border-border bg-muted/50 sticky left-0 z-30"
      style={{ width: '56px', minWidth: '56px', maxWidth: '56px' }}
      scope="col"
    >
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={selected}
          indeterminate={indeterminate}
          onChange={onToggleSelectAll}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Select all rows"
        />
      </div>
    </th>
  );
}

export function DataTableSelectionCell({ row, rowKey, selected, onToggle, disabled }) {
  return (
    <td
      className="px-4 py-3 align-top sticky left-0 z-20 bg-white"
      style={{ width: '56px', minWidth: '56px', maxWidth: '56px' }}
    >
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(rowKey)}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label={`Select row ${rowKey}`}
        />
      </div>
    </td>
  );
}
