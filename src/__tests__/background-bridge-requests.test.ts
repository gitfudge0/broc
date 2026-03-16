import { describe, expect, it, vi } from "vitest";
import {
  handleExtensionStatusRequest,
  handleOpenNotebookRequest,
  handleOpenTabRequest,
  normalizeTabInfo,
} from "../background/bridge-requests.js";

describe("normalizeTabInfo", () => {
  it("normalizes created tab fields", () => {
    expect(normalizeTabInfo({
      id: 10,
      url: "https://www.google.com",
      title: "Google",
      active: true,
      windowId: 3,
    })).toEqual({
      id: 10,
      url: "https://www.google.com",
      title: "Google",
      active: true,
      windowId: 3,
    });
  });

  it("throws when the browser does not return tab identifiers", () => {
    expect(() => normalizeTabInfo({
      url: "https://www.google.com",
      active: true,
    })).toThrow("id and windowId");
  });
});

describe("handleOpenTabRequest", () => {
  it("returns open_tab_result with normalized tab info", async () => {
    const response = await handleOpenTabRequest(
      {
        type: "open_tab",
        id: "req_1",
        sessionId: "default",
        url: "https://www.google.com",
      },
      {
        createTab: vi.fn(async () => ({
          id: 17,
          url: "https://www.google.com",
          title: "Google",
          active: true,
          windowId: 4,
        })),
      },
    );

    expect(response).toEqual({
      type: "open_tab_result",
      id: "req_1",
      sessionId: "default",
      tab: {
        id: 17,
        url: "https://www.google.com",
        title: "Google",
        active: true,
        windowId: 4,
      },
    });
  });

  it("returns a structured error when tab creation fails", async () => {
    const response = await handleOpenTabRequest(
      {
        type: "open_tab",
        id: "req_2",
        sessionId: "default",
        url: "https://www.google.com",
      },
      {
        createTab: vi.fn(async () => {
          throw new Error("tabs.create failed");
        }),
      },
    );

    expect(response).toEqual({
      type: "error",
      id: "req_2",
      sessionId: "default",
      error: {
        code: "internal_error",
        message: "tabs.create failed",
      },
    });
  });
});

describe("handleOpenNotebookRequest", () => {
  it("returns open_notebook_result with the resolved notebook URL", async () => {
    const response = await handleOpenNotebookRequest(
      {
        type: "open_notebook",
        id: "req_notebook",
        sessionId: "default",
      },
      {
        getNotebookUrl: vi.fn(async () => "http://127.0.0.1:43123/notebook.html"),
      },
    );

    expect(response).toEqual({
      type: "open_notebook_result",
      id: "req_notebook",
      sessionId: "default",
      url: "http://127.0.0.1:43123/notebook.html",
    });
  });

  it("returns a structured error when notebook URL resolution fails", async () => {
    const response = await handleOpenNotebookRequest(
      {
        type: "open_notebook",
        id: "req_notebook_err",
        sessionId: "default",
      },
      {
        getNotebookUrl: vi.fn(async () => {
          throw new Error("notebook unavailable");
        }),
      },
    );

    expect(response).toEqual({
      type: "error",
      id: "req_notebook_err",
      sessionId: "default",
      error: {
        code: "internal_error",
        message: "notebook unavailable",
      },
    });
  });
});

describe("handleExtensionStatusRequest", () => {
  it("returns the current extension protocol and capabilities", () => {
    const response = handleExtensionStatusRequest(
      {
        type: "extension_status",
        id: "req_status",
        sessionId: "default",
      },
      {
        getManifestVersion: () => "0.1.0.5",
      },
    );

    expect(response).toEqual({
      type: "extension_status_result",
      id: "req_status",
      sessionId: "default",
      extensionVersion: "0.1.0.5",
      protocolVersion: 2,
      capabilities: {
        openTab: true,
        openNotebook: true,
      },
    });
  });
});
