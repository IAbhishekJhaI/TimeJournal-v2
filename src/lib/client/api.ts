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
  QuicklogParseResponse,
  SavedQuery,
  SavedQueriesResponse,
  SavedQueryCreate,
  SavedQueryResponse,
  SavedQueryUpdate,
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

type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

/** Installed by <ClerkTokenBridge> (providers.tsx) once Clerk is mounted. */
export function setTokenGetter(fn: TokenGetter | null) {
  tokenGetter = fn;
}

// A stuck getToken() must not stall the upload queue; past this we fall back
// to the session cookie alone.
export const TOKEN_TIMEOUT_MS = 3_000;

/**
 * A fresh Clerk session token as a bearer header. The proxy only refreshes an
 * expired `__session` cookie on GET, so a PUT/POST/PATCH/DELETE sent after the
 * ~60s token lapses (backgrounded tab, laptop sleep) would 401. Clerk checks
 * the Authorization header before the cookie, and getToken() mints a new token
 * when the cached one has expired.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const token = await Promise.race([
      tokenGetter(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), TOKEN_TIMEOUT_MS);
      }),
    ]);
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(await authHeaders()),
      ...init?.headers,
    },
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

  // Multipart upload — can't use apiFetch (must not set a JSON content-type;
  // the browser sets the multipart boundary itself).
  importXlsx: async (file: File): Promise<ImportResult> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/import/xlsx", {
      method: "POST",
      body: form,
      headers: await authHeaders(),
    });
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

  parseQuicklog: (text: string, day?: string): Promise<QuicklogParseResponse> =>
    apiFetch<QuicklogParseResponse>("/quicklog/parse", {
      method: "POST",
      body: JSON.stringify(day ? { text, day } : { text }),
    }),

  getSavedQueries: (): Promise<SavedQuery[]> =>
    apiFetch<SavedQueriesResponse>("/queries").then((r) => r.queries),

  createSavedQuery: (body: SavedQueryCreate): Promise<SavedQuery> =>
    apiFetch<SavedQueryResponse>("/queries", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.query),

  updateSavedQuery: (id: string, body: SavedQueryUpdate): Promise<SavedQuery> =>
    apiFetch<SavedQueryResponse>(`/queries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.query),

  deleteSavedQuery: (id: string): Promise<void> =>
    apiFetch<{ ok: true }>(`/queries/${id}`, { method: "DELETE" }).then(() => undefined),

  getAnalytics: (
    period: "day" | "week" | "month" | "year",
    date: string,
    groupBy: GroupBy = "category",
  ): Promise<AnalyticsSummaryResponse> =>
    apiFetch<AnalyticsSummaryResponse>(
      `/analytics/summary?period=${period}&date=${date}&groupBy=${groupBy}`,
    ),
};
