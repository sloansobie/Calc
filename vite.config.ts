import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  // MathLive 0.109.2 leaves its global focus reference pointing at a disposed
  // model. Clear it before disposal so rapid Enter handoffs cannot serialize it.
  resolve: {
    alias: [
      {
        find: /^mathlive$/,
        replacement: decodeURIComponent(
          new URL("./node_modules/mathlive/mathlive.mjs", import.meta.url)
            .pathname,
        ),
      },
    ],
  },
  optimizeDeps: { exclude: ["mathlive"] },
  plugins: [
    react(),
    {
      name: "mathlive-disposed-focus-fix",
      enforce: "pre",
      transform(code, id) {
        if (!id.endsWith("/mathlive/mathlive.mjs")) return;
        const needle =
          "dispose() {\n    if (!isValidMathfield(this)) return;\n    l10n.unsubscribe";
        if (!code.includes(needle))
          throw new Error(
            "Review MathLive focus fix after updating the dependency",
          );
        return code.replace(
          needle,
          "dispose() {\n    if (!isValidMathfield(this)) return;\n    if (__Mathfield._globallyFocusedMathfield === this) __Mathfield._globallyFocusedMathfield = void 0;\n    this.blurred = true;\n    l10n.unsubscribe",
        );
      },
    },
  ],
});
