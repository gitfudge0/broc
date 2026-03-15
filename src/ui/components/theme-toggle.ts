/**
 * Sun/moon toggle button for switching between light and dark themes.
 * Persists preference to localStorage and toggles `data-theme` on <html>.
 */

const STORAGE_KEY = "broc-canvas-theme";

const sunIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="5"/>
  <line x1="12" y1="1" x2="12" y2="3"/>
  <line x1="12" y1="21" x2="12" y2="23"/>
  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
  <line x1="1" y1="12" x2="3" y2="12"/>
  <line x1="21" y1="12" x2="23" y2="12"/>
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
</svg>`;

const moonIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
</svg>`;

export function themeToggle(): string {
  return `
    <button class="theme-toggle" data-theme-toggle aria-label="Toggle dark mode" title="Toggle dark mode">
      <span class="theme-toggle__sun">${sunIcon}</span>
      <span class="theme-toggle__moon">${moonIcon}</span>
    </button>
  `;
}

/** Call once after DOM is rendered to bind the toggle behaviour. */
export function bindThemeToggle(): void {
  const btn = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const html = document.documentElement;
    const current = html.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable — ignore
    }
  });
}

export const themeToggleCSS = /* css */ `
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: background 0.15s, color 0.15s;
}
.theme-toggle:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

/* Show sun in dark mode, moon in light mode */
.theme-toggle__sun { display: none; }
.theme-toggle__moon { display: flex; }

[data-theme="dark"] .theme-toggle__sun { display: flex; }
[data-theme="dark"] .theme-toggle__moon { display: none; }
`;
