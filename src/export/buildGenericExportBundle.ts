import type { GenericProposal, ProposedTool } from "../discovery/inferGenericCapabilities";
import type { CapabilityObservation, GenericScanResult } from "../discovery/scanHtml";
import { canonicalJson, sha256Hex } from "../discovery/scanOwnedFixture";
import type { HtmlSnapshot } from "../fixtures/genericFixtures";
import { deepFreeze } from "../lib/deepFreeze";
import type { PresenceReceipt } from "../presence/humanPresence";
import { isPassingGenericReport, type GenericCheckReport } from "../validation/runGenericChecks";

/**
 * Export for a generic proposal. Fail-closed: it refuses to build unless the
 * deterministic report passed against this exact proposal and scan, and every
 * confirmation receipt names a staged change that belongs to this proposal.
 * The bundle carries a manifest, the tool contracts with their page bindings,
 * PII-free evidence, and a standalone embed script that registers the tools
 * on the live page.
 *
 * The embed never submits a form. Writes are applied to the page controls and
 * announced as a `webmcp-retrofit:staged` event so the host page's own
 * confirmation step (a person, not a tool) decides what happens next. Its
 * input validator implements the same rules as `validateToolInput`; the
 * conformance test in tests/embedConformance.test.ts runs one table of cases
 * through both and fails on any divergence.
 */

export interface GenericToolBinding {
  name: string;
  kind: CapabilityObservation["kind"];
  riskClass: ProposedTool["riskClass"];
  selector: string;
  method: "get" | "post";
  actionLabel: string;
  /** A button-level formaction that overrides the form's action. */
  action?: string;
  fields: readonly { name: string; selector: string; inputType: string; multiple?: true }[];
  outputColumns?: readonly string[];
}

export interface GenericExportManifest {
  schemaVersion: "1.0.0";
  kind: "generic-retrofit";
  snapshotId: string;
  sourceKind: HtmlSnapshot["sourceKind"];
  scanHash: string;
  proposalHash: string;
  versionHash: string;
  toolNames: readonly string[];
  excludedActions: readonly { actionLabel: string; riskClass: string }[];
  executionBoundary: "owner-reviewed-adapter";
  humanConfirmationBoundary: "outside-tool-surface";
  embedValidation: "same-rules-as-studio-runtime";
  validation: { passed: number; total: number; checkIds: readonly string[]; executedAt: string };
  artifacts: {
    toolsPath: "webmcp-retrofit.tools.json";
    toolsSha256: string;
    evidencePath: "webmcp-retrofit.evidence.json";
    evidenceSha256: string;
    generatedJavaScriptPath: "webmcp-retrofit.generated.js";
    generatedJavaScriptSha256: string;
  };
}

export interface GenericExportEvidence {
  snapshotId: string;
  scanHash: string;
  proposalHash: string;
  safety: GenericScanResult["safety"];
  capabilities: readonly { id: string; kind: string; riskClass: string; selector: string; actionLabel: string }[];
  humanConfirmations: readonly PresenceReceipt[];
}

export interface GenericExportFile {
  path:
    | "webmcp-retrofit.manifest.json"
    | "webmcp-retrofit.tools.json"
    | "webmcp-retrofit.evidence.json"
    | "webmcp-retrofit.generated.js";
  mediaType: "application/json" | "text/javascript";
  sha256: string;
  content: string;
}

export interface GenericExportBundle {
  bundleHash: string;
  manifest: GenericExportManifest;
  files: readonly GenericExportFile[];
}

/** A staged change the session actually recorded; receipts must point at one. */
export interface StagedChangeRecord {
  id: string;
  capabilityId: string;
}

export interface GenericExportInput {
  snapshot: HtmlSnapshot;
  scan: GenericScanResult;
  proposal: GenericProposal;
  validation: GenericCheckReport;
  staged?: readonly StagedChangeRecord[];
  humanConfirmations?: readonly PresenceReceipt[];
}

