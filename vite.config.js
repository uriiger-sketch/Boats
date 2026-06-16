import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the built asset URLs resolve correctly no matter what
  // subpath GitHub Pages serves the project site from (and survive a rename).
  base: "./",
  plugins: [react()],
});
