import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.BASE_PATH || "/padmd/";

export default defineConfig({
  base,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
  plugins: [
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
        background_color: "#101114",
        theme_color: "#101114",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
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
