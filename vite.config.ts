import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
	// NOTE: Relative base so that the build can be hosted from any sub directory (e.g. GitHub Pages)
	base: "./",
	plugins: [svelte()],
	define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString()) },
	worker: { format: "es" },
	build: { target: "es2022" },
});
