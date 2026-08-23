/**
 * Sits on the assistant page and hands relayed events to it.
 *
 * A content script cannot set a variable the page can read, so presence is
 * announced the only way that crosses the isolated world: a message. The page
 * says hello, this replies, and that handshake is what "extension found" means.
 */
const announce = () =>
  window.postMessage(
    { source: "deflator-extension", event: { type: "status", connection: "live" }, sentAt: Date.now() },
    window.location.origin,
  );

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  if (ev.data?.source === "deflator-app" && ev.data.type === "hello") announce();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind !== "relay") return;
  window.postMessage(
    { source: "deflator-extension", event: msg.event, sentAt: msg.sentAt },
    window.location.origin,
  );
});

announce();
