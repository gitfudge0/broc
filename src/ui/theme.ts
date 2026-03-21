/**
 * Design tokens and global stylesheet for the Broc Notebook UI.
 *
 * Swiss-minimalist aesthetic: near-monochrome palette, clean sans-serif
 * typography, generous whitespace, single warm accent color (red/coral).
 */

export const themeCSS = /* css */ `
/* ------------------------------------------------------------------ */
/*  TOKENS                                                            */
/* ------------------------------------------------------------------ */
:root, [data-theme="light"] {
  color-scheme: light;

  /* palette */
  --bg:              #f5f5f4;
  --surface:         #ffffff;
  --surface-muted:   #fafaf9;
  --surface-hover:   #f0f0ee;

  --text-primary:    #0a0a0a;
  --text-secondary:  #525252;
  --text-muted:      #a3a3a3;

  --accent:          #dc2626;
  --accent-soft:     #fef2f2;
  --accent-hover:    #b91c1c;

  --border:          rgba(0, 0, 0, 0.06);
  --border-strong:   rgba(0, 0, 0, 0.12);

  /* status */
  --status-running-bg:    #fef2f2;
  --status-running-fg:    #dc2626;
  --status-completed-bg:  #f0fdf4;
  --status-completed-fg:  #16a34a;
  --status-failed-bg:     #fef2f2;
  --status-failed-fg:     #dc2626;
  --status-blocked-bg:    #fef2f2;
  --status-blocked-fg:    #dc2626;
  --status-pending-bg:    #f5f5f4;
  --status-pending-fg:    #737373;
  --status-waiting-bg:    #fffbeb;
  --status-waiting-fg:    #d97706;
  --status-archived-bg:   #f5f5f4;
  --status-archived-fg:   #a3a3a3;

  /* sidebar */
  --sidebar-bg: #ffffff;

  /* typography */
  --font-display:  'Inter', 'Helvetica Neue', 'Arial', sans-serif;
  --font-body:     'Inter', 'Helvetica Neue', 'Arial', sans-serif;
  --font-mono:     'JetBrains Mono', 'Fira Code', 'Menlo', monospace;

  /* spacing (4px base) */
  --sp-1:  4px;
  --sp-2:  8px;
  --sp-3:  12px;
  --sp-4:  16px;
  --sp-5:  20px;
  --sp-6:  24px;
  --sp-7:  32px;
  --sp-8:  48px;
  --sp-9:  64px;

  /* radii */
  --radius-sm:  3px;
  --radius-md:  5px;
  --radius-lg:  8px;
  --radius-xl:  12px;
  --radius-pill: 999px;

  /* shadows */
  --shadow-card:     0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.06);
}

/* ------------------------------------------------------------------ */
/*  DARK THEME                                                        */
/* ------------------------------------------------------------------ */
[data-theme="dark"] {
  color-scheme: dark;

  --bg:              #0a0a0a;
  --surface:         #141414;
  --surface-muted:   #111111;
  --surface-hover:   #1f1f1f;

  --text-primary:    #f5f5f5;
  --text-secondary:  #a3a3a3;
  --text-muted:      #525252;

  --accent:          #ef4444;
  --accent-soft:     #1c1111;
  --accent-hover:    #f87171;

  --border:          rgba(255, 255, 255, 0.06);
  --border-strong:   rgba(255, 255, 255, 0.12);

  /* status */
  --status-running-bg:    #1c1111;
  --status-running-fg:    #ef4444;
  --status-completed-bg:  #0d1f12;
  --status-completed-fg:  #4ade80;
  --status-failed-bg:     #1c1111;
  --status-failed-fg:     #ef4444;
  --status-blocked-bg:    #1c1111;
  --status-blocked-fg:    #ef4444;
  --status-pending-bg:    #1a1a1a;
  --status-pending-fg:    #737373;
  --status-waiting-bg:    #1a1608;
  --status-waiting-fg:    #fbbf24;
  --status-archived-bg:   #1a1a1a;
  --status-archived-fg:   #525252;

  --sidebar-bg: #111111;

  --shadow-card:     0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.4);
}

/* ------------------------------------------------------------------ */
/*  RESET & GLOBALS                                                   */
/* ------------------------------------------------------------------ */
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-display);
  font-weight: 700;
  line-height: 1.15;
  margin: 0;
}

p { margin: 0; }

button {
  font-family: inherit;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
  color: inherit;
}

a {
  color: var(--text-primary);
  text-decoration: underline;
  text-decoration-color: var(--border-strong);
  text-underline-offset: 2px;
  transition: text-decoration-color 0.15s;
}
a:hover {
  text-decoration-color: var(--text-primary);
}

.short-link {
  font-family: var(--font-display);
  font-size: inherit;
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: underline;
  text-decoration-color: var(--border-strong);
  text-underline-offset: 2px;
}
.short-link:hover {
  text-decoration-color: var(--text-primary);
}

pre, code { font-family: var(--font-mono); }

img { display: block; max-width: 100%; }

/* ------------------------------------------------------------------ */
/*  UTILITY CLASSES                                                   */
/* ------------------------------------------------------------------ */
.eyebrow {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.body-sm {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
`;
