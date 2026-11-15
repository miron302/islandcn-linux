import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Two pages: the island overlay and the settings window. Relative base so file:// loads work.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(__dirname, "index.html"), settings: resolve(__dirname, "settings.html") } },
  },
});
