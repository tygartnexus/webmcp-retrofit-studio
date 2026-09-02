import type { BookingToolName } from "../domain/booking";

export interface BookingToolContract
  extends Omit<WebMCP.ModelContextTool, "execute"> {
  name: BookingToolName;
  title: string;
  inputSchema: {
    type: "object";
    properties: Record<string, object>;
    required?: readonly string[];
    additionalProperties: false;
  };
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: true;
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return Object.freeze(value);
}

const SERVICE_ID_SCHEMA = deepFreeze({
  type: "string",
  enum: ["consultation", "installation", "repair"],
} as const);

export const SEARCH_SERVICES_TOOL_CONTRACT = deepFreeze({
  name: "search_services",
  title: "Search services",
  description:
    "Search the fixed synthetic service catalog. This tool does not modify state.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", maxLength: 80 },
    },
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
} as const satisfies BookingToolContract);

export const GET_AVAILABILITY_TOOL_CONTRACT = deepFreeze({
  name: "get_availability",
  title: "Get availability",
  description:
    "Return fixed synthetic availability for one known service. This tool does not modify state.",
  inputSchema: {
    type: "object",
    properties: {
      serviceId: SERVICE_ID_SCHEMA,
    },
    required: ["serviceId"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
} as const satisfies BookingToolContract);

export const STAGE_BOOKING_TOOL_CONTRACT = deepFreeze({
  name: "stage_booking",
  title: "Stage booking draft",
  description:
    "Create or replace a reversible local booking draft. Final confirmation remains on the visible interface and outside this tool.",
  inputSchema: {
    type: "object",
    properties: {
      serviceId: SERVICE_ID_SCHEMA,
      date: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        maxLength: 10,
      },
      time: {
        type: "string",
        pattern: "^\\d{2}:\\d{2}$",
        maxLength: 5,
      },
    },
    required: ["serviceId", "date", "time"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    untrustedContentHint: true,
  },
} as const satisfies BookingToolContract);

export const BOOKING_TOOL_CONTRACTS = deepFreeze([
  SEARCH_SERVICES_TOOL_CONTRACT,
  GET_AVAILABILITY_TOOL_CONTRACT,
  STAGE_BOOKING_TOOL_CONTRACT,
]);
