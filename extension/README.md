# WebMCP Agent Console (extension shell)

The agent-side half of the retrofit story. The studio makes a page expose
tools through `document.modelContext`; this extension lets an agent, or a
person acting as one, discover and call those tools.

## What it does

- Installs a small clean-room registry as `document.modelContext` in
  browsers without native WebMCP, so retrofitted pages register their tools
  instead of skipping registration. When the browser has native support the
  registry mirrors native registrations (all four methods) and does not
  replace them. A frozen or unusual native object is left untouched.
- Lists the tools on the active tab with their read-only or writes marker.
- Calls a tool with JSON input and shows the result or the error.
- Warns before calling a tool that is not marked read-only. A retrofitted
  page stages such a change and asks a person to confirm it on the page; the
  console cannot confirm on their behalf, by design.

## Trust model, stated plainly

The tool list, descriptions, and hints are the page's own claims. A page
can declare a destructive tool and label it read-only, exactly as it could
with native WebMCP. The read-only warning protects against accidental calls,
not against a hostile page. Treat every tool as page-controlled.

The popup reaches the page's registry through
`chrome.scripting.executeScript` in the main world, a channel the page
cannot observe or answer. There is no DOM-event bus, so a page cannot race
or forge the console's requests and responses. What it can do is lie in its
own tool implementations, and nothing on the agent side can prevent that.

## What it does not do

- No language model, no automation loop, no network. It is a harness for
  discovery and invocation, and a test surface for the studio's exports.
- No interaction with sign-in, CAPTCHA, or any bot-detection surface.
- No storage. Nothing persists between popups.
- No input validation of its own. Tools validate their input; the studio's
  generated tools do so strictly.

## Scope of injection

`manifest.json` injects the shim on `http://localhost/*` and
`http://127.0.0.1/*` only, which covers the studio and local retrofits.
Widening `matches` to the open web is a deliberate decision to make later,
with the trust model above in mind, and it triggers Chrome's broad host
access warning.

## Files

| File | World | Role |
|---|---|---|
| `shim.js` | main | registry, request handler, native mirror; also loaded by the vitest suite |
| `main-world.js` | main | installs or mirrors `document.modelContext`; exposes the registry for the popup |
| `popup-logic.js` | popup | pure helpers, including the function injected into the page |
| `popup.html`, `popup.js` | popup | list and call tools |

## Load it

1. Open `chrome://extensions`, enable Developer mode.
2. Load unpacked and choose this `extension/` folder.
3. Open the studio (`npm run preview`, then `http://localhost:4175/`),
   scan a fixture, approve, and reach Preview. The registration badge reads
   registered because the shim is now `document.modelContext`.
4. Click the extension icon. The tools appear; pick one, adjust the input,
   call it.

## Tests

`tests/extensionShim.test.ts` covers the registry (registration rules,
abort-signal removal, duplicates, atomic provideContext), the request handler
(list, call, list failure, malformed, unknown), the native mirror (writable
and frozen hosts), `main-world.js` in both install and mirror modes, the
popup helpers, and the round trip of a studio-exported embed registering
into the shim.
