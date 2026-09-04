import {
  PRESENCE_METHOD,
  PresenceUnavailableError,
  PresenceVerificationError,
  base64Url,
  createWebAuthnPresenceVerifier,
  parseAuthenticatorFlags,
  type PresenceReceipt,
} from "../src/presence/humanPresence";

const UP = 0b0000_0001;
const UV = 0b0000_0100;

function authenticatorData(flags: number): ArrayBuffer {
  const buffer = new ArrayBuffer(37);
  const bytes = new Uint8Array(buffer);
  bytes.fill(0xab, 0, 32);
  bytes[32] = flags;
  return buffer;
}

function credentialIdBytes(seed: number): ArrayBuffer {
  const buffer = new ArrayBuffer(4);
  new Uint8Array(buffer).set([seed, seed + 1, seed + 2, seed + 3]);
  return buffer;
}

function clientData(challenge: BufferSource | undefined, override?: string): ArrayBuffer {
  const echoed =
    override ??
    (challenge instanceof Uint8Array ? base64Url(challenge) : "missing-challenge");
  const json = JSON.stringify({ type: "webauthn.create", challenge: echoed, origin: "https://x" });
  const encoded = new TextEncoder().encode(json);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

interface FakeCredentialsOptions {
  createFlags?: number | null;
  getFlags?: number | null;
  createError?: Error;
  getError?: Error;
  echoChallenge?: string;
}

function fakeCredentials(options: FakeCredentialsOptions = {}) {
  const calls: string[] = [];
  const container = {
    async create(init?: CredentialCreationOptions): Promise<unknown> {
      calls.push("create");
      if (options.createError) throw options.createError;
      if (options.createFlags === null) return null;
      return {
        rawId: credentialIdBytes(1),
        response: {
          getAuthenticatorData: () => authenticatorData(options.createFlags ?? UP | UV),
          clientDataJSON: clientData(init?.publicKey?.challenge, options.echoChallenge),
        },
      };
    },
    async get(init?: CredentialRequestOptions): Promise<unknown> {
      calls.push("get");
      if (options.getError) throw options.getError;
      if (options.getFlags === null) return null;
      return {
        rawId: credentialIdBytes(1),
        response: {
          authenticatorData: authenticatorData(options.getFlags ?? UP),
          clientDataJSON: clientData(init?.publicKey?.challenge, options.echoChallenge),
        },
      };
    },
  };
  return { container: container as unknown as CredentialsContainer, calls };
}

function verifierWith(container: CredentialsContainer) {
  return createWebAuthnPresenceVerifier({
    credentials: container,
    rpId: "example.test",
    secureContext: true,
  });
}

describe("authenticator flag parsing", () => {
  it("reads the user-presence and user-verification bits", () => {
    expect(parseAuthenticatorFlags(authenticatorData(UP))).toEqual({
      userPresent: true,
      userVerified: false,
    });
    expect(parseAuthenticatorFlags(authenticatorData(UP | UV))).toEqual({
      userPresent: true,
      userVerified: true,
    });
    expect(parseAuthenticatorFlags(authenticatorData(0))).toEqual({
      userPresent: false,
      userVerified: false,
    });
  });

  it("rejects authenticator data that is too short to carry flags", () => {
    expect(() => parseAuthenticatorFlags(new ArrayBuffer(10))).toThrow(/authenticator data/i);
  });
});

describe("WebAuthn presence verifier", () => {
  it("refuses a ceremony without a subject draft", async () => {
    const { container, calls } = fakeCredentials();
    await expect(verifierWith(container).verify("")).rejects.toMatchObject({
      reason: "authenticator-error",
    });
    expect(calls).toEqual([]);
  });

  it("reports unavailable and refuses to verify when WebAuthn is absent", async () => {
    const verifier = createWebAuthnPresenceVerifier({
      credentials: undefined,
      secureContext: true,
    });

    expect(verifier.available).toBe(false);
    await expect(verifier.verify("draft-repair-2026-09-05-1430")).rejects.toBeInstanceOf(PresenceUnavailableError);
  });

  it("refuses to run on an insecure origin", async () => {
    const { container, calls } = fakeCredentials();
    const verifier = createWebAuthnPresenceVerifier({
      credentials: container,
      rpId: "example.test",
      secureContext: false,
    });

    expect(verifier.available).toBe(false);
    await expect(verifier.verify("draft-repair-2026-09-05-1430")).rejects.toMatchObject({ reason: "insecure-context" });
    expect(calls).toEqual([]);
  });

  it("registers a platform credential on first use and issues a receipt without PII", async () => {
    const { container, calls } = fakeCredentials();
    const verifier = verifierWith(container);

    const receipt: PresenceReceipt = await verifier.verify("draft-repair-2026-09-05-1430");

    expect(calls).toEqual(["create"]);
    expect(receipt.method).toBe(PRESENCE_METHOD);
    expect(receipt.ceremony).toBe("registration");
    expect(receipt.rpId).toBe("example.test");
    expect(receipt.subject).toBe("draft-repair-2026-09-05-1430");
    expect(receipt.userPresent).toBe(true);
    expect(receipt.userVerified).toBe(true);
    expect(receipt.credentialIdSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Object.keys(receipt).sort()).toEqual([
      "ceremony",
      "credentialIdSha256",
      "method",
      "rpId",
      "subject",
      "userPresent",
      "userVerified",
      "verifiedAt",
    ]);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it("asserts with the registered credential on later uses", async () => {
    const { container, calls } = fakeCredentials();
    const verifier = verifierWith(container);

    const first = await verifier.verify("draft-repair-2026-09-05-1430");
    const second = await verifier.verify("draft-repair-2026-09-05-1430");

    expect(calls).toEqual(["create", "get"]);
    expect(second.ceremony).toBe("assertion");
    expect(second.credentialIdSha256).toBe(first.credentialIdSha256);
  });

  it("fails closed when the authenticator does not report user presence", async () => {
    const { container } = fakeCredentials({ createFlags: 0 });

    await expect(verifierWith(container).verify("draft-repair-2026-09-05-1430")).rejects.toMatchObject({
      reason: "presence-not-reported",
    });
  });

  it("fails closed when the browser does not echo the issued challenge", async () => {
    const { container } = fakeCredentials({ echoChallenge: "stale-challenge" });

    await expect(verifierWith(container).verify("draft-repair-2026-09-05-1430")).rejects.toMatchObject({
      reason: "challenge-mismatch",
    });
  });

  it("fails closed when the ceremony is cancelled or returns nothing", async () => {
    const cancelled = fakeCredentials({
      createError: new DOMException("The operation was cancelled", "NotAllowedError"),
    });
    await expect(verifierWith(cancelled.container).verify("draft-repair-2026-09-05-1430")).rejects.toMatchObject({
      name: "PresenceVerificationError",
      reason: "cancelled",
    });

    const empty = fakeCredentials({ createFlags: null });
    await expect(verifierWith(empty.container).verify("draft-repair-2026-09-05-1430")).rejects.toBeInstanceOf(
      PresenceVerificationError,
    );
  });

  it("does not retain a credential after a failed assertion", async () => {
    const { container, calls } = fakeCredentials({
      getError: new DOMException("no credential", "NotAllowedError"),
    });
    const verifier = verifierWith(container);

    await verifier.verify("draft-repair-2026-09-05-1430");
    await expect(verifier.verify("draft-repair-2026-09-05-1430")).rejects.toBeInstanceOf(PresenceVerificationError);
    await verifier.verify("draft-repair-2026-09-05-1430");

    expect(calls).toEqual(["create", "get", "create"]);
  });
});

describe("credential persistence option", () => {
  function fakeStorage() {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
  }

  it("is off by default and stores nothing", async () => {
    const storage = fakeStorage();
    const { container } = fakeCredentials();
    await createWebAuthnPresenceVerifier({
      credentials: container,
      rpId: "example.test",
      secureContext: true,
      storage,
    }).verify("draft-repair-2026-09-05-1430");
    expect(storage.map.size).toBe(0);
  });

  it("remembers the credential so a later visit needs one assertion instead of a registration", async () => {
    const storage = fakeStorage();
    const first = fakeCredentials();
    const receipt = await createWebAuthnPresenceVerifier({
      credentials: first.container,
      rpId: "example.test",
      secureContext: true,
      persistCredential: true,
      storage,
    }).verify("draft-repair-2026-09-05-1430");
    expect(first.calls).toEqual(["create"]);
    expect(storage.map.size).toBe(1);
    expect([...storage.map.values()][0]).not.toContain(receipt.credentialIdSha256);

    const later = fakeCredentials();
    const second = await createWebAuthnPresenceVerifier({
      credentials: later.container,
      rpId: "example.test",
      secureContext: true,
      persistCredential: true,
      storage,
    }).verify("draft-repair-2026-09-05-1430");
    expect(later.calls).toEqual(["get"]);
    expect(second.ceremony).toBe("assertion");
  });

  it("forgets the credential after a failed assertion", async () => {
    const storage = fakeStorage();
    storage.setItem("webmcp-retrofit:presence-credential", "01020304");
    const failing = fakeCredentials({ getError: new DOMException("gone", "NotAllowedError") });
    await expect(
      createWebAuthnPresenceVerifier({
        credentials: failing.container,
        rpId: "example.test",
        secureContext: true,
        persistCredential: true,
        storage,
      }).verify("draft-repair-2026-09-05-1430"),
    ).rejects.toMatchObject({ reason: "cancelled" });
    expect(storage.map.size).toBe(0);
  });
});
