// ---------------------------------------------------------------------
// DataTable Hook - Centralized state management for server-side DataTable
// Handles pagination, sorting, filtering, selection, and data fetching.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function useDataTable({
  fetchFn,
  initialPage = 1,
  initialLimit = 25,
  initialSortBy = 'created_at',
  initialSortOrder = 'desc',
  initialFilters = {},
  initialSearch = '',
  serverSide = true,
  debounceMs = 300,
  onError,
} = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [sortBy, setSortBy] = useState(initialSortBy);
  const [sortOrder, setSortOrder] = useState(initialSortOrder);
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState(initialSearch);

  const [selectedRows, setSelectedRows] = useState(new Set());
  const [visibleColumns, setVisibleColumns] = useState(new Set());

  const fetchFnRef = useRef(fetchFn);
  const mountedRef = useRef(true);
  const abortControllerRef = useRef(null);
  const executeFetchRef = useRef(null);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const buildParams = useCallback(() => {
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)
    );

    return {
      page,
      limit,
      sortBy,
      sortOrder,
      ...(search ? { search } : {}),
      ...(Object.keys(activeFilters).length ? { filters: activeFilters } : {}),
    };
  }, [filters, limit, page, search, sortBy, sortOrder]);

  const executeFetch = useCallback(async () => {
    if (!fetchFnRef.current) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFnRef.current(buildParams(), { signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return;

      const responseData = Array.isArray(result) ? result : result?.data || [];
      const pagination = !Array.isArray(result) ? result?.pagination || {} : {};

      setData(Array.isArray(responseData) ? responseData : []);

      const nextTotal = Number(pagination.total ?? responseData.length ?? 0);
      const nextTotalPages = Number(
        pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / Math.max(limit, 1)))
      );
      setTotal(nextTotal);
      setTotalPages(nextTotalPages || 1);

      // Do not merge response-driven values (sort, filters) back into fetch state — the
      // backend echoes the request back for informational purposes only. Feeding them back
      // into state that re-triggers executeFetch causes an infinite fetch loop.
    } catch (err) {
      if (!mountedRef.current || err.name === 'AbortError' || err.name === 'CancellationError') return;
      console.error('DataTable fetch error:', err);
      setError(err.message || 'Failed to fetch data');
      setData([]);
      onError?.(err);
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [buildParams, limit, onError]);

  useEffect(() => {
    executeFetchRef.current = executeFetch;
  }, [executeFetch]);


  useEffect(() => {
    if (!serverSide || !fetchFnRef.current) return undefined;

    const timer = window.setTimeout(() => {
      executeFetchRef.current?.();
    }, Math.max(0, debounceMs));

    return () => window.clearTimeout(timer);
  }, [debounceMs, serverSide]);

  const processedData = useMemo(() => {
    if (serverSide) return data;

    let result = [...data];

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter((row) =>
        Object.values(row).some((value) => String(value || '').toLowerCase().includes(searchLower))
      );
    }

    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      result = result.filter((row) => {
        const rowValue = row[key];
        if (Array.isArray(value)) return value.includes(rowValue);
        return String(rowValue || '').toLowerCase() === String(value).toLowerCase();
      });
    });

    if (sortBy) {
      result.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        if (aValue === bValue) return 0;
        const direction = sortOrder === 'asc' ? 1 : -1;
        if (aValue === null || aValue === undefined) return direction;
        if (bValue === null || bValue === undefined) return -direction;
        return String(aValue).localeCompare(String(bValue)) * direction;
      });
    }

    return result.slice((page - 1) * limit, page * limit);
  }, [data, filters, limit, page, search, serverSide, sortBy, sortOrder]);

  useEffect(() => {
    if (serverSide) return;
    const nextTotal = data.length;
    setTotal(nextTotal);
    setTotalPages(Math.max(1, Math.ceil(nextTotal / Math.max(limit, 1))));
  }, [data.length, limit, serverSide]);

  const goToPage = useCallback((newPage) => {
    setPage(Math.max(1, Math.min(newPage, totalPages || 1)));
  }, [totalPages]);

  const nextPage = useCallback(() => goToPage(page + 1), [goToPage, page]);
  const prevPage = useCallback(() => goToPage(page - 1), [goToPage, page]);
  const firstPage = useCallback(() => goToPage(1), [goToPage]);
  const lastPage = useCallback(() => goToPage(totalPages || 1), [goToPage, totalPages]);

  const changeLimit = useCallback((newLimit) => {
    setLimit(newLimit);
    setPage(1);
  }, []);

  const handleSort = useCallback((columnKey) => {
    setSortBy((current) => {
      if (current === columnKey) {
        setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'));
        return current;
      }
      setSortOrder('asc');
      return columnKey;
    });
    setPage(1);
  }, []);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const setMultipleFilters = useCallback((newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
    setSearch(initialSearch);
    setPage(1);
  }, [initialFilters, initialSearch]);

  const handleSearch = useCallback((value) => {
    setSearch(value);
    setPage(1);
  }, []);

  const toggleRowSelection = useCallback((rowKey) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((rowKeys) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      const allSelected = rowKeys.every((key) => next.has(key));
      rowKeys.forEach((key) => {
        if (allSelected) next.delete(key);
        else next.add(key);
      });
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedRows(new Set()), []);

  const toggleColumnVisibility = useCallback((columnKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) next.delete(columnKey);
      else next.add(columnKey);
      return next;
    });
  }, []);

  const setColumnVisibility = useCallback((columnKey, visible) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (visible) next.add(columnKey);
      else next.delete(columnKey);
      return next;
    });
  }, []);

  const isColumnVisible = useCallback((columnKey) => {
    if (visibleColumns.size === 0) return true;
    return visibleColumns.has(columnKey);
  }, [visibleColumns]);

  const refresh = useCallback(() => executeFetch(), [executeFetch]);

  const reset = useCallback(() => {
    setPage(initialPage);
    setLimit(initialLimit);
    setSortBy(initialSortBy);
    setSortOrder(initialSortOrder);
    setFilters(initialFilters);
    setSearch(initialSearch);
    setSelectedRows(new Set());
  }, [initialFilters, initialLimit, initialPage, initialSearch, initialSortBy, initialSortOrder]);

  return {
    data: processedData,
    rawData: data,
    setData,
    loading,
    error,
    page,
    setPage: goToPage,
    limit,
    setLimit: changeLimit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    sortBy,
    sortOrder,
    setSort: handleSort,
    filters,
    setFilter,
    setFilters: setMultipleFilters,
    clearFilters,
    search,
    setSearch: handleSearch,
    selectedRows,
    setSelectedRows,
    selectedCount: selectedRows.size,
    toggleRowSelection,
    toggleSelectAll,
    clearSelection,
    isRowSelected: (rowKey) => selectedRows.has(rowKey),
    areAllRowsSelected: (rowKeys) => rowKeys.length > 0 && rowKeys.every((key) => selectedRows.has(key)),
    visibleColumns,
    toggleColumnVisibility,
    setColumnVisibility,
    isColumnVisible,
    refresh,
    reset,
    executeFetch,
  };
}
