// ---------------------------------------------------------------------
// DataTableRow - Row renderer with selection, expansion, and click handling
// ---------------------------------------------------------------------
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { DataTableCell, DataTableSelectionCell } from './DataTableCell';

export function DataTableRow({
  row,
  rowIndex,
  columns,
  rowKey,
  selected,
  onSelect,
  onClick,
  selectable = false,
  expandable,
  expanded,
  onToggleExpand,
  renderExpanded,
  selectionDisabled,
  className,
  style,
}) {
  const handleClick = (e) => {
    // Don't trigger row click if clicking on interactive elements
    const interactive = e.target.closest('button, a, input, select, [role="menuitem"], .no-row-click');
    if (interactive) return;
    if (onClick) onClick(row, e);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const interactive = e.target.closest('button, a, input, select, [role="menuitem"]');
      if (!interactive && onClick) {
        e.preventDefault();
        onClick(row, e);
      }
    }
  };

  const rowClasses = cn(
    'border-b border-border transition-colors',
    'hover:bg-muted/30',
    selected && 'bg-primary/5',
    expandable && 'cursor-pointer',
    className
  );

  const visibleColumns = columns.filter(col => col.hidden !== true);

  return (
    <>
      <tr
        className={rowClasses}
        style={style}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={onClick ? 0 : -1}
        role={onClick ? 'button' : undefined}
        aria-selected={selected}
        aria-expanded={expandable ? expanded : undefined}
        data-row-key={rowKey}
        data-row-index={rowIndex}
      >
        {selectable && (
          <DataTableSelectionCell
            row={row}
            rowKey={rowKey}
            selected={selected}
            onToggle={onSelect}
            disabled={selectionDisabled}
          />
        )}
        {visibleColumns.map((column, colIndex) => (
          <DataTableCell
            key={`${rowKey}-${column.key}`}
            column={column}
            row={row}
            rowIndex={rowIndex}
          />
        ))}
      </tr>
      {expandable && expanded && renderExpanded && (
        <tr
          className="bg-muted/20"
          data-expanded-row={rowKey}
        >
          <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} className="p-0">
            <div className="px-6 py-4 border-t border-border animate-in fade-in-80 slide-in-from-top-2">
              {renderExpanded(row, rowIndex)}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function DataTableRowSkeleton({ columns, hasSelection = false }) {
  const visibleColumns = columns.filter(col => col.hidden !== true);
  const colCount = visibleColumns.length + (hasSelection ? 1 : 0);

  return (
    <tr className="animate-pulse">
      {hasSelection && (
        <td className="px-4 py-3" style={{ width: '56px' }}>
          <div className="h-4 w-4 rounded border-gray-300 bg-muted" />
        </td>
      )}
      {Array.from({ length: visibleColumns.length }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-3/4 bg-muted rounded" />
        </td>
      ))}
      {colCount > visibleColumns.length + (hasSelection ? 1 : 0) && (
        <td className="px-4 py-3">
          <div className="h-4 w-1/2 bg-muted rounded" />
        </td>
      )}
    </tr>
  );
}