function bindingFor(tool: ProposedTool, scan: GenericScanResult): GenericToolBinding {
  const capability = scan.capabilities.find((candidate) => candidate.id === tool.capabilityId);
  if (!capability) throw new Error(`Tool ${tool.name} has no capability in the scan`);
  return {
    name: tool.name,
    kind: capability.kind,
    riskClass: tool.riskClass,
    selector: capability.selector,
    method: capability.method,
    actionLabel: capability.actionLabel,
    ...(capability.action ? { action: capability.action } : {}),
    fields: capability.fields
      .filter((field) => !field.excluded)
      .map((field) => ({
        name: field.name,
        selector: field.selector,
        inputType: field.inputType,
        ...(field.multiple ? { multiple: true as const } : {}),
      })),
    ...(tool.outputColumns ? { outputColumns: tool.outputColumns } : {}),
  };
}

function toolsDocument(proposal: GenericProposal, scan: GenericScanResult) {
  return {
    proposalHash: proposal.proposalHash,
    tools: proposal.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      binding: bindingFor(tool, scan),
    })),
  };
}

/* Mirrors src/runtime/validateToolInput.ts rule for rule. Keep the two in step. */
const EMBED_VALIDATOR = String.raw`
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function isPlainObject(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
    var proto = Object.getPrototypeOf(input);
    return proto === Object.prototype || proto === null;
  }
  function ownDataValue(input, key) {
    var descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor) return undefined;
    if (!("value" in descriptor)) throw new TypeError(key + " must be an own data property");
    return descriptor.value;
  }
  function compilePattern(pattern, key) {
    try { return new RegExp(pattern, "u"); } catch (error) { throw new TypeError(key + " has an invalid pattern in its schema"); }
  }
  function validateNumber(key, value, prop) {
    if (typeof value !== "number" || !isFinite(value)) throw new TypeError(key + " must be a finite number");
    if (prop.type === "integer" && Math.floor(value) !== value) throw new TypeError(key + " must be an integer");
    if (prop.minimum !== undefined && value < prop.minimum) throw new TypeError(key + " must be at least " + prop.minimum);
    if (prop.maximum !== undefined && value > prop.maximum) throw new TypeError(key + " must be at most " + prop.maximum);
    return value;
  }
  function validateString(key, value, prop) {
    if (typeof value !== "string") throw new TypeError(key + " must be a string");
    if (prop.enum && prop.enum.indexOf(value) < 0) throw new TypeError(key + " must be one of: " + prop.enum.join(", "));
    if (prop.maxLength !== undefined && value.length > prop.maxLength) throw new TypeError(key + " must be at most " + prop.maxLength + " characters");
    if (prop.pattern && !compilePattern(prop.pattern, key).test(value)) throw new TypeError(key + " does not match the required format");
    if (prop.format === "email" && !EMAIL_PATTERN.test(value)) throw new TypeError(key + " must be an email address");
    if (prop.format === "uri" && !URL.canParse(value)) throw new TypeError(key + " must be an absolute URL");
    return value;
  }
  function validateArray(key, value, prop) {
    if (!Array.isArray(value)) throw new TypeError(key + " must be an array");
    var allowed = (prop.items && prop.items.enum) || [];
    var items = value.map(function (item, index) {
      if (typeof item !== "string") throw new TypeError(key + "[" + index + "] must be a string");
      if (allowed.indexOf(item) < 0) throw new TypeError(key + " items must be one of: " + allowed.join(", "));
      return item;
    });
    if (prop.uniqueItems) {
      var seen = {};
      for (var i = 0; i < items.length; i++) {
        if (seen[items[i]]) throw new TypeError(key + " must not repeat an item");
        seen[items[i]] = true;
      }
    }
    return Object.freeze(items);
  }
  function validateValue(key, value, prop) {
    if (prop.type === "array") return validateArray(key, value, prop);
    if (prop.type === "boolean") {
      if (typeof value !== "boolean") throw new TypeError(key + " must be a boolean");
      return value;
    }
    if (prop.type === "number" || prop.type === "integer") return validateNumber(key, value, prop);
    return validateString(key, value, prop);
  }
  function validate(schema, input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError("Tool input must be an object");
    if (!isPlainObject(input)) throw new TypeError("Tool input must be a plain object");
    var allowed = Object.keys(schema.properties || {});
    var keys = Reflect.ownKeys(input);
    for (var i = 0; i < keys.length; i++) {
      if (typeof keys[i] !== "string" || allowed.indexOf(keys[i]) < 0) throw new TypeError("Unexpected input property: " + String(keys[i]));
    }
    var required = schema.required || [];
    for (var r = 0; r < required.length; r++) {
      if (!Object.prototype.hasOwnProperty.call(input, required[r])) throw new TypeError(required[r] + " is required");
    }
    var out = {};
    for (var k = 0; k < allowed.length; k++) {
      var key = allowed[k];
      if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
      out[key] = validateValue(key, ownDataValue(input, key), schema.properties[key]);
    }
    return Object.freeze(out);
  }
`;

