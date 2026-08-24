import { defineConfig, loadEnv, type ProxyOptions } from "vite";
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
 *   ESPN_S2=AEA...    (the espn_s2 cookie, pasted whole)
 *   SWID={xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}
 */
export default defineConfig(({ mode }) => {
  // An empty prefix is deliberate: loadEnv otherwise hands back only VITE_*
  // vars, and these two must never reach the client.
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const cookie = espnCookie(env.ESPN_S2, env.SWID);

  console.log(cookie
    ? "  ESPN cookies loaded — private leagues will work"
    : "  no ESPN cookies — public leagues only (add ESPN_S2 and SWID to app/.env.local)");

  const espn: ProxyOptions = {
    target: env.ESPN_ORIGIN ?? "https://lm-api-reads.fantasy.espn.com",
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/espn/, ""),
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq) => {
        if (cookie) proxyReq.setHeader("cookie", cookie);
        proxyReq.setHeader("accept", "application/json");
      });
    },
  };

  return {
    plugins: [react()],
    server: { port: 5173, proxy: { "/espn": espn } },
    preview: { port: 4173, proxy: { "/espn": espn } },
    build: { outDir: "dist" },
  };
});

/** Tolerates the ways these two values get pasted: quotes, spaces, missing braces. */
export function espnCookie(s2?: string, swid?: string): string | null {
  const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, "") ?? "";
  const espnS2 = clean(s2);
  let id = clean(swid);
  if (!espnS2 || !id) return null;
  if (!id.startsWith("{")) id = `{${id.replace(/^\{|\}$/g, "")}}`;
  return `espn_s2=${espnS2}; SWID=${id}`;
}
