import type { HtmlSnapshot } from "../fixtures/genericFixtures";
import { sha256Hex } from "./scanOwnedFixture";
import { deepFreeze } from "../lib/deepFreeze";

/**
 * Generic inert scanner. Parses owner-supplied HTML with DOMParser, which
 * never executes scripts or fetches subresources, and records the structure
 * an agent could act on: forms, their fields, buttons, and tables. It keeps
 * attributes (names, labels, types, constraints, option values) and never
 * keeps field values, hidden inputs, or credential fields.
 */

export type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "email"
  | "tel"
  | "url"
  | "date"
  | "time"
  | "file";

export type FieldExclusion = "hidden" | "credential" | "payment-credential" | "file";

export interface FieldObservation {
  id: string;
  name: string;
  selector: string;
  inputType: string;
  kind: FieldKind;
  required: boolean;
  label?: string;
  placeholder?: string;
  pattern?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: readonly string[];
  excluded?: FieldExclusion;
}

export interface ButtonObservation {
  label: string;
  type: string;
  selector: string;
}

export interface TableObservation {
  headers: readonly string[];
  rowCount: number;
  pagination: { previous: boolean; next: boolean };
}

export type CapabilityKind = "form" | "search" | "table";
export type RiskClass = "read" | "write" | "finalize" | "credential";

export interface CapabilityObservation {
  id: string;
  kind: CapabilityKind;
  selector: string;
  heading: string;
  method: "get" | "post";
  actionLabel: string;
  riskClass: RiskClass;
  fields: readonly FieldObservation[];
  buttons: readonly ButtonObservation[];
  table?: TableObservation;
}

export interface ScanSafety {
  parsedInertly: true;
  externalRequests: 0;
  executedScripts: 0;
  scriptsIgnored: number;
  credentialFieldsExcluded: number;
  hiddenFieldsExcluded: number;
  retainedRawValues: false;
}

export interface GenericScanResult {
  snapshotId: string;
  revision: string;
  sourceKind: HtmlSnapshot["sourceKind"];
  authorization: "owner-authorized";
  title: string;
  scanHash: string;
  capabilities: readonly CapabilityObservation[];
  safety: ScanSafety;
}

const MAX_HTML_CHARS = 2_000_000;
/*
 * Action vocabulary. Latin-script terms are matched on word boundaries; CJK
 * terms are matched as substrings. Every language list errs toward exclusion:
 * a false finalize or credential match keeps an action off the tool surface,
 * which is the safe direction. JavaScript's  is ASCII-based, so every Latin
 * term must start and end with an ASCII letter (diacritics only inside).
 * Read verbs are Latin-script only; CJK read coverage is the search terms.
 */
