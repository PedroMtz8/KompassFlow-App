# Operación de KompasFlow

Guía corta para quien mantiene el servicio: pruebas, respaldos y monitoreo.

## Pruebas

```bash
bun run test                 # todas (17 suites), contra una base SQLite TEMPORAL
bun run test roles email     # solo algunas, por nombre
bun run test --remote        # contra la base del .env (cuidado: escribe y borra datos de prueba ahí)
bun run typecheck && bun run lint
```

- `bun run test:smoke` es opcional (~20 s): levanta el servidor REAL de Expo (Node, no Bun) y revisa salud, validación, registro y que React Email renderice. Necesita una base remota (Metro no abre SQLite local), así que usa la del `.env` y borra su usuario de prueba al terminar.
- La base temporal se migra y siembra desde cero en cada corrida: **no toca Turso**, no manda correos reales (Resend, Stripe, R2 y Google quedan vacíos) y tarda ~15 s.
- Cada suite imprime `OK`/`FALLA` por comprobación. Las pruebas individuales siguen disponibles como `bun run test:roles`, etc. (esas sí leen tu `.env`).
- `.github/workflows/ci.yml` corre tipos + lint + todas las pruebas en cada push y pull request.

## Respaldos

Copia lógica (esquema + filas) en un archivo comprimido y **cifrado** (AES-256-GCM). Restaura en una base vacía.

```bash
bun run backup                         # → ./backups/stagelight-AAAAMMDD-HHMMSS.slbak (con BACKUP_ENCRYPTION_KEY) o a R2 si hay R2_BACKUP_BUCKET
bun run restore backups/archivo.slbak --to file:./restaurada.db
bun run restore backups/archivo.slbak --to libsql://base-nueva.turso.io --token <token>
```

**Puesta en marcha (una vez):**
1. En Cloudflare R2 crea un bucket **privado** nuevo (sin dominio público), p. ej. `stagelight-backups`. No uses el de las imágenes.
2. Genera la clave: `openssl rand -base64 32`. **Guárdala en tu gestor de contraseñas**: sin ella los respaldos no se pueden abrir.
3. En el `.env` / secretos de GitHub: `R2_BACKUP_BUCKET`, `BACKUP_ENCRYPTION_KEY` (+ las credenciales R2 que ya tienes).
4. `.github/workflows/backup.yml` sube uno cada día y conserva los últimos 30.

**Simulacro de restauración (hazlo una vez al mes):** restaura el último respaldo en una base nueva (`--to file:./simulacro.db`) y revisa que `restore` termine con «sin referencias rotas». Un respaldo que nunca se restauró no es un respaldo.

Además, Turso ofrece restaurar a un punto en el tiempo en sus planes de pago: complementa esto, no lo reemplaza (esta copia vive fuera de Turso).

## Monitoreo

- **Errores:** con `SENTRY_DSN` los errores inesperados del servidor, los fallos de la app (`/api/client-errors`) y los correos rechazados por Resend llegan a Sentry (sin cuerpos de petición, cookies ni correos). Sin DSN quedan en el log del servidor como una línea JSON por error. La persona ve «Ocurrió un error inesperado (Ref. xxxxxxxx)»: esa referencia es el id del evento.
- **Disponibilidad:** apunta un monitor externo (UptimeRobot, Better Stack…) a `https://tu-dominio/api/health`. Responde `200` si el servidor y la base responden, `503` si no.
- **Límite de ruido:** el mismo error se reporta una vez por minuto y como máximo 30 eventos por minuto.

## Variables de entorno

Todas están documentadas en `.env.example`: base de datos, Better Auth, Google, Stripe, R2, Resend (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`), Sentry (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `APP_VERSION`), respaldos (`R2_BACKUP_BUCKET`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_KEEP`) y los datos del aviso de privacidad (`EXPO_PUBLIC_LEGAL_*`).

## Stripe (planes de las academias)

