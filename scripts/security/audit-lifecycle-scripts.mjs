#!/usr/bin/env node
/**
 * Lists install/prepare lifecycle scripts in direct and transitive dependencies.
 * Review output after any dependency change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const nodeModules = path.join(ROOT, 'node_modules');

const HOOKS = ['preinstall', 'install', 'postinstall', 'prepare', 'preprepare'];

if (!fs.existsSync(nodeModules)) {
  console.log('[security:lifecycle] node_modules not found — run npm ci first.');
  process.exit(0);
}

const rows = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === '@types') continue;
      walk(full);
    } else if (entry.name === 'package.json') {
      let pkg;
      try {
        pkg = JSON.parse(fs.readFileSync(full, 'utf8'));
      } catch {
        continue;
      }
      const scripts = pkg.scripts || {};
      for (const hook of HOOKS) {
        if (scripts[hook]) {
          rows.push({
            package: path.relative(nodeModules, path.dirname(full)),
            hook,
            command: String(scripts[hook]).slice(0, 120),
          });
        }
      }
    }
  }
}

walk(nodeModules);

rows.sort((a, b) => a.package.localeCompare(b.package) || a.hook.localeCompare(b.hook));

console.log(`[security:lifecycle] ${rows.length} lifecycle script(s) in dependency tree:\n`);
for (const row of rows) {
  console.log(`  ${row.package} → ${row.hook}: ${row.command}`);
}
