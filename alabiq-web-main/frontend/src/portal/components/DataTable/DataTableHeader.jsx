// ---------------------------------------------------------------------
// DataTableHeader - Toolbar with search, filters, column picker, export.
// ---------------------------------------------------------------------
import { useMemo } from 'react';
import { ChevronDown, Columns, Download, Filter, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function DataTableHeader({
  columns,
  search = '',
  onSearchChange,
  filters = {},
  onFiltersChange,
  onClearFilters,
  onToggleColumnVisibility,
  isColumnVisible = () => true,
  onExport,
  showSearch = true,
  showFilters = true,
  showColumnPicker = true,
  showExport = true,
  filterFields = [],
  className,
  loading,
}) {
  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== '' && value !== null && value !== undefined).length,
    [filters]
  );

  const renderFilterInput = (field) => {
    const value = filters[field.key] ?? '';
    const filterType = field.filterType || 'text';

    if (filterType === 'select') {
      return (
        <select
          value={value}
          onChange={(event) => onFiltersChange?.({ [field.key]: event.target.value })}
          className="h-8 w-full px-2 py-1 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {(field.options || []).map((option) => (
            <option key={option.value ?? option} value={option.value ?? option}>
              {option.label ?? option}
            </option>
          ))}
        </select>
      );
    }

    if (filterType === 'boolean') {
      return (
        <select
          value={value}
          onChange={(event) => onFiltersChange?.({ [field.key]: event.target.value })}
          className="h-8 w-full px-2 py-1 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">All</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }

    if (filterType === 'date') {
      return (
        <input
          type="date"
          value={value}
          onChange={(event) => onFiltersChange?.({ [field.key]: event.target.value })}
          className="h-8 w-full px-2 py-1 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      );
    }

    return (
      <Input
        type="text"
        value={value}
        onChange={(event) => onFiltersChange?.({ [field.key]: event.target.value })}
        placeholder={`Filter ${field.label || field.key}...`}
        className="h-8"
      />
    );
  };

  return (
    <div className={cn('flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30', className)}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
        {showSearch && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder="Search..."
              className="pl-9 pr-9"
              disabled={loading}
              aria-label="Search table"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {showFilters && filterFields.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant={activeFilterCount ? 'default' : 'outline'} size="sm" className="gap-1.5" disabled={loading}>
                <Filter className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-medium px-1.5">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[280px] p-2">
              <div className="space-y-2">
                <DropdownMenuLabel>Filter by column</DropdownMenuLabel>
                {filterFields.map((field) => (
                  <div key={field.key} className="space-y-1 px-2">
                    <label className="text-xs font-medium text-muted-foreground block">
                      {field.label || field.key}
                    </label>
                    {renderFilterInput(field)}
                  </div>
                ))}
                {activeFilterCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onClearFilters?.()} className="text-red-600 focus:bg-red-50">
                      <X className="mr-2 h-4 w-4" />
                      Clear all filters
                    </DropdownMenuItem>
                  </>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {showColumnPicker && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={loading}>
                <Columns className="w-4 h-4" />
                Columns
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px] p-2 max-h-[400px] overflow-y-auto">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {columns
                .filter((column) => column.key !== 'actions' && column.type !== 'selection')
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.key}
                    checked={isColumnVisible(column.key)}
                    onCheckedChange={() => onToggleColumnVisibility?.(column.key)}
                  >
                    {column.header}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {showExport && (
        <Button type="button" variant="outline" size="sm" onClick={() => onExport?.()} disabled={loading} className="gap-1.5">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      )}
    </div>
  );
}

export function DataTableSimpleHeader({ title, subtitle, action, className }) {
  return (
    <div className={cn('flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3', className)}>
      <div>
        {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="mt-2 sm:mt-0">{action}</div>}
    </div>
  );
}
