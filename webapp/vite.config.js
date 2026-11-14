import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.BASE_PATH || "/padmd/";
const analyticsToken = process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim();

function cloudflareWebAnalytics() {
  return {
    name: "moyo-cloudflare-web-analytics",
    transformIndexHtml() {
      if (!analyticsToken) return [];

      return [
        {
          tag: "script",
          attrs: {
            defer: true,
            src: "https://static.cloudflareinsights.com/beacon.min.js",
            "data-cf-beacon": JSON.stringify({ token: analyticsToken }),
          },
          injectTo: "body",
        },
      ];
    },
  };
}

export default defineConfig({
  base,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
  plugins: [
    cloudflareWebAnalytics(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "THIRD_PARTY_NOTICES.md"],
      manifest: {
        name: "Moyo 墨页 · Markdown 编辑器",
        short_name: "Moyo",
        description: "适合平板与手机的本地 Markdown 阅读与编辑工具",
        lang: "zh-CN",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "any",
        background_color: "#fff9f0",
        theme_color: "#fff9f0",
        icons: [
          {
            src: "icon-192.png?v=3",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png?v=3",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png?v=3",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
});
