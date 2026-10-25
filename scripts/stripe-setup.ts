/**
 * Prepara Stripe para los planes SaaS: crea (una sola vez, se puede repetir) un producto y un precio mensual en MXN por
 * plan de paga y guarda sus ids en .env. Se identifican con `lookup_key`, así que no se duplican.
 *   bun --env-file=.env scripts/stripe-setup.ts           (modo prueba)
 *   bun --env-file=.env.production scripts/stripe-setup.ts --live --out .env.production   (modo real: los ids van a ESE archivo, nunca a tu .env de desarrollo)
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { PAID_PLANS, PLANS } from '../src/server/billing/plans';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('Falta STRIPE_SECRET_KEY en .env');
const live = key.startsWith('sk_live_');
if (!live && !key.startsWith('sk_test_')) throw new Error('STRIPE_SECRET_KEY no parece una llave de Stripe.');
// Crear precios en modo REAL es deliberado: hay que pedirlo (--live) para que nadie lo haga por accidente.
if (live && !process.argv.includes('--live')) throw new Error('La llave es de modo REAL (sk_live_…). Si de verdad quieres crear los precios reales, repite con:  bun --env-file=.env scripts/stripe-setup.ts --live');


const outIdx = process.argv.indexOf('--out');
const outFile = outIdx > 0 ? process.argv[outIdx + 1] : live ? '' : '.env';
if (!outFile) throw new Error('En modo real indica el archivo de salida con --out (p. ej. --out .env.production): los ids reales no deben mezclarse con tu .env de pruebas.');

const call = async (path: string, body?: Record<string, string>) => {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? new URLSearchParams(body) : undefined,
  });
  const json = (await r.json()) as any;
  if (!r.ok) throw new Error(`${path}: ${json.error?.message ?? r.status}`);
  return json;
};

const found: Record<string, string> = {};
for (const k of PAID_PLANS) {
  const lookup = `stagelight_${k}_monthly`;
  const existing = (await call(`/prices?lookup_keys[]=${lookup}&active=true`)).data[0];
  if (existing) {
    found[k] = existing.id;
    console.log(`= ${PLANS[k].name}: ya existía`);
    continue;
  }
  const plan = PLANS[k];
  const price = await call('/prices', {
    currency: 'mxn',
    unit_amount: String(plan.priceMxn * 100),
    'recurring[interval]': 'month',
    lookup_key: lookup,
    'product_data[name]': `Kompass ${plan.name}`,
    'product_data[metadata][plan]': k,
  });
  found[k] = price.id;
  console.log(`+ ${plan.name}: creado (${plan.priceMxn} MXN/mes)`);
}

let env = readFileSync(outFile, 'utf8');
for (const k of PAID_PLANS) {
  const name = `STRIPE_PRICE_${k.toUpperCase()}`;
  env = new RegExp(`^${name}=`, 'm').test(env) ? env.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${found[k]}`) : `${env.trimEnd()}\n${name}=${found[k]}\n`;
}
writeFileSync(outFile, env);
console.log(`Ids guardados en ${outFile}`);
