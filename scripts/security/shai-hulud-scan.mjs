#!/usr/bin/env node
/**
 * Detects indicators associated with Shai-Hulud / SHA1-Hulud npm supply-chain worms.
 * Run after install and in CI: npm run security:scan
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const WORKFLOW_INDICATORS = [
  /^shai[-_]?hulud/i,
  /^discussion\.ya?ml$/i,
  /^formatter_.*\.ya?ml$/i,
  /^shai[-_]?hulud[-_]?workflow/i,
];

const EXFIL_ARTIFACTS = [
  'cloud.json',
  'contents.json',
  'environment.json',
  'truffleSecrets.json',
  'actionsSecrets.json',
];

const SUSPICIOUS_SCRIPT_PATTERNS = [
  /\bbun\s+run\b/i,
  /\bbun\s+install\b/i,
  /bundle\.js/i,
  /trufflehog/i,
  /SHA1HULUD/i,
  /shai[-_]?hulud/i,
  /self-hosted-runner/i,
  /setup\.bun\.sh/i,
];

const findings = [];

function rel(filePath) {
  return path.relative(ROOT, filePath) || '.';
}

function add(severity, category, message, filePath = null) {
  findings.push({ severity, category, message, file: filePath ? rel(filePath) : null });
}

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'dist') continue;
      walk(full, onFile);
    } else if (entry.isFile()) {
      onFile(full);
    }
  }
}

function scanGitHubWorkflows() {
  const workflowsDir = path.join(ROOT, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return;

  for (const file of fs.readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/i.test(file)) continue;
    if (WORKFLOW_INDICATORS.some((re) => re.test(file))) {
      add('critical', 'workflow', `Suspicious workflow filename: ${file}`, path.join(workflowsDir, file));
    }

    const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    if (/SHA1HULUD/i.test(content)) {
      add('critical', 'workflow', 'Workflow references self-hosted runner "SHA1HULUD"', path.join(workflowsDir, file));
    }
    if (/runs-on:\s*self-hosted/i.test(content) && /discussion/i.test(content)) {
      add('high', 'workflow', 'Self-hosted runner + discussion trigger pattern (SHA1-Hulud)', path.join(workflowsDir, file));
    }
    if (/webhook\.site/i.test(content) || /ngrok/i.test(content)) {
      add('high', 'workflow', 'Suspicious exfiltration endpoint in workflow', path.join(workflowsDir, file));
    }
  }
}

function scanExfilArtifacts() {
  for (const name of EXFIL_ARTIFACTS) {
    const inRoot = path.join(ROOT, name);
    if (fs.existsSync(inRoot)) {
      add('critical', 'artifact', `Known Shai-Hulud exfil artifact: ${name}`, inRoot);
    }
  }
}

function scanNodeModulesLifecycleScripts() {
  const nodeModules = path.join(ROOT, 'node_modules');
  if (!fs.existsSync(nodeModules)) return;

  walk(nodeModules, (filePath) => {
    if (path.basename(filePath) !== 'package.json') return;
    const pkgDir = path.dirname(filePath);
    const pkgName = path.relative(nodeModules, pkgDir).split(path.sep)[0];

    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return;
    }

    const scripts = pkg.scripts || {};
    for (const [hook, command] of Object.entries(scripts)) {
      if (!/^(pre|post)?install$|^prepare$/i.test(hook)) continue;
      for (const pattern of SUSPICIOUS_SCRIPT_PATTERNS) {
        if (pattern.test(String(command))) {
          add(
            'high',
            'lifecycle',
            `${pkgName}: suspicious ${hook} script (${pattern})`,
            filePath
          );
          break;
        }
      }
    }
  });
}

function scanObfuscatedBundles() {
  const nodeModules = path.join(ROOT, 'node_modules');
  if (!fs.existsSync(nodeModules)) return;

  walk(nodeModules, (filePath) => {
    const base = path.basename(filePath);
    if (base !== 'bundle.js' && base !== 'setup_bun.js') return;
    const stat = fs.statSync(filePath);
    if (stat.size > 200_000) {
      add('high', 'payload', `Large obfuscated ${base} (${Math.round(stat.size / 1024)} KB)`, filePath);
    }
  });
}

scanGitHubWorkflows();
scanExfilArtifacts();
scanNodeModulesLifecycleScripts();
scanObfuscatedBundles();

const critical = findings.filter((f) => f.severity === 'critical');
const high = findings.filter((f) => f.severity === 'high');

if (findings.length === 0) {
  console.log('[security:scan] No Shai-Hulud indicators found.');
  process.exit(0);
}

console.error('[security:scan] Potential supply-chain indicators detected:\n');
for (const f of findings) {
  console.error(`  [${f.severity.toUpperCase()}] ${f.category}: ${f.message}${f.file ? ` (${f.file})` : ''}`);
}

console.error(`\n${critical.length} critical, ${high.length} high — see SECURITY.md for response steps.`);
process.exit(critical.length > 0 || high.length > 0 ? 1 : 0);
