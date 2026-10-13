import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/; CI sets VITE_BASE_PATH. Local dev stays at /.
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) {
            return "three-vendor";
          }
          if (id.includes("node_modules/plotly.js-dist-min")) {
            return "plotly-vendor";
          }
          if (id.includes("node_modules/mathjs")) {
            return "math-vendor";
          }
          return undefined;
        }
      }
    }
  }
});
