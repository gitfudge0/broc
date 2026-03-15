import { escapeHtml } from "../utils";
import { emptyState } from "./empty-state";

export interface ArtifactData {
  id: string;
  name: string;
  kind: string;
  mimeType?: string;
  size: number;
  createdAt: string;
}

export interface ArtifactGalleryProps {
  artifacts: ArtifactData[];
  taskId: string;
  apiBase: string;
}

function isImage(artifact: ArtifactData): boolean {
  if (artifact.mimeType && artifact.mimeType.startsWith("image/")) return true;
  const name = artifact.name.toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(name);
}

function artifactUrl(taskId: string, artifactId: string, apiBase: string): string {
  return `${apiBase}/task/${encodeURIComponent(taskId)}/artifact/${encodeURIComponent(artifactId)}`;
}

export function artifactGallery({ artifacts, taskId, apiBase }: ArtifactGalleryProps): string {
  if (!artifacts || artifacts.length === 0) {
    return emptyState({ message: "No artifacts yet", hint: "Screenshots and files appear here." });
  }

  const images = artifacts.filter(isImage);
  const files = artifacts.filter((a) => !isImage(a));

  const imageThumbs = images.map((a) => {
    const url = artifactUrl(taskId, a.id, apiBase);
    return `
      <a class="ag-thumb" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(a.name)}">
        <img class="ag-thumb__img" src="${escapeHtml(url)}" alt="${escapeHtml(a.name)}" loading="lazy" />
      </a>
    `;
  }).join("");

  const fileCards = files.map((a) => {
    const url = artifactUrl(taskId, a.id, apiBase);
    return `
      <a class="ag-file" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        <span class="ag-file__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </span>
        <span class="ag-file__name">${escapeHtml(a.name)}</span>
        <span class="ag-file__meta">${escapeHtml(a.kind)} &middot; ${formatBytes(a.size)}</span>
      </a>
    `;
  }).join("");

  return `
    <div class="ag">
      ${images.length > 0 ? `
        <div class="ag-images">
          <span class="eyebrow">Screenshots &amp; Images</span>
          <div class="ag-thumb-strip">${imageThumbs}</div>
        </div>
      ` : ""}
      ${files.length > 0 ? `
        <div class="ag-files">
          <span class="eyebrow">Files</span>
          <div class="ag-file-list">${fileCards}</div>
        </div>
      ` : ""}
    </div>
  `;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const artifactGalleryCSS = /* css */ `
.ag {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

.ag-images, .ag-files {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.ag-thumb-strip {
  display: flex;
  gap: var(--sp-3);
  overflow-x: auto;
  padding-bottom: var(--sp-2);
}

.ag-thumb {
  flex-shrink: 0;
  width: 120px;
  height: 80px;
  border-radius: var(--radius-md);
  overflow: hidden;
  display: block;
  border: 1px solid var(--border);
  transition: transform 0.15s, box-shadow 0.15s;
}
.ag-thumb:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-elevated);
}

.ag-thumb__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ag-file-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.ag-file {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  text-decoration: none;
  color: inherit;
  transition: background 0.15s;
}
.ag-file:hover {
  background: var(--surface-hover);
  text-decoration: none;
}

.ag-file__icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.ag-file__name {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ag-file__meta {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

@media (max-width: 900px) {
  .ag-thumb {
    width: 90px;
    height: 60px;
  }
}
`;
