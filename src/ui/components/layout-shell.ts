/**
 * The top-level shell: sidebar (task list) + main content area.
 * Clean two-column layout with solid sidebar background.
 */

export interface LayoutShellProps {
  sidebar: string;
  main: string;
}

export function layoutShell({ sidebar, main }: LayoutShellProps): string {
  return `
    <div class="shell">
      <aside class="shell__sidebar">${sidebar}</aside>
      <main class="shell__main">${main}</main>
    </div>
  `;
}

export const layoutShellCSS = /* css */ `
.shell {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  align-items: start;
  min-height: 100vh;
}

.shell__sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: var(--sidebar-bg);
  padding: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}

.shell__main {
  padding: var(--sp-8) var(--sp-8) var(--sp-9);
  max-width: 820px;
  min-width: 0;
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: 1fr;
  }
  .shell__sidebar {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--border);
    max-height: none;
    padding: var(--sp-4);
  }
  .shell__sidebar .sidebar-list {
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    gap: var(--sp-2);
    padding-bottom: var(--sp-2);
    align-items: stretch;
  }
  .shell__main {
    padding: var(--sp-6);
  }
}
`;
