/*
 * Popup: lists the active tab's WebMCP tools and calls one with JSON input.
 * Reaches the page's registry through chrome.scripting.executeScript in the
 * main world, a channel the page cannot observe or answer.
 */
(function () {
  "use strict";
  var logic = globalThis.WebMcpPopup;
  var statusEl = document.getElementById("status");
  var toolsEl = document.getElementById("tools");
  var inputEl = document.getElementById("input");
  var callEl = document.getElementById("call");
  var selectedEl = document.getElementById("selected");
  var outputEl = document.getElementById("output");
  var tools = [];
  var selected = null;

  function query(request) {
    return chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      if (!tabs[0] || tabs[0].id === undefined) throw new Error("No active tab");
      var id = crypto.randomUUID();
      return chrome.scripting
        .executeScript({
          target: { tabId: tabs[0].id },
          world: "MAIN",
          func: logic.pageQuery,
          args: [Object.assign({ id: id }, request)],
        })
        .then(function (results) {
          var frame = results && results[0];
          return frame ? frame.result : null;
        });
    });
  }

  function select(tool) {
    selected = tool;
    inputEl.value = logic.sampleInput(tool);
    selectedEl.textContent = tool.name;
    callEl.disabled = false;
    Array.prototype.forEach.call(toolsEl.querySelectorAll("button"), function (button) {
      button.setAttribute("aria-pressed", button.dataset.name === tool.name ? "true" : "false");
    });
  }

  function render() {
    toolsEl.textContent = "";
    tools.forEach(function (tool) {
      var li = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.name = tool.name;
      button.setAttribute("aria-pressed", "false");
      var code = document.createElement("code");
      code.textContent = tool.name;
      var chip = document.createElement("span");
      var readOnly = logic.isReadOnly(tool);
      chip.className = "chip " + (readOnly ? "read" : "write");
      chip.textContent = readOnly ? "read-only (page claim)" : "writes";
      var desc = document.createElement("div");
      desc.textContent = tool.description;
      button.appendChild(code);
      button.appendChild(chip);
      button.appendChild(desc);
      button.addEventListener("click", function () {
        select(tool);
      });
      li.appendChild(button);
      toolsEl.appendChild(li);
    });
    statusEl.textContent = logic.statusText(tools.length);
  }

  function showOutput(described) {
    outputEl.hidden = false;
    outputEl.className = described.isError ? "error" : "";
    outputEl.textContent = described.text;
  }

  callEl.addEventListener("click", function () {
    if (!selected) return;
    var input;
    try {
      input = JSON.parse(inputEl.value);
    } catch {
      showOutput({ text: "Input is not valid JSON", isError: true });
      return;
    }
    if (!logic.isReadOnly(selected)) {
      var proceed = window.confirm(
        selected.name + " changes page state. The page will stage it for a person to confirm. Call it?",
      );
      if (!proceed) return;
    }
    callEl.disabled = true;
    query({ type: "call", name: selected.name, input: input })
      .then(function (response) {
        showOutput(logic.describeResponse(response));
      })
      .catch(function (error) {
        showOutput({ text: String(error && error.message ? error.message : error), isError: true });
      })
      .then(function () {
        callEl.disabled = false;
      });
  });

  query({ type: "list" })
    .then(function (response) {
      tools = response && response.ok ? response.result : [];
      render();
      if (response && !response.ok) showOutput(logic.describeResponse(response));
    })
    .catch(function (error) {
      statusEl.textContent = "Could not reach this page: " + String(error && error.message ? error.message : error);
    });
})();
