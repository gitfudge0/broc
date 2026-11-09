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
  workflow: {
    milestones: Array<{ id: string; title: string; summary: string; createdAt: string; screenshotArtifactId?: string }>;
    gatheredResults: Array<{ id: string; label: string; value: string; source?: string; fields?: Record<string, string> }>;
    finalOutput: {
      summary: string;
      details: string;
      gathered: Array<{ id: string; label: string; value: string; source?: string; fields?: Record<string, string> }>;
      screenshotArtifactId?: string;
    };
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
    summary: "Pinned demo of the simplified markdown-first notebook layout.",
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
    workflow: {
      milestones: [
        {
          id: "milestone-1",
          title: "Showcase built",
          summary: "Prepared the simplified notebook layout with one primary output surface.",
          createdAt: "2026-03-17T09:20:00.000Z",
          screenshotArtifactId: "showcase-image",
        },
      ],
      gatheredResults: [
        {
          id: "result-1",
          label: "Track",
          value: "Rockstar",
          fields: {
            Rank: "1",
            Song: "Rockstar",
            Source: "Example showcase page",
          },
          source: "Example showcase page",
        },
      ],
      finalOutput: {
        summary: "Showcase task completed with representative notebook content.",
        details: "This sample demonstrates the simplified notebook: a single primary output view with supporting sections below it.",
        gathered: [
          {
            id: "result-1",
            label: "Track",
            value: "Rockstar",
            fields: {
              Rank: "1",
              Song: "Rockstar",
              Source: "Example showcase page",
            },
            source: "Example showcase page",
          },
        ],
        screenshotArtifactId: "showcase-image",
      },
    },
    view: {
      summary: "A built-in demo of the markdown-first notebook page with inline supporting sections.",
      highlights: [],
      suggestedActions: [],
      sections: [
        {
          id: "final-output",
          title: "Final Output",
          kind: "markdown",
          content: "# Notebook Showcase\n\n## Summary\n\nThe main page now renders a single markdown document.\n\n## Gathered Information\n\nThis sample keeps user-facing information in one readable place instead of multiple component renderers.\n\n## Results\n\n1. Track: Rockstar",
        },
        {
          id: "supporting-notes",
          title: "Supporting Notes",
          kind: "checklist",
          content: [
            { label: "Header looks polished", checked: true },
            { label: "Main page uses one markdown document", checked: true },
            { label: "Supporting details render inline below the main output", checked: true },
          ],
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
