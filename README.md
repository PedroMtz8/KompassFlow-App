# Expo Starter

Template base para una app **iOS + Android + Web** con Expo SDK 57, con el backend dentro del mismo proyecto (Elysia como API) pensado para poder moverlo a un servidor aparte más adelante.

## Stack

| Área | Paquete |
|---|---|
| Framework | Expo SDK 57 · React Native 0.86 · React 19.2 · Hermes v1 · New Architecture · React Compiler |
| Rutas y tabs | Expo Router (tabs nativos en iOS/Android, tabs propios en web) |
| Estilos / UI | Uniwind + Tailwind 4 · componentes estilo shadcn en `src/components/ui` (compatibles con React Native Reusables) |
| Animaciones | Reanimated 4 · Gesture Handler |
| Listas | FlashList 2 |
| API | Elysia (`src/server`) montada en una ruta `+api.ts` · cliente tipado con Eden |
| Auth | Better Auth (email/contraseña, Google, Facebook) + plugin de organizaciones |
| Base de datos | Turso (libSQL) + Drizzle ORM |
| Datos / estado | TanStack Query · Zustand (+ expo-sqlite/kv-store) · react-hook-form + zod |
| Hosting | EAS Hosting (Cloudflare Workers) |

## Primeros pasos

Requisitos: Node ≥ 20.19.4.

```bash
npm install
cp .env.example .env            # y rellena BETTER_AUTH_SECRET (openssl rand -base64 32)
```