const EMBED_RUNTIME = String.raw`
  var OUTPUT_BUDGET = 1500;
  var CELL_BUDGET = 200;
  var MIN_CELL_BUDGET = 8;
  function clipCell(value, budget) { return value.length <= budget ? value : value.slice(0, budget - 1) + "\u2026"; }
  function abortError() { return new DOMException("Tool execution was cancelled", "AbortError"); }
  function apply(binding, values) {
    Object.keys(values).forEach(function (name) {
      var field = binding.fields.filter(function (f) { return f.name === name; })[0];
      if (!field) throw new TypeError("Unexpected input property: " + name);
      var controls = document.querySelectorAll(field.selector);
      if (!controls.length) throw new Error("The control for " + name + " is missing from the page");
      for (var i = 0; i < controls.length; i++) {
        var control = controls[i], value = values[name];
        if (field.inputType === "radio") control.checked = control.getAttribute("value") === String(value);
        else if (field.inputType === "checkbox") {
          control.checked = field.multiple
            ? Array.isArray(value) && value.indexOf(control.getAttribute("value") === null ? "on" : control.getAttribute("value")) >= 0
            : Boolean(value);
        } else if (field.inputType === "select" && field.multiple) {
          var chosen = Array.isArray(value) ? value.map(String) : [];
          for (var j = 0; j < control.options.length; j++) control.options[j].selected = chosen.indexOf(control.options[j].value) >= 0;
        } else control.value = String(value);
      }
    });
    return values;
  }
  function readTable(binding, values) {
    var table = document.querySelector(binding.selector);
    if (!table) throw new Error("The bound table is missing from the page");
    var owned = function (node) { return node.closest("table") === table; };
    var rows = Array.prototype.filter.call(table.querySelectorAll("tr"), function (row) {
      var inFooter = row.parentNode && row.parentNode.tagName === "TFOOT";
      return owned(row) && !inFooter && Array.prototype.some.call(row.querySelectorAll("td"), owned);
    });
    var page = typeof values.page === "number" ? values.page : 1, limit = typeof values.limit === "number" ? values.limit : 25;
    var start = (page - 1) * limit;
    var raw = rows.slice(start, start + limit).map(function (row) {
      return Array.prototype.filter.call(row.querySelectorAll("td"), owned).map(function (cell) { return (cell.textContent || "").replace(/\s+/g, " ").trim(); });
    });
    var cellBudget = CELL_BUDGET;
    var clipRows = function () { return raw.map(function (row) { return row.map(function (cell) { return clipCell(cell, cellBudget); }); }); };
    var slice = clipRows();
    var truncated = slice.some(function (row, i) { return row.some(function (cell, j) { return cell !== raw[i][j]; }); });
    var build = function () { return { columns: binding.outputColumns || [], rows: slice, page: page, limit: limit, totalRows: rows.length, hasMore: start + slice.length < rows.length, truncated: truncated, source: "page-table" }; };
    while (slice.length > 1 && JSON.stringify(build()).length > OUTPUT_BUDGET) { slice = slice.slice(0, -1); truncated = true; }
    while (JSON.stringify(build()).length > OUTPUT_BUDGET && cellBudget > MIN_CELL_BUDGET) {
      cellBudget = Math.max(MIN_CELL_BUDGET, Math.floor(cellBudget / 2));
      slice = clipRows().slice(0, slice.length);
      truncated = true;
    }
    if (JSON.stringify(build()).length > OUTPUT_BUDGET) throw new Error("The table has too many columns to fit the output budget");
    return build();
  }
  function formOwner(control) {
    var reference = control.getAttribute("form");
    if (reference !== null) {
      var target = document.getElementById(reference);
      return target && target.tagName === "FORM" ? target : null;
    }
    return control.closest("form");
  }
  function execute(tool, input, options) {
    var signal = options && options.signal;
    if (signal && signal.aborted) throw abortError();
    var values = validate(tool.inputSchema, input);
    var binding = tool.binding;
    if (binding.kind === "table") return readTable(binding, values);
    var anchor = document.querySelector(binding.selector);
    var form = anchor && (formOwner(anchor) || anchor);
    if (!form) throw new Error("The form for \"" + tool.name + "\" is missing from the page");
    var applied = apply(binding, values);
    var action = binding.action || form.getAttribute("action");
    if (signal && signal.aborted) throw abortError();
    if (binding.kind === "search") {
      var params = new URLSearchParams();
      Object.keys(applied).forEach(function (k) {
        var v = applied[k];
        if (Array.isArray(v)) v.forEach(function (item) { params.append(k, String(item)); });
        else params.append(k, String(v));
      });
      return { status: "query_prepared", performed: false, request: { method: "GET", action: action, query: params.toString() }, applied: applied };
    }
    var id = "staged-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    var change = { id: id, toolName: tool.name, actionLabel: binding.actionLabel, method: binding.method, action: action, fields: applied, stagedAt: new Date().toISOString() };
    window.dispatchEvent(new CustomEvent("webmcp-retrofit:staged", { detail: change }));
    return { status: "draft_staged", requiresHumanConfirmation: true, humanConfirmation: { surface: "visible-interface", method: "webauthn-user-presence", toolAvailable: false }, staged: { id: id, actionLabel: binding.actionLabel, fields: applied } };
  }
  var context = document.modelContext;
  if (!context || typeof context.registerTool !== "function") return { registered: [], supported: false };
  var registered = [];
  TOOLS.forEach(function (tool) {
    context.registerTool({
      name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations,
      execute: function (input, options) { return execute(tool, input, options); }
    });
    registered.push(tool.name);
  });
  return { registered: registered, supported: true };
`;

