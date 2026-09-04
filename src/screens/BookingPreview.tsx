import { CheckCircle2, ClipboardCheck, Fingerprint, LockKeyhole } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAvailability,
  type BookingDraft,
  type ServiceId,
} from "../domain/booking";
import {
  PresenceUnavailableError,
  PresenceVerificationError,
  type HumanPresenceVerifier,
  type PresenceReceipt,
} from "../presence/humanPresence";

export type DraftSource = "tool" | "visible-ui";

export interface BookingPreviewProps {
  draft: BookingDraft | null;
  draftSource: DraftSource | null;
  presenceReceipt: PresenceReceipt | null;
  presenceVerifier: HumanPresenceVerifier;
  onStage: (input: { serviceId: ServiceId; date: string; time: string }) => void;
  onValuesChanged: () => void;
  onConfirmed: (receipt: PresenceReceipt) => void;
}

type CeremonyState =
  | { phase: "idle" }
  | { phase: "verifying" }
  | { phase: "failed"; message: string };

const DRAFT_CHANGED_MESSAGE =
  "The draft changed while presence was being verified. Review the new draft and confirm it again.";
const UNAVAILABLE_MESSAGE =
  "Presence verification is unavailable here. WebAuthn on a secure origin is required, so the draft stays unconfirmed.";

function describeFailure(error: unknown): string {
  if (error instanceof PresenceUnavailableError) return UNAVAILABLE_MESSAGE;
  if (error instanceof PresenceVerificationError) {
    switch (error.reason) {
      case "cancelled":
        return `${error.message}. The draft stays unconfirmed.`;
      case "insecure-context":
        return "Presence can only be verified on a secure origin. The draft stays unconfirmed.";
      case "presence-not-reported":
        return "The authenticator did not report a user gesture. The draft stays unconfirmed.";
      case "challenge-mismatch":
        return "The authenticator response did not match this request. The draft stays unconfirmed.";
      default:
        return `Presence could not be verified: ${error.message}. The draft stays unconfirmed.`;
    }
  }
  return "Presence could not be verified. The draft stays unconfirmed.";
}

export function describeReceipt(receipt: PresenceReceipt): string {
  const verified = receipt.userVerified ? "user verified" : "presence only";
  return `WebAuthn ${receipt.ceremony} · ${verified} · ${receipt.credentialIdSha256.slice(0, 12)} · ${receipt.verifiedAt.slice(11, 19)} UTC`;
}

function useDialogSync(open: boolean, dialogRef: React.RefObject<HTMLDialogElement | null>, focusRef: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      focusRef.current?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open, dialogRef, focusRef]);
}

