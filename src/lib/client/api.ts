import type {
  AnalyticsSummaryResponse,
  CategoriesResponse,
  Category,
  CategoryCreate,
  CategoryReorder,
  CategoryReorderResponse,
  CategoryResponse,
  CategoryUpdate,
  DrainResponse,
  ImportResult,
  EntriesBatch,
  EntriesPutResponse,
  EntriesResponse,
  GroupBy,
  MeUpdate,
  Profile,
  ProfileResponse,
  TimeEntry,
} from "@/lib/api/types";

/** Thrown for any non-2xx API response, carrying the status + server message. */
export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body; keep the default message
    }
    throw new ApiClientError(res.status, message);
  }

  return (await res.json()) as T;
}

export const api = {
  getProfile: () => apiFetch<ProfileResponse>("/me").then((r) => r.profile),

  updateProfile: (body: MeUpdate): Promise<Profile> =>
    apiFetch<ProfileResponse>("/me", { method: "PATCH", body: JSON.stringify(body) }).then(
      (r) => r.profile,
    ),

  exportNow: (): Promise<DrainResponse> =>
    apiFetch<DrainResponse>("/export/sheet", { method: "POST" }),

  getInviteStats: (): Promise<{ total: number; redeemed: number }> =>
    apiFetch<{ total: number; redeemed: number }>("/invites"),

  addInvite: (email: string): Promise<boolean> =>
    apiFetch<{ added: boolean }>("/invites", {
      method: "POST",
      body: JSON.stringify({ email }),
    }).then((r) => r.added),

  // Multipart upload — can't use apiFetch (must not set a JSON content-type;
  // the browser sets the multipart boundary itself).
  importXlsx: async (file: File): Promise<ImportResult> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/import/xlsx", { method: "POST", body: form });
    if (!res.ok) {
      let message = `import failed (${res.status})`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        /* non-JSON error */
      }
      throw new ApiClientError(res.status, message);
    }
    return (await res.json()) as ImportResult;
  },

  getCategories: (includeArchived = false): Promise<Category[]> =>
    apiFetch<CategoriesResponse>(
      `/categories${includeArchived ? "?includeArchived=true" : ""}`,
    ).then((r) => r.categories),

  createCategory: (body: CategoryCreate): Promise<Category> =>
    apiFetch<CategoryResponse>("/categories", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.category),

  updateCategory: (id: string, body: CategoryUpdate): Promise<Category> =>
    apiFetch<CategoryResponse>(`/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.category),

  archiveCategory: (id: string): Promise<Category> =>
    apiFetch<CategoryResponse>(`/categories/${id}`, { method: "DELETE" }).then(
      (r) => r.category,
    ),

  reorderCategories: (items: CategoryReorder): Promise<CategoryReorderResponse> =>
    apiFetch<CategoryReorderResponse>("/categories/reorder", {
      method: "PATCH",
      body: JSON.stringify(items),
    }),

  getEntries: (from: string, to: string): Promise<TimeEntry[]> =>
    apiFetch<EntriesResponse>(`/entries?from=${from}&to=${to}`).then((r) => r.entries),

  putEntries: (items: EntriesBatch): Promise<EntriesPutResponse> =>
    apiFetch<EntriesPutResponse>("/entries", {
      method: "PUT",
      body: JSON.stringify(items),
    }),

  getAnalytics: (
    period: "day" | "week" | "month" | "year",
    date: string,
    groupBy: GroupBy = "category",
  ): Promise<AnalyticsSummaryResponse> =>
    apiFetch<AnalyticsSummaryResponse>(
      `/analytics/summary?period=${period}&date=${date}&groupBy=${groupBy}`,
    ),
};
