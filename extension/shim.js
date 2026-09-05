/*
 * WebMCP agent shim. Clean-room, dependency-free registry shaped like the
 * `document.modelContext` surface in the WebMCP explainer: registerTool,
 * unregisterTool, provideContext, clearContext. It exists so an agent-side
 * extension can discover and call a page's tools in browsers without native
 * WebMCP, and so pages that already have native support are mirrored, not
 * replaced.
 *
 * Runs in the page's main world and in vitest. No network, no storage.
 */
(function (root) {
  "use strict";

  var NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
  var MIRRORED_METHODS = ["registerTool", "unregisterTool", "provideContext", "clearContext"];

  function clone(value) {
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  }

  function toolSummary(tool) {
    return {
      name: tool.name,
      title: typeof tool.title === "string" ? tool.title : tool.name,
      description: typeof tool.description === "string" ? tool.description : "",
      inputSchema: clone(tool.inputSchema),
      annotations: tool.annotations ? clone(tool.annotations) : {},
    };
  }

  function assertRegistrable(tool) {
    if (!tool || typeof tool !== "object") throw new TypeError("Tool must be an object");
    if (typeof tool.name !== "string" || !NAME_PATTERN.test(tool.name)) {
      throw new TypeError("Tool name must match ^[A-Za-z0-9_.-]{1,128}$");
    }
    if (typeof tool.execute !== "function") throw new TypeError("Tool " + tool.name + " must have an execute function");
    try {
      JSON.stringify(tool.inputSchema);
    } catch {
      throw new TypeError("Tool " + tool.name + " inputSchema must be JSON-serializable");
    }
  }

  function assertBatch(list) {
    var seen = new Set();
    list.forEach(function (tool) {
      assertRegistrable(tool);
      if (seen.has(tool.name)) throw new Error("Duplicate tool name in batch: " + tool.name);
      seen.add(tool.name);
    });
  }

  function createRegistry() {
    var tools = new Map();
    var listeners = new Set();

    function emit() {
      listeners.forEach(function (listener) {
        try {
          listener();
        } catch {
          /* a listener failure must not break the registry */
        }
      });
    }

    function remove(name, expected) {
      if (expected !== undefined && tools.get(name) !== expected) return false;
      var had = tools.delete(name);
      if (had) emit();
      return had;
    }

    var context = {
      registerTool: function (tool, options) {
        assertRegistrable(tool);
        if (tools.has(tool.name)) return Promise.reject(new Error("A tool named " + tool.name + " is already registered"));
        var signal = options && options.signal;
        if (signal && signal.aborted) return Promise.resolve();
        tools.set(tool.name, tool);
        if (signal) {
          signal.addEventListener(
            "abort",
            function () {
              remove(tool.name, tool);
            },
            { once: true },
          );
        }
        emit();
        return Promise.resolve();
      },
      unregisterTool: function (name) {
        remove(name);
      },
      /* Validates the whole batch before touching the registry, so a bad entry changes nothing. */
      provideContext: function (options) {
        var list = (options && options.tools) || [];
        assertBatch(list);
        tools.clear();
        list.forEach(function (tool) {
          tools.set(tool.name, tool);
        });
        emit();
      },
      clearContext: function () {
        tools.clear();
        emit();
      },
    };

    return {
      context: context,
      list: function () {
        return Array.from(tools.values(), toolSummary);
      },
      call: function (name, input, options) {
        var tool = tools.get(name);
        if (!tool) return Promise.reject(new Error("No tool named " + name + " is registered"));
        var signal = (options && options.signal) || new AbortController().signal;
        return Promise.resolve().then(function () {
          return tool.execute(input, { signal: signal });
        });
      },
      onChange: function (listener) {
        listeners.add(listener);
        return function () {
          listeners.delete(listener);
        };
      },
    };
  }

  function serializeError(error) {
    if (error && typeof error === "object") {
      return { name: String(error.name || "Error"), message: String(error.message || "") };
    }
    return { name: "Error", message: String(error) };
  }

  /* Request: { id, type: "list" | "call", name?, input? }. Response: { id, ok, result?, error? }. */
  function handleRequest(registry, request) {
    var id = request && request.id;
    if (!request || typeof id !== "string") {
      return Promise.resolve({ id: null, ok: false, error: { name: "TypeError", message: "Malformed request" } });
    }
    if (request.type === "list") {
      return Promise.resolve()
        .then(function () {
          return { id: id, ok: true, result: registry.list() };
        })
        .catch(function (error) {
          return { id: id, ok: false, error: serializeError(error) };
        });
    }
    if (request.type === "call") {
      return registry
        .call(request.name, request.input === undefined ? {} : request.input)
        .then(function (result) {
          return { id: id, ok: true, result: clone(result) };
        })
        .catch(function (error) {
          return { id: id, ok: false, error: serializeError(error) };
        });
    }
    return Promise.resolve({ id: id, ok: false, error: { name: "TypeError", message: "Unknown request type" } });
  }

  /*
   * Mirrors a native model context into the registry so the extension can
   * list what the page registered. Every method is wrapped only if the native
   * object allows it; a frozen or exotic native object is left untouched and
   * the list of methods actually mirrored is returned.
   */
  function mirrorNative(registry, native) {
    var mirrored = [];
    MIRRORED_METHODS.forEach(function (method) {
      if (!native || typeof native[method] !== "function") return;
      var original = native[method];
      var wrapped = function () {
        var args = Array.prototype.slice.call(arguments);
        try {
          var shadow = registry.context[method].apply(registry.context, args);
          if (shadow && typeof shadow.catch === "function") shadow.catch(function () {});
        } catch {
          /* the shadow registry never blocks the page's own call */
        }
        return original.apply(native, args);
      };
      try {
        native[method] = wrapped;
        if (native[method] === wrapped) mirrored.push(method);
      } catch {
        /* non-writable: leave the native method alone */
      }
    });
    return mirrored;
  }

  root.WebMcpShim = {
    createRegistry: createRegistry,
    handleRequest: handleRequest,
    toolSummary: toolSummary,
    mirrorNative: mirrorNative,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
