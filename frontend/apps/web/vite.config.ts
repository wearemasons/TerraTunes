import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Runtime switches read by src/lib/api/source.ts. Taken from .env files or the process environment
// (dev.mjs sets them), and injected explicitly so they work in dev and build alike.
const CLIENT_VARS = ["VITE_API_URL", "VITE_STATIC_MODE"] as const;

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "VITE_");
  const define = Object.fromEntries(
    CLIENT_VARS.map((key) => [`import.meta.env.${key}`, JSON.stringify(process.env[key] ?? fileEnv[key] ?? "")]),
  );

  return {
    define,
    server: {
      port: 3000,
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      varlockVitePlugin({ ssrInjectMode: "auto-load" }),
      tailwindcss(),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
    ],
  };
});
