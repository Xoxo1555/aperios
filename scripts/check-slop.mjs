#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".opencode",
  "ECC",
  "build",
  "dist",
  "node_modules",
  "out",
  "public/uploads",
  "skills",
  "storage",
]);

const IGNORED_FILES = new Set([
  "AGENTS.md",
  "next-env.d.ts",
  "package-lock.json",
  "pnpm-lock.yaml",
  "scripts/check-slop.mjs",
  "tsconfig.tsbuildinfo",
  "yarn.lock",
]);

const LINT_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const PROSE_EXTENSIONS = new Set([".adoc", ".md", ".mdx", ".rst", ".txt"]);
const HASH_COMMENT_EXTENSIONS = new Set([".py", ".sh", ".yaml", ".yml"]);
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

const BANNED = [
  ["delve", /\bdelv(e|es|ed|ing)\b/i],
  ["tapestry", /\btapestr(y|ies)\b/i],
  ["testament", /\btestament(s)?\b/i],
  ["bustling", /\bbustling\b/i],
  ["paradigm", /\bparadigm(s|atic)?\b/i],
  ["furthermore", /\bfurthermore\b/i],
  ["moreover", /\bmoreover\b/i],
  ["crucial", /\bcrucial(ly)?\b/i],
  ["vital", /\bvital(ly|ity)?\b/i],
  ["essential", /\bessential(ly)?\b/i],
];

function git(args) {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function normalize(file) {
  return file.replaceAll("\\", "/");
}

function isIgnored(file) {
  const rel = normalize(file);
  if (IGNORED_FILES.has(rel)) return true;
  const parts = rel.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    const partial = parts.slice(0, index + 1).join("/");
    if (IGNORED_DIRS.has(partial)) return true;
  }
  return false;
}

function stagedFiles() {
  return git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    .split(/\r?\n/)
    .filter(Boolean);
}

function allFiles() {
  return git(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter(Boolean);
}

function lintFiles(files) {
  const targets = files.filter((file) => {
    if (isIgnored(file)) return false;
    if (!LINT_EXTENSIONS.has(path.extname(file).toLowerCase())) return false;
    return existsSync(path.join(ROOT, file));
  });

  if (targets.length === 0) return true;

  const eslint = path.join(ROOT, "node_modules", "eslint", "bin", "eslint.js");
  if (!existsSync(eslint)) {
    console.error("[slop] node_modules/eslint introuvable. Lance npm install.");
    return false;
  }

  const result = spawnSync(process.execPath, [eslint, ...targets], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`[slop] ESLint a rejeté ${targets.length} fichier(s) modifié(s).`);
    return false;
  }
  return true;
}

