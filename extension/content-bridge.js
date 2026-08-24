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
  if (ev.data?.source !== "deflator-app") return;

  if (ev.data.type === "hello") announce();

  if (ev.data.type === "refresh") {
    chrome.runtime.sendMessage({ kind: "fetchProjections", season: ev.data.season }, (res) => {
      const error = chrome.runtime.lastError?.message ?? res?.error;
      window.postMessage(
        { source: "deflator-extension", type: "projections", players: res?.players, error },
        window.location.origin,
      );
    });
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind !== "relay") return;
  window.postMessage(
    { source: "deflator-extension", event: msg.event, sentAt: msg.sentAt },
    window.location.origin,
  );
});

announce();
