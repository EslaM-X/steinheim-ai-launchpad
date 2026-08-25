// Shared engine for the sync layer. Zero dependencies on purpose: this runs in
// CI before npm ci even matters and must never break because a dependency moved.
//
// The premise: code is the truth. Everything downstream — generated API docs,
// the table inventory, the workflow cross-checks — is derived from it here, so
// "the docs got stale" becomes impossible instead of merely discouraged.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");

const ROUTES_DIR = join(ROOT, "src", "routes", "api", "public");
const WORKFLOWS_DIR = join(ROOT, "infra", "n8n", "workflows");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

/** Endpoints allowed to have no consumer yet, with the reason why. */
const ALLOWLIST_PATH = join(ROOT, "scripts", "sync", "endpoints-allowlist.json");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Every public endpoint, straight from the route files. The path comes from
 * createFileRoute's argument — the same string TanStack itself keys on — and
 * methods from the handler object, so nothing can be registered without being
 * seen here.
 */
export function scanRoutes() {
  return walk(ROUTES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((file) => {
      const text = readFileSync(file, "utf8");

      const pathMatch = text.match(/createFileRoute\(\s*"([^"]+)"/);
      if (!pathMatch) throw new Error(`No createFileRoute path in ${file}`);

      const methods = [
        ...new Set(
          [...text.matchAll(/^\s+(GET|POST|PUT|PATCH|DELETE):\s*(?:async\s*)?\(/gm)].map(
            (m) => m[1],
          ),
        ),
      ];
      if (methods.length === 0) throw new Error(`No HTTP handlers in ${file}`);

      // First sentence of the JSDoc attached to createFileRoute becomes the
      // doc-table description. Attached, not merely first: helper classes
      // above the route carry their own comments (generate-today's
      // SkipNotification taught us that).
      const routeAt = text.indexOf("createFileRoute(");
      const before = text.slice(0, routeAt);
      const jsdoc = [...before.matchAll(/\/\*\*([\s\S]*?)\*\//g)].pop();
      const firstSentence = jsdoc
        ? jsdoc[1]
            .split("\n")
            .map((line) => line.replace(/^\s*\*s?/, "").trim())
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .split(/(?<=\.)\s/)[0]
        : "";

      const channel = pathMatch[1].startsWith("/api/public/automation")
        ? { header: "x-automation-secret", plane: "n8n" }
        : pathMatch[1].startsWith("/api/public/creative")
          ? { header: "x-worker-secret", plane: "GPU worker" }
          : { header: "x-telegram-bot-api-secret-token", plane: "Telegram" };

      return {
        path: pathMatch[1],
        methods,
        channel,
        description: firstSentence,
        file: file.slice(ROOT.length + 1),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function collectApiPaths(value, into) {
  if (typeof value === "string") {
    for (const m of value.matchAll(/\/api\/public\/[a-z0-9/_-]*/g)) into.add(m[0]);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectApiPaths(v, into));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectApiPaths(v, into));
  }
}

/**
 * Which app endpoints each n8n workflow template calls. Only the templates are
 * scanned; ready/ copies hold real URLs and would just duplicate the findings.
 */
export function scanWorkflows() {
  return readdirSync(WORKFLOWS_DIR)
    .filter((name) => /^W\d+.*\.json$/.test(name))
    .map((name) => {
      const json = JSON.parse(readFileSync(join(WORKFLOWS_DIR, name), "utf8"));
      const paths = new Set();
      for (const node of json.nodes ?? []) collectApiPaths(node.parameters?.url ?? "", paths);
      return { name, label: json.name ?? name, calls: [...paths].sort() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every place outside the workflows that references an endpoint: the smoke
 * script, the runbooks, the README. `${BASE}/x` in the smoke script resolves
 * against /api/public/automation, which the generic regex cannot see.
 */
export function scanConsumerRefs() {
  // The generated docs are excluded: they restate every endpoint path, so
  // counting them as consumers would let an endpoint "cover itself" and hide
  // real drift.
  const generated = new Set(["api.md", "schema.md"]);
  const sources = [
    "scripts/smoke-automation.sh",
    "README.md",
    ...walk(join(ROOT, "docs"))
      .filter((f) => !generated.has(f.split(/[\\/]/).pop()))
      .map((f) => f.slice(ROOT.length + 1).replaceAll("\\", "/")),
  ];
  const refs = new Map();
  for (const source of sources.filter((f) => f.endsWith(".md") || f.endsWith(".sh"))) {
    const text = readFileSync(join(ROOT, source), "utf8");
    const found = new Set([
      ...text.matchAll(/\/api\/public\/[a-z0-9/_-]*/g).map((m) => m[0]),
      ...text.matchAll(/\$\{BASE\}\/([a-z0-9/_-]+)/g).map((m) => `/api/public/automation/${m[1]}`),
    ]);
    for (const p of found) if (p.length > "/api/public/".length + 2) refs.set(p, source);
  }
  refs.set("/api/public/telegram/webhook", "Telegram webhook configuration");
  return refs;
}

function loadAllowlist() {
  try {
    return JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Tables and the migration that introduced them. Regex over our own SQL is
 * enough — every CREATE TABLE in this repo is plain and schema-qualified or
 * public by default.
 */
export function scanTables() {
  const tables = new Map();
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi,
    )) {
      if (!tables.has(m[1])) tables.set(m[1], file);
    }
  }
  return [...tables.entries()]
    .map(([table, introducedIn]) => ({ table, introducedIn }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

/**
 * Cross-checks between layers. Returns human-readable violations; an empty
 * array means every layer agrees with the code.
 */
export function runChecks() {
  const seen = new Set();
  const problems = [];
  const push = (message) => {
    if (!seen.has(message)) {
      seen.add(message);
      problems.push(message);
    }
  };

  const routes = scanRoutes();
  const routePaths = new Set(routes.map((r) => r.path));
  const workflows = scanWorkflows();
  const consumerRefs = scanConsumerRefs();
  const allowlist = loadAllowlist();

  // A workflow calling an endpoint that does not exist is how an automation
  // fails at 09:00 Cairo time instead of at review time.
  for (const wf of workflows) {
    for (const called of wf.calls) {
      if (!routePaths.has(called)) {
        push(`${wf.name} calls ${called} — no such route under src/routes/api/public`);
      }
    }
  }

  // An endpoint nothing consumes is either a missing workflow (drift) or dead
  // surface area pretending to be a feature. The allowlist says which and why;
  // entries there are still listed in the generated docs, visibly.
  const covered = new Set();
  const refSources = new Map(consumerRefs);
  for (const wf of workflows) {
    if (wf.calls.length === 0) continue;
    refSources.set(wf.name, wf.calls.join(" "));
    for (const called of wf.calls) {
      if (routePaths.has(called)) covered.add(called);
    }
  }
  for (const refPath of refSources.keys()) {
    for (const route of routes) {
      if (
        route.path === refPath ||
        (refPath.endsWith("*") && route.path.startsWith(refPath.slice(0, -1)))
      ) {
        covered.add(route.path);
      }
    }
  }
  for (const route of routes) {
    if (!covered.has(route.path) && !allowlist[route.path]) {
      push(
        `${route.path} has no consumer — no workflow, smoke test or doc references it` +
          ` (add one, or justify it in scripts/sync/endpoints-allowlist.json)`,
      );
    }
  }

  // Compose variables that exist in neither example file are secrets someone
  // has to guess; that check runs per compose directory.
  for (const [compose, example] of [
    ["infra/selfhost/docker-compose.yml", ".env.selfhost.example"],
    ["infra/n8n/docker-compose.yml", "infra/n8n/.env.example"],
  ]) {
    const composeText = readFileSync(join(ROOT, compose), "utf8");
    const exampleText = readFileSync(join(ROOT, example), "utf8");
    const documented = new Set(
      [...exampleText.matchAll(/^\s*#?\s*([A-Z0-9_]+)=/gm)].map((m) => m[1]),
    );
    for (const m of composeText.matchAll(/\$\{([A-Z0-9_]+)(?::-[^}]*)?\}/g)) {
      if (!documented.has(m[1])) {
        push(`${compose} uses \${${m[1]}} — not documented in ${example}`);
      }
    }
  }

  return { routes, workflows, consumerRefs, allowlist, problems };
}
