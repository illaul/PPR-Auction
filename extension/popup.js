const $ = (id) => document.getElementById(id);

chrome.runtime.sendMessage({ kind: "status" }, (res) => {
  const relayed = res?.relayed ?? 0;
  $("relayed").textContent = String(relayed);
  $("version").textContent = "v" + chrome.runtime.getManifest().version;
  if (relayed > 0) {
    $("status-card").classList.remove("off");
    $("dot").classList.remove("off");
    $("state").classList.remove("off");
    $("state").textContent = "Relaying";
    $("latency").textContent = "<1s";
  }
  if (res?.league) {
    $("league").textContent = res.league.name ?? "Draft room open";
    $("league-meta").textContent =
      `${res.league.teams ?? "?"} teams · $${res.league.budget ?? "?"} · ${res.league.scoring ?? "auction"}`;
  }
});

chrome.tabs.query({ url: ["https://fantasy.espn.com/football/*"] }, (tabs) => {
  if (tabs.length && $("league").textContent === "No draft room open") {
    $("league").textContent = tabs[0].title?.split(" - ")[0] ?? "Draft room open";
    $("league-meta").textContent = "Waiting for the first nomination.";
  }
});

$("open").addEventListener("click", () => {
  chrome.tabs.create({ url: "http://localhost:5173/" });
});