const FINALIZE_TERMS = [
  "place order", "pay", "purchase", "checkout", "confirm", "finali[sz]e", "delete", "remove", "cancel",
  "destroy", "purge", "submit order", "book now", "deactivate", "close account", "terminate", "unsubscribe",
  "erase", "wipe",
  "löschen", "entfernen", "bestellen", "kostenpflichtig", "kaufen", "bezahlen", "zahlen", "bestätigen",
  "kündigen", "stornieren", "konto schließen", "deaktivieren",
  "supprimer", "effacer", "commander", "acheter", "payer", "confirmer", "résilier", "annuler",
  "se désabonner", "désactiver",
  "eliminar", "borrar", "comprar", "pagar", "confirmar", "cancelar", "darse de baja", "desactivar",
  "finalizar compra",
  "elimina(?:re)?", "cancella(?:re)?", "acquista(?:re)?", "paga(?:re)?", "conferma(?:re)?", "annulla(?:re)?",
  "disattiva(?:re)?",
  "excluir", "apagar", "encerrar", "desativar",
  "verwijderen", "kopen", "betalen", "bevestigen", "opzeggen", "annuleren", "deactiveren",
];
const FINALIZE_TERMS_CJK = ["削除", "購入", "注文", "支払", "確定", "退会", "解約", "删除", "购买", "订单", "支付", "确认", "注销"];
const CREDENTIAL_TERMS = [
  "log ?in", "sign ?in", "log ?out", "sign ?out", "authenticate", "password",
  "anmelden", "einloggen", "abmelden", "ausloggen", "passwort", "kennwort",
  "connexion", "se connecter", "connectez-vous", "déconnexion", "se déconnecter", "mot de passe",
  "iniciar sesión", "acceder", "cerrar sesión", "contraseña",
  "accedi", "accesso", "esci",
  "entrar", "sair", "senha",
  "inloggen", "aanmelden", "uitloggen", "afmelden", "wachtwoord",
];
const CREDENTIAL_TERMS_CJK = ["ログイン", "ログアウト", "パスワード", "登录", "登出", "密码"];
const SEARCH_TERMS = [
  "search", "find", "filter", "look ?up", "browse",
  "suchen", "filtern", "rechercher", "chercher", "filtrer", "buscar", "filtrar", "cerca", "pesquisar", "zoeken",
];
const SEARCH_TERMS_CJK = ["検索", "搜索"];
const READ_VERBS = [
  "go", "apply filters?", "sort", "show", "view", "list", "next", "previous", "prev", "page", "refresh", "load more",
  "export", "weiter", "zurück", "anzeigen", "suivant", "précédent", "afficher", "siguiente", "anterior", "mostrar",
  "avanti", "indietro", "mostra", "próximo", "seguinte", "volgende", "vorige", "tonen",
];

function vocabulary(latin: readonly string[], cjk: readonly string[], anchored = false): RegExp {
  const latinGroup = `${anchored ? "^" : "\\b"}(?:${latin.join("|")})\\b`;
  const cjkGroup = `${anchored ? "^" : ""}(?:${cjk.join("|")})`;
  return new RegExp(`${latinGroup}|${cjkGroup}`, "iu");
}

const FINALIZE_PATTERN = vocabulary(FINALIZE_TERMS, FINALIZE_TERMS_CJK);
const SEARCH_PATTERN = vocabulary(SEARCH_TERMS, SEARCH_TERMS_CJK);
/** Action labels that read or navigate without changing state. */
const READ_ACTION_PATTERN = vocabulary([...SEARCH_TERMS, ...READ_VERBS], SEARCH_TERMS_CJK, true);
const CREDENTIAL_ACTION_PATTERN = vocabulary(CREDENTIAL_TERMS, CREDENTIAL_TERMS_CJK);
const PAYMENT_NAME_PATTERN = /(card|cvv|cvc|expir|iban|routing|account ?number)/i;


function text(node: Element | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

const ID_PATTERN = /^[A-Za-z][\w-]*$/;

/** The element's id, only when it is well formed and unique in the document. */
function uniqueId(element: Element, document: Document): string | null {
  const id = element.getAttribute("id");
  if (!id || !ID_PATTERN.test(id)) return null;
  return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1 ? id : null;
}

/**
 * A structural path from the nearest uniquely identified ancestor (or body),
 * one nth-of-type step per level, so it resolves to exactly this element.
 * Unlike a document-wide index, nth-of-type is sibling-scoped, which is why
 * the path must include every level.
 */
function structuralSelector(element: Element, document: Document): string {
  const steps: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && current !== document.documentElement) {
    const id = uniqueId(current, document);
    if (id) {
      steps.unshift(`#${id}`);
      return steps.join(" > ");
    }
    const parent: Element | null = current.parentElement;
    const tag = current.tagName.toLowerCase();
    const sameTag = parent ? [...parent.children].filter((child) => child.tagName === current!.tagName) : [current];
    steps.unshift(sameTag.length === 1 ? tag : `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})`);
    current = parent;
  }
  steps.unshift("body");
  return steps.join(" > ");
}