- Prueba: `bun --env-file=.env scripts/stripe-setup.ts` crea (sin duplicar) los precios mensuales y guarda sus ids en `.env`.
- Prueba de punta a punta con Stripe real de prueba (no está en `bun run test`): levanta `bun --env-file=.env scripts/serve-api.ts 8099`, en otra terminal `stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:8099/api/auth/stripe/webhook`, y corre `bun --env-file=.env scripts/stripe-plans-check.ts`.
- Con `STRIPE_SECRET_KEY` definida la facturación se activa y cada academia queda con los límites de su plan (sin suscripción = Gratis).
- En producción: llaves `sk_live_…`, un webhook real en el panel de Stripe hacia `/api/auth/stripe/webhook` y precios creados en modo live.

## Cobros con tarjeta de los alumnos (Stripe Connect)

- Modelo: cada academia conecta su propia cuenta (Accounts v2, panel completo de Stripe). **Stripe asume las pérdidas** (Managed Risk, requisito de las cuentas nuevas) y los cobros son **directos** a la cuenta de la academia. La plataforma puede retener una comisión con `PLATFORM_FEE_BPS` (0 por defecto), y por plan de la academia con `PLATFORM_FEE_BPS_FREE|STARTER|PRO|BUSINESS` (la que falte usa la general). La comisión se calcula al crear cada cobro con el plan vigente de la academia y se muestra en la pantalla de planes.
- Los eventos de las cuentas de las academias llegan por el mismo webhook que las suscripciones, pero hay que escuchar también los de cuentas conectadas. En desarrollo:
  `stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:8081/api/auth/stripe/webhook --forward-connect-to localhost:8081/api/stripe/connect-webhook`
- En producción hay dos destinos (cada uno con su secreto): "Tu cuenta" → `/api/auth/stripe/webhook` (`STRIPE_WEBHOOK_SECRET`) y "Cuentas conectadas" → `/api/stripe/connect-webhook` (`STRIPE_CONNECT_WEBHOOK_SECRET`, con `checkout.session.completed` y `charge.refunded`). En desarrollo `stripe listen` usa un solo secreto para ambos.
- Si el webhook no llega, el pago igual se registra cuando la persona vuelve a la app (`/payment-result`); ambos caminos son idempotentes.
- Prueba automática (Stripe falso, sin red): `bun run test connect`.
- Eliminar una academia no cierra su cuenta de Stripe (puede tener saldo o historial): se cierra a mano desde el panel de Stripe si hace falta.

## Avisos, push y recordatorios

- **Campana**: cada aviso (recordatorio, clase cancelada, reserva hecha por la academia, pago recibido, transferencia por confirmar, paquete por vencer) se guarda en la base y aparece en la app; es la fuente de verdad. La **push** del teléfono es un extra (Expo Push Service) para quien dio permiso. Cada persona elige qué categorías quiere en Perfil → Avisos y recordatorios.
- **Recordatorios**: `POST /api/jobs/reminders` con la cabecera `x-cron-secret` (= `CRON_SECRET`). Lo llama GitHub Actions cada 10 minutos. Es seguro correrlo varias veces: cada aviso reserva una marca (`notification_dedupe`) antes de enviarse.
- **Probarlo a mano**: `curl -X POST "$APP_URL/api/jobs/reminders" -H "x-cron-secret: $CRON_SECRET"` → `{"ok":true,"classes":N,"passes":M}`.
- **Tokens muertos**: si Expo responde `DeviceNotRegistered`, el token se borra solo. Al cerrar sesión, la app desregistra el teléfono.
- Prueba automática (Expo falso, sin red): `bun run test notifications`.

## Lista de espera

- Una sesión llena admite fila. Al liberarse un lugar (cancelación, cupo ampliado, oferta vencida o rechazada) se **aparta** para la primera persona de la fila hasta 2 horas (menos si la clase está cerca; con menos de ~20 min ya no se ofrece) y se le avisa. Ese lugar cuenta como ocupado para cualquier otra reserva, incluida la de recepción.
- Las ofertas vencidas se procesan al ver la sesión y cada 10 minutos en `POST /api/jobs/reminders` (devuelve `waitlistOffers`). Sin el planificador, la fila solo avanza cuando alguien cancela o abre la clase.
- El equipo ve la fila en el detalle de la sesión y puede quitar a alguien (permiso de cancelar reservas).
- Prueba automática: `bun run test waitlist`.
