#!/usr/bin/env node
// Fails when app code hard-codes colours instead of using theme tokens, so a tweakcn theme
// pasted into packages/ui/src/styles/globals.css restyles the whole UI. See docs/FRONTEND_PLAN.md.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));

// Data colours that reproduce a source visualization's colorbar, plus generated files.
const EXEMPT = [
  "lib/mock/",
  "lib/colormap.ts",
  "features/player/legend.tsx",
  "routeTree.gen.ts",
  "env.ts",
];

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
const RULES = [
  { name: "hex colour", re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: "colour function", re: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/ },
  { name: "Tailwind palette colour", re: new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|decoration|accent|caret|divide|placeholder)-(?:${PALETTE})(?:-\\d{2,3})?\\b`) },
  { name: "arbitrary colour value", re: /-\[(?:#|rgb|hsl|oklch|color:)/ },
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const problems = [];
for (const file of walk(root)) {
  if (!/\.(tsx?|css)$/.test(file)) continue;
  const rel = relative(root, file).split(sep).join("/");
  if (EXEMPT.some((e) => rel === e || rel.startsWith(e))) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.re.test(line)) problems.push(`src/${rel}:${i + 1}  ${rule.name}: ${line.trim().slice(0, 120)}`);
      }
    });
}

if (problems.length) {
  console.error(`Theme token check failed (${problems.length}). Use semantic tokens such as bg-primary or text-muted-foreground:\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log("Theme token check passed: no hard-coded colours in app code.");