function buildGeneratedJavaScript(proposal: GenericProposal, scan: GenericScanResult): string {
  const tools = JSON.stringify(toolsDocument(proposal, scan).tools);
  return [
    "// Generated by WebMCP Retrofit Studio (generic retrofit).",
    `// proposalHash ${proposal.proposalHash}`,
    `// scanHash ${scan.scanHash}`,
    "// This embed registers reviewed tools only. It never submits a form; writes are",
    "// applied to the page and announced as a 'webmcp-retrofit:staged' event for the",
    "// page's own human confirmation step. Input validation follows the studio's rules.",
    "(function () {",
    `  var TOOLS = ${tools};`,
    EMBED_VALIDATOR,
    EMBED_RUNTIME,
    "})();",
    "",
  ].join("\n");
}

async function file(
  path: GenericExportFile["path"],
  mediaType: GenericExportFile["mediaType"],
  content: string,
): Promise<GenericExportFile> {
  return { path, mediaType, sha256: await sha256Hex(content), content };
}

function assertReceiptsBelong(input: GenericExportInput): void {
  const receipts = input.humanConfirmations ?? [];
  if (receipts.length === 0) return;
  const toolCapabilities = new Set(input.proposal.tools.map((tool) => tool.capabilityId));
  const stagedById = new Map((input.staged ?? []).map((record) => [record.id, record]));
  for (const receipt of receipts) {
    if (receipt.userPresent !== true) throw new Error("Export refused: a confirmation receipt lacks user presence");
    const record = stagedById.get(receipt.subject);
    if (!record) throw new Error(`Export refused: receipt ${receipt.subject} names no staged change from this session`);
    if (!toolCapabilities.has(record.capabilityId)) {
      throw new Error(`Export refused: receipt ${receipt.subject} confirms a change outside this proposal`);
    }
  }
}