function selectorFor(element: Element, document: Document): string {
  const id = uniqueId(element, document);
  return id ? `#${id}` : structuralSelector(element, document);
}

function attributeSelector(scope: string, attribute: string, value: string): string {
  return `${scope} [${attribute}="${CSS.escape(value)}"]`;
}

function nearestHeading(element: Element, document: Document): string {
  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  let best = "";
  for (const heading of headings) {
    const position = heading.compareDocumentPosition(element);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) best = text(heading);
  }
  return best || text(document.querySelector("title")) || "Page";
}

function labelFor(control: Element, form: Element): string | undefined {
  const id = control.getAttribute("id");
  if (id) {
    const label = form.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) return text(label);
  }
  const wrapping = control.closest("label");
  if (wrapping) return text(wrapping);
  const aria = control.getAttribute("aria-label");
  return aria ? aria.trim() : undefined;
}

function fieldKind(control: Element, inputType: string): FieldKind {
  if (control.tagName === "SELECT") return "enum";
  if (control.tagName === "TEXTAREA") return "string";
  switch (inputType) {
    case "number":
    case "range":
      return "number";
    case "checkbox":
      return "boolean";
    case "email":
      return "email";
    case "tel":
      return "tel";
    case "url":
      return "url";
    case "date":
    case "datetime-local":
      return "date";
    case "time":
      return "time";
    case "file":
      return "file";
    default:
      return "string";
  }
}

function exclusionFor(control: Element, inputType: string, name: string): FieldExclusion | undefined {
  if (inputType === "hidden") return "hidden";
  if (inputType === "password") return "credential";
  const autocomplete = control.getAttribute("autocomplete") ?? "";
  if (/^cc-/.test(autocomplete) || PAYMENT_NAME_PATTERN.test(name)) return "payment-credential";
  if (inputType === "file") return "file";
  return undefined;
}

