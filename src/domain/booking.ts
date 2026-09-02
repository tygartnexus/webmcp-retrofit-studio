export const BOOKING_TOOL_NAMES = [
  "search_services",
  "get_availability",
  "stage_booking",
] as const;

export type BookingToolName = (typeof BOOKING_TOOL_NAMES)[number];

export function isExactBookingToolInventory(
  toolNames: readonly unknown[],
): toolNames is readonly BookingToolName[] {
  return (
    toolNames.length === BOOKING_TOOL_NAMES.length &&
    BOOKING_TOOL_NAMES.every(
      (expectedName, index) => toolNames[index] === expectedName,
    )
  );
}

export type ServiceId = "consultation" | "installation" | "repair";

export interface BookingService {
  id: ServiceId;
  name: string;
  summary: string;
  durationMinutes: number;
}

export interface AvailabilitySlot {
  date: string;
  time: string;
}

export interface AvailabilityResult {
  serviceId: ServiceId;
  serviceName: string;
  slots: AvailabilitySlot[];
}

export interface BookingDraft extends AvailabilitySlot {
  id: string;
  serviceId: ServiceId;
  serviceName: string;
  status: "draft";
}

export interface BookingSnapshot {
  draft: BookingDraft | null;
}

export interface BookingStore {
  stage(input: unknown): BookingDraft;
  cancelDraft(): void;
  getSnapshot(): BookingSnapshot;
}

const SERVICES: readonly BookingService[] = Object.freeze([
  Object.freeze({
    id: "consultation",
    name: "Consultation",
    summary: "A focused planning session with a service specialist.",
    durationMinutes: 30,
  }),
  Object.freeze({
    id: "installation",
    name: "Installation",
    summary: "On-site setup for an approved standard installation.",
    durationMinutes: 90,
  }),
  Object.freeze({
    id: "repair",
    name: "Repair",
    summary: "A diagnostic visit for an existing installation.",
    durationMinutes: 60,
  }),
]);

const AVAILABILITY: Readonly<Record<ServiceId, readonly AvailabilitySlot[]>> =
  Object.freeze({
    consultation: Object.freeze([
      Object.freeze({ date: "2026-09-03", time: "10:00" }),
      Object.freeze({ date: "2026-09-03", time: "13:30" }),
      Object.freeze({ date: "2026-09-04", time: "09:00" }),
    ]),
    installation: Object.freeze([
      Object.freeze({ date: "2026-09-04", time: "11:00" }),
      Object.freeze({ date: "2026-09-06", time: "09:30" }),
    ]),
    repair: Object.freeze([
      Object.freeze({ date: "2026-09-05", time: "14:30" }),
      Object.freeze({ date: "2026-09-07", time: "10:30" }),
    ]),
  });

const SERVICE_IDS = new Set<ServiceId>(SERVICES.map((service) => service.id));

function assertPlainRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const unexpectedKey = Reflect.ownKeys(value).find(
    (key) => typeof key !== "string" || !allowedKeys.includes(key),
  );
  if (unexpectedKey) {
    throw new TypeError(`Unexpected input property: ${String(unexpectedKey)}`);
  }
}

function readOwnDataProperty(
  value: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor)) {
    throw new TypeError(`${key} must be an own data property`);
  }
  return descriptor.value;
}

function requireBoundedString(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }
  if (normalized.length > maximumLength) {
    throw new TypeError(`${label} must be at most ${maximumLength} characters`);
  }
  return normalized;
}

function requireServiceId(value: unknown): ServiceId {
  const serviceId = requireBoundedString(value, "serviceId", 32);
  if (!SERVICE_IDS.has(serviceId as ServiceId)) {
    throw new RangeError(`Unknown service: ${serviceId}`);
  }
  return serviceId as ServiceId;
}

function copyService(service: BookingService): BookingService {
  return { ...service };
}

function copySlot(slot: AvailabilitySlot): AvailabilitySlot {
  return { ...slot };
}

function copyDraft(draft: BookingDraft): BookingDraft {
  return { ...draft };
}

export function searchServices(query: unknown = ""): BookingService[] {
  if (typeof query !== "string") {
    throw new TypeError("query must be a string");
  }
  if (query.length > 80) {
    throw new TypeError("query must be at most 80 characters");
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  return SERVICES.filter((service) => {
    if (!normalizedQuery) return true;
    return `${service.id} ${service.name}`
      .toLocaleLowerCase("en-US")
      .includes(normalizedQuery);
  }).map(copyService);
}

export function getAvailability(input: unknown): AvailabilityResult {
  assertPlainRecord(input, "availability input");
  assertOnlyKeys(input, ["serviceId"]);
  const serviceId = requireServiceId(readOwnDataProperty(input, "serviceId"));
  const service = SERVICES.find((candidate) => candidate.id === serviceId)!;

  return {
    serviceId,
    serviceName: service.name,
    slots: AVAILABILITY[serviceId].map(copySlot),
  };
}

export function stageBooking(input: unknown): BookingDraft {
  assertPlainRecord(input, "booking input");
  assertOnlyKeys(input, ["serviceId", "date", "time"]);
  const serviceId = requireServiceId(readOwnDataProperty(input, "serviceId"));
  const date = requireBoundedString(
    readOwnDataProperty(input, "date"),
    "date",
    10,
  );
  const time = requireBoundedString(
    readOwnDataProperty(input, "time"),
    "time",
    5,
  );
  const slotIsAvailable = AVAILABILITY[serviceId].some(
    (slot) => slot.date === date && slot.time === time,
  );

  if (!slotIsAvailable) {
    throw new RangeError("Unavailable booking slot");
  }

  const service = SERVICES.find((candidate) => candidate.id === serviceId)!;
  return {
    id: `draft-${serviceId}-${date}-${time.replace(":", "")}`,
    serviceId,
    serviceName: service.name,
    date,
    time,
    status: "draft",
  };
}

export function createBookingStore(): BookingStore {
  let draft: BookingDraft | null = null;

  return {
    stage(input: unknown) {
      draft = stageBooking(input);
      return copyDraft(draft);
    },
    cancelDraft() {
      draft = null;
    },
    getSnapshot() {
      return { draft: draft ? copyDraft(draft) : null };
    },
  };
}
