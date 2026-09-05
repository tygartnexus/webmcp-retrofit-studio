/*
 * Runs in the page's main world at document_start, after shim.js.
 * Installs the registry as document.modelContext when the browser has no
 * native WebMCP, or mirrors native registrations into the registry when it
 * does. Exposes the registry at globalThis.__webmcpAgentRegistry for the
 * popup, which reaches it through chrome.scripting.executeScript rather than
 * through page-visible DOM events.
 */
(function () {
  "use strict";
  if (!globalThis.WebMcpShim) return;
  var shim = globalThis.WebMcpShim;
  var registry = shim.createRegistry();

  try {
    if (!document.modelContext) {
      Object.defineProperty(document, "modelContext", { value: registry.context, configurable: true });
    } else {
      shim.mirrorNative(registry, document.modelContext);
    }
  } catch {
    /* an unusual host object must not stop the registry from being reachable */
  }

  try {
    Object.defineProperty(globalThis, "__webmcpAgentRegistry", { value: registry, configurable: true });
  } catch {
    globalThis.__webmcpAgentRegistry = registry;
  }
})();
