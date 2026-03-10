// ============================================================
// Locator generator — Playwright-style locator candidates
// ============================================================

import type { LocatorCandidates } from "../shared/types/elements.js";
import { getRole, getAccessibleName, getVisibleTextContent } from "./aria.js";

/**
 * Generate Playwright-style locator candidates for an element.
 * Priority order: role/name > label > placeholder > text > alt > title > testid > css
 */
export function generateLocators(el: HTMLElement): LocatorCandidates {
  const locators: LocatorCandidates = {};

  // 1. Role + accessible name
  const role = getRole(el);
  if (role && role !== "generic") {
    const name = getAccessibleName(el);
    locators.role = { role, name: name || undefined };
  }

  // 2. Label text (for form controls)
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const labelText = getLabelText(el);
    if (labelText) locators.label = labelText;
  }

  // 3. Placeholder
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const placeholder = el.placeholder?.trim();
    if (placeholder) locators.placeholder = placeholder;
  }

  // 4. Visible text content (for non-form elements)
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    const text = getVisibleTextContent(el, 100);
    if (text) locators.text = text;
  }

  // 5. Alt text (images)
  if (el instanceof HTMLImageElement && el.alt?.trim()) {
    locators.alt = el.alt.trim();
  }

  // 6. Title attribute
  const title = el.getAttribute("title")?.trim();
  if (title) locators.title = title;

  // 7. data-testid
  const testId = el.getAttribute("data-testid")?.trim();
  if (testId) locators.testId = testId;

  // 8. CSS selector fallback (shortest unique)
  locators.css = generateCssSelector(el);

  return locators;
}

/**
 * Get label text for a form control element.
 */
function getLabelText(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string | undefined {
  // label[for="id"]
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  // Wrapping <label>
  const parentLabel = el.closest("label");
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select").forEach((c) => c.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}

/**
 * Generate the shortest unique CSS selector for an element.
 * Tries: #id > [data-testid] > tag.class > nth-child chain
 * For elements inside shadow roots, uses a shadow-piercing notation.
 */
function generateCssSelector(el: HTMLElement): string {
  // Check if the element is inside a shadow root
  const shadowPath = getShadowPath(el);
  if (shadowPath.length > 0) {
    // Generate shadow-aware selector: "host-selector >>> inner-selector"
    return shadowPath.join(" >>> ");
  }

  return generateStandardCssSelector(el);
}

/**
 * Build a shadow-piercing path if the element is inside shadow DOM.
 * Returns an array of CSS selectors, one per shadow boundary.
 * Empty array means the element is NOT in shadow DOM.
 */
function getShadowPath(el: HTMLElement): string[] {
  const boundaries: { host: HTMLElement; inner: HTMLElement }[] = [];
  let current: Node = el;

  // Walk up from the element, collecting shadow root boundaries
  while (current) {
    const root = current.getRootNode();
    if (root instanceof ShadowRoot) {
      boundaries.unshift({
        host: root.host as HTMLElement,
        inner: current instanceof HTMLElement ? current : el,
      });
      current = root.host;
    } else {
      break;
    }
  }

  if (boundaries.length === 0) return [];

  // Build the path: host-selector >>> inner-selector >>> ...
  const parts: string[] = [];

  // First part: selector for the outermost shadow host (in light DOM)
  parts.push(generateStandardCssSelector(boundaries[0].host));

  // Middle parts: selectors inside each shadow root
  for (let i = 0; i < boundaries.length; i++) {
    const inner = i === boundaries.length - 1 ? el : boundaries[i + 1].host;
    parts.push(generateSelectorInRoot(inner, boundaries[i].host.shadowRoot!));
  }

  return parts;
}

/**
 * Generate a CSS selector for an element within a specific root (document or shadow root).
 */
function generateSelectorInRoot(el: HTMLElement, root: ShadowRoot | Document): string {
  // Try ID
  if (el.id) {
    try {
      if (root.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
        return `#${CSS.escape(el.id)}`;
      }
    } catch {}
  }

  // Try data-testid
  const testId = el.getAttribute("data-testid");
  if (testId) {
    const sel = `[data-testid="${CSS.escape(testId)}"]`;
    try {
      if (root.querySelectorAll(sel).length === 1) return sel;
    } catch {}
  }

  // Fall back to tag + class
  let segment = el.tagName.toLowerCase();
  const classes = Array.from(el.classList)
    .filter((c) => !isGeneratedClass(c))
    .slice(0, 2);
  if (classes.length > 0) {
    segment += classes.map((c) => `.${CSS.escape(c)}`).join("");
  }

  try {
    if (root.querySelectorAll(segment).length === 1) return segment;
  } catch {}

  return segment;
}

/**
 * Standard CSS selector generation (for elements in light DOM).
 */
function generateStandardCssSelector(el: HTMLElement): string {
  // Try ID first
  if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
    return `#${CSS.escape(el.id)}`;
  }

  // Try data-testid
  const testId = el.getAttribute("data-testid");
  if (testId) {
    const sel = `[data-testid="${CSS.escape(testId)}"]`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }

  // Build a path from element to root, stopping as soon as selector is unique
  const parts: string[] = [];
  let current: HTMLElement | null = el;

  while (current && current !== document.documentElement) {
    let segment = current.tagName.toLowerCase();

    // Add significant classes (skip utility/generated classes)
    const classes = Array.from(current.classList)
      .filter((c) => !isGeneratedClass(c))
      .slice(0, 2);
    if (classes.length > 0) {
      segment += classes.map((c) => `.${CSS.escape(c)}`).join("");
    }

    parts.unshift(segment);
    const candidate = parts.join(" > ");

    // Check if this selector is unique
    try {
      if (document.querySelectorAll(candidate).length === 1) {
        return candidate;
      }
    } catch {
      // Invalid selector, keep going
    }

    // Add nth-child if needed for disambiguation
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const currentTag = current.tagName;
      const siblings = Array.from(parent.children).filter(
        (s: Element) => s.tagName === currentTag
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        parts[0] = `${segment}:nth-of-type(${index})`;

        try {
          const candidate2 = parts.join(" > ");
          if (document.querySelectorAll(candidate2).length === 1) {
            return candidate2;
          }
        } catch {
          // Invalid selector
        }
      }
    }

    current = parent;
  }

  // Fallback: full path
  return parts.join(" > ");
}

/**
 * Heuristic to detect generated/utility CSS class names that aren't useful as selectors.
 */
function isGeneratedClass(className: string): boolean {
  // Hashes, UUIDs, Tailwind-style utilities
  return (
    /^[a-z]{1,3}-[a-zA-Z0-9]{4,}$/.test(className) || // CSS modules style: _abc-X7kf2
    /^[A-Za-z0-9_-]{20,}$/.test(className) || // Long hashes
    /^(hover|focus|active|disabled|dark|lg|md|sm|xl|2xl):/.test(className) || // Tailwind variants
    /^[a-z]+(-[a-z]+){3,}$/.test(className) // Deep BEM chains
  );
}
