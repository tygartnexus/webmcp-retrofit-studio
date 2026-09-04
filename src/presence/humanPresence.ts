/**
 * Human-presence verification for the finalization boundary.
 *
 * The WebMCP tool surface can stage a draft but never confirm it. Confirming
 * requires a WebAuthn ceremony on a platform authenticator, which needs a
 * physical gesture (touch, biometric, or PIN). No WebMCP tool can reach this
 * ceremony, and automation limited to synthetic mouse and keyboard input
 * cannot complete the authenticator prompt. The receipt records only flags
 * and a hash; no name, identifier, or biometric data leaves the authenticator.
 *
 * Honest limits: without a relying-party server nothing here is verified
 * cryptographically by a third party. This module trusts whatever occupies
 * navigator.credentials in the current browsing context; code that already
 * runs JavaScript in the page (devtools-protocol automation, a malicious
 * extension, a compromised dependency) could substitute a fake container and
 * fabricate a response. The rpId in the receipt is recorded, not re-derived
 * from the authenticator data. It proves a local gesture, not an identity.
 */

export const PRESENCE_METHOD = "webauthn-user-presence" as const;

export type PresenceCeremony = "registration" | "assertion";

export interface PresenceReceipt {
  method: typeof PRESENCE_METHOD;
  ceremony: PresenceCeremony;
  /** The draft id this gesture was requested for; a receipt never applies to another draft. */
  subject: string;
  rpId: string;
  userPresent: true;
  userVerified: boolean;
  credentialIdSha256: string;
  verifiedAt: string;
}

export interface AuthenticatorFlags {
  userPresent: boolean;
  userVerified: boolean;
}

export type PresenceFailureReason =
  | "cancelled"
  | "insecure-context"
  | "no-credential"
  | "challenge-mismatch"
  | "presence-not-reported"
  | "authenticator-error";

export class PresenceUnavailableError extends Error {
  override readonly name = "PresenceUnavailableError";
  constructor() {
    super("WebAuthn is not available in this browser, so presence cannot be verified");
  }
}

