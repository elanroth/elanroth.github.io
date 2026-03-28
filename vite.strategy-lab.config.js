import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "strategy-lab"),
  plugins: [react()],
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
