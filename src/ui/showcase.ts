const SAMPLE_IMAGE = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIiB2aWV3Qm94PSIwIDAgODAwIDQ1MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBzdG9wLWNvbG9yPSIjRjhFNUQyIi8+PHN0b3Agb2Zmc2V0PSIwLjUiIHN0b3AtY29sb3I9IiNFOEVGRTciLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNEM0U0RkYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0idXJsKCNnKSIgcng9IjI4Ii8+PGNpcmNsZSBjeD0iMTM1IiBjeT0iMTIwIiByPSI1OCIgZmlsbD0iI0ZGRkYiIG9wYWNpdHk9Ii44NSIvPjxyZWN0IHg9IjE5MCIgeT0iOTAiIHdpZHRoPSIzNzAiIGhlaWdodD0iMzAiIHJ4PSIxNSIgZmlsbD0iI0ZGRkYiIG9wYWNpdHk9Ii45MSIvPjxyZWN0IHg9IjE5MCIgeT0iMTM4IiB3aWR0aD0iMjgwIiBoZWlnaHQ9IjE4IiByeD0iOSIgZmlsbD0iI0ZGRkYiIG9wYWNpdHk9Ii42NSIvPjxyZWN0IHg9IjYyIiB5PSIyMjAiIHdpZHRoPSIyMDAiIGhlaWdodD0iMTQ4IiByeD0iMjQiIGZpbGw9IiNGRkZGIiBvcGFjaXR5PSIuNzgiLz48cmVjdCB4PSIyODMiIHk9IjIyMCIgd2lkdGg9IjE2NSIgaGVpZ2h0PSIxNDgiIHJ4PSIyNCIgZmlsbD0iI0ZGRkYiIG9wYWNpdHk9Ii43NCIvPjxyZWN0IHg9IjQ2OSIgeT0iMjIwIiB3aWR0aD0iMjY5IiBoZWlnaHQ9IjE0OCIgcng9IjI0IiBmaWxsPSIjRkZGRiIgb3BhY2l0eT0iLjgyIi8+PHRleHQgeD0iNjIiIHk9IjQxMCIgZm9udC1mYW1pbHk9Ik1hbnJvcGUsIEFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjM0Y0QjU2Ij5TaG93Y2FzZSBwcmV2aWV3PC90ZXh0Pjwvc3ZnPg==";

export const SHOWCASE_TASK_ID = "__showcase__";

export interface ShowcaseArtifact {
  id: string;
  name: string;
  kind: string;
  mimeType?: string;
  size: number;
  createdAt: string;
  href?: string;
  thumbnailSrc?: string;
}

export interface ShowcaseTaskSummary {
  id: string;
  title: string;
  status: "completed";
  updatedAt: string;
  createdAt: string;
  tags: string[];
  summary: string;
  pinned: true;
  deletable: false;
}

export interface ShowcaseTaskRecord {
  meta: {
    id: string;
    title: string;
    status: "completed";
    updatedAt: string;
    createdAt: string;
    tags: string[];
    artifacts: ShowcaseArtifact[];
  };
  view: {
    summary: string;
    highlights: Array<{ id: string; label: string; value: string }>;
    suggestedActions: Array<{ id: string; label: string; kind: string; payload?: Record<string, unknown> }>;
    sections: Array<{ id: string; title: string; kind: string; content: unknown }>;
  };
  events: Array<{ id: string; type: string; createdAt: string; actor: string; payload: Record<string, unknown> }>;
}

const createdAt = "2026-03-17T09:00:00.000Z";
const updatedAt = "2026-03-17T11:45:00.000Z";

export function createShowcaseTaskSummary(): ShowcaseTaskSummary {
  return {
    id: SHOWCASE_TASK_ID,
    title: "Component Showcase",
    status: "completed",
    createdAt,
    updatedAt,
    tags: ["demo", "ui", "showcase"],
    summary: "Pinned visual reference for every notebook content renderer.",
    pinned: true,
    deletable: false,
  };
}

