import { LEGACY_BOOKING_SNAPSHOT } from "../fixtures/legacyBookingSnapshot";

export type EvidenceObservationId =
  | "service-search-control"
  | "service-choice-control"
  | "date-control"
  | "time-control"
  | "stage-control"
  | "human-confirmation-control";

export interface EvidenceObservation {
  id: EvidenceObservationId;
  selector: string;
  semanticRole:
    | "search"
    | "choice"
    | "date"
    | "time"
    | "reversible-write"
    | "human-confirmation";
  present: boolean;
}

export interface OwnedFixtureScanResult {
  fixtureId: string;
  fixtureRevision: string;
  sourceKind: "bundled-synthetic-html";
  authorization: "owner-authorized";
  scanHash: string;
  observations: readonly EvidenceObservation[];
  safety: {
    parsedInertly: true;
    externalRequests: 0;
    executedScripts: 0;
    capturedCredentials: false;
    retainedRawValues: false;
  };
}

const OBSERVATIONS = Object.freeze([
  {
    id: "service-search-control",
    selector: "#service-search",
    semanticRole: "search",
  },
  {
    id: "service-choice-control",
    selector: "#service-choice",
    semanticRole: "choice",
  },
  { id: "date-control", selector: "#booking-date", semanticRole: "date" },
  { id: "time-control", selector: "#booking-time", semanticRole: "time" },
  {
    id: "stage-control",
    selector: "#stage-booking",
    semanticRole: "reversible-write",
  },
  {
    id: "human-confirmation-control",
    selector: "#confirm-booking",
    semanticRole: "human-confirmation",
  },
] as const satisfies readonly Omit<EvidenceObservation, "present">[]);

const ACTIVE_CONTENT_PATTERN =
  /<(?:script|iframe|object|embed|link|img|audio|video|source)\b|\bon[a-z]+\s*=|\b(?:src|href|action|formaction)\s*=/i;
const CREDENTIAL_CONTROL_PATTERN = /<input\b[^>]*\btype\s*=\s*["']?password\b/i;

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable");
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(digest);
}

type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeForCanonicalJson(
  value: unknown,
  ancestors: WeakSet<object>,
): CanonicalJsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON numbers must be finite.");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError("Canonical JSON accepts JSON-compatible values only.");
  }
  if (ancestors.has(value)) {
    throw new TypeError("Canonical JSON cannot contain circular references.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError("Canonical JSON arrays must use the plain Array prototype.");
      }
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") continue;
        if (
          typeof key !== "string" ||
          !/^(?:0|[1-9]\d*)$/.test(key) ||
          Number(key) >= value.length
        ) {
          throw new TypeError("Canonical JSON arrays cannot contain custom properties.");
        }
      }
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new TypeError(
            "Canonical JSON arrays must be dense and contain data properties only.",
          );
        }
        return normalizeForCanonicalJson(descriptor.value, ancestors);
      });
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON objects must be plain objects.");
    }
    const entries = Reflect.ownKeys(value).map((key) => {
      if (typeof key !== "string") {
        throw new TypeError("Canonical JSON objects cannot contain symbol keys.");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new TypeError(
          "Canonical JSON objects must contain enumerable data properties only.",
        );
      }
      return [
        key,
        normalizeForCanonicalJson(descriptor.value, ancestors),
      ] as const;
    });
    entries.sort(([left], [right]) => compareCodeUnits(left, right));
    return Object.fromEntries(entries);
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForCanonicalJson(value, new WeakSet()));
}

export async function scanOwnedFixture(): Promise<OwnedFixtureScanResult> {
  const snapshot = LEGACY_BOOKING_SNAPSHOT;
  if (
    ACTIVE_CONTENT_PATTERN.test(snapshot.html) ||
    CREDENTIAL_CONTROL_PATTERN.test(snapshot.html)
  ) {
    throw new Error("Bundled fixture contains prohibited active or credential content");
  }

  const parsed = new DOMParser().parseFromString(snapshot.html, "text/html");
  const observations = OBSERVATIONS.map((definition) => ({
    ...definition,
    present: parsed.querySelector(definition.selector) !== null,
  }));

  return {
    fixtureId: snapshot.id,
    fixtureRevision: snapshot.revision,
    sourceKind: snapshot.sourceKind,
    authorization: snapshot.authorization,
    scanHash: await sha256Hex(snapshot.html),
    observations,
    safety: {
      parsedInertly: true,
      externalRequests: 0,
      executedScripts: 0,
      capturedCredentials: false,
      retainedRawValues: false,
    },
  };
}
