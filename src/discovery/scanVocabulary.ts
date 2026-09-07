/**
 * Action vocabulary and the patterns the scanner classifies with. Kept apart
 * from the DOM walk so the word lists can be reviewed on their own.
 */

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
export const NEUTRAL_ACTION_PATTERN = new RegExp(
  `^(?:${NEUTRAL_VERBS.join("|")})\\s+(?:(?:${NEUTRAL_ARTICLES.join("|")})\\s+)?(?:${NEUTRAL_OBJECTS.join("|")})\\s*$`,
  "iu",
);

export const FINALIZE_PATTERN = vocabulary(FINALIZE_TERMS, FINALIZE_TERMS_CJK);
/**
 * A button label that does not say what happens ("Go", "Continue", "Submit"), so the form's
 * choices are what name the action. A specific label ("Send message", "Save plan") makes the
 * choices plain data.
 */
const GENERIC_ACTION_TERMS = [
  "submit", "go", "ok", "okay", "apply", "run", "execute", "proceed", "continue", "next", "done", "save", "update",
  "send", "confirm", "choose", "select", "button",
  "weiter", "absenden", "senden", "speichern", "bestätigen", "ausführen",
  "envoyer", "continuer", "valider", "enregistrer", "appliquer",
  "enviar", "continuar", "aceptar", "guardar", "aplicar",
  "invia", "avanti", "salva", "conferma", "applica",
  "verzenden", "doorgaan", "opslaan", "toepassen",
  "送信", "次へ", "保存", "実行", "提交", "继续", "保存", "确定",
];
export const GENERIC_ACTION_PATTERN = new RegExp(`^(?:${GENERIC_ACTION_TERMS.join("|")})$`, "iu");

/** Consent wording on a choice ("I confirm I am over 18") is a statement, not an action; it is not judged. */
export const CONSENT_PATTERN = /\b(confirm\w*|bestätig\w*|confirm(?:er|ez|é|ée)|conferm\w*|bevestig\w*)\b|確認|确认/giu;
export const SEARCH_PATTERN = vocabulary(SEARCH_TERMS, SEARCH_TERMS_CJK);
/** Action labels that read or navigate without changing state. */
export const READ_ACTION_PATTERN = vocabulary([...SEARCH_TERMS, ...READ_VERBS], SEARCH_TERMS_CJK, true);
export const CREDENTIAL_ACTION_PATTERN = vocabulary(CREDENTIAL_TERMS, CREDENTIAL_TERMS_CJK);
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

export const PREVIOUS_PATTERN = wholeLabel(PREVIOUS_TERMS, PREVIOUS_TERMS_CJK);
export const NEXT_PATTERN = wholeLabel(NEXT_TERMS, NEXT_TERMS_CJK);
/** Wizard navigation: a type="button" whose whole label is a step verb is not an action. */
export const NAVIGATION_PATTERN = wholeLabel(
  [...PREVIOUS_TERMS, ...NEXT_TERMS, ...CONTINUE_TERMS],
  [...PREVIOUS_TERMS_CJK, ...NEXT_TERMS_CJK, ...CONTINUE_TERMS_CJK],
  true,
);
export const PAYMENT_NAME_PATTERN = /(card|cvv|cvc|expir|iban|routing|account ?number)/i;
