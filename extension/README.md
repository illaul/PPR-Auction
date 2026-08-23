# Deflator relay (Chrome, MV3)

Reads your ESPN auction draft room and relays each nomination, bid, and sale to
the assistant. **Read-only**: it observes the DOM and never clicks, bids, or
calls an ESPN endpoint. `Place bids` is listed in the popup as *never asked*
because the extension has no code path that could.

## Install

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → pick this
   folder.
2. Open your ESPN auction draft room in one tab and the assistant in another.
3. The assistant's setup screen shows **Extension found** once the handshake lands.

## How it moves

```
fantasy.espn.com tab            assistant tab
content-espn.js  ──chrome.runtime──►  background.js  ──tabs.sendMessage──►  content-bridge.js
   reads the DOM                        counts + routes                      window.postMessage
```

The page and the content script live in separate JavaScript worlds, so presence
is announced by handshake: the app posts `hello`, the bridge answers. Nothing is
stored, and nothing leaves the machine.

## The part that needs one pass on a live draft

ESPN publishes no API for the draft room, so `content-espn.js` reads class names
that are theirs to change. Each field is a **list** of selectors, first match
wins — repairing the relay means adding a selector, never rewriting logic.

To re-derive them during a mock draft, open the draft room console and run:

```js
window.__deflatorProbe()
```

It prints what each selector currently resolves to. Anything showing `null`
needs a new entry at the top of its list in `content-espn.js`.

Names are matched to the player pool by `app/src/state/names.ts`, which handles
suffixes (`Kyle Pitts` ↔ `Kyle Pitts Sr.`), punctuation (`Ja'Marr Chase`), and
defenses (`Texans`, `Houston D/ST`). A name it cannot match is **dropped rather
than guessed** — a wrong player at the wrong price is worse than a missed relay.
