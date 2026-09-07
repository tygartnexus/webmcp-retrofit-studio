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
  /** A same-name checkbox group: the value is an array of option keys. */
  multiple?: true;
  /** Legend of the enclosing fieldset, used to label a checkbox group. */
  groupLabel?: string;
  excluded?: FieldExclusion;
}

export interface ButtonObservation {
  label: string;
  type: string;
  selector: string;
  /** A submit button's own target, when it overrides the form's. */
  formAction?: string;
  formMethod?: "get" | "post";
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
  /** Visible text identifying the row or repeated block this form belongs to. */
  rowLabel?: string;
  /** A button-level formaction that overrides the form's action. */
  action?: string;
}

export interface ScanSafety {
  parsedInertly: true;
  externalRequests: 0;
  executedScripts: 0;
  scriptsIgnored: number;
  credentialFieldsExcluded: number;
  hiddenFieldsExcluded: number;
  fileFieldsExcluded: number;
  navigationButtonsSkipped: number;
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
const PREVIOUS_TERMS = ["previous", "prev", "back", "zurück", "précédent", "anterior", "indietro", "vorige", "voltar"];
const PREVIOUS_TERMS_CJK = ["前へ", "上一页", "前のページ", "戻る"];
const NEXT_TERMS = ["next", "weiter", "suivant", "siguiente", "avanti", "próximo", "seguinte", "volgende"];
const NEXT_TERMS_CJK = ["次へ", "下一页", "次のページ"];
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

/*
 * Ambiguous verbs followed by an explicit read or neutral object are not
 * exclusions: "Remove filter" clears a filter, "Acceder al catálogo" opens a
 * catalogue, "Entrar em contato" gets in touch. The verb alone still excludes.
 */
const NEUTRAL_VERBS = ["remove", "clear", "reset", "cancel", "annuler", "cancelar", "annulla", "acceder al?", "entrar e[mn]", "accedi al", "accéder au", "accéder à"];
const NEUTRAL_ARTICLES = ["the", "el", "la", "los", "las", "o", "a", "il", "le", "les", "de", "du", "des"];
const NEUTRAL_OBJECTS = [
  "filters?", "filtros?", "filtres?", "filtri", "search", "búsqueda", "recherche", "ricerca", "busca", "catálogo",
  "catalogo", "catalogue", "catalog", "contato", "contacto", "contact", "contatto", "lists?", "lista", "liste",
  "selection", "selección", "sélection", "selezione", "seleção", "view", "vista", "vue", "sort", "orden", "ordre",
];
const NEUTRAL_ACTION_PATTERN = new RegExp(
  `^(?:${NEUTRAL_VERBS.join("|")})\\s+(?:(?:${NEUTRAL_ARTICLES.join("|")})\\s+)?(?:${NEUTRAL_OBJECTS.join("|")})\\s*$`,
  "iu",
);

const FINALIZE_PATTERN = vocabulary(FINALIZE_TERMS, FINALIZE_TERMS_CJK);
const SEARCH_PATTERN = vocabulary(SEARCH_TERMS, SEARCH_TERMS_CJK);
/** Action labels that read or navigate without changing state. */
const READ_ACTION_PATTERN = vocabulary([...SEARCH_TERMS, ...READ_VERBS], SEARCH_TERMS_CJK, true);
const CREDENTIAL_ACTION_PATTERN = vocabulary(CREDENTIAL_TERMS, CREDENTIAL_TERMS_CJK);
const STEP_WORDS = ["step", "page", "schritt", "seite", "étape", "paso", "página", "passo", "pagina", "stap"];
const CONTINUE_TERMS = ["continue", "go back", "skip", "fortfahren", "continuer", "continuar", "prosegui", "doorgaan"];
const CONTINUE_TERMS_CJK = ["続ける", "继续"];

/**
 * The whole label is one of the words, optionally followed by a step or page
 * word and a number. With `bareSteps`, a step word alone ("Page 2") also
 * matches; that is right for wizard buttons but not for a pager direction.
 */
function wholeLabel(latin: readonly string[], cjk: readonly string[], bareSteps = false): RegExp {
  const words = `(?:${[...latin, ...cjk].join("|")})`;
  const steps = `(?:${STEP_WORDS.join("|")})`;
  const body = bareSteps ? `${words}(?:\\s+${steps})?|${steps}` : `${words}(?:\\s+${steps})?`;
  return new RegExp(`^(?:${body})\\s*\\d*$`, "iu");
}

const PREVIOUS_PATTERN = wholeLabel(PREVIOUS_TERMS, PREVIOUS_TERMS_CJK);
const NEXT_PATTERN = wholeLabel(NEXT_TERMS, NEXT_TERMS_CJK);
/** Wizard navigation: a type="button" whose whole label is a step verb is not an action. */
const NAVIGATION_PATTERN = wholeLabel(
  [...PREVIOUS_TERMS, ...NEXT_TERMS, ...CONTINUE_TERMS],
  [...PREVIOUS_TERMS_CJK, ...NEXT_TERMS_CJK, ...CONTINUE_TERMS_CJK],
  true,
);
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
    const tag = CSS.escape(current.tagName.toLowerCase());
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

/** Radio and checkbox groups are addressed by type and name, never catching a same-name text control. */
function groupSelector(scope: string, inputType: string, name: string): string {
  return `${scope} input[type="${inputType}"][name="${CSS.escape(name)}"]`;
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

/**
 * A control's selector must resolve to exactly the controls it stands for: a
 * unique id, else a name attribute shared only by its group (radio or
 * checkbox), else a structural path. A nameless control never gets a name
 * selector built from its id.
 */
function controlSelector(control: Element, formSelector: string, inputType: string, document: Document): string {
  const id = uniqueId(control, document);
  if (id) return `#${id}`;
  const nameAttribute = control.getAttribute("name");
  if (nameAttribute) {
    const sharing = control.closest("form")?.querySelectorAll(attributeSelector("", "name", nameAttribute).trim()).length ?? 1;
    const grouped = inputType === "radio" || inputType === "checkbox";
    if (grouped) return groupSelector(formSelector, inputType, nameAttribute);
    if (sharing === 1) return attributeSelector(formSelector, "name", nameAttribute);
  }
  return structuralSelector(control, document);
}

function observeField(control: Element, form: Element, formSelector: string, document: Document): FieldObservation | null {
  const inputType = (control.getAttribute("type") ?? (control.tagName === "SELECT" ? "select" : "text")).toLowerCase();
  if (inputType === "submit" || inputType === "button" || inputType === "reset" || inputType === "image") return null;
  const given = control.getAttribute("name") ?? control.getAttribute("id") ?? "";
  const excluded = exclusionFor(control, inputType, given);
  // A nameless control can never be a parameter, but an excluded one still counts and still classifies its form.
  if (!given && !excluded) return null;
  const name = given || `unnamed_${inputType}`;
  const field: FieldObservation = {
    id: `${formSelector}:field:${name}`,
    name,
    selector: controlSelector(control, formSelector, inputType, document),
    inputType,
    kind: fieldKind(control, inputType),
    required: control.hasAttribute("required"),
  };
  if (excluded) return { ...field, excluded };
  if (inputType === "radio") return observeRadio(control, field);
  if (inputType === "checkbox") return observeCheckbox(control, form, field);
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

/**
 * Two fields in one form can end up with the same name: nameless inputs that
 * share a duplicated id, or repeated text inputs with one name. The second
 * and later ones get a numeric suffix so schema keys and field ids stay
 * distinct; their selectors already point at their own control.
 */
function dedupeFieldNames(fields: readonly FieldObservation[], formSelector: string): FieldObservation[] {
  const seen = new Map<string, number>();
  return fields.map((field) => {
    const count = (seen.get(field.name) ?? 0) + 1;
    seen.set(field.name, count);
    if (count === 1) return field;
    const name = `${field.name}_${count}`;
    return { ...field, name, id: `${formSelector}:field:${name}` };
  });
}

/** A checkbox keeps its static value key so a same-name group can collapse into an enum array. */
function observeCheckbox(control: Element, form: Element, field: FieldObservation): FieldObservation {
  const label = labelFor(control, form);
  const legend = text(control.closest("fieldset")?.querySelector("legend") ?? null);
  // A checkbox without a value attribute submits "on", which is therefore its option key.
  const value = control.getAttribute("value") || "on";
  return { ...field, ...(label ? { label } : {}), ...(legend ? { groupLabel: legend } : {}), options: [value] };
}

/**
 * Two or more same-name checkboxes form a multi-select group: one enum field
 * whose value is an array of option keys, labelled by the fieldset legend.
 * A lone checkbox stays a boolean.
 */
function collapseCheckboxGroups(fields: readonly FieldObservation[], formSelector: string): FieldObservation[] {
  const counts = new Map<string, number>();
  for (const field of fields) {
    if (field.inputType === "checkbox") counts.set(field.name, (counts.get(field.name) ?? 0) + 1);
  }
  const groups = new Map<string, FieldObservation>();
  const collapsed: FieldObservation[] = [];
  for (const field of fields) {
    if (field.inputType !== "checkbox") {
      collapsed.push(field);
      continue;
    }
    if ((counts.get(field.name) ?? 0) < 2) {
      const { options: _single, groupLabel: _legend, ...lone } = field;
      collapsed.push(lone);
      continue;
    }
    const existing = groups.get(field.name);
    if (!existing) {
      // The group is labelled by its legend; an individual option's label would mislead.
      const { label: _own, groupLabel, ...rest } = field;
      const group: FieldObservation = {
        ...rest,
        ...(groupLabel ? { label: groupLabel } : {}),
        kind: "enum",
        multiple: true,
        selector: groupSelector(formSelector, "checkbox", field.name),
      };
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
      const group = { ...field, selector: groupSelector(formSelector, "radio", field.name) };
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
  return [...form.querySelectorAll("button, input[type=submit], input[type=image]")].map((button) => {
    const formAction = button.getAttribute("formaction")?.trim();
    const formMethod = button.getAttribute("formmethod")?.toLowerCase();
    const imageLabel = button.getAttribute("alt")?.trim() || button.getAttribute("title")?.trim();
    return {
      label:
        button.tagName === "INPUT"
          ? (button.getAttribute("type") ?? "").toLowerCase() === "image"
            ? imageLabel || "Submit"
            : (button.getAttribute("value") ?? "Submit")
          : text(button),
      type: (button.getAttribute("type") ?? "submit").toLowerCase(),
      selector: selectorFor(button, document),
      ...(formAction ? { formAction } : {}),
      ...(formMethod === "get" || formMethod === "post" ? { formMethod } : {}),
    };
  });
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
  const neutral = NEUTRAL_ACTION_PATTERN.test(actionLabel.trim());
  if (hasCredential || (!neutral && CREDENTIAL_ACTION_PATTERN.test(actionLabel))) {
    return { kind: "form", riskClass: "credential" };
  }
  if (hasPayment || (!neutral && FINALIZE_PATTERN.test(actionLabel))) return { kind: "form", riskClass: "finalize" };
  const readSignal =
    neutral || roleSearch || hasSearchInput || SEARCH_PATTERN.test(labels) || READ_ACTION_PATTERN.test(actionLabel.trim());
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
/**
 * Visible text that identifies the row or repeated block a form sits in: the
 * first non-form cell of its table row, or the heading of a repeated sibling
 * container. Never a hidden value.
 */
const ROW_LABEL_BUDGET = 60;
const NON_VISIBLE_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "TEXTAREA", "SELECT", "OPTION"]);
/** Common stylesheet-driven hiding; inline styles are checked separately. Stylesheets themselves are not evaluated. */
const HIDDEN_CLASS_PATTERN = /(^|\s)(sr-only|visually-hidden|visuallyhidden|hidden|d-none|screen-reader-text|is-hidden)(\s|$)/i;

function isHiddenElement(element: Element): boolean {
  if (NON_VISIBLE_TAGS.has(element.tagName)) return true;
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return true;
  if (HIDDEN_CLASS_PATTERN.test(element.getAttribute("class") ?? "")) return true;
  const style = (element.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
  return style.includes("display:none") || style.includes("visibility:hidden");
}

/** Text a person can see: skips hidden elements and control values entirely. */
function visibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE || isHiddenElement(node as Element)) return "";
  return [...node.childNodes].map(visibleText).join("").replace(/\s+/g, " ").trim();
}

function clipLabel(value: string): string {
  return value.length <= ROW_LABEL_BUDGET ? value : `${value.slice(0, ROW_LABEL_BUDGET - 1)}…`;
}

function rowLabelFor(form: Element): string | undefined {
  const row = form.closest("tr");
  if (row) {
    const label = [...row.children].filter((cell) => !cell.contains(form)).map(visibleText).find(Boolean);
    return label ? clipLabel(label) : undefined;
  }
  const container = form.parentElement;
  const grandparent = container?.parentElement;
  if (!container || !grandparent) return undefined;
  const repeated = [...grandparent.children].filter(
    (sibling) => sibling.tagName === container.tagName && sibling.querySelector("form"),
  );
  if (repeated.length < 2) return undefined;
  const heading = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6, legend, strong")].find(
    (candidate) => !form.contains(candidate),
  );
  const fromHeading = heading ? visibleText(heading) : "";
  if (fromHeading) return clipLabel(fromHeading);
  const firstText = [...container.children].filter((child) => child !== form && !child.contains(form)).map(visibleText).find(Boolean);
  return firstText ? clipLabel(firstText) : undefined;
}

function buttonCapability(
  button: ButtonObservation,
  base: Pick<CapabilityObservation, "heading" | "rowLabel">,
  method: "get" | "post",
  form: Element,
  fields: readonly FieldObservation[],
): CapabilityObservation {
  const effectiveMethod = button.formMethod ?? method;
  const { kind, riskClass } = classifyForm(effectiveMethod, button.label, form, fields);
  return {
    id: `action:${button.selector}`,
    kind,
    selector: button.selector,
    heading: base.heading,
    ...(base.rowLabel ? { rowLabel: base.rowLabel } : {}),
    ...(button.formAction ? { action: button.formAction } : {}),
    method: effectiveMethod,
    actionLabel: button.label,
    riskClass,
    fields: fields.filter((field) => field.inputType !== "search"),
    buttons: [button],
  };
}

function observeForm(form: Element, document: Document): CapabilityObservation[] {
  const selector = selectorFor(form, document);
  const rowLabel = rowLabelFor(form);
  const method = (form.getAttribute("method") ?? "get").toLowerCase() === "post" ? "post" : "get";
  const heading = nearestHeading(form, document);
  const buttons = observeButtons(form, document);
  const submit = buttons.find((button) => button.type === "submit") ?? buttons[0];
  const actionLabel = submit?.label ?? "Submit";
  const primaryMethod = submit?.formMethod ?? method;
  const primaryAction = submit?.formAction;
  const fields = dedupeFieldNames(
    collapseCheckboxGroups(
      collapseRadioGroups(
        [...form.querySelectorAll("input, select, textarea")]
          .map((control) => observeField(control, form, selector, document))
          .filter((field): field is FieldObservation => field !== null),
        selector,
      ),
      selector,
    ),
    selector,
  );
  const { kind, riskClass } = classifyForm(primaryMethod, actionLabel, form, fields);
  const primary: CapabilityObservation = {
    id: `${kind}:${selector}`,
    kind,
    selector,
    heading,
    ...(rowLabel ? { rowLabel } : {}),
    ...(primaryAction ? { action: primaryAction } : {}),
    method: primaryMethod,
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
  const base = { heading, rowLabel };
  for (const button of buttons.filter((candidate) => candidate.type === "button" && !isNavigation(candidate))) {
    extras.push(buttonCapability(button, base, "post", form, fields));
  }
  for (const button of buttons.filter((candidate) => candidate.type === "submit" && candidate !== submit)) {
    extras.push(buttonCapability(button, base, method, form, fields));
  }
  return [primary, ...extras];
}

function isNavigation(button: ButtonObservation): boolean {
  return NAVIGATION_PATTERN.test(button.label.trim());
}

/** thead cells, else the first row made only of th cells. */
function headerCells(table: Element): string[] {
  const fromHead = [...table.querySelectorAll("thead th")].map(text).filter(Boolean);
  if (fromHead.length > 0) return fromHead;
  const headerRow = [...table.querySelectorAll("tr")].find(
    (row) => row.children.length > 0 && [...row.children].every((cell) => cell.tagName === "TH"),
  );
  return headerRow ? [...headerRow.children].map(text).filter(Boolean) : [];
}

/**
 * Pagination controls belong to the table's own neighbourhood: its container
 * when it is the only table there, otherwise the siblings between it and the
 * next table. A link counts only with rel="prev"/"next" or previous/next
 * wording; never "the first link".
 */
function paginationScope(table: Element): Element[] {
  const parent = table.parentElement;
  if (!parent) return [];
  const tables = [...parent.children].filter((child) => child.tagName === "TABLE");
  const isRoot = parent === parent.ownerDocument.body || parent === parent.ownerDocument.documentElement;
  if (tables.length <= 1 && !isRoot) return [parent];
  const scope: Element[] = [];
  // Only a lone table claims the siblings before it; between two tables a pager belongs to the one above it.
  let before = tables.length <= 1 ? table.previousElementSibling : null;
  while (before && before.tagName !== "TABLE") {
    scope.push(before);
    before = before.previousElementSibling;
  }
  let after = table.nextElementSibling;
  while (after && after.tagName !== "TABLE") {
    scope.push(after);
    after = after.nextElementSibling;
  }
  return scope;
}

function paginationFor(table: Element): TableObservation["pagination"] {
  const links = paginationScope(table).flatMap((element) => [
    ...(element.matches("a, button") ? [element] : []),
    ...element.querySelectorAll("a, button"),
  ]);
  const wording = (link: Element, pattern: RegExp) =>
    pattern.test(text(link).trim()) || pattern.test((link.getAttribute("aria-label") ?? "").trim());
  return {
    previous: links.some((link) => link.getAttribute("rel") === "prev" || wording(link, PREVIOUS_PATTERN)),
    next: links.some((link) => link.getAttribute("rel") === "next" || wording(link, NEXT_PATTERN)),
  };
}

function observeTable(table: Element, document: Document): CapabilityObservation | null {
  const headers = headerCells(table);
  if (headers.length === 0) return null;
  const selector = selectorFor(table, document);
  const rowCount = [...table.querySelectorAll("tr")].filter((row) => row.querySelector("td")).length;
  const { previous, next } = paginationFor(table);
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
  const navigationButtonsSkipped = [...document.querySelectorAll("form button")].filter(
    (button) => (button.getAttribute("type") ?? "submit").toLowerCase() === "button" && NAVIGATION_PATTERN.test(text(button).trim()),
  ).length;
  const forms = [...document.querySelectorAll("form")].flatMap((form) => observeForm(form, document));
  const tables = [...document.querySelectorAll("table")]
    .map((table) => observeTable(table, document))
    .filter((table): table is CapabilityObservation => table !== null);
  const capabilities = withUniqueIds([...forms, ...tables]);
  // Button capabilities re-carry their form's fields; count each observed control once.
  const allFields = [...new Map(capabilities.flatMap((capability) => capability.fields).map((field) => [field.id, field])).values()];

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
      fileFieldsExcluded: allFields.filter((field) => field.excluded === "file").length,
      navigationButtonsSkipped,
      retainedRawValues: false as const,
    },
  });
}
