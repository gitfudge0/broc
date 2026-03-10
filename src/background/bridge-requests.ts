import type {
  ErrorResponse,
  ExtensionStatusRequest,
  ExtensionStatusResponse,
  OpenTabRequest,
  OpenTabResponse,
  TabInfo,
} from "../shared/index.js";

interface BrowserTabShape {
  id?: number;
  url?: string;
  title?: string;
  active?: boolean;
  windowId?: number;
}

export interface OpenTabRequestDeps {
  createTab: (options: { url: string; active: boolean }) => Promise<BrowserTabShape>;
}

export interface ExtensionStatusDeps {
  getManifestVersion: () => string;
}

export function makeProtocolError(
  req: { id: string; sessionId: string },
  code: ErrorResponse["error"]["code"],
  message: string,
): ErrorResponse {
  return {
    type: "error",
    id: req.id,
    sessionId: req.sessionId,
    error: {
      code,
      message,
    },
  };
}

export function normalizeTabInfo(tab: BrowserTabShape, defaultActive = true): TabInfo {
  if (tab.id === undefined || tab.windowId === undefined) {
    throw new Error("Browser did not return a created tab with id and windowId.");
  }

  return {
    id: tab.id,
    url: tab.url || "",
    title: tab.title || "",
    active: tab.active ?? defaultActive,
    windowId: tab.windowId,
  };
}

export async function handleOpenTabRequest(
  req: OpenTabRequest,
  deps: OpenTabRequestDeps,
): Promise<OpenTabResponse | ErrorResponse> {
  const active = req.active ?? true;

  try {
    const tab = await deps.createTab({ url: req.url, active });
    return {
      type: "open_tab_result",
      id: req.id,
      sessionId: req.sessionId,
      tab: normalizeTabInfo(tab, active),
    };
  } catch (error) {
    return makeProtocolError(
      req,
      "internal_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function handleExtensionStatusRequest(
  req: ExtensionStatusRequest,
  deps: ExtensionStatusDeps,
): ExtensionStatusResponse {
  return {
    type: "extension_status_result",
    id: req.id,
    sessionId: req.sessionId,
    extensionVersion: deps.getManifestVersion(),
    protocolVersion: 2,
    capabilities: {
      openTab: true,
    },
  };
}
