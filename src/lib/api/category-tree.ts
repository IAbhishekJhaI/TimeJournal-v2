/**
 * Pure helpers for reasoning about the category parent graph, split out from
 * DB code so they can be unit-tested without a database.
 */

/**
 * Returns the id of a node that sits on a parent cycle, or null if the graph
 * is acyclic. A node pointing at a missing parent is treated as a root (the
 * caller validates parent existence separately).
 */
export function findCycle(parentById: Map<string, string | null>): string | null {
  const state = new Map<string, "visiting" | "done">();

  const walk = (start: string): string | null => {
    let current: string | null = start;
    const path: string[] = [];
    while (current) {
      const seen = state.get(current);
      if (seen === "done") break;
      if (seen === "visiting") return current; // back-edge => cycle
      state.set(current, "visiting");
      path.push(current);
      current = parentById.get(current) ?? null;
    }
    for (const id of path) state.set(id, "done");
    return null;
  };

  for (const id of parentById.keys()) {
    const cyclic = walk(id);
    if (cyclic) return cyclic;
  }
  return null;
}
