import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type PluginOption } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Plugin order matters: tailwind and path resolution first, then TanStack Start,
 * then nitro (build only), then React last.
 */
export default defineConfig(async ({ command, mode }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Keep server-only modules out of the browser bundle at build time rather
      // than discovering the leak in production.
      importProtection: {
        behavior: "error",
        client: {
          // `**/server/**` alone does not cover the `*.server.ts` convention this
          // codebase actually uses, which is where every secret lives.
          files: ["**/server/**", "**/*.server.ts", "**/*.server.tsx"],
          specifiers: ["server-only"],
        },
      },
    }),
  ];

  if (command === "build") {
    // Nitro detects the deployment target from the CI environment, so a Vercel
    // build selects the Vercel preset on its own. Override with NITRO_PRESET
    // when building for a different target; a local build produces a Node server.
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({}));
  }

  plugins.push(viteReact());

  // Make VITE_* values available to the server bundle too, not just the browser.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  return {
    define,
    server: { port: 8080 },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      // A second copy of any of these breaks at runtime rather than at build:
      // React duplicates break hooks, and a duplicated TanStack Start core gets
      // split into two chunks that import each other, so a top-level call runs
      // before the binding it needs is initialised.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
        "@tanstack/react-router",
        "@tanstack/router-core",
        "@tanstack/react-start",
        "@tanstack/start-client-core",
        "@tanstack/start-server-core",
        "@tanstack/history",
        "@tanstack/store",
        "@tanstack/react-store",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    plugins,
  };
});