function numberAttribute(control: Element, attribute: string): number | undefined {
  const raw = control.getAttribute(attribute);
  if (raw === null || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function observeField(control: Element, form: Element, formSelector: string, document: Document): FieldObservation | null {
  const name = control.getAttribute("name") ?? control.getAttribute("id") ?? "";
  if (!name) return null;
  const inputType = (control.getAttribute("type") ?? (control.tagName === "SELECT" ? "select" : "text")).toLowerCase();
  if (inputType === "submit" || inputType === "button" || inputType === "reset" || inputType === "image") return null;
  const excluded = exclusionFor(control, inputType, name);
  const controlId = uniqueId(control, document);
  const field: FieldObservation = {
    id: `${formSelector}:field:${name}`,
    name,
    selector: controlId ? `#${controlId}` : attributeSelector(formSelector, "name", name),
    inputType,
    kind: fieldKind(control, inputType),
    required: control.hasAttribute("required"),
  };
  if (excluded) return { ...field, excluded };
  if (inputType === "radio") return observeRadio(control, field);
  const label = labelFor(control, form);
  const placeholder = control.getAttribute("placeholder")?.trim();
  const pattern = control.getAttribute("pattern")?.trim();
  const min = numberAttribute(control, "min");
  const max = numberAttribute(control, "max");
  const maxLength = numberAttribute(control, "maxlength");
  const options =
    control.tagName === "SELECT"
      ? [...control.querySelectorAll("option")]
          .map((option) => option.getAttribute("value") ?? "")
          .filter((value) => value !== "")
      : undefined;
  return {
    ...field,
    ...(label ? { label } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(pattern ? { pattern } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(options ? { options } : {}),
  };
}

/**
 * A radio is one option of a group. Its static value attribute is the option
 * key (never user data), and the fieldset legend names the group.
 */
function observeRadio(control: Element, field: FieldObservation): FieldObservation {
  const legend = text(control.closest("fieldset")?.querySelector("legend") ?? null);
  const value = control.getAttribute("value") ?? "";
  return {
    ...field,
    kind: "enum",
    ...(legend ? { label: legend } : {}),
    options: value ? [value] : [],
  };
}

/** Same-name radios collapse into one enum field; required if any option is. */
function collapseRadioGroups(
  fields: readonly FieldObservation[],
  formSelector: string,
): FieldObservation[] {
  const groups = new Map<string, FieldObservation>();
  const collapsed: FieldObservation[] = [];
  for (const field of fields) {
    if (field.inputType !== "radio") {
      collapsed.push(field);
      continue;
    }
    const existing = groups.get(field.name);
    if (!existing) {
      const group = { ...field, selector: attributeSelector(formSelector, "name", field.name) };
      groups.set(field.name, group);
      collapsed.push(group);
      continue;
    }
    const merged: FieldObservation = {
      ...existing,
      required: existing.required || field.required,
      options: [...(existing.options ?? []), ...(field.options ?? [])],
    };
    groups.set(field.name, merged);
    collapsed[collapsed.indexOf(existing)] = merged;
  }
  return collapsed;
}

function observeButtons(form: Element, document: Document): ButtonObservation[] {
  return [...form.querySelectorAll("button, input[type=submit]")].map((button) => ({
    label: button.tagName === "INPUT" ? (button.getAttribute("value") ?? "Submit") : text(button),
    type: (button.getAttribute("type") ?? "submit").toLowerCase(),
    selector: selectorFor(button, document),
  }));
}

function classifyForm(
  method: "get" | "post",
  actionLabel: string,
  form: Element,
  fields: readonly FieldObservation[],
): { kind: CapabilityKind; riskClass: RiskClass } {
  const hasCredential = fields.some((field) => field.excluded === "credential");
  const hasPayment = fields.some((field) => field.excluded === "payment-credential");
  const roleSearch = form.getAttribute("role") === "search";
  const hasSearchInput = fields.some((field) => field.inputType === "search");
  const labels = [actionLabel, ...fields.map((field) => field.label ?? "")].join(" ");
  if (hasCredential || CREDENTIAL_ACTION_PATTERN.test(actionLabel)) return { kind: "form", riskClass: "credential" };
  if (hasPayment || FINALIZE_PATTERN.test(actionLabel)) return { kind: "form", riskClass: "finalize" };
  const readSignal =
    roleSearch || hasSearchInput || SEARCH_PATTERN.test(labels) || READ_ACTION_PATTERN.test(actionLabel.trim());
  if (method === "get" && readSignal) return { kind: "search", riskClass: "read" };
  // A GET form with no read signal is still an action; stage it rather than assume it is safe.
  return { kind: "form", riskClass: "write" };
}

/**
 * A compound legacy form can carry several capabilities: the submit action,
 * embedded search inputs, and non-submit buttons that stage or review. Each
 * becomes its own observation so review and risk classification stay per
 * action rather than per form.
 */
function observeForm(form: Element, document: Document): CapabilityObservation[] {
  const selector = selectorFor(form, document);
  const method = (form.getAttribute("method") ?? "get").toLowerCase() === "post" ? "post" : "get";
  const heading = nearestHeading(form, document);
  const buttons = observeButtons(form, document);
  const submit = buttons.find((button) => button.type === "submit") ?? buttons[0];
  const actionLabel = submit?.label ?? "Submit";
  const fields = collapseRadioGroups(
    [...form.querySelectorAll("input, select, textarea")]
      .map((control) => observeField(control, form, selector, document))
      .filter((field): field is FieldObservation => field !== null),
    selector,
  );
  const { kind, riskClass } = classifyForm(method, actionLabel, form, fields);
  const primary: CapabilityObservation = {
    id: `${kind}:${selector}`,
    kind,
    selector,
    heading,
    method,
    actionLabel,
    riskClass,
    fields,
    buttons,
  };
  const extras: CapabilityObservation[] = [];
  const searchFields = fields.filter((field) => field.inputType === "search" && !field.excluded);
  const primaryIsExcluded = riskClass === "credential" || riskClass === "finalize";
  if (kind !== "search" && !primaryIsExcluded && searchFields.length > 0) {
    extras.push({
      id: `search:${selector}`,
      kind: "search",
      selector: searchFields[0].selector,
      heading,
      method: "get",
      actionLabel: searchFields[0].label ?? "Search",
      riskClass: "read",
      fields: searchFields,
      buttons: [],
    });
  }
  for (const button of buttons.filter((candidate) => candidate.type === "button")) {
    const { riskClass: buttonRisk } = classifyForm("post", button.label, form, fields);
    extras.push({
      id: `action:${button.selector}`,
      kind: "form",
      selector: button.selector,
      heading,
      method: "post",
      actionLabel: button.label,
      riskClass: buttonRisk,
      fields: fields.filter((field) => field.inputType !== "search"),
      buttons: [button],
    });
  }
  return [primary, ...extras];
}

function observeTable(table: Element, document: Document): CapabilityObservation | null {
  const headers = [...table.querySelectorAll("thead th")].map((th) => text(th)).filter(Boolean);
  if (headers.length === 0) return null;
  const selector = selectorFor(table, document);
  const rowCount = table.querySelectorAll("tbody tr").length;
  const previous = document.querySelector('a[rel="prev"], [aria-label*="pagination" i] a:first-of-type') !== null;
  const next = document.querySelector('a[rel="next"]') !== null;
  return {
    id: `table:${selector}`,
    kind: "table",
    selector,
    heading: nearestHeading(table, document),
    method: "get",
    actionLabel: "Read rows",
    riskClass: "read",
    fields: [],
    buttons: [],
    table: { headers, rowCount, pagination: { previous, next } },
  };
}

/** Selectors are unique per element, so ids collide only in pathological markup; suffix them anyway. */
function withUniqueIds(capabilities: readonly CapabilityObservation[]): CapabilityObservation[] {
  const seen = new Map<string, number>();
  return capabilities.map((capability) => {
    const count = (seen.get(capability.id) ?? 0) + 1;
    seen.set(capability.id, count);
    return count === 1 ? capability : { ...capability, id: `${capability.id}#${count}` };
  });
}

export async function scanHtml(snapshot: HtmlSnapshot): Promise<GenericScanResult> {
  const html = snapshot.html;
  if (typeof html !== "string" || html.trim().length === 0) {
    throw new Error("The snapshot html is empty");
  }
  if (html.length > MAX_HTML_CHARS) {
    throw new Error(`The snapshot html is too large (${html.length} characters; limit ${MAX_HTML_CHARS})`);
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const scriptsIgnored = document.querySelectorAll("script").length;
  const forms = [...document.querySelectorAll("form")].flatMap((form) => observeForm(form, document));
  const tables = [...document.querySelectorAll("table")]
    .map((table) => observeTable(table, document))
    .filter((table): table is CapabilityObservation => table !== null);
  const capabilities = withUniqueIds([...forms, ...tables]);
  const allFields = capabilities.flatMap((capability) => capability.fields);

  return deepFreeze({
    snapshotId: snapshot.id,
    revision: snapshot.revision,
    sourceKind: snapshot.sourceKind,
    authorization: snapshot.authorization,
    title: snapshot.title,
    scanHash: await sha256Hex(html),
    capabilities,
    safety: {
      parsedInertly: true as const,
      externalRequests: 0 as const,
      executedScripts: 0 as const,
      scriptsIgnored,
      credentialFieldsExcluded: allFields.filter(
        (field) => field.excluded === "credential" || field.excluded === "payment-credential",
      ).length,
      hiddenFieldsExcluded: allFields.filter((field) => field.excluded === "hidden").length,
      retainedRawValues: false as const,
    },
  });
}
