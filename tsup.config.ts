import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/init.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  target: "node18",
  platform: "node",
  external: [/^node:/, "@agstack/plugin-sdk"],
  treeshake: "recommended",
  shims: false,
  sourcemap: false,
  minify: false,
  splitting: false,
});
