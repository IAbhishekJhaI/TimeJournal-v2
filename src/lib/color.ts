/** Parse "#rrggbb" into [r, g, b] (0..255). */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Readable text colour to place on a category-coloured slot. Uses relative
 * luminance (WCAG) to pick near-white or near-black (FRONTEND_PLAN.md §2).
 */
export function onColor(hex: string): string {
  try {
    const [r, g, b] = hexToRgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.45 ? "#1c1917" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}
