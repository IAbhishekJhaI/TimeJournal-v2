"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { CategoryCreate, CategoryReorder, CategoryUpdate } from "@/lib/api/types";

export function useProfile() {
  return useQuery({ queryKey: ["me"], queryFn: api.getProfile });
}

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", { includeArchived }],
    queryFn: () => api.getCategories(includeArchived),
  });
}

/** Invalidate every cached categories list (archived + non-archived). */
function useInvalidateCategories() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["categories"] });
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (body: CategoryCreate) => api.createCategory(body),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CategoryUpdate }) =>
      api.updateCategory(id, body),
    onSuccess: invalidate,
  });
}

export function useArchiveCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (id: string) => api.archiveCategory(id),
    onSuccess: invalidate,
  });
}

export function useReorderCategories() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (items: CategoryReorder) => api.reorderCategories(items),
    onSuccess: invalidate,
  });
}

export function useEntries(day: string) {
  return useQuery({
    queryKey: ["entries", day],
    queryFn: () => api.getEntries(day, day),
  });
}

// Writes now go through the offline-durable queue in `sync.tsx`
// (useSync().enqueue) rather than a direct react-query mutation, so paints
// survive offline and a refresh. See IMPLEMENTATION_PLAN.md §4.6.
