import type { GenericProposal, ProposedTool } from "../discovery/inferGenericCapabilities";
import type { CapabilityObservation, FieldObservation, GenericScanResult } from "../discovery/scanHtml";
import type { ModelContextLike } from "../webmcp/registerBookingTools";
import { validateToolInput, type ValidatedToolInput } from "./validateToolInput";

/**
 * Generic runtime adapter. Binds proposed tools to the controls the scanner
 * observed and registers them with the page's model context.
 *
 * - Table tools read rows from the bound table.
 * - Search tools apply parameters to the bound controls and return the
 *   request the page would make. They never submit.
 * - Write tools apply parameters and stage a change for a person to confirm
 *   on the visible page. They never submit either.
 *
 * Nothing here calls submit(), requestSubmit(), click(), or navigates. In
 * this build the host document is the inert DOMParser document of the
 * scanned snapshot; on a live page it is window.document.
 */

export interface StagedChange {
  id: string;
  toolName: string;
  capabilityId: string;
  actionLabel: string;
  heading: string;
  method: "get" | "post";
  action: string | null;
  fields: ValidatedToolInput;
  stagedAt: string;
}

export interface GenericRuntimeOptions {
  hostDocument: Document;
  scan: GenericScanResult;
  proposal: GenericProposal;
  modelContext: ModelContextLike | undefined;
  onStaged?: (change: StagedChange) => void;
  registrationSignal?: AbortSignal;
  now?: () => string;
  nextId?: () => string;
}

export interface GenericToolRegistration {
  supported: boolean;
  registeredTools: readonly string[];
  dispose(): void;
}

export interface TableReadOutput {
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  page: number;
  limit: number;
  totalRows: number;
  hasMore: boolean;
  truncated: boolean;
  source: "page-table";
}

/** Chrome's guidance caps tool output near 1.5K characters. */
export const OUTPUT_BUDGET_CHARS = 1500;
const DEFAULT_PAGE_LIMIT = 25;
const BRIDGE_COMPATIBILITY_SIGNAL = new AbortController().signal;

function abortError(): DOMException {
  return new DOMException("Tool execution was cancelled", "AbortError");
}

function assertExecutionActive(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function cellText(cell: Element): string {
  return (cell.textContent ?? "").replace(/\s+/g, " ").trim();
}

function defaultId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `staged-${Date.now().toString(36)}`;
}

interface Binding {
  tool: ProposedTool;
  capability: CapabilityObservation;
}

function bind(proposal: GenericProposal, scan: GenericScanResult): Binding[] {
  return proposal.tools.map((tool) => {
    const capability = scan.capabilities.find((candidate) => candidate.id === tool.capabilityId);
    if (!capability) throw new Error(`Tool ${tool.name} has no matching capability in the scan`);
    if (capability.riskClass === "finalize" || capability.riskClass === "credential") {
      throw new Error(`Tool ${tool.name} would bind a ${capability.riskClass} action; refusing`);
    }
    return { tool, capability };
  });
}

function resolveControls(host: Document, field: FieldObservation): Element[] {
  const controls = [...host.querySelectorAll(field.selector)];
  if (controls.length === 0) throw new Error(`The control for ${field.name} is missing from the page`);
  return controls;
}

function setControlValue(control: Element, field: FieldObservation, value: ValidatedToolInput[string]): void {
  if (field.inputType === "radio") {
    const radio = control as HTMLInputElement;
    radio.checked = radio.getAttribute("value") === String(value);
    return;
  }
  if (field.inputType === "checkbox") {
    const box = control as HTMLInputElement;
    box.checked = field.multiple ? Array.isArray(value) && value.includes(box.getAttribute("value") ?? "") : Boolean(value);
    return;
  }
  (control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = String(value);
}

/** Applies validated values to the bound controls. Returns what was applied. */
function applyValues(host: Document, capability: CapabilityObservation, values: ValidatedToolInput): ValidatedToolInput {
  for (const [name, value] of Object.entries(values)) {
    const field = capability.fields.find((candidate) => candidate.name === name && !candidate.excluded);
    if (!field) throw new TypeError(`Unexpected input property: ${name}`);
    for (const control of resolveControls(host, field)) setControlValue(control, field, value);
  }
  return values;
}

/** The form a capability acts on. Throws rather than staging against nothing. */
function formFor(host: Document, capability: CapabilityObservation, toolName: string): Element {
  const anchor = host.querySelector(capability.selector);
  const form = anchor?.closest("form") ?? anchor;
  if (!form) throw new Error(`The form for "${toolName}" is missing from the page`);
  return form;
}

function readTable(host: Document, capability: CapabilityObservation, page: number, limit: number): TableReadOutput {
  const table = host.querySelector(capability.selector);
  if (!table) throw new Error("The bound table is missing from the page");
  const allRows = [...table.querySelectorAll("tr")].filter((row) => row.querySelector("td"));
  const columns = capability.table?.headers ?? [];
  const start = (page - 1) * limit;
  let rows = allRows.slice(start, start + limit).map((row) => [...row.querySelectorAll("td")].map(cellText));
  let truncated = false;
  const output = (): TableReadOutput => ({
    columns,
    rows,
    page,
    limit,
    totalRows: allRows.length,
    hasMore: start + rows.length < allRows.length,
    truncated,
    source: "page-table",
  });
  while (rows.length > 1 && JSON.stringify(output()).length > OUTPUT_BUDGET_CHARS) {
    rows = rows.slice(0, -1);
    truncated = true;
  }
  return output();
}

function toolBase(tool: ProposedTool) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  };
}

