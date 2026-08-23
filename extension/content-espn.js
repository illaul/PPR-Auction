/**
 * Reads the ESPN auction draft room and relays what it sees.
 *
 * Read-only by construction: it observes the DOM and never dispatches a click,
 * a bid, or a network request. If ESPN changes its markup the relay goes quiet
 * rather than guessing — a wrong price is worse than no price.
 */
const SELECTORS = {
  playerName: [".AuctionBoard__PlayerName", ".player-column__athlete a", "[class*='nominatedPlayer'] .truncate"],
  playerMeta: [".AuctionBoard__PlayerMeta", ".player-column__position", "[class*='nominatedPlayer'] .player__meta"],
  currentBid: [".AuctionBoard__CurrentBid", "[class*='currentBid'] .currency", "[class*='auction'] [class*='bid-amount']"],
  highBidder: [".AuctionBoard__HighBidder", "[class*='highBidder']", "[class*='auction'] [class*='team-name']"],
  clock: [".AuctionBoard__Timer", "[class*='timer']", "[class*='auction'] [class*='countdown']"],
  nominatingTeam: [".AuctionBoard__NominatingTeam", "[class*='onTheClock'] [class*='team']"],
  soldBanner: [".AuctionBoard__Sold", "[class*='sold-banner']"],
  myTeamName: [".Nav__Secondary__Title", "[class*='userTeamName']"],
};

const pick = (keys) => {
  for (const sel of SELECTORS[keys]) {
    const el = document.querySelector(sel);
    if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
  }
  return null;
};

const dollars = (text) => {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

const seconds = (text) => {
  if (!text) return null;
  const m = text.match(/(\d+):(\d+)/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = text.match(/(\d+)/);
  return n ? Number(n[1]) : null;
};

const send = (event) => {
  chrome.runtime.sendMessage({ kind: "relay", event, sentAt: Date.now() }).catch(() => {});
};

let last = { name: null, bid: null, clock: null, bidder: null };

function read() {
  const name = pick("playerName");
  const bid = dollars(pick("currentBid"));
  const bidder = pick("highBidder");
  const clock = seconds(pick("clock"));

  if (!name) {
    if (last.name) { last = { name: null, bid: null, clock: null, bidder: null }; }
    return;
  }
  if (name !== last.name) {
    send({ type: "nomination", playerName: name, meta: pick("playerMeta"), bid: bid ?? 1, bidder });
  } else {
    if (bid !== null && bid !== last.bid) send({ type: "bid", bid, bidder });
    if (clock !== null && clock !== last.clock) send({ type: "clock", seconds: clock });
  }
  const sold = pick("soldBanner");
  if (sold && bid !== null) send({ type: "sold", playerName: name, price: bid, teamName: bidder ?? "" });
  last = { name, bid, clock, bidder };
}

const observer = new MutationObserver(() => read());
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
setInterval(read, 1000);
send({ type: "status", connection: "live" });

/** Console helper for repairing selectors against a live room. */
window.__deflatorProbe = () =>
  Object.fromEntries(Object.keys(SELECTORS).map((k) => [k, pick(k)]));