export function BookingPreview({
  draft,
  draftSource,
  presenceReceipt,
  presenceVerifier,
  onStage,
  onValuesChanged,
  onConfirmed,
}: BookingPreviewProps) {
  const [serviceId, setServiceId] = useState<ServiceId>(draft?.serviceId ?? "consultation");
  const [date, setDate] = useState(draft?.date ?? "2026-09-03");
  const [time, setTime] = useState(draft?.time ?? "10:00");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [displayDraft, setDisplayDraft] = useState<BookingDraft | null>(draft);
  const [ceremony, setCeremony] = useState<CeremonyState>({ phase: "idle" });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const latestDraftId = useRef<string | null>(draft?.id ?? null);
  const latestDraft = useRef<BookingDraft | null>(draft);
  const verifying = useRef(false);
  const confirmTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelDialogRef = useRef<HTMLButtonElement>(null);
  const availability = useMemo(() => getAvailability({ serviceId }), [serviceId]);
  const dates = useMemo(
    () => [...new Set(availability.slots.map((slot) => slot.date))],
    [availability],
  );
  const times = availability.slots.filter((slot) => slot.date === date).map((slot) => slot.time);
  const matchesDraft =
    draft?.serviceId === serviceId && draft.date === date && draft.time === time;

  const syncToDraft = useCallback((next: BookingDraft, source: DraftSource | null) => {
    setServiceId(next.serviceId);
    setDate(next.date);
    setTime(next.time);
    setDisplayDraft(next);
    // An agent staging a draft opens the confirmation so the person's only
    // action is the gesture. Visible-UI staging keeps the explicit click.
    setDialogOpen(source === "tool");
  }, []);

  useEffect(() => {
    latestDraftId.current = draft?.id ?? null;
    latestDraft.current = draft;
    if (!draft) return;
    // While a gesture is in flight the dialog keeps showing the draft the
    // person is confirming; the new draft is applied once the ceremony settles.
    if (verifying.current) return;
    syncToDraft(draft, draftSource);
  }, [draft, draftSource, syncToDraft]);

  useDialogSync(dialogOpen, dialogRef, cancelDialogRef);

  const closeConfirmation = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    setDialogOpen(false);
    setCeremony({ phase: "idle" });
    confirmTriggerRef.current?.focus();
  };

  const changeService = (nextServiceId: ServiceId) => {
    const firstSlot = getAvailability({ serviceId: nextServiceId }).slots[0];
    setServiceId(nextServiceId);
    setDate(firstSlot.date);
    setTime(firstSlot.time);
    setDialogOpen(false);
    onValuesChanged();
  };

  const changeDate = (nextDate: string) => {
    const firstTime = availability.slots.find((slot) => slot.date === nextDate)?.time;
    setDate(nextDate);
    if (firstTime) setTime(firstTime);
    setDialogOpen(false);
    onValuesChanged();
  };

  const verifyAndConfirm = async () => {
    if (ceremony.phase === "verifying" || !draft || !matchesDraft) return;
    const subject = draft.id;
    setCeremony({ phase: "verifying" });
    verifying.current = true;
    try {
      const receipt = await presenceVerifier.verify(subject);
      if (receipt.subject !== subject || latestDraftId.current !== subject) {
        setCeremony({ phase: "failed", message: DRAFT_CHANGED_MESSAGE });
        return;
      }
      onConfirmed(receipt);
      closeConfirmation();
    } catch (error) {
      setCeremony({ phase: "failed", message: describeFailure(error) });
    } finally {
      verifying.current = false;
      const current = latestDraft.current;
      if (current && current.id !== subject) syncToDraft(current, "tool");
    }
  };

  const confirmedForDraft =
    presenceReceipt !== null && matchesDraft && presenceReceipt.subject === draft?.id;

  return (
    <section className="preview-card" aria-labelledby="preview-heading">
      <div className="preview-browser-bar">
        <span />
        <span />
        <span />
        <div>legacy-booking.test/preview</div>
      </div>
      <div className="booking-demo">
        <div className="booking-demo-heading">
          <span className="mini-brand">LB</span>
          <div>
            <p className="eyebrow">Synthetic service desk</p>
            <h2 id="preview-heading">Book a service</h2>
          </div>
        </div>
        <p className="preview-helper">
          An agent prepares the draft. You confirm it with one device gesture.
        </p>
        <label>
          Service
          <select
            aria-label="Service"
            onChange={(event) => changeService(event.target.value as ServiceId)}
            value={serviceId}
          >
            <option value="consultation">Consultation</option>
            <option value="installation">Installation</option>
            <option value="repair">Repair</option>
          </select>
        </label>
        <div className="field-row">
          <label>
            Date
            <select aria-label="Date" onChange={(event) => changeDate(event.target.value)} value={date}>
              {dates.map((availableDate) => (
                <option key={availableDate} value={availableDate}>
                  {availableDate}
                </option>
              ))}
            </select>
          </label>
          <label>
            Time
            <select
              aria-label="Time"
              onChange={(event) => {
                setTime(event.target.value);
                setDialogOpen(false);
                onValuesChanged();
              }}
              value={time}
            >
              {times.map((availableTime) => (
                <option key={availableTime} value={availableTime}>
                  {availableTime}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="draft-summary">
          <div>
            <span>Draft status</span>
            <strong>
              {matchesDraft
                ? draftSource === "tool"
                  ? "Staged by tool"
                  : "Staged in visible UI"
                : draft
                  ? "Changes not staged"
                  : "Fixture preview"}
            </strong>
          </div>
          <span className="draft-dot" />
        </div>
        <button
          className="stage-draft-button"
          onClick={() => onStage({ serviceId, date, time })}
          type="button"
        >
          <ClipboardCheck size={16} /> Stage selected draft
        </button>
        <button
          className="human-confirm-button"
          disabled={!matchesDraft}
          onClick={() => {
            setCeremony({ phase: "idle" });
            setDialogOpen(true);
          }}
          ref={confirmTriggerRef}
          type="button"
        >
          <LockKeyhole size={17} /> Confirm booking
        </button>
        {confirmedForDraft && presenceReceipt && (
          <p className="human-confirmed" role="status">
            <CheckCircle2 size={17} /> Confirmed with verified human presence
            <small>{describeReceipt(presenceReceipt)}</small>
          </p>
        )}
        <p className="human-boundary-copy">
          Not a WebMCP tool. Confirmation needs a device gesture no agent can perform.
        </p>
        <dialog
          aria-labelledby="confirm-dialog-heading"
          className="confirm-dialog"
          onCancel={(event) => {
            event.preventDefault();
            closeConfirmation();
          }}
          onClose={() => {
            setDialogOpen(false);
            setCeremony({ phase: "idle" });
            confirmTriggerRef.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeConfirmation();
            }
          }}
          ref={dialogRef}
        >
          {displayDraft && (ceremony.phase === "verifying" || matchesDraft) && (
            <>
              <h3 id="confirm-dialog-heading">Confirm staged booking</h3>
              <p>
                <strong>{displayDraft.serviceName}</strong>
                <span>
                  {displayDraft.date} at {displayDraft.time}
                </span>
              </p>
              <p className="presence-copy">
                <Fingerprint size={16} /> Touch, face, or PIN on this device confirms the draft.
              </p>
              {!presenceVerifier.available && (
                <p className="presence-error" role="alert">
                  {UNAVAILABLE_MESSAGE}
                </p>
              )}
              {ceremony.phase === "failed" && (
                <p className="presence-error" role="alert">
                  {ceremony.message}
                </p>
              )}
              <div>
                <button autoFocus onClick={closeConfirmation} ref={cancelDialogRef} type="button">
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={!presenceVerifier.available || ceremony.phase === "verifying"}
                  onClick={() => void verifyAndConfirm()}
                  type="button"
                >
                  {ceremony.phase === "verifying" ? "Waiting for your device" : "Confirm with passkey"}
                </button>
              </div>
            </>
          )}
        </dialog>
      </div>
    </section>
  );
}
