/**
 * Corre TODAS las pruebas contra una base de datos local temporal (SQLite en un archivo): se migra y se siembra desde cero,
 * así que no toca tu Turso real, no manda correos de verdad y es idéntico en CI. Uso:
 *   bun run test                 todas
 *   bun run test roles email     solo esas (por nombre)
 *   bun run test --remote        usa la base del .env (cuidado: escribe y borra datos de prueba ahí)
 *   bun run test smoke --remote  prueba de humo contra el servidor real de Expo (~1 min; necesita una base remota)
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUITES = [
  'concurrency', 'payments', 'storage', 'uploads', 'series', 'timezone', 'checkin', 'accounts', 'shared', 'booking-pass', 'connect', 'pagination', 'removal', 'ownership', 'ratelimit', 'preflight', 'notifications', 'waitlist', 'profile', 'admin', 'verification',
  'roles', 'extras', 'email', 'deletion', 'validation', 'backup', 'monitoring', 'security', 'smoke',
] as const;
// Solo se corren si se piden por nombre (levantan el servidor real de Expo y tardan ~1 min).
const OPT_IN: string[] = ['smoke'];

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const wanted = args.filter((a) => !a.startsWith('--'));
const suites = wanted.length ? SUITES.filter((s) => wanted.includes(s)) : SUITES.filter((s) => !OPT_IN.includes(s));
if (wanted.length && suites.length !== wanted.length) {
  console.error(`Pruebas desconocidas: ${wanted.filter((w) => !(SUITES as readonly string[]).includes(w)).join(', ')}\nDisponibles: ${SUITES.join(', ')}`);
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), 'stagelight-test-'));
// Las pruebas simulan peticiones desde http://localhost:8081 (el origen de la app en desarrollo); la de seguridad levanta la API en otro puerto.
const ORIGIN = 'http://localhost:8081';
const PORT = 8099;
const FILE: Record<string, string> = { shared: 'shared-pass' };
// Todo lo que pueda llegar a servicios reales se vacía: las pruebas traen sus propios servidores falsos cuando los necesitan.
const blank = ['RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL', 'R2_ENDPOINT', 'SENTRY_DSN', 'R2_BACKUP_BUCKET', 'BACKUP_ENCRYPTION_KEY', 'PLATFORM_FEE_BPS', 'PLATFORM_FEE_BPS_FREE', 'PLATFORM_FEE_BPS_STARTER', 'PLATFORM_FEE_BPS_PRO', 'PLATFORM_FEE_BPS_BUSINESS', 'PLATFORM_ADMIN_EMAILS'];
const env = {
  ...process.env,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'secreto-solo-para-pruebas-0123456789abcdef',
  BETTER_AUTH_URL: ORIGIN,
  ...(remote ? {} : { TURSO_DATABASE_URL: `file:${join(dir, 'test.db')}`, TURSO_AUTH_TOKEN: '', ...Object.fromEntries(blank.map((k) => [k, ''])) }),
};

const run = (cmd: string, cmdArgs: string[], extra: Record<string, string> = {}) =>
  new Promise<{ code: number; out: string }>((resolve) => {
    const p = spawn(cmd, cmdArgs, { env: { ...env, ...extra } as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (out += c));
    p.on('close', (code) => resolve({ code: code ?? 1, out }));
  });

try {
  if (!remote) {
    process.stdout.write('Preparando base de datos temporal… ');
    const mig = spawnSync('node', ['./node_modules/drizzle-kit/bin.cjs', 'migrate'], { env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
    if (mig.status !== 0) throw new Error(`migración falló:\n${mig.stdout}\n${mig.stderr}`);
    const seed = await run('bun', ['src/server/db/seed.ts']);
    if (seed.code !== 0) throw new Error(`sembrado falló:\n${seed.out}`);
    console.log('lista.\n');
  } else console.log(`⚠ Usando la base del .env (${env.TURSO_DATABASE_URL}).\n`);

  const rows: { name: string; ok: boolean; summary: string; ms: number; out: string }[] = [];
  for (const name of suites) {
    const t0 = Date.now();
    if (name === 'smoke' && !remote) {
      // Metro no empaqueta el binario de SQLite local: la prueba de humo necesita una base remota (Turso).
      rows.push({ name, ok: true, summary: 'omitida: necesita --remote (usa la base del .env)', ms: 0, out: '' });
      console.log(`--    ${name.padEnd(12)}         omitida: necesita --remote (usa la base del .env y crea/borra un usuario de prueba)`);
      continue;
    }
    let server: ReturnType<typeof spawn> | null = null;
    let res: { code: number; out: string };
    if (name === 'security') {
      server = spawn('bun', ['scripts/serve-api.ts', String(PORT)], { env: { ...env, BETTER_AUTH_URL: `http://localhost:${PORT}` } as NodeJS.ProcessEnv, stdio: 'ignore' });
      for (let i = 0; i < 40; i++) {
        try {
          if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) break;
        } catch {
          /* aún no */
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      res = await run('bun', ['scripts/security-check.ts', `http://localhost:${PORT}`], { BETTER_AUTH_URL: `http://localhost:${PORT}` });
      server.kill();
    } else {
      res = await run('bun', [`scripts/${FILE[name] ?? name}-check.ts`]);
    }
    const line = res.out.split('\n').reverse().find((l) => /pasaron|Sin problemas|^FALLA |^ERROR:/.test(l)) ?? res.out.trim().split('\n').pop() ?? '';
    const hasFail = /^(FALLA |ERROR:)/m.test(res.out);
    rows.push({ name, ok: res.code === 0 && !hasFail, summary: line.trim().slice(0, 70), ms: Date.now() - t0, out: res.out });
    console.log(`${rows.at(-1)!.ok ? 'OK   ' : 'FALLA'} ${name.padEnd(12)} ${(rows.at(-1)!.ms / 1000).toFixed(1).padStart(5)} s  ${rows.at(-1)!.summary}`);
  }
  const failed = rows.filter((r) => !r.ok);
  for (const f of failed) console.log(`\n── ${f.name} ──\n${f.out.split('\n').filter((l) => /^(FALLA |ERROR:)/.test(l)).slice(0, 12).join('\n')}`);
  console.log(failed.length ? `\n${failed.length} de ${rows.length} pruebas fallaron.` : `\nTodas las pruebas pasaron (${rows.length}).`);
  process.exitCode = failed.length ? 1 : 0;
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
