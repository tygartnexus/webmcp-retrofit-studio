import {
  Check,
  ChevronRight,
  Eye,
  FileCheck2,
  Search,
  ShieldCheck,
  Sparkles,
  TestTube2,
} from "lucide-react";

/** The five-step rail and the Screen union it navigates. */

export type Screen = "scan" | "candidates" | "preview" | "validate" | "export";

export const STEPS = [
  { id: "scan", label: "Scan", icon: Search },
  { id: "candidates", label: "Candidates", icon: Sparkles },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "validate", label: "Validate", icon: TestTube2 },
  { id: "export", label: "Export", icon: FileCheck2 },
] as const;

export function StepRail({
  screen,
  scanComplete,
  approved,
  previewReady,
  validated,
  onNavigate,
}: {
  screen: Screen;
  scanComplete: boolean;
  approved: boolean;
  previewReady: boolean;
  validated: boolean;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <aside className="step-rail" aria-label="Retrofit progress">
      <p className="eyebrow rail-eyebrow">Retrofit flow</p>
      <nav>
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.id === screen;
          const isComplete =
            (step.id === "scan" && scanComplete) ||
            (step.id === "candidates" && approved) ||
            (step.id === "preview" && previewReady) ||
            (step.id === "validate" && validated);
          const canNavigate =
            step.id === "scan" ||
            (step.id === "candidates" && scanComplete) ||
            (step.id === "preview" && approved) ||
            (step.id === "validate" && previewReady) ||
            (step.id === "export" && validated);
          const disabled = !canNavigate;
          return (
            <button
              className={`step-link${isActive ? " is-active" : ""}`}
              disabled={disabled}
              key={step.id}
              onClick={() => onNavigate(step.id)}
              type="button"
            >
              <span className={`step-index${isComplete ? " is-complete" : ""}`}>
                {isComplete ? <Check size={14} /> : index + 1}
              </span>
              <Icon size={17} />
              <span>{step.label}</span>
              {isActive && <ChevronRight className="step-chevron" size={16} />}
            </button>
          );
        })}
      </nav>
      <div className="rail-note">
        <ShieldCheck size={18} />
        <div>
          <strong>Owned fixture only</strong>
          <span>No credentials or live bookings.</span>
        </div>
      </div>
    </aside>
  );
}
