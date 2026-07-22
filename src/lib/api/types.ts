/**
 * The frozen API contract, as types (IMPLEMENTATION_PLAN.md §2.6). Request
 * bodies are derived from the Zod schemas so they can't drift; response shapes
 * are declared here and returned by the route handlers. The frontend imports
 * from this file rather than re-declaring shapes.
 *
 * Prose documentation of each endpoint lives in docs/API.md.
 */
import type { z } from "zod";
import type {
  categoryCreateSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
  entriesBatchSchema,
  entryUpsertSchema,
  meUpdateSchema,
  savedQueryCreateSchema,
  savedQueryUpdateSchema,
} from "./schemas";
import type { UpsertConflict } from "./entries";
import type { GroupBy, SummaryBucket } from "./analytics";
import type { Profile } from "./profile";

// ---- Request bodies (inferred from Zod, single source of truth) ----
export type EntryUpsert = z.infer<typeof entryUpsertSchema>;
export type EntriesBatch = z.infer<typeof entriesBatchSchema>;
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type CategoryReorder = z.infer<typeof categoryReorderSchema>;
export type MeUpdate = z.infer<typeof meUpdateSchema>;
export type SavedQueryCreate = z.infer<typeof savedQueryCreateSchema>;
export type SavedQueryUpdate = z.infer<typeof savedQueryUpdateSchema>;

// ---- Entities ----
export interface TimeEntry {
  userId: string;
  day: string;
  slot: number;
  categoryId: string;
  note: string | null;
  updatedAt: string;
}

export interface Category {
  id: string;
  userId: string;
  parentId: string | null;
  code: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  archived: boolean;
}

export interface SavedQuery {
  id: string;
  userId: string;
  name: string;
  categoryIds: string[];
}

export type { Profile, GroupBy, SummaryBucket, UpsertConflict };

// ---- Response envelopes ----
export interface EntriesResponse {
  entries: TimeEntry[];
}
export interface EntriesPutResponse {
  ok: true;
  conflicts: UpsertConflict[];
}
export interface CategoriesResponse {
  categories: Category[];
}
export interface CategoryResponse {
  category: Category;
}
export interface CategoryReorderResponse {
  ok: true;
  updated: number;
}
export interface ProfileResponse {
  profile: Profile;
}
export interface SavedQueriesResponse {
  queries: SavedQuery[];
}
export interface SavedQueryResponse {
  query: SavedQuery;
}

export interface AnalyticsSummaryResponse {
  from: string;
  to: string;
  groupBy: GroupBy;
  totalMinutes: number;
  totalHours: number;
  buckets: SummaryBucket[];
}

export type QuicklogParseResponse =
  | { ok: false; reason: string }
  | {
      ok: true;
      day: string;
      startSlot: number;
      endSlot: number;
      assumedMeridiem: boolean;
      category: { id: string; code: string; name: string } | null;
      candidates: { id: string; code: string; name: string }[];
      needsConfirmation: true;
    };

export interface DrainResponse {
  processed: number;
  failed: { userId: string; day: string; error: string }[];
}

export interface ApiErrorResponse {
  error: string;
  issues?: unknown;
}
