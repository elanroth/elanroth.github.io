import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { strategyLabRunApiPlugin } from "./strategy-lab/runApiPlugin.js";

export default defineConfig({
  root: path.resolve(__dirname, "strategy-lab"),
  plugins: [react(), strategyLabRunApiPlugin()],
  base: "/",
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    outDir: path.resolve(__dirname, "build-strategy-lab"),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    open: true,
  },
});
