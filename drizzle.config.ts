import { defineConfig } from 'drizzle-kit';

// Expo CLI carga .env automáticamente al correr la app; drizzle-kit no, así que
// usa `node --env-file=.env` (Node 20.6+) vía los scripts db:* de package.json,
// o exporta las variables en tu shell.
const url = process.env.TURSO_DATABASE_URL ?? 'http://127.0.0.1:8080';

// `file:` = SQLite local (dialecto sqlite); cualquier otra URL = Turso / `turso dev`.
export default defineConfig({
  schema: './src/server/db/schema/index.ts',
  out: './src/server/db/migrations',
  ...(url.startsWith('file:')
    ? { dialect: 'sqlite' as const, dbCredentials: { url } }
    : {
        dialect: 'turso' as const,
        dbCredentials: { url, authToken: process.env.TURSO_AUTH_TOKEN },
      }),
});