**Base de datos local** (necesitas la [Turso CLI](https://docs.turso.tech/cli/installation)):

```bash
turso dev --db-file local.db    # terminal aparte → http://127.0.0.1:8080
npm run db:push                 # crea las tablas
```

**Ejecutar:**

```bash
npx expo start                  # "i" simulador iOS · "a" Android · "w" web
```

> El proyecto usa solo módulos incluidos en **Expo Go** (sin `ios/` ni `android/`). Notas de Expo Go con SDK 57:
> - El simulador de iOS instala Expo Go automáticamente (sin login).
> - En dispositivos físicos exige sesión de Expo en la terminal (`npx expo login`) y en la app; en iPhone además necesita `eas go` (cuenta Apple Developer de pago), porque el App Store solo tiene SDK 54.
> - Push remotas en Android y algunas librerías de terceros con código nativo requerirían una development build (`expo-dev-client` + `npx expo run:ios|android`).

## Estructura

```
src/
  app/                 rutas (finas) + api/[...slugs]+api.ts  ← único adaptador Expo ↔ backend
    (auth)/            sign-in, sign-up          (solo sin sesión)
    (app)/             tabs: inicio, explorar, cuenta  (solo con sesión)
  components/          app-tabs(.web).tsx, screen, text-field, ui/ (button, input, card, ...)
  features/            lógica por dominio (auth/)
  lib/                 auth-client(.web).ts, api.ts (Eden), storage(.web).ts (kv-store), query-client
  stores/              Zustand
  server/              ← BACKEND PORTABLE
    app.ts             composición de Elysia
    auth/              Better Auth + macro `auth` para proteger rutas
    db/                cliente libSQL, schema/ (Drizzle), migrations/
    modules/           un archivo por módulo de la API (health, me, ...)
```

### Reglas que mantienen el backend portable

1. `src/server/` no importa nada de `src/app`, React ni React Native, y usa **solo imports relativos**.
2. El cliente importa de `@/server` **solo tipos** (`import type { App }`): todo lo que importa el cliente termina en su bundle.
3. Para mover el backend: copia `src/server/`, `drizzle.config.ts` y sus dependencias; sirve `api.fetch` con Bun/Node (`Bun.serve({ fetch: api.fetch })`) y apunta `EXPO_PUBLIC_API_URL` al nuevo servidor. La base de datos no cambia (Turso es remota). En Node/Bun puedes quitar `adapter: CloudflareAdapter` y `.compile()` de `src/server/app.ts`.

### Archivos por plataforma

`x.web.tsx`, `x.ios.tsx`, `x.android.tsx`, `x.native.tsx`. Dentro de `src/app/` toda ruta específica de plataforma necesita además el archivo base con el mismo nombre. Ejemplos incluidos: `app-tabs.tsx` / `app-tabs.web.tsx` y `auth-client.ts` / `auth-client.web.ts`.

## Auth

- Email/contraseña funciona sin configuración extra.
- **Google / Facebook**: crea las credenciales OAuth y rellena las variables en `.env`. URI de redirección: `<BETTER_AUTH_URL>/api/auth/callback/google` (y `/facebook`). Si las variables faltan, el proveedor se desactiva y el botón muestra el error.
- **Instagram** no está incluido (no verificado como proveedor de Better Auth).
- Organizaciones: ver `src/app/(app)/account.tsx` (listar, crear, activar). Para quitar el plugin: elimina `organization()` en `src/server/auth/index.ts` y `organizationClient()` en `src/lib/auth-client*.ts`, luego `npm run auth:generate` y `npm run db:generate`.
- Tras cambiar plugins/campos de auth: `npm run auth:generate` → `npm run db:generate` → `npm run db:migrate`.

## Base de datos

- Esquema: `src/server/db/schema/` (`auth.ts` lo genera Better Auth; añade tus tablas en archivos nuevos y expórtalas en `index.ts`).
- Migraciones: `npm run db:generate` y `npm run db:migrate` (usa `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` del `.env`; para producción apúntalas a tu base de Turso).
- El cliente es `@libsql/client/web` (HTTP/WebSocket), compatible con Workers.

## Despliegue en EAS Hosting

```bash
npx eas-cli@latest login && npx eas-cli@latest init
# Variables de servidor (TURSO_*, BETTER_AUTH_*, GOOGLE_*, FACEBOOK_*) en el dashboard de EAS o con `eas env:create`
npm run deploy          # preview
npm run deploy:prod     # producción
```

Después define `EXPO_PUBLIC_API_URL` y `BETTER_AUTH_URL` con la URL publicada (`https://<tu-app>.expo.app`), y cambia `scheme`, `ios.bundleIdentifier` y `android.package` en `app.json` (hoy `expostarter` / `com.example.expostarter`). Si cambias el `scheme`, define también `APP_SCHEME` en el servidor.

## Estado de verificación

Comprobado al crear el template: `tsc`, `expo lint`, `expo-doctor` (21/21), export web y export iOS + Android (bundles Hermes), captura de la pantalla de login en web (móvil y escritorio), y un flujo completo contra SQLite en archivo con el servidor Elysia (registro, login, contraseña incorrecta, ruta protegida con y sin sesión, crear/listar organizaciones). Se comprobó también que ni el código de servidor ni los secretos aparecen en los bundles del cliente.

**No comprobado** (pruébalo al arrancar): ejecución en simulador o dispositivo, despliegue real en EAS Hosting (Workers), el cliente `@libsql/client/web` contra `turso dev`/Turso, login social con credenciales reales, y el CLI de React Native Reusables sobre este proyecto (`npx @react-native-reusables/cli@latest add <componente>`; sus componentes usan el alias `@/`, ya configurado en `tsconfig.json`).

## Decisiones y trampas conocidas

- **`metro.config.js` fuerza la build CJS de `@sinclair/typebox`** (dependencia de Elysia): con la build ESM la API respondía 500 (`Cannot read properties of undefined (reading 'defineProperty')`).
- Tabs nativos: `expo-router/unstable-native-tabs` en SDK 57; en SDK 58 pasa a `expo-router/native-tabs`.
- `@hookform/resolvers` no se instaló (conflicto de peers con typebox); `src/lib/zod-resolver.ts` es un resolver mínimo para Zod 4.
- `authClient.getCookie()` es asíncrono en `@better-auth/expo` 1.7.5.
- Mantén las versiones con `npx expo install --fix` (React Native 0.87 y Reanimated 4.7 existen en npm, pero SDK 57 fija RN 0.86 y Reanimated 4.5).
