// ============================================================
// Browser API compatibility shim
//
// Firefox natively provides `browser.*` with Promise-based APIs.
// Chrome MV3 provides `chrome.*` with Promise support on most APIs.
//
// This shim aliases `globalThis.browser = chrome` when `browser` is
// not defined, so all extension code can use `browser.*` uniformly.
//
// Must be imported before any other extension code that uses
// `browser.*` APIs. The build system prepends this to the
// background and content script bundles for Chrome builds.
// ============================================================

if (typeof globalThis.browser === "undefined" && typeof chrome !== "undefined") {
  // Chrome MV3: chrome.* APIs already return Promises for most methods.
  // Assign the entire chrome namespace as browser.
  (globalThis as Record<string, unknown>).browser = chrome;
}
