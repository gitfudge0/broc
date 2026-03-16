// ============================================================
// Type declarations for WebExtension APIs (Firefox + Chrome)
// Minimal subset needed by Broc
//
// Code uses `browser.*` everywhere. In Chrome, the polyfill shim
// assigns `globalThis.browser = chrome`, so these types apply to
// both browsers.
// ============================================================

declare namespace browser {
  namespace runtime {
    interface MessageSender {
      tab?: tabs.Tab;
      frameId?: number;
      id?: string;
      url?: string;
    }

    interface Port {
      name: string;
      sender?: MessageSender;
      onMessage: {
        addListener(cb: (message: unknown) => void): void;
        removeListener(cb: (message: unknown) => void): void;
      };
      onDisconnect: {
        addListener(cb: () => void): void;
        removeListener(cb: () => void): void;
      };
      postMessage(message: unknown): void;
      disconnect(): void;
    }

    function sendMessage(message: unknown): Promise<unknown>;
    function connectNative(application: string): Port;
    function getURL(path: string): string;
    function getManifest(): { version: string; [key: string]: unknown };

    const onMessage: {
      addListener(
        cb: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response: unknown) => void
        ) => boolean | void | Promise<unknown>
      ): void;
      removeListener(
        cb: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response: unknown) => void
        ) => boolean | void | Promise<unknown>
      ): void;
    };

    const onConnect: {
      addListener(cb: (port: Port) => void): void;
      removeListener(cb: (port: Port) => void): void;
    };

    const onSuspend: {
      addListener(cb: () => void): void;
    };

    const onInstalled: {
      addListener(cb: (details: { reason: string }) => void): void;
    };
  }

  namespace action {
    const onClicked: {
      addListener(cb: (tab: tabs.Tab) => void | Promise<void>): void;
    };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      active: boolean;
      windowId: number;
      status?: string;
    }

    function query(queryInfo: {
      active?: boolean;
      currentWindow?: boolean;
      windowId?: number;
    }): Promise<Tab[]>;

    function get(tabId: number): Promise<Tab>;

    function create(createProperties: {
      url?: string;
      active?: boolean;
      windowId?: number;
    }): Promise<Tab>;

    function sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<unknown>;

    function captureVisibleTab(
      windowId?: number,
      options?: { format?: string; quality?: number }
    ): Promise<string>;

    const onActivated: {
      addListener(cb: (activeInfo: { tabId: number; windowId: number }) => void): void;
    };

    const onRemoved: {
      addListener(cb: (tabId: number, removeInfo: { windowId: number; isWindowClosing: boolean }) => void): void;
    };

    const onUpdated: {
      addListener(
        cb: (tabId: number, changeInfo: { status?: string; url?: string; title?: string }, tab: Tab) => void
      ): void;
    };
  }

  namespace scripting {
    interface InjectionTarget {
      tabId: number;
      frameIds?: number[];
      allFrames?: boolean;
    }

    interface ScriptInjection {
      target: InjectionTarget;
      files?: string[];
      func?: (...args: unknown[]) => unknown;
      args?: unknown[];
      injectImmediately?: boolean;
    }

    interface InjectionResult {
      frameId: number;
      result: unknown;
    }

    function executeScript(injection: ScriptInjection): Promise<InjectionResult[]>;
  }

  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }

    interface StorageChange {
      oldValue?: unknown;
      newValue?: unknown;
    }

    const session: StorageArea;
    const local: StorageArea;

    const onChanged: {
      addListener(cb: (changes: Record<string, StorageChange>, areaName: string) => void): void;
      removeListener(cb: (changes: Record<string, StorageChange>, areaName: string) => void): void;
    };
  }

  namespace webNavigation {
    interface NavigationDetails {
      tabId: number;
      url: string;
      frameId: number;
      transitionType?: string;
      transitionQualifiers?: string[];
      timeStamp: number;
    }

    const onCommitted: {
      addListener(cb: (details: NavigationDetails) => void): void;
    };

    const onCompleted: {
      addListener(cb: (details: NavigationDetails) => void): void;
    };
  }
}

// Chrome exposes APIs under `chrome.*` instead of `browser.*`.
// The polyfill shim assigns `globalThis.browser = chrome`.
// This declaration lets TypeScript know `chrome` exists as a global.
declare const chrome: typeof browser;
