/** Escape a string for safe insertion into HTML. */
export function escapeHtml(value: string): string {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Format an ISO date string for display. */
export function formatDate(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

/** Format a full date with time. */
export function formatDateTime(value: string): string {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a status string for display. */
export function formatStatus(status: string): string {
  return (status || "").replaceAll("_", " ");
}

/** Zero-pad a number to 2 digits. */
export function padOrdinal(n: number): string {
  return String(n).padStart(2, "0");
}

const URL_RE = /^https?:\/\/\S+$/;

/** Check if a string looks like a URL. */
export function isUrl(value: string): boolean {
  return URL_RE.test(value.trim());
}

/**
 * Render a value that may be a URL. If it is, return a clickable `<a>` tag
 * with the text "Link". Otherwise return the escaped text.
 */
export function renderMaybeUrl(value: string): string {
  const trimmed = value.trim();
  if (isUrl(trimmed)) {
    return `<a class="short-link" href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(trimmed)}">Link</a>`;
  }
  return escapeHtml(value);
}
