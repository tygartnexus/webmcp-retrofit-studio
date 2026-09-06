import { Blocks, HelpCircle } from "lucide-react";

/** Top bar with the brand lockup and fixture name. */

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          <Blocks size={23} strokeWidth={2.2} />
        </span>
        <div>
          <span className="brand-name">WebMCP Retrofit Studio</span>
          <span className="brand-divider" aria-hidden="true" />
          <span className="fixture-name">Legacy Booking Demo</span>
        </div>
      </div>
      <a
        className="quiet-button"
        href="https://learn.chatgpt.com/docs/webmcp"
        rel="noreferrer"
        target="_blank"
      >
        <HelpCircle size={17} />
        Help
      </a>
    </header>
  );
}
