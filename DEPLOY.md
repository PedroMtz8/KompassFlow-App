# Salir a producción — guía paso a paso

Esta guía lleva la app de tu laptop a internet. El orden importa: cada paso desbloquea el siguiente. Al terminar, `bun run preflight .env.production` debe decir **0 bloqueos**. (Operación diaria —respaldos, monitoreo, Stripe— está en `OPERACION.md`.)

## 0. Decisiones que solo tú tomas (antes de empezar)

| Decisión | Por qué importa |
|---|---|
| **Nombre del dominio** (p. ej. `app.tudominio.mx`) | Va en los correos, Stripe y Google; cambiarlo después duele. |
| **Identificador de la app** (p. ej. `mx.tuempresa.kompassflow`) | `ios.bundleIdentifier` y `android.package` en `app.json`. **No se pueden cambiar después de publicar.** Hoy son `com.example.expostarter`. |
| **Razón social, domicilio y correo de soporte** | Los pide el aviso de privacidad y los términos (`EXPO_PUBLIC_LEGAL_*`). Un abogado debe revisar los textos de `src/features/legal/legal-text.ts`. |
| **Plan de EAS de paga** | El dominio propio de EAS Hosting no existe en el plan gratis. |

## 1. Repositorio y CI

```bash
git init && git add -A && git commit -m "Kompass"
git branch -M main
git remote add origin git@github.com:<tu-usuario>/KompassFlow-App.git   # repositorio PRIVADO
git push -u origin main
```
Revisa antes del primer `git add` que `.env`, `.env.production` y `STRIPE.md` no se suben (ya están en `.gitignore`). En GitHub → Settings → Secrets agrega los del respaldo (ver `OPERACION.md`). La CI (`.github/workflows/ci.yml`) corre tipos, lint y las pruebas en cada push.

## 2. Base de datos de producción

Crea **otra** base de Turso para producción (no uses la de pruebas) y aplica las migraciones en orden (`src/server/db/migrations/0000…`), igual que se ha hecho hasta ahora; luego el catálogo inicial: `bun --env-file=.env.production src/server/db/seed.ts`.

## 3. Correo (Resend)

1. Resend → Domains → agrega tu dominio y crea los registros DNS que te pide (SPF y DKIM). Espera a "Verified".
2. `EMAIL_FROM="Kompass <hola@tudominio.mx>"`.

## 4. Archivos y respaldos (Cloudflare R2)

- Bucket público de imágenes (`R2_BUCKET`, con su `R2_PUBLIC_URL`).
- Bucket **privado y distinto** para respaldos (`R2_BACKUP_BUCKET`) y `BACKUP_ENCRYPTION_KEY` (`openssl rand -base64 32`). **Guarda esa clave en tu gestor de contraseñas**: sin ella no se restaura.

## 5. Google (opcional pero recomendado)

Google Cloud → Credenciales → tu cliente OAuth → agrega `https://app.tudominio.mx/api/auth/callback/google` a las URI autorizadas.

## 6. Stripe en modo REAL

1. Activa tu cuenta (verificación de negocio) y **Connect** en modo real.
2. Precios de los planes (modo real, a propósito explícito):
   `bun --env-file=.env.production scripts/stripe-setup.ts --live --out .env.production`
3. Portal de clientes (modo real): Configuración → Facturación → Portal → activa **cambiar de plan** con los 3 productos y **cancelar**.
4. Webhooks: Stripe da un secreto distinto a cada destino, así que se crean **dos**:
   - **"Tu cuenta"** → `https://app.tudominio.mx/api/auth/stripe/webhook`, eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Su secreto es `STRIPE_WEBHOOK_SECRET`.
   - **"Cuentas conectadas"** → `https://app.tudominio.mx/api/stripe/connect-webhook`, eventos `checkout.session.completed` y `charge.refunded`. Su secreto es `STRIPE_CONNECT_WEBHOOK_SECRET`.
5. `PLATFORM_FEE_BPS` si vas a cobrar comisión (100 = 1%).

## 7. Variables de producción

Copia `.env.example` a `.env.production`, llénalo y súbelo a EAS:

```bash
bunx eas-cli env:create --environment production --name NOMBRE --value "..." --visibility sensitive   # una por variable
# Las EXPO_PUBLIC_* van con --visibility plaintext. EAS Hosting NO acepta variables "secret", solo plaintext o sensitive.
bun run preflight .env.production      # debe decir 0 bloqueos
```
Obligatorias que son fáciles de olvidar: `RATE_LIMIT_STORE=db`, `APP_URL`, `BETTER_AUTH_URL`, `EXPO_PUBLIC_API_URL` (las tres con `https://`), `BETTER_AUTH_SECRET` nuevo (no el de desarrollo), `SENTRY_DSN`.

## 8. Publicar el servidor y la web

```bash
npx expo export --platform web
bunx eas-cli deploy --prod --environment production
```
La primera vez pide crear el proyecto y un subdominio. Después: EAS → Hosting → Custom domain y crea los 3 registros DNS que indica (verificación TXT, SSL CNAME y el de ruteo), en ese orden para no tener caída.
Comprueba: `https://app.tudominio.mx/api/health` responde 200 y crea una cuenta de prueba de punta a punta (registro → correo de confirmación → academia → plan de prueba).

## 9. Recordatorios y avisos

- Genera `CRON_SECRET` (`openssl rand -base64 32`) y ponlo en las variables del servidor (paso 7).
- En GitHub → Settings → Secrets agrega `APP_URL` (`https://app.tudominio.mx`) y `CRON_SECRET` (el mismo valor). El workflow `.github/workflows/reminders.yml` llama cada 10 minutos a `/api/jobs/reminders` (también puedes lanzarlo a mano desde la pestaña Actions).
- Las push del teléfono necesitan un proyecto de EAS (`bunx eas-cli init` agrega `extra.eas.projectId` a `app.json`) y una build instalada: en Expo Go de Android no existen las push remotas (los avisos de la campana sí).
- Android: para iconos de aviso correctos agrega un icono monocromático en el plugin `expo-notifications` de `app.json`.

## 10. Monitoreo

Un monitor externo (UptimeRobot) a `/api/health` y el proyecto de Sentry con alertas por correo.

## 11. Apps de iOS y Android

1. Cambia el identificador en `app.json` (paso 0) **antes** del primer build.
2. `bunx eas-cli build --profile production --platform all` (necesitas Apple Developer, 99 USD/año, y Google Play, 25 USD una vez).
3. Prueba primero con `--profile preview` en tus teléfonos (TestFlight / pruebas internas de Play).
4. `bunx eas-cli submit --platform all`.
5. Fichas de las tiendas: URL del aviso de privacidad (`https://app.tudominio.mx/privacy`), correo de soporte, capturas, y la declaración de datos (eliminación de cuenta desde la app: Perfil → Configuración → Eliminar mi cuenta).

## Lista de verificación final

- [ ] `bun run preflight .env.production` → 0 bloqueos
- [ ] `bun run test` → todo verde
- [ ] Un pago real pequeño con tu tarjeta (y su reembolso) en una academia de prueba
- [ ] Un respaldo real: `bun run backup` y una restauración de ensayo (ver `OPERACION.md`)
- [ ] Textos legales revisados por un abogado
