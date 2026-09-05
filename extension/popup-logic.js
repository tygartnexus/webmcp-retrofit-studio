/*
 * Pure helpers for the popup. No chrome.* access here so vitest can load it.
 */
(function (root) {
  "use strict";

  function sampleInput(tool) {
    var schema = tool.inputSchema || {};
    var required = schema.required || [];
    var out = {};
    required.forEach(function (key) {
      var prop = (schema.properties || {})[key] || {};
      if (prop.enum && prop.enum.length) out[key] = prop.enum[0];
      else if (prop.type === "boolean") out[key] = true;
      else if (prop.type === "number" || prop.type === "integer") out[key] = prop.minimum !== undefined ? prop.minimum : 1;
      else out[key] = "";
    });
    return JSON.stringify(out, null, 2);
  }

  /* A page-declared hint. Anything not explicitly read-only is treated as a write. */
  function isReadOnly(tool) {
    return Boolean(tool && tool.annotations && tool.annotations.readOnlyHint === true);
  }

  function statusText(count) {
    if (count === 0) return "No WebMCP tools registered on this page.";
    return count + " tool" + (count === 1 ? "" : "s") + " registered on this page";
  }

  function describeResponse(response) {
    if (!response) return { text: "No response from the page", isError: true };
    if (response.ok) return { text: JSON.stringify(response.result, null, 2), isError: false };
    var error = response.error || {};
    return { text: (error.name || "Error") + ": " + (error.message || "unknown"), isError: true };
  }

  /* Runs inside the page (main world) via chrome.scripting.executeScript; must stay self-contained. */
  function pageQuery(request) {
    var shim = globalThis.WebMcpShim;
    var registry = globalThis.__webmcpAgentRegistry;
    if (!shim || !registry) {
      return { id: request.id, ok: false, error: { name: "Error", message: "The WebMCP shim is not installed on this page. Reload it." } };
    }
    return shim.handleRequest(registry, request);
  }

  root.WebMcpPopup = {
    sampleInput: sampleInput,
    isReadOnly: isReadOnly,
    statusText: statusText,
    describeResponse: describeResponse,
    pageQuery: pageQuery,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