export class PresenceVerificationError extends Error {
  override readonly name = "PresenceVerificationError";
  readonly reason: PresenceFailureReason;
  constructor(reason: PresenceFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface HumanPresenceVerifier {
  readonly method: typeof PRESENCE_METHOD;
  readonly available: boolean;
  /** Runs one ceremony for `subject` (the draft id shown to the person). */
  verify(subject: string): Promise<PresenceReceipt>;
}

export interface WebAuthnPresenceOptions {
  /** Override for tests; defaults to `navigator.credentials` when present. */
  credentials?: CredentialsContainer;
  /** Override for tests; defaults to `globalThis.crypto`. */
  crypto?: Crypto;
  relyingPartyName?: string;
  /** Recorded in the receipt; defaults to the current hostname. */
  rpId?: string;
  /** WebAuthn refuses insecure origins; defaults to `window.isSecureContext`. */
  secureContext?: boolean;
  /**
   * Remember the registered credential id in browser storage so later visits
   * need one prompt instead of two. Off by default; the id is not a secret, but
   * persisting it is a product choice the owner should make deliberately.
   */
  persistCredential?: boolean;
  /** Override for tests; defaults to `localStorage` when persistence is on. */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAGS_BYTE_OFFSET = 32;
const MIN_AUTHENTICATOR_DATA_LENGTH = 37;
const CEREMONY_TIMEOUT_MS = 60_000;
const STORAGE_KEY = "webmcp-retrofit:presence-credential";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBuffer(hex: string): ArrayBuffer | null {
  if (!/^[a-f0-9]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const buffer = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i += 1) view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return buffer;
}

function defaultStorage(): WebAuthnPresenceOptions["storage"] | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function parseAuthenticatorFlags(data: ArrayBuffer): AuthenticatorFlags {
  const bytes = new Uint8Array(data);
  if (bytes.length < MIN_AUTHENTICATOR_DATA_LENGTH) {
    throw new PresenceVerificationError(
      "authenticator-error",
      "Authenticator data is too short to carry presence flags",
    );
  }
  const flags = bytes[FLAGS_BYTE_OFFSET];
  return {
    userPresent: (flags & FLAG_USER_PRESENT) !== 0,
    userVerified: (flags & FLAG_USER_VERIFIED) !== 0,
  };
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function defaultCredentials(): CredentialsContainer | undefined {
  if (typeof navigator === "undefined") return undefined;
  const container = (navigator as Partial<Navigator>).credentials;
  if (!container || typeof container.create !== "function" || typeof container.get !== "function") {
    return undefined;
  }
  return container;
}

function defaultRpId(): string {
  if (typeof location === "undefined" || !location.hostname) return "unknown-host";
  return location.hostname;
}

function defaultSecureContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true;
}

async function sha256Hex(subtle: SubtleCrypto, data: ArrayBuffer): Promise<string> {
  const digest = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomBytes(crypto: Crypto, length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

interface CeremonyResult {
  rawId: ArrayBuffer;
  authenticatorData: ArrayBuffer;
  clientDataJSON: ArrayBuffer | null;
}

interface CeremonyOutcome {
  ceremony: PresenceCeremony;
  challenge: Uint8Array;
  result: CeremonyResult;
}

function readCeremonyResult(credential: unknown, ceremony: PresenceCeremony): CeremonyResult {
  if (!credential || typeof credential !== "object") {
    throw new PresenceVerificationError("no-credential", "The authenticator returned no credential");
  }
  const { rawId, response } = credential as {
    rawId?: ArrayBuffer;
    response?: {
      authenticatorData?: ArrayBuffer;
      getAuthenticatorData?: () => ArrayBuffer;
      clientDataJSON?: ArrayBuffer;
    };
  };
  if (!(rawId instanceof ArrayBuffer) || !response) {
    throw new PresenceVerificationError("authenticator-error", "The credential response is malformed");
  }
  const authenticatorData =
    ceremony === "registration"
      ? response.getAuthenticatorData?.()
      : response.authenticatorData;
  if (!(authenticatorData instanceof ArrayBuffer)) {
    throw new PresenceVerificationError("authenticator-error", "Authenticator data is missing");
  }
  const clientDataJSON =
    response.clientDataJSON instanceof ArrayBuffer ? response.clientDataJSON : null;
  return { rawId, authenticatorData, clientDataJSON };
}

/**
 * Confirms the browser echoed the locally issued challenge. Skipped only when
 * the response carries no clientDataJSON, which real browsers always supply.
 */
function assertChallengeEcho(result: CeremonyResult, challenge: Uint8Array): void {
  if (!result.clientDataJSON) return;
  let parsed: { challenge?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(result.clientDataJSON)) as { challenge?: unknown };
  } catch {
    throw new PresenceVerificationError("challenge-mismatch", "clientDataJSON could not be parsed");
  }
  if (parsed.challenge !== base64Url(challenge)) {
    throw new PresenceVerificationError(
      "challenge-mismatch",
      "The authenticator did not echo the issued challenge",
    );
  }
}

function toVerificationError(error: unknown): PresenceVerificationError {
  if (error instanceof PresenceVerificationError) return error;
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return new PresenceVerificationError(
      "cancelled",
      "The presence ceremony was cancelled, timed out, or no platform authenticator is enrolled",
    );
  }
  const message = error instanceof Error ? error.message : "Unknown authenticator failure";
  return new PresenceVerificationError("authenticator-error", message);
}

export function createWebAuthnPresenceVerifier(
  options: WebAuthnPresenceOptions = {},
): HumanPresenceVerifier {
  const credentials = "credentials" in options ? options.credentials : defaultCredentials();
  const crypto = options.crypto ?? globalThis.crypto;
  const relyingPartyName = options.relyingPartyName ?? "WebMCP Retrofit Studio";
  const rpId = options.rpId ?? defaultRpId();
  const secureContext = options.secureContext ?? defaultSecureContext();
  const storage = options.persistCredential ? (options.storage ?? defaultStorage()) : undefined;
  let registeredId: ArrayBuffer | null = null;
  try {
    const remembered = storage?.getItem(STORAGE_KEY);
    if (remembered) registeredId = hexToBuffer(remembered);
  } catch {
    registeredId = null;
  }

  function remember(id: ArrayBuffer | null): void {
    registeredId = id;
    if (!storage) return;
    try {
      if (id) storage.setItem(STORAGE_KEY, bytesToHex(new Uint8Array(id)));
      else storage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable or full; the in-memory id still works.
    }
  }

  async function register(container: CredentialsContainer): Promise<CeremonyOutcome> {
    const challenge = randomBytes(crypto, 32);
    const credential = await container.create({
      publicKey: {
        challenge,
        rp: { name: relyingPartyName },
        user: {
          id: randomBytes(crypto, 16),
          name: "booking-confirmer",
          displayName: "Booking confirmer (local, no account)",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "preferred",
        },
        attestation: "none",
        timeout: CEREMONY_TIMEOUT_MS,
      },
    });
    return { ceremony: "registration", challenge, result: readCeremonyResult(credential, "registration") };
  }

  async function assert(container: CredentialsContainer, id: ArrayBuffer): Promise<CeremonyOutcome> {
    const challenge = randomBytes(crypto, 32);
    const credential = await container.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: "public-key", id }],
        userVerification: "preferred",
        timeout: CEREMONY_TIMEOUT_MS,
      },
    });
    return { ceremony: "assertion", challenge, result: readCeremonyResult(credential, "assertion") };
  }

  async function runCeremony(container: CredentialsContainer): Promise<CeremonyOutcome> {
    if (registeredId) {
      try {
        return await assert(container, registeredId);
      } catch (error) {
        remember(null);
        throw error;
      }
    }
    const outcome = await register(container);
    remember(outcome.result.rawId);
    return outcome;
  }

  return Object.freeze({
    method: PRESENCE_METHOD,
    available: credentials !== undefined && secureContext,
    async verify(subject: string): Promise<PresenceReceipt> {
      if (!credentials) throw new PresenceUnavailableError();
      if (typeof subject !== "string" || subject.length === 0) {
        throw new PresenceVerificationError("authenticator-error", "A ceremony needs a subject draft");
      }
      const container = credentials;
      if (!secureContext) {
        throw new PresenceVerificationError(
          "insecure-context",
          "Presence can only be verified on a secure origin (https or localhost)",
        );
      }
      let outcome: CeremonyOutcome;
      try {
        outcome = await runCeremony(container);
        assertChallengeEcho(outcome.result, outcome.challenge);
      } catch (error) {
        remember(null);
        throw toVerificationError(error);
      }
      const flags = parseAuthenticatorFlags(outcome.result.authenticatorData);
      if (!flags.userPresent) {
        remember(null);
        throw new PresenceVerificationError(
          "presence-not-reported",
          "The authenticator did not report user presence",
        );
      }
      return Object.freeze({
        method: PRESENCE_METHOD,
        ceremony: outcome.ceremony,
        subject,
        rpId,
        userPresent: true,
        userVerified: flags.userVerified,
        credentialIdSha256: await sha256Hex(crypto.subtle, outcome.result.rawId),
        verifiedAt: new Date().toISOString(),
      });
    },
  });
}
