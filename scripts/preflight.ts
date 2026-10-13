/**
 * Revisa que la configuración de PRODUCCIÓN esté lista antes de publicar. Lee un archivo de variables (no usa tu .env de
 * desarrollo) y el app.json:
 *   eas env:pull --environment production --path .env.production      (baja las variables de EAS)
 *   bun run preflight .env.production
 * Sale con error si hay algún bloqueo.
 */
import { readFileSync } from 'node:fs';

import { checkProduction, summary } from './lib/preflight-core';

const file = process.argv[2];
if (!file) {
  console.error('Uso: bun run preflight <archivo de variables de producción>   (p. ej. .env.production)');
  process.exit(2);
}
const vars: Record<string, string> = {};
for (const line of readFileSync(file, 'utf8').split('\n')) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
const app = JSON.parse(readFileSync('app.json', 'utf8'));
const findings = checkProduction(vars, app);
const icon = { blocker: '✗ BLOQUEA', warning: '! AVISO  ', ok: '✓ ok     ' } as const;
for (const level of ['blocker', 'warning', 'ok'] as const)
  for (const f of findings.filter((x) => x.level === level)) console.log(`${icon[level]}  [${f.area}] ${f.message}`);
const s = summary(findings);
console.log(`\n${s.blockers} bloqueos · ${s.warnings} avisos · ${s.ok} correctos`);
process.exit(s.blockers ? 1 : 0);
