/**
 * Where the ESPN auction draft room keeps each thing.
 *
 * ESPN ships no stable API for the live draft room, and these class names are
 * theirs to change. Every selector below is a list: the first one that matches
 * wins, so adding a new one is how you repair the relay without touching logic.
 *
 * To re-derive them: open the draft room, run `window.__deflatorProbe()` in the
 * console, and it prints what each selector currently resolves to.
 */
export const SELECTORS = {
  playerName: [".AuctionBoard__PlayerName", ".player-column__athlete a", "[class*='nominatedPlayer'] .truncate"],
  playerMeta: [".AuctionBoard__PlayerMeta", ".player-column__position", "[class*='nominatedPlayer'] .player__meta"],
  currentBid: [".AuctionBoard__CurrentBid", "[class*='currentBid'] .currency", "[class*='auction'] [class*='bid-amount']"],
  highBidder: [".AuctionBoard__HighBidder", "[class*='highBidder']", "[class*='auction'] [class*='team-name']"],
  clock: [".AuctionBoard__Timer", "[class*='timer']", "[class*='auction'] [class*='countdown']"],
  nominatingTeam: [".AuctionBoard__NominatingTeam", "[class*='onTheClock'] [class*='team']"],
  soldBanner: [".AuctionBoard__Sold", "[class*='sold-banner']"],
  myTeamName: [".Nav__Secondary__Title", "[class*='userTeamName']"],
};
