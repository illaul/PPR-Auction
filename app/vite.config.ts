import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

/**
 * ESPN sends no CORS headers, so the browser can never call it directly. The
 * dev/preview server proxies instead: same origin to the page, real request on
 * the server side. That is what lets the app poll a draft with no extension.
 *
 * Private leagues need the two cookies ESPN sets for your own session. Put them
 * in app/.env.local — they are read here, on the server, and never reach the
 * page:
 *
 *   ESPN_S2=AEA...    (the espn_s2 cookie)
 *   SWID={xxxxxxxx-xxxx-...}
 */
const ESPN_ORIGIN = process.env.ESPN_ORIGIN ?? "https://lm-api-reads.fantasy.espn.com";

const espn: ProxyOptions = {
  target: ESPN_ORIGIN,
  changeOrigin: true,
  secure: true,
  rewrite: (path) => path.replace(/^\/espn/, ""),
  configure: (proxy) => {
    proxy.on("proxyReq", (proxyReq) => {
      const { ESPN_S2, SWID } = process.env;
      if (ESPN_S2 && SWID) proxyReq.setHeader("cookie", `espn_s2=${ESPN_S2}; SWID=${SWID}`);
      proxyReq.setHeader("accept", "application/json");
    });
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/espn": espn } },
  preview: { port: 4173, proxy: { "/espn": espn } },
  build: { outDir: "dist" },
});