function assertExportReady(input: GenericExportInput): void {
  if (!isPassingGenericReport(input.validation, input.proposal)) {
    throw new Error("Export refused: the deterministic checks have not passed for this exact proposal");
  }
  if (input.validation.scanHash !== input.scan.scanHash || input.proposal.scanHash !== input.scan.scanHash) {
    throw new Error("Export refused: the proposal and report do not belong to this scan");
  }
  assertReceiptsBelong(input);
}

export async function buildGenericExportBundle(input: GenericExportInput): Promise<GenericExportBundle> {
  assertExportReady(input);
  const { snapshot, scan, proposal, validation } = input;
  const tools = await file("webmcp-retrofit.tools.json", "application/json", canonicalJson(toolsDocument(proposal, scan)));
  const evidence: GenericExportEvidence = {
    snapshotId: snapshot.id,
    scanHash: scan.scanHash,
    proposalHash: proposal.proposalHash,
    safety: scan.safety,
    capabilities: scan.capabilities.map((capability) => ({
      id: capability.id,
      kind: capability.kind,
      riskClass: capability.riskClass,
      selector: capability.selector,
      actionLabel: capability.actionLabel,
    })),
    humanConfirmations: input.humanConfirmations ?? [],
  };
  const evidenceFile = await file("webmcp-retrofit.evidence.json", "application/json", canonicalJson(evidence));
  const generated = await file("webmcp-retrofit.generated.js", "text/javascript", buildGeneratedJavaScript(proposal, scan));
  const manifest: GenericExportManifest = {
    schemaVersion: "1.0.0",
    kind: "generic-retrofit",
    snapshotId: snapshot.id,
    sourceKind: snapshot.sourceKind,
    scanHash: scan.scanHash,
    proposalHash: proposal.proposalHash,
    versionHash: proposal.versionHash,
    toolNames: proposal.tools.map((tool) => tool.name),
    excludedActions: proposal.excluded.map((item) => ({ actionLabel: item.actionLabel, riskClass: item.riskClass })),
    executionBoundary: "owner-reviewed-adapter",
    humanConfirmationBoundary: "outside-tool-surface",
    embedValidation: "same-rules-as-studio-runtime",
    validation: {
      passed: validation.passed,
      total: validation.total,
      checkIds: validation.checks.map((check) => check.id),
      executedAt: validation.executedAt,
    },
    artifacts: {
      toolsPath: "webmcp-retrofit.tools.json",
      toolsSha256: tools.sha256,
      evidencePath: "webmcp-retrofit.evidence.json",
      evidenceSha256: evidenceFile.sha256,
      generatedJavaScriptPath: "webmcp-retrofit.generated.js",
      generatedJavaScriptSha256: generated.sha256,
    },
  };
  const manifestFile = await file("webmcp-retrofit.manifest.json", "application/json", canonicalJson(manifest));
  const files = [manifestFile, tools, evidenceFile, generated];
  const bundleHash = await sha256Hex(canonicalJson(files.map((entry) => [entry.path, entry.sha256])));
  return deepFreeze({ bundleHash, manifest, files });
}

export function serializeGenericExportBundle(bundle: GenericExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}