function signalFrom(options: { signal?: AbortSignal } | undefined): AbortSignal {
  return options?.signal ?? BRIDGE_COMPATIBILITY_SIGNAL;
}

function tableTool(binding: Binding, host: Document): WebMCP.ModelContextTool {
  return {
    ...toolBase(binding.tool),
    execute(input, options) {
      const signal = signalFrom(options);
      assertExecutionActive(signal);
      const values = validateToolInput(binding.tool.inputSchema, input);
      const page = typeof values.page === "number" ? values.page : 1;
      const limit = typeof values.limit === "number" ? values.limit : DEFAULT_PAGE_LIMIT;
      const result = readTable(host, binding.capability, page, limit);
      assertExecutionActive(signal);
      return result;
    },
  };
}

function searchTool(binding: Binding, host: Document): WebMCP.ModelContextTool {
  return {
    ...toolBase(binding.tool),
    execute(input, options) {
      const signal = signalFrom(options);
      assertExecutionActive(signal);
      const values = validateToolInput(binding.tool.inputSchema, input);
      const form = formFor(host, binding.capability, binding.tool.name);
      const applied = applyValues(host, binding.capability, values);
      const query = new URLSearchParams(
        Object.entries(applied).flatMap(([key, value]) => {
          const items: readonly (string | number | boolean)[] = Array.isArray(value) ? value : [value];
          return items.map((item) => [key, String(item)]);
        }),
      ).toString();
      assertExecutionActive(signal);
      return {
        status: "query_prepared",
        performed: false,
        request: { method: "GET", action: form.getAttribute("action"), query },
        applied,
      };
    },
  };
}

function writeTool(binding: Binding, options: GenericRuntimeOptions): WebMCP.ModelContextTool {
  const { hostDocument: host, onStaged, now = () => new Date().toISOString(), nextId = defaultId } = options;
  return {
    ...toolBase(binding.tool),
    execute(input, executeOptions) {
      const signal = signalFrom(executeOptions);
      assertExecutionActive(signal);
      const values = validateToolInput(binding.tool.inputSchema, input);
      const form = formFor(host, binding.capability, binding.tool.name);
      const applied = applyValues(host, binding.capability, values);
      const change: StagedChange = Object.freeze({
        id: nextId(),
        toolName: binding.tool.name,
        capabilityId: binding.capability.id,
        actionLabel: binding.capability.actionLabel,
        heading: binding.capability.heading,
        method: binding.capability.method,
        action: form.getAttribute("action"),
        fields: applied,
        stagedAt: now(),
      });
      assertExecutionActive(signal);
      onStaged?.(change);
      return {
        status: "draft_staged",
        requiresHumanConfirmation: true,
        humanConfirmation: {
          surface: "visible-interface",
          method: "webauthn-user-presence",
          toolAvailable: false,
        },
        staged: { id: change.id, actionLabel: change.actionLabel, fields: applied },
      };
    },
  };
}

/** Tool definitions without registering them; the deterministic checks use this. */
export function createGenericToolDefinitions(options: GenericRuntimeOptions): WebMCP.ModelContextTool[] {
  return bind(options.proposal, options.scan).map((binding) => {
    if (binding.capability.kind === "table") return tableTool(binding, options.hostDocument);
    if (binding.capability.kind === "search") return searchTool(binding, options.hostDocument);
    return writeTool(binding, options);
  });
}

export async function registerGenericTools(options: GenericRuntimeOptions): Promise<GenericToolRegistration> {
  const { modelContext, registrationSignal } = options;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return { supported: false, registeredTools: [], dispose() {} };
  }
  const controller = new AbortController();
  const registered: string[] = [];
  const abortFromOwner = () => controller.abort(registrationSignal?.reason ?? "registration-owner-disposed");
  if (registrationSignal?.aborted) abortFromOwner();
  else registrationSignal?.addEventListener("abort", abortFromOwner, { once: true });

  try {
    for (const tool of createGenericToolDefinitions(options)) {
      assertExecutionActive(controller.signal);
      await modelContext.registerTool(tool, { signal: controller.signal });
      assertExecutionActive(controller.signal);
      registered.push(tool.name);
    }
  } catch (error) {
    controller.abort("partial-registration-failed");
    registrationSignal?.removeEventListener("abort", abortFromOwner);
    throw error;
  }

  return {
    supported: true,
    registeredTools: Object.freeze([...registered]),
    dispose() {
      registrationSignal?.removeEventListener("abort", abortFromOwner);
      controller.abort("generic-tools-disposed");
    },
  };
}
