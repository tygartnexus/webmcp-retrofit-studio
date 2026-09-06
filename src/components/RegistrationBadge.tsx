import { CheckCircle2, CircleDashed } from "lucide-react";

/** Live registration state badge for the booking flow. */

export type RegistrationState =
  | "idle"
  | "registering"
  | "registered"
  | "unsupported"
  | "failed";

export function RegistrationBadge({ state }: { state: RegistrationState }) {
  const copy: Record<RegistrationState, string> = {
    idle: "Registration deferred to Validate",
    registering: "Registering 3 tools",
    registered: "3 live tools registered",
    unsupported: "Live discovery unavailable",
    failed: "Registration failed closed",
  };
  return (
    <span className={`registration-badge ${state}`}>
      {state === "registered" ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}
      {copy[state]}
    </span>
  );
}
