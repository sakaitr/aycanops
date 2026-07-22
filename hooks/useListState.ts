"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type ListSortDirection = "asc" | "desc";
export type ListFilters = Record<string, string>;

type UseListStateOptions<TSort extends string, TFilters extends ListFilters> = {
  defaultSearch?: string;
  defaultPage?: number;
  defaultPageSize?: number;
  defaultSort: TSort;
  defaultSortDir?: ListSortDirection;
  defaultFilters: TFilters;
};

type ListState<TSort extends string, TFilters extends ListFilters> = {
  search: string;
  page: number;
  pageSize: number;
  sort: TSort;
  sortDir: ListSortDirection;
  filters: TFilters;
  selectedIds: string[];
};

function readInitialState<TSort extends string, TFilters extends ListFilters>(options: UseListStateOptions<TSort, TFilters>): ListState<TSort, TFilters> {
  if (typeof window === "undefined") {
    return {
      search: options.defaultSearch ?? "",
      page: options.defaultPage ?? 1,
      pageSize: options.defaultPageSize ?? 20,
      sort: options.defaultSort,
      sortDir: options.defaultSortDir ?? "asc",
      filters: { ...options.defaultFilters },
      selectedIds: [],
    };
  }

  const params = new URLSearchParams(window.location.search);
  const filters = { ...options.defaultFilters };
  for (const key of Object.keys(filters)) {
    filters[key as keyof TFilters] = (params.get(`f_${key}`) ?? options.defaultFilters[key]) as TFilters[keyof TFilters];
  }

  return {
    search: params.get("search") ?? options.defaultSearch ?? "",
    page: Math.max(1, Number(params.get("page") ?? options.defaultPage ?? 1) || 1),
    pageSize: Math.max(1, Number(params.get("pageSize") ?? options.defaultPageSize ?? 20) || 20),
    sort: (params.get("sort") as TSort | null) ?? options.defaultSort,
    sortDir: params.get("dir") === "desc" ? "desc" : options.defaultSortDir ?? "asc",
    filters,
    selectedIds: (params.get("selectedIds") ?? "").split(",").map(id => id.trim()).filter(Boolean),
  };
}

export function useListState<TSort extends string, TFilters extends ListFilters>(options: UseListStateOptions<TSort, TFilters>) {
  const [state, setState] = useState<ListState<TSort, TFilters>>(() => readInitialState(options));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string, defaultValue = "") => {
      if (!value || value === defaultValue) params.delete(key);
      else params.set(key, value);
    };

    setOrDelete("search", state.search, options.defaultSearch ?? "");
    setOrDelete("page", String(state.page), String(options.defaultPage ?? 1));
    setOrDelete("pageSize", String(state.pageSize), String(options.defaultPageSize ?? 20));
    setOrDelete("sort", state.sort, options.defaultSort);
    setOrDelete("dir", state.sortDir, options.defaultSortDir ?? "asc");
    setOrDelete("selectedIds", state.selectedIds.join(","));

    for (const [key, defaultValue] of Object.entries(options.defaultFilters)) {
      setOrDelete(`f_${key}`, state.filters[key] ?? "", defaultValue);
    }

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [options.defaultFilters, options.defaultPage, options.defaultPageSize, options.defaultSearch, options.defaultSort, options.defaultSortDir, state]);

  const setSearch = useCallback((search: string) => {
    setState(prev => ({ ...prev, search, page: 1, selectedIds: [] }));
  }, []);

  const setFilter = useCallback(<K extends keyof TFilters>(key: K, value: TFilters[K]) => {
    setState(prev => ({ ...prev, filters: { ...prev.filters, [key]: value }, page: 1, selectedIds: [] }));
  }, []);

  const clearFilters = useCallback(() => {
    setState(prev => ({ ...prev, search: "", filters: { ...options.defaultFilters }, page: 1, selectedIds: [] }));
  }, [options.defaultFilters]);

  const setPage = useCallback((page: number | ((current: number) => number)) => {
    setState(prev => ({ ...prev, page: Math.max(1, typeof page === "function" ? page(prev.page) : page) }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setState(prev => ({ ...prev, pageSize: Math.max(1, pageSize), page: 1, selectedIds: [] }));
  }, []);

  const toggleSort = useCallback((sort: TSort) => {
    setState(prev => ({
      ...prev,
      sort,
      sortDir: prev.sort === sort && prev.sortDir === "asc" ? "desc" : "asc",
      page: 1,
    }));
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      selectedIds: prev.selectedIds.includes(id) ? prev.selectedIds.filter(item => item !== id) : [...prev.selectedIds, id],
    }));
  }, []);

  const selectMany = useCallback((ids: string[]) => {
    setState(prev => {
      const next = new Set(prev.selectedIds);
      ids.forEach(id => next.add(id));
      return { ...prev, selectedIds: Array.from(next) };
    });
  }, []);

  const setSelectedIds = useCallback((ids: string[]) => {
    setState(prev => ({ ...prev, selectedIds: ids }));
  }, []);

  const clearSelection = useCallback(() => {
    setState(prev => ({ ...prev, selectedIds: [] }));
  }, []);

  const isSelected = useCallback((id: string) => state.selectedIds.includes(id), [state.selectedIds]);

  return useMemo(() => ({
    ...state,
    setSearch,
    setFilter,
    clearFilters,
    setPage,
    setPageSize,
    toggleSort,
    toggleSelected,
    selectMany,
    setSelectedIds,
    clearSelection,
    isSelected,
  }), [clearFilters, clearSelection, isSelected, selectMany, setFilter, setPage, setPageSize, setSearch, setSelectedIds, state, toggleSelected, toggleSort]);
}