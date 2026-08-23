/** Routes draft-room events to any open assistant tab, and keeps a small count for the popup. */
const APP_MATCH = ["http://localhost:5173/*", "http://localhost:4173/*"];
let relayed = 0;
let league = null;

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg?.kind === "relay") {
    relayed += 1;
    chrome.tabs.query({ url: APP_MATCH }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { kind: "relay", event: msg.event, sentAt: msg.sentAt }).catch(() => {});
      }
    });
    respond?.({ ok: true });
    return true;
  }
  if (msg?.kind === "league") { league = msg.league; respond?.({ ok: true }); return true; }
  if (msg?.kind === "status") { respond?.({ relayed, league, from: sender?.tab?.id ?? null }); return true; }
});
