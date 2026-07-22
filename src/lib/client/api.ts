import type {
  AnalyticsSummaryResponse,
  CategoriesResponse,
  Category,
  EntriesBatch,
  EntriesPutResponse,
  EntriesResponse,
  GroupBy,
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

  getCategories: (includeArchived = false): Promise<Category[]> =>
    apiFetch<CategoriesResponse>(
      `/categories${includeArchived ? "?includeArchived=true" : ""}`,
    ).then((r) => r.categories),

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
