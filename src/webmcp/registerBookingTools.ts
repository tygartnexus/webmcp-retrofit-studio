import {
  BOOKING_TOOL_NAMES,
  createBookingStore,
  getAvailability,
  searchServices,
  stageBooking,
  type BookingDraft,
  type BookingStore,
  type BookingToolName,
} from "../domain/booking";
import {
  GET_AVAILABILITY_TOOL_CONTRACT,
  SEARCH_SERVICES_TOOL_CONTRACT,
  STAGE_BOOKING_TOOL_CONTRACT,
} from "./bookingToolContracts";

export interface WebMcpToolDefinition extends WebMCP.ModelContextTool {
  name: BookingToolName;
  title: string;
  description: string;
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

export type ModelContextLike = Pick<WebMCP.ModelContext, "registerTool">;

export interface RegisterBookingToolsOptions {
  modelContext: ModelContextLike | undefined;
  store?: BookingStore;
  onDraftStaged?: (draft: BookingDraft) => void;
  registrationSignal?: AbortSignal;
}

export interface BookingToolRegistration {
  supported: boolean;
  registeredTools: BookingToolName[];
  dispose(): void;
}

const BRIDGE_COMPATIBILITY_SIGNAL = new AbortController().signal;

function abortError(): DOMException {
  return new DOMException("Tool execution was cancelled", "AbortError");
}

function assertExecutionActive(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function assertInputRecord(input: unknown): asserts input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Tool input must be an object");
  }

  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Tool input must be a plain object");
  }
}

function assertOnlyKeys(
  input: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const unexpectedKey = Reflect.ownKeys(input).find(
    (key) => typeof key !== "string" || !allowedKeys.includes(key),
  );
  if (unexpectedKey) {
    throw new TypeError(`Unexpected input property: ${String(unexpectedKey)}`);
  }
}

function readOwnDataProperty(
  input: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor)) {
    throw new TypeError(`${key} must be an own data property`);
  }
  return descriptor.value;
}

function createToolDefinitions(
  store: BookingStore,
  onDraftStaged: RegisterBookingToolsOptions["onDraftStaged"],
): WebMcpToolDefinition[] {
  return [
    {
      ...SEARCH_SERVICES_TOOL_CONTRACT,
      execute(input, options) {
        const signal = options?.signal ?? BRIDGE_COMPATIBILITY_SIGNAL;
        assertExecutionActive(signal);
        assertInputRecord(input);
        assertOnlyKeys(input, ["query"]);
        const query = Object.prototype.hasOwnProperty.call(input, "query")
          ? readOwnDataProperty(input, "query")
          : "";
        if (typeof query !== "string") {
          throw new TypeError("query must be a string");
        }
        const services = searchServices(query);
        assertExecutionActive(signal);
        return {
          count: services.length,
          services,
          source: "synthetic_catalog",
        };
      },
    },
    {
      ...GET_AVAILABILITY_TOOL_CONTRACT,
      execute(input, options) {
        const signal = options?.signal ?? BRIDGE_COMPATIBILITY_SIGNAL;
        assertExecutionActive(signal);
        assertInputRecord(input);
        assertOnlyKeys(input, ["serviceId"]);
        const availability = getAvailability({
          serviceId: readOwnDataProperty(input, "serviceId"),
        });
        assertExecutionActive(signal);
        return { ...availability, source: "synthetic_schedule" };
      },
    },
    {
      ...STAGE_BOOKING_TOOL_CONTRACT,
      execute(input, options) {
        const signal = options?.signal ?? BRIDGE_COMPATIBILITY_SIGNAL;
        assertExecutionActive(signal);
        assertInputRecord(input);
        assertOnlyKeys(input, ["serviceId", "date", "time"]);
        const validatedInput = {
          serviceId: readOwnDataProperty(input, "serviceId"),
          date: readOwnDataProperty(input, "date"),
          time: readOwnDataProperty(input, "time"),
        };
        const validatedDraft = stageBooking(validatedInput);
        assertExecutionActive(signal);
        onDraftStaged?.({ ...validatedDraft });
        assertExecutionActive(signal);
        const draft = store.stage(validatedInput);
        return {
          status: "draft_staged",
          visiblePostcondition: "booking_draft_updated",
          requiresHumanConfirmation: true,
          humanConfirmation: {
            surface: "visible-interface",
            method: "webauthn-user-presence",
            toolAvailable: false,
          },
          source: "synthetic_draft",
          draft: { ...draft },
        };
      },
    },
  ];
}

export async function registerBookingTools({
  modelContext,
  store = createBookingStore(),
  onDraftStaged,
  registrationSignal,
}: RegisterBookingToolsOptions): Promise<BookingToolRegistration> {
  if (
    !modelContext ||
    typeof (modelContext as Partial<ModelContextLike>).registerTool !== "function"
  ) {
    return {
      supported: false,
      registeredTools: [],
      dispose() {},
    };
  }

  const registrationController = new AbortController();
  const registeredTools: BookingToolName[] = [];
  const abortFromOwner = () => {
    registrationController.abort(
      registrationSignal?.reason ?? "registration-owner-disposed",
    );
  };

  if (registrationSignal?.aborted) {
    abortFromOwner();
  } else {
    registrationSignal?.addEventListener("abort", abortFromOwner, { once: true });
  }

  try {
    for (const tool of createToolDefinitions(store, onDraftStaged)) {
      assertExecutionActive(registrationController.signal);
      await modelContext.registerTool(tool, {
        signal: registrationController.signal,
      });
      assertExecutionActive(registrationController.signal);
      registeredTools.push(tool.name);
    }
  } catch (error) {
    registrationController.abort("partial-registration-failed");
    registrationSignal?.removeEventListener("abort", abortFromOwner);
    throw error;
  }

  return {
    supported: true,
    registeredTools: [...registeredTools],
    dispose() {
      registrationSignal?.removeEventListener("abort", abortFromOwner);
      registrationController.abort("booking-tools-disposed");
    },
  };
}

export { BOOKING_TOOL_NAMES };