export function createShowcaseTask(): ShowcaseTaskRecord {
  return {
    meta: {
      id: SHOWCASE_TASK_ID,
      title: "Notebook Component Showcase",
      status: "completed",
      createdAt,
      updatedAt,
      tags: ["demo", "reference", "visual QA"],
      artifacts: [
        {
          id: "showcase-image",
          name: "showcase-preview.svg",
          kind: "screenshot",
          mimeType: "image/svg+xml",
          size: 14320,
          createdAt: "2026-03-17T09:35:00.000Z",
          href: SAMPLE_IMAGE,
          thumbnailSrc: SAMPLE_IMAGE,
        },
        {
          id: "showcase-report",
          name: "component-notes.md",
          kind: "file",
          mimeType: "text/markdown",
          size: 2418,
          createdAt: "2026-03-17T09:40:00.000Z",
          href: "data:text/markdown;charset=utf-8,%23%20Notebook%20Showcase%0A%0AUse%20this%20page%20to%20review%20renderers%20and%20request%20design%20changes.%0A",
        },
      ],
    },
    view: {
      summary: "A built-in gallery of notebook renderers and surrounding UI surfaces, intended for rapid visual review.",
      highlights: [
        { id: "hl-1", label: "Renderer Kinds", value: "15" },
        { id: "hl-2", label: "Artifacts", value: "Image + File" },
        { id: "hl-3", label: "Timeline Events", value: "5 sample entries" },
        { id: "hl-4", label: "Use Case", value: "Visual QA" },
      ],
      suggestedActions: [
        {
          id: "action-1",
          label: "Review notebook docs",
          kind: "open_url",
          payload: { url: "https://developer.mozilla.org/en-US/docs/Web/HTML" },
        },
        {
          id: "action-2",
          label: "Open Broc repository",
          kind: "open_url",
          payload: { url: "https://github.com" },
        },
      ],
      sections: [
        {
          id: "section-text",
          title: "Text",
          kind: "text",
          content: "A straightforward body copy block for notes, summaries, and inline narrative. It should feel calm and readable across long-form content.",
        },
        {
          id: "section-markdown",
          title: "Markdown",
          kind: "markdown",
          content: "# Heading\n\n## Subheading\n\nThis renderer supports **bold text**, inline `code`, and [external links](https://example.com).\n\n### Notes\n\nUse it for richer narrative sections.",
        },
        {
          id: "section-key-value",
          title: "Key Value",
          kind: "key_value",
          content: {
            Environment: "Notebook Dev",
            Browser: "Managed Chromium",
            URL: "https://example.com/showcase",
            Status: "Ready for review",
          },
        },
        {
          id: "section-list",
          title: "List",
          kind: "list",
          content: [
            "Visual hierarchy",
            "Spacing rhythm",
            "Color contrast",
            "Empty state clarity",
          ],
        },
        {
          id: "section-checklist",
          title: "Checklist",
          kind: "checklist",
          content: [
            { label: "Header looks polished", checked: true },
            { label: "Sidebar item is easy to find", checked: true },
            { label: "Artifact gallery needs tweaks", checked: false },
          ],
        },
        {
          id: "section-metrics",
          title: "Metrics",
          kind: "metrics",
          content: [
            { label: "Sections", value: "15" },
            { label: "Surface Variants", value: "4" },
            { label: "Review Speed", value: "Fast" },
          ],
        },
        {
          id: "section-links",
          title: "Links",
          kind: "links",
          content: [
            { label: "HTML reference", url: "https://developer.mozilla.org/en-US/docs/Web/HTML" },
            { label: "CSS reference", url: "https://developer.mozilla.org/en-US/docs/Web/CSS" },
            { label: "Accessibility basics", url: "https://www.w3.org/WAI/fundamentals/accessibility-intro/" },
          ],
        },
        {
          id: "section-table",
          title: "Table",
          kind: "table",
          content: [
            { Component: "Sidebar", Purpose: "Navigation", State: "Stable" },
            { Component: "Section Cards", Purpose: "Content display", State: "Growing" },
            { Component: "Timeline", Purpose: "Progress history", State: "Stable" },
          ],
        },
        {
          id: "section-code",
          title: "Code",
          kind: "code",
          content: "const showcase = { pinned: true, kind: 'demo' };\nconsole.log(showcase);",
        },
        {
          id: "section-json",
          title: "JSON",
          kind: "json",
          content: {
            component: "artifact_gallery",
            supportsImages: true,
            supportsFiles: true,
            reviewMode: "visual",
          },
        },
        {
          id: "section-diff",
          title: "Diff",
          kind: "diff",
          content: "- Old spacing scale\n+ Refined spacing scale\n- Generic label styling\n+ Sharper typography for labels",
        },
        {
          id: "section-media",
          title: "Media",
          kind: "media",
          content: [
            { src: SAMPLE_IMAGE, alt: "Gradient preview card" },
            { src: SAMPLE_IMAGE, alt: "Alternative showcase preview" },
          ],
        },
        {
          id: "section-html",
          title: "HTML",
          kind: "html",
          content: '<div style="padding:16px;border-radius:16px;background:linear-gradient(135deg,#f8efe1,#d9e7ff);border:1px solid rgba(70,85,105,.18)"><strong style="display:block;margin-bottom:6px">Custom HTML callout</strong><span style="color:#475569">Useful when an agent wants a bespoke formatted payload.</span></div>',
        },
        {
          id: "section-timeline",
          title: "Timeline",
          kind: "timeline",
          content: "Rendered below in the dedicated timeline area.",
        },
        {
          id: "section-artifacts",
          title: "Artifact Gallery",
          kind: "artifact_gallery",
          content: "Rendered below in the dedicated artifacts area.",
        },
      ],
    },
    events: [
      {
        id: "event-1",
        type: "task.created",
        createdAt: "2026-03-17T09:00:00.000Z",
        actor: "system",
        payload: { title: "Notebook Component Showcase" },
      },
      {
        id: "event-2",
        type: "notebook.view_updated",
        createdAt: "2026-03-17T09:12:00.000Z",
        actor: "agent",
        payload: { description: "Added representative content blocks for each supported section kind." },
      },
      {
        id: "event-3",
        type: "artifact.added",
        createdAt: "2026-03-17T09:35:00.000Z",
        actor: "agent",
        payload: { label: "showcase-preview.svg", summary: "Attached a sample image and file artifact." },
      },
      {
        id: "event-4",
        type: "browser.event_linked",
        createdAt: "2026-03-17T10:02:00.000Z",
        actor: "system",
        payload: { event: "page_opened", url: "http://127.0.0.1:43123/notebook.html?task=__showcase__" },
      },
      {
        id: "event-5",
        type: "task.status_changed",
        createdAt: "2026-03-17T11:45:00.000Z",
        actor: "agent",
        payload: { status: "completed", description: "Showcase page is ready for visual review and design feedback." },
      },
    ],
  };
}
