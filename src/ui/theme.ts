/**
 * Design tokens and global stylesheet for the Broc Canvas UI.
 *
 * Inspired by editorial / magazine aesthetics: warm neutrals, strong
 * typographic hierarchy, generous whitespace, and restrained accent color.
 */

export const themeCSS = /* css */ `
/* ------------------------------------------------------------------ */
/*  TOKENS                                                            */
/* ------------------------------------------------------------------ */
:root, [data-theme="light"] {
  color-scheme: light;

  /* palette */
  --bg:              #f4f1eb;
  --surface:         #ffffff;
  --surface-muted:   #faf8f5;
  --surface-hover:   #f0ede7;

  --text-primary:    #1a1a1a;
  --text-secondary:  #6b6560;
  --text-muted:      #a8a29e;

  --accent:          #174c63;
  --accent-soft:     #d5e5eb;
  --accent-hover:    #1b5d78;

  --border:          rgba(0, 0, 0, 0.06);
  --border-strong:   rgba(0, 0, 0, 0.12);

  /* status */
  --status-running-bg:    #dbeafe;
  --status-running-fg:    #1e5a8a;
  --status-completed-bg:  #d9ead7;
  --status-completed-fg:  #1f6f34;
  --status-failed-bg:     #f4d7d5;
  --status-failed-fg:     #8a2820;
  --status-blocked-bg:    #f4d7d5;
  --status-blocked-fg:    #8a2820;
  --status-pending-bg:    #f0ede7;
  --status-pending-fg:    #6b6560;
  --status-waiting-bg:    #fef3cd;
  --status-waiting-fg:    #856404;
  --status-archived-bg:   #e8e5df;
  --status-archived-fg:   #6b6560;

  /* sidebar */
  --sidebar-bg: rgba(250, 248, 244, 0.85);

  /* typography */
  --font-display:  'Inter', 'Helvetica Neue', Arial, sans-serif;
  --font-body:     Georgia, 'Iowan Old Style', 'Palatino Linotype', serif;
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
  --radius-sm:  6px;
  --radius-md:  12px;
  --radius-lg:  20px;
  --radius-xl:  28px;
  --radius-pill: 999px;

  /* shadows */
  --shadow-card:     0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-elevated: 0 8px 30px rgba(0, 0, 0, 0.07);
}

/* ------------------------------------------------------------------ */
/*  DARK THEME                                                        */
/* ------------------------------------------------------------------ */
[data-theme="dark"] {
  color-scheme: dark;

  --bg:              #131316;
  --surface:         #1c1c21;
  --surface-muted:   #18181c;
  --surface-hover:   #252529;

  --text-primary:    #e8e6e3;
  --text-secondary:  #9b9690;
  --text-muted:      #5c5752;

  --accent:          #6bb8d6;
  --accent-soft:     #1e3a48;
  --accent-hover:    #8acae3;

  --border:          rgba(255, 255, 255, 0.07);
  --border-strong:   rgba(255, 255, 255, 0.14);

  --status-running-bg:    #172540;
  --status-running-fg:    #6bb8d6;
  --status-completed-bg:  #15301a;
  --status-completed-fg:  #6fcf7f;
  --status-failed-bg:     #351616;
  --status-failed-fg:     #e57373;
  --status-blocked-bg:    #351616;
  --status-blocked-fg:    #e57373;
  --status-pending-bg:    #252529;
  --status-pending-fg:    #9b9690;
  --status-waiting-bg:    #332d15;
  --status-waiting-fg:    #e0c55b;
  --status-archived-bg:   #252529;
  --status-archived-fg:   #5c5752;

  --sidebar-bg: rgba(22, 22, 26, 0.9);

  --shadow-card:     0 1px 3px rgba(0, 0, 0, 0.2);
  --shadow-elevated: 0 8px 30px rgba(0, 0, 0, 0.35);
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
  font-size: 15px;
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
  color: var(--accent);
  text-decoration: none;
}
a:hover { text-decoration: underline; }

pre, code { font-family: var(--font-mono); }

img { display: block; max-width: 100%; }

/* ------------------------------------------------------------------ */
/*  UTILITY CLASSES                                                   */
/* ------------------------------------------------------------------ */
.eyebrow {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
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
