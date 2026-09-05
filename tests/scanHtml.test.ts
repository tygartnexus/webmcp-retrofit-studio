import { LEGACY_BOOKING_SNAPSHOT } from "../src/fixtures/legacyBookingSnapshot";
import {
  CHECKOUT_FIXTURE,
  CONTACT_FORM_FIXTURE,
  DATA_TABLE_FIXTURE,
  LOGIN_FIXTURE,
  SEARCH_FILTERS_FIXTURE,
  type HtmlSnapshot,
} from "../src/fixtures/genericFixtures";
import { scanHtml, type CapabilityObservation } from "../src/discovery/scanHtml";

function byKind(result: { capabilities: readonly CapabilityObservation[] }, kind: CapabilityObservation["kind"]) {
  return result.capabilities.filter((capability) => capability.kind === kind);
}

describe("generic HTML scanner", () => {
  it("parses inertly and records a safety envelope without executing scripts", async () => {
    const result = await scanHtml(SEARCH_FILTERS_FIXTURE);

    expect(result.safety.parsedInertly).toBe(true);
    expect(result.safety.executedScripts).toBe(0);
    expect(result.safety.externalRequests).toBe(0);
    expect(result.safety.scriptsIgnored).toBe(1);
    expect(result.safety.retainedRawValues).toBe(false);
    expect(result.scanHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("produces the same hash for the same html and a different one for different html", async () => {
    const a = await scanHtml(CONTACT_FORM_FIXTURE);
    const b = await scanHtml(CONTACT_FORM_FIXTURE);
    const c = await scanHtml(SEARCH_FILTERS_FIXTURE);

    expect(a.scanHash).toBe(b.scanHash);
    expect(a.scanHash).not.toBe(c.scanHash);
  });

  it("observes a contact form with labelled, typed, required fields", async () => {
    const result = await scanHtml(CONTACT_FORM_FIXTURE);
    const [form] = byKind(result, "form");

    expect(form.selector).toBe("#contact-form");
    expect(form.method).toBe("post");
    expect(form.actionLabel).toBe("Send message");
    expect(form.heading).toBe("Contact us");
    const fields = Object.fromEntries(form.fields.map((field) => [field.name, field]));
    expect(fields.fullName).toMatchObject({ kind: "string", required: true, label: "Full name", maxLength: 80 });
    expect(fields.email).toMatchObject({ kind: "email", required: true, placeholder: "you@example.test" });
    expect(fields.topic).toMatchObject({ kind: "enum", options: ["sales", "support", "other"] });
    expect(fields.message).toMatchObject({ kind: "string", required: true, maxLength: 2000 });
    expect(fields.newsletter).toMatchObject({ kind: "boolean", label: "Subscribe to updates" });
    expect(fields.priority).toMatchObject({
      kind: "enum",
      inputType: "radio",
      label: "Priority",
      required: true,
      options: ["low", "high"],
      selector: '#contact-form [name="priority"]',
    });
    expect(form.fields.filter((field) => field.name === "priority")).toHaveLength(1);
  });

  it("does not treat a GET form as read unless it carries a read signal", async () => {
    const owner = (html: string): HtmlSnapshot => ({
      id: "owner-get",
      revision: "1",
      sourceKind: "owner-supplied-html",
      authorization: "owner-authorized",
      title: "GET actions",
      html,
    });
    const logout = await scanHtml(owner('<form method="get" action="/logout"><button>Log out</button></form>'));
    const unsubscribe = await scanHtml(owner('<form method="get"><input name="id"><button>Unsubscribe</button></form>'));
    const saveView = await scanHtml(owner('<form method="get"><input name="view"><button>Save view</button></form>'));
    const next = await scanHtml(owner('<form method="get"><input name="page"><button>Next</button></form>'));

    expect(logout.capabilities[0]).toMatchObject({ kind: "form", riskClass: "credential" });
    expect(unsubscribe.capabilities[0]).toMatchObject({ kind: "form", riskClass: "finalize" });
    expect(saveView.capabilities[0]).toMatchObject({ kind: "form", riskClass: "write" });
    expect(next.capabilities[0]).toMatchObject({ kind: "search", riskClass: "read" });
  });

  it("classifies a GET search form as a search capability with numeric bounds and enums", async () => {
    const result = await scanHtml(SEARCH_FILTERS_FIXTURE);
    const [search] = byKind(result, "search");

    expect(search.method).toBe("get");
    const fields = Object.fromEntries(search.fields.map((field) => [field.name, field]));
    expect(fields.q).toMatchObject({ kind: "string", label: "Search products" });
    expect(fields.category).toMatchObject({ kind: "enum", options: ["tools", "parts", "safety"] });
    expect(fields.minPrice).toMatchObject({ kind: "number", min: 0, max: 5000 });
    expect(fields.inStock).toMatchObject({ kind: "boolean" });
    expect(result.capabilities).toHaveLength(1);
  });

  it("observes a data table with headers, row count, and pagination", async () => {
    const result = await scanHtml(DATA_TABLE_FIXTURE);
    const [table] = byKind(result, "table");

    expect(table.selector).toBe("#orders");
    expect(table.table).toEqual({
      headers: ["Order", "Status", "Total", "Placed"],
      rowCount: 3,
      pagination: { previous: true, next: true },
    });
    expect(table.heading).toBe("Recent orders");
  });

  it("separates a reversible coupon form from a finalizing order form and excludes card and hidden fields", async () => {
    const result = await scanHtml(CHECKOUT_FIXTURE);
    const forms = byKind(result, "form");
    const coupon = forms.find((form) => form.selector === "#coupon-form")!;
    const order = forms.find((form) => form.selector === "#order-form")!;

    expect(coupon.riskClass).toBe("write");
    expect(order.riskClass).toBe("finalize");
    expect(order.actionLabel).toBe("Place order");
    const orderFields = Object.fromEntries(order.fields.map((field) => [field.name, field]));
    expect(orderFields.postalCode).toMatchObject({ pattern: "[0-9]{5}", required: true });
    expect(orderFields.cardNumber).toMatchObject({ excluded: "payment-credential" });
    expect(orderFields.cartToken).toMatchObject({ excluded: "hidden" });
    expect(JSON.stringify(result)).not.toContain("hidden-token-should-not-be-retained");
  });

  it("marks a login form as a credential capability and never records the password field's attributes as parameters", async () => {
    const result = await scanHtml(LOGIN_FIXTURE);
    const [login] = byKind(result, "form");

    expect(login.riskClass).toBe("credential");
    const password = login.fields.find((field) => field.name === "password")!;
    expect(password.excluded).toBe("credential");
    expect(result.safety.credentialFieldsExcluded).toBe(1);
  });

  it("scans the original booking fixture and finds its controls", async () => {
    const snapshot: HtmlSnapshot = {
      id: LEGACY_BOOKING_SNAPSHOT.id,
      revision: LEGACY_BOOKING_SNAPSHOT.revision,
      sourceKind: "bundled-synthetic-html",
      authorization: "owner-authorized",
      title: "Legacy booking",
      html: LEGACY_BOOKING_SNAPSHOT.html,
    };
    const result = await scanHtml(snapshot);
    const form = result.capabilities.find((capability) => capability.selector === "#booking-form")!;

    expect(form.riskClass).toBe("finalize");
    expect(form.actionLabel).toBe("Confirm booking");
    expect(form.fields.map((field) => field.name)).toEqual([
      "service-search",
      "service-choice",
      "booking-date",
      "booking-time",
    ]);
    expect(form.buttons.map((button) => button.label)).toEqual(["Review booking", "Confirm booking"]);
    expect(result.capabilities.map((capability) => [capability.kind, capability.riskClass])).toEqual([
      ["form", "finalize"],
      ["search", "read"],
      ["form", "write"],
    ]);
    const review = result.capabilities.find((capability) => capability.actionLabel === "Review booking")!;
    expect(review.fields.map((field) => field.name)).toEqual(["service-choice", "booking-date", "booking-time"]);
  });

  it("accepts owner-supplied html and refuses empty or oversized input", async () => {
    const owner: HtmlSnapshot = {
      id: "owner-paste",
      revision: "1",
      sourceKind: "owner-supplied-html",
      authorization: "owner-authorized",
      title: "Pasted page",
      html: "<form id='f' method='get'><label for='a'>Term</label><input id='a' name='term'><button>Find</button></form>",
    };
    const result = await scanHtml(owner);
    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilities[0].kind).toBe("search");

    await expect(scanHtml({ ...owner, html: "   " })).rejects.toThrow(/empty/i);
    await expect(scanHtml({ ...owner, html: "x".repeat(2_000_001) })).rejects.toThrow(/too large/i);
  });
});
