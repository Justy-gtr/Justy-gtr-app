import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Vier Versuche, dazwischen 5, 15 und 30 Sekunden. */
export const PUSH_ATTEMPTS = 4;
export const BACKOFF_SECONDS = [5, 15, 30];

const DATA_FILES = [
  "data/prices.json",
  "data/alerts.json",
  "data/meta.json",
  "data/seasonality.json",
  "data/moonshots.json"
];

export function backoffSeconds(attempt) {
  const index = Math.max(0, attempt - 1);
  return BACKOFF_SECONDS[Math.min(index, BACKOFF_SECONDS.length - 1)];
}

function run(args, { inherit = false, ok = false } = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    env: { ...process.env, GIT_EDITOR: "true" },
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0 && !ok) {
    const detail = `${result.stderr || ""}${result.stdout || ""}`.trim();
    throw new Error(detail || `git ${args.join(" ")} endete mit ${result.status}`);
  }
  return result;
}

function unmerged() {
  const result = run(["diff", "--name-only", "--diff-filter=U"], { ok: true });
  return String(result.stdout || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * Rebase onto origin/branch.
 * A conflict in data/ keeps the files from this run: during a rebase,
 * `--theirs` is the commit being replayed.
 * Returns "ok" when the branch can be pushed, or "regenerate".
 */
export function rebaseKeepingGeneratedData(branch = "main") {
  const pulled = run(["pull", "--rebase", "origin", branch], { inherit: true, ok: true });
  if (pulled.status === 0) return "ok";
  const kept = run(["checkout", "--theirs", "--", "data"], { inherit: true, ok: true });
  if (kept.status !== 0) {
    run(["rebase", "--abort"], { inherit: true, ok: true });
    return "regenerate";
  }
  run(["add", "--", "data"], { inherit: true, ok: true });
  const left = unmerged();
  if (left.length) {
    console.log(`Konflikt außerhalb von data/: ${left.join(", ")}`);
    run(["rebase", "--abort"], { inherit: true, ok: true });
    return "regenerate";
  }
  const empty = run(["diff", "--cached", "--quiet"], { ok: true });
  const continued = empty.status === 0
    ? run(["rebase", "--skip"], { inherit: true, ok: true })
    : run(["rebase", "--continue"], { inherit: true, ok: true });
  if (continued.status !== 0) {
    run(["rebase", "--abort"], { inherit: true, ok: true });
    return "regenerate";
  }
  return "ok";
}

function regenerateOntoMain(branch, command) {
  run(["fetch", "origin", branch], { inherit: true });
  run(["reset", "--hard", `origin/${branch}`], { inherit: true });
  const generated = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env
  });
  if (generated.status !== 0) return false;
  run(["add", "--", ...DATA_FILES], { inherit: true, ok: true });
  const quiet = run(["diff", "--cached", "--quiet"], { ok: true });
  if (quiet.status === 0) return true;
  run(["commit", "-m", "Kurse aktualisiert"], { inherit: true });
  return true;
}

function ensureHistory(branch) {
  const shallow = run(["rev-parse", "--is-shallow-repository"], { ok: true });
  if (String(shallow.stdout || "").trim() !== "true") return;
  const full = run(["fetch", "--unshallow", "origin"], { inherit: true, ok: true });
  if (full.status !== 0) run(["fetch", "--deepen=200", "origin", branch], { inherit: true, ok: true });
}

export async function pushMain({
  branch = "main",
  attempts = PUSH_ATTEMPTS,
  regenerate = process.env.JGTR_REGENERATE || "",
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  run(["fetch", "origin", branch], { inherit: true, ok: true });
  ensureHistory(branch);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const pushed = run(["push", "origin", `HEAD:${branch}`], { inherit: true, ok: true });
    if (pushed.status === 0) return true;
    console.log(`Push Versuch ${attempt} abgelehnt.`);
    if (attempt === attempts) return false;
    const wait = backoffSeconds(attempt);
    console.log(`Nächster Versuch in ${wait}s.`);
    await sleep(wait * 1000);
    const outcome = rebaseKeepingGeneratedData(branch);
    if (outcome === "regenerate") {
      console.log("data/ wird auf main neu erzeugt.");
      if (!regenerate || !regenerateOntoMain(branch, regenerate)) return false;
    }
  }
  return false;
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  pushMain().then((ok) => {
    if (!ok) process.exitCode = 1;
  }).catch((error) => {
    console.log(error.stack || error.message);
    process.exitCode = 1;
  });
}
