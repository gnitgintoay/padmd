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
      includeAssets: ["icon.svg", "THIRD_PARTY_NOTICES.md"],
      manifest: {
        name: "PadMD Markdown 编辑器",
        short_name: "PadMD",
        description: "适合平板的本地 Markdown 阅读与编辑工具",
        lang: "zh-CN",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "any",
        background_color: "#101114",
        theme_color: "#101114",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
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