function extractProse(file, line) {
  const ext = path.extname(file).toLowerCase();
  if (PROSE_EXTENSIONS.has(ext)) return line.replace(/`[^`]*`/g, " ");

  const chunks = [];
  for (const match of line.matchAll(/\/\*(.*?)\*\//g)) chunks.push(match[1]);
  for (const match of line.matchAll(/<!--(.*?)-->/g)) chunks.push(match[1]);

  const slash = line.match(/(?:^|[^:])\/\/(.*)$/);
  if (slash) chunks.push(slash[1]);

  const star = line.match(/^\s*\*\s?(.*)$/);
  if (star) chunks.push(star[1]);

  if (HASH_COMMENT_EXTENSIONS.has(ext)) {
    const hash = line.match(/^\s*#\s?(.*)$/);
    if (hash) chunks.push(hash[1]);
  }

  if (ext === ".sql") {
    const sql = line.match(/^\s*--\s?(.*)$/);
    if (sql) chunks.push(sql[1]);
  }

  return chunks.join(" ");
}

function scanLine(file, line, lineNumber, violations) {
  const prose = extractProse(file, line);
  if (!prose) return;

  for (const [word, pattern] of BANNED) {
    if (pattern.test(prose)) {
      violations.push({
        file,
        line: lineNumber,
        word,
        excerpt: prose.trim().slice(0, 140),
      });
    }
  }
}

function scanPlainText(label, text, violations) {
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [word, pattern] of BANNED) {
      if (pattern.test(line)) {
        violations.push({
          file: label,
          line: index + 1,
          word,
          excerpt: line.trim().slice(0, 140),
        });
      }
    }
  });
}

function scanStagedDiff(violations) {
  const diff = git(["diff", "--cached", "--unified=0", "--diff-filter=ACMR", "--no-color"]);
  let currentFile = null;
  let newLine = 0;

  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith("+++ b/")) {
      currentFile = raw.slice("+++ b/".length);
      continue;
    }
    if (raw.startsWith("@@")) {
      const match = raw.match(/\+(\d+)(?:,\d+)?\s@@/);
      newLine = match ? Number.parseInt(match[1], 10) : 0;
      continue;
    }
    if (!currentFile || isIgnored(currentFile)) continue;
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      scanLine(currentFile, raw.slice(1), newLine, violations);
      newLine += 1;
    }
  }
}

function scanAllFiles(files, violations) {
  for (const file of files) {
    if (isIgnored(file)) continue;
    const absolute = path.join(ROOT, file);
    if (!existsSync(absolute)) continue;

    const buffer = readFileSync(absolute);
    if (buffer.length > MAX_SCAN_BYTES || buffer.includes(0)) continue;

    const isProse = PROSE_EXTENSIONS.has(path.extname(file).toLowerCase());
    const lines = buffer.toString("utf8").split(/\r?\n/);
    let inFence = false;

    lines.forEach((line, index) => {
      if (isProse && /^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;
      scanLine(file, line, index + 1, violations);
    });
  }
}

function installHook(force) {
  const hooksDir = path.resolve(ROOT, git(["rev-parse", "--git-path", "hooks"]).trim());
  const hooks = [
    {
      name: "pre-commit",
      body: 'exec node "$ROOT/scripts/check-slop.mjs" --staged',
    },
    {
      name: "commit-msg",
      body: 'exec node "$ROOT/scripts/check-slop.mjs" --message "$1"',
    },
  ];

  for (const hook of hooks) {
    const hookPath = path.join(hooksDir, hook.name);
    if (existsSync(hookPath) && !force) {
      console.error(`[slop] ${hookPath} existe déjà. Utilise --force pour le remplacer.`);
      return false;
    }
  }

  for (const hook of hooks) {
    const hookPath = path.join(hooksDir, hook.name);
    const content = [
      "#!/bin/sh",
      "set -e",
      'ROOT="$(git rev-parse --show-toplevel)"',
      hook.body,
      "",
    ].join("\n");

    writeFileSync(hookPath, content, "utf8");
    try {
      chmodSync(hookPath, 0o755);
    } catch {
      // NTFS ignore le bit exécutable ; Git for Windows exécute quand même le hook.
    }
    console.log(`[slop] Hook installé : ${hookPath}`);
  }

  return true;
}

function reportViolations(violations) {
  if (violations.length === 0) return;
  console.error(`[slop] ${violations.length} violation(s) de la liste AGENTS.md :`);
  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line} → "${violation.word}" : ${violation.excerpt}`
    );
  }
  console.error("[slop] Reformule ou retire ces termes avant de committer.");
}

function parseArgs(argv) {
  const messageIndex = argv.indexOf("--message");
  return {
    all: argv.includes("--all"),
    force: argv.includes("--force"),
    installHook: argv.includes("--install-hook"),
    message: messageIndex >= 0 ? argv[messageIndex + 1] : null,
  };
}

const args = parseArgs(process.argv.slice(2));

if (args.installHook) {
  process.exit(installHook(args.force) ? 0 : 1);
}

if (args.message) {
  const messagePath = path.resolve(ROOT, args.message);
  const violations = [];
  scanPlainText("COMMIT_EDITMSG", readFileSync(messagePath, "utf8"), violations);
  reportViolations(violations);
  process.exit(violations.length === 0 ? 0 : 1);
}

const files = args.all ? allFiles() : stagedFiles();
if (files.length === 0) process.exit(0);

const violations = [];
if (args.all) scanAllFiles(files, violations);
else scanStagedDiff(violations);

const lintOk = lintFiles(files);
reportViolations(violations);

process.exit(lintOk && violations.length === 0 ? 0 : 1);
