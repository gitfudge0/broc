// ============================================================
// ARIA utilities — role mapping and accessible name computation
// ============================================================

/**
 * Implicit ARIA role mapping from HTML tag names.
 * Based on WAI-ARIA 1.2 spec: https://www.w3.org/TR/html-aria/
 * Only includes roles that are useful for agent interaction.
 */
const IMPLICIT_ROLES: Record<string, string | ((el: HTMLElement) => string)> = {
  a: (el) => (el.hasAttribute("href") ? "link" : "generic"),
  article: "article",
  aside: "complementary",
  button: "button",
  datalist: "listbox",
  details: "group",
  dialog: "dialog",
  fieldset: "group",
  figure: "figure",
  footer: (el) => (isSectioning(el) ? "contentinfo" : "generic"),
  form: (el) =>
    el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby") || (el as HTMLFormElement).name
      ? "form"
      : "generic",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  header: (el) => (isSectioning(el) ? "banner" : "generic"),
  hr: "separator",
  img: (el) => (el.getAttribute("alt") === "" ? "presentation" : "img"),
  input: resolveInputRole,
  li: "listitem",
  main: "main",
  math: "math",
  menu: "list",
  nav: "navigation",
  ol: "list",
  optgroup: "group",
  option: "option",
  output: "status",
  progress: "progressbar",
  search: "search",
  section: (el) =>
    el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")
      ? "region"
      : "generic",
  select: (el) =>
    (el as HTMLSelectElement).multiple ? "listbox" : "combobox",
  summary: "button",
  table: "table",
  tbody: "rowgroup",
  td: "cell",
  textarea: "textbox",
  tfoot: "rowgroup",
  th: (el) => {
    const scope = el.getAttribute("scope");
    return scope === "col" || scope === "colgroup" ? "columnheader" : "rowheader";
  },
  thead: "rowgroup",
  tr: "row",
  ul: "list",
};

function isSectioning(el: HTMLElement): boolean {
  // footer/header only have landmark roles when not nested inside sectioning content
  const sectioningTags = ["article", "aside", "main", "nav", "section"];
  let parent = el.parentElement;
  while (parent) {
    if (sectioningTags.includes(parent.tagName.toLowerCase())) {
      return false;
    }
    parent = parent.parentElement;
  }
  return true;
}

function resolveInputRole(el: HTMLElement): string {
  const type = (el as HTMLInputElement).type?.toLowerCase() || "text";
  switch (type) {
    case "button":
    case "image":
    case "reset":
    case "submit":
      return "button";
    case "checkbox":
      return "checkbox";
    case "radio":
      return "radio";
    case "range":
      return "slider";
    case "search":
      return "searchbox";
    case "email":
    case "tel":
    case "text":
    case "url":
    case "password":
      return (el as HTMLInputElement).list ? "combobox" : "textbox";
    case "number":
      return "spinbutton";
    case "hidden":
      return "hidden";
    default:
      return "textbox";
  }
}

/**
 * Get the ARIA role for an element.
 * Explicit `role` attribute takes precedence over implicit mapping.
 */
export function getRole(el: HTMLElement): string {
  // Explicit role
  const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0];
  if (explicit) return explicit;

  // Implicit role from tag
  const tag = el.tagName.toLowerCase();
  const mapping = IMPLICIT_ROLES[tag];
  if (typeof mapping === "function") return mapping(el);
  if (typeof mapping === "string") return mapping;

  return "generic";
}

/**
 * Compute the accessible name for an element.
 * Simplified version of the accname computation algorithm.
 * Priority: aria-labelledby > aria-label > associated label > placeholder > alt > title > text content
 */
export function getAccessibleName(el: HTMLElement): string {
  // aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const ids = labelledBy.trim().split(/\s+/);
    const parts = ids
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
  }

  // aria-label
  const ariaLabel = el.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  // Associated <label> (for form controls)
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    // label[for="id"]
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label?.textContent?.trim()) return label.textContent.trim();
    }
    // Wrapping <label>
    const parentLabel = el.closest("label");
    if (parentLabel) {
      // Get label text excluding the control's own text
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      const inputs = clone.querySelectorAll("input, textarea, select");
      inputs.forEach((input) => input.remove());
      const text = clone.textContent?.trim();
      if (text) return text;
    }
  }

  // placeholder (for inputs/textareas)
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const placeholder = el.placeholder?.trim();
    if (placeholder) return placeholder;
  }

  // alt (for images)
  if (el instanceof HTMLImageElement) {
    const alt = el.alt?.trim();
    if (alt) return alt;
  }

  // title attribute
  const title = el.getAttribute("title")?.trim();
  if (title) return title;

  // For buttons, links, and headings: use text content
  const role = getRole(el);
  if (["button", "link", "heading", "tab", "menuitem", "option", "treeitem"].includes(role)) {
    const text = getVisibleTextContent(el);
    if (text) return text;
  }

  return "";
}

/**
 * Get visible text content of an element, excluding hidden children.
 * Truncated to a reasonable length.
 */
export function getVisibleTextContent(el: HTMLElement, maxLength = 200): string {
  const text = collectVisibleText(el).trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "\u2026";
}

function collectVisibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  // Skip hidden elements
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return "";
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return "";

  let text = "";
  for (const child of el.childNodes) {
    text += collectVisibleText(child);
  }
  return text;
}
