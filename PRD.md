# PRD — Plataforma Digital para Academias y Estudios de Actividad

_Danza (lanzamiento) · preparado para Yoga, Artes Marciales, Música y otros rubros de clase programada_

Documento de producto — versión inicial / enfoque MVP

---

## 1. Resumen ejecutivo

La propuesta es una plataforma especializada que combina un SaaS operativo para academias/estudios con una experiencia de descubrimiento y reserva para alumnos. La prioridad inicial no será construir una red social completa, sino resolver el flujo que genera valor recurrente: descubrir una academia → consultar clases → reservar → pagar → asistir; y, del lado de la academia: configurar → administrar alumnos/profesores/salas → publicar clases → controlar cupo → cobrar → registrar asistencia.

**Lanzamos enfocados en un solo rubro: danza.** Pero el producto se diseña desde el modelo de datos para que abrir nuevos rubros de "clase programada" (yoga, artes marciales, música, natación, etc.) sea una configuración, no una reconstrucción. Rubros de acceso libre tipo gimnasio tradicional (check-in por credencial, uso de equipo sin horario fijo) quedan fuera del MVP y de las versiones inmediatas siguientes — son un negocio distinto que requiere funcionalidades que hoy no se están construyendo.

La capa social (seguidores, publicaciones, videos, comunidades, mensajería y matching) se plantea para una fase posterior, una vez validado el uso recurrente y la operación de las academias.

## 2. Decisiones de producto

| Decisión                     | Definición                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidad                    | Una sola cuenta User por persona. La misma persona puede ser alumno, instructor, staff y propietario.                                                                                                                                                                                                                                             |
| Organizaciones               | Solo dos tipos en MVP: PERSONAL para instructor independiente y STUDIO para academia/estudio.                                                                                                                                                                                                                                                     |
| Roles                        | OWNER, ADMIN, INSTRUCTOR y STAFF, por organización.                                                                                                                                                                                                                                                                                               |
| **Verticales / Rubros**      | **La plataforma se organiza por Vertical (categoría de actividad: Danza, Yoga, Artes Marciales, Música, etc.). En MVP solo Danza está activa. El modelo ya soporta agregar verticales de "clase programada" sin rediseño. Verticales de acceso libre (gimnasio tradicional) quedan fuera del alcance hasta que se justifique una fase dedicada.** |
| **Intereses del usuario**    | **En el primer inicio de sesión, el alumno elige los rubros/disciplinas que le interesan. Se usa para personalizar el descubrimiento y es editable en cualquier momento desde su perfil.**                                                                                                                                                        |
| Profesor en varias academias | Permitido mediante OrganizationMember. Una cuenta puede pertenecer a múltiples organizaciones.                                                                                                                                                                                                                                                    |
| Alumno sin cuenta            | Student es independiente de User. Puede existir con userId = null y vincularse posteriormente.                                                                                                                                                                                                                                                    |
| Clases                       | Separar Service (qué se vende) de ClassSession (cuándo ocurre).                                                                                                                                                                                                                                                                                   |
| Reservas                     | Booking centraliza reservas, cancelaciones y control de capacidad.                                                                                                                                                                                                                                                                                |
| Pagos                        | Online y manuales son registros de primera clase; no son excepciones. Hay dos integraciones de Stripe separadas: suscripción SaaS de la academia (plugin de Better Auth) y pagos de alumnos a la academia (Stripe Connect) — ver sección 13.                                                                                                      |
| Finanzas                     | En MVP cada servicio tiene un único responsable financiero. No habrá split payments.                                                                                                                                                                                                                                                              |
| Privadas                     | Usan el mismo modelo Service + Session + Booking; una organización PERSONAL puede venderlas.                                                                                                                                                                                                                                                      |
| Renta de salones             | Se deja fuera del MVP. Se incorporará posteriormente como módulo específico.                                                                                                                                                                                                                                                                      |
| Red social                   | No es parte del MVP; se construye después de validar el núcleo operativo.                                                                                                                                                                                                                                                                         |

## 3. Problema que resuelve

- Los alumnos tienen dificultad para encontrar academias, horarios y clases disponibles en un solo lugar.
- Las academias pueden depender de hojas de cálculo, WhatsApp, transferencias y procesos manuales para administrar alumnos.
- El control de cupo puede ser manual y susceptible a sobreventa.
- Un profesor puede trabajar en varias academias, pero normalmente sus relaciones están fragmentadas.
- Los alumnos nuevos pueden llegar físicamente sin tener una cuenta; el sistema debe permitir registrar su historial desde el primer día.
- Las clases privadas y los instructores independientes necesitan un modelo sencillo que no obligue a crear múltiples tipos de negocio.
- El negocio puede querer crecer a otros rubros de clase programada más adelante; construir el producto amarrado 100% al vocabulario de "danza" encarece esa expansión innecesariamente.

## 4. Usuarios y escenarios

| Actor                         | Escenario principal                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Alumno registrado             | Busca academias/clases, consulta cupo, reserva, paga y consulta historial.                       |
| Alumno invitado/no registrado | La academia crea su registro y cobra manualmente; posteriormente el alumno vincula su cuenta.    |
| Instructor                    | Pertenece a una o varias organizaciones, imparte clases y registra asistencia.                   |
| Instructor independiente      | Crea una organización PERSONAL y ofrece clases privadas o grupales.                              |
| Propietario de academia       | Administra organización, salones, profesores, alumnos, clases, reservas y pagos.                 |
| Staff                         | Opera alumnos, reservas, pagos manuales y asistencia sin tener control total de la organización. |
| Instructor externo de evento  | Participa en un evento mediante invitación sin necesidad de ser miembro permanente.              |

## 5. Arquitectura conceptual

La unidad central es la organización, y toda organización pertenece a un Vertical. La relación entre User y Organization es independiente de la identidad del alumno, lo que permite soportar múltiples roles y múltiples academias sin duplicar cuentas.

```
Vertical → Organization → Location → Room
User → OrganizationMember → Organization
Organization → Service → ClassSession → Booking → Payment
Organization → Student (con o sin User)
ClassSession → Instructor(s)
User → Interest → Vertical (intereses elegidos en onboarding)
Event → EventParticipant (para invitados externos)
```

## 6. Entidades principales

| Entidad            | Propósito                                                                                                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vertical**       | **Categoría de actividad de alto nivel (Danza, Yoga, Artes Marciales, Música…). Define la taxonomía de disciplinas disponible y si está activa o "próximamente". En MVP solo existe una fila activa: Danza.**                                                                     |
| User               | Cuenta global de una persona.                                                                                                                                                                                                                                                     |
| **Interest**       | **Relación User ↔ Vertical/disciplina elegida en el onboarding o en el perfil; alimenta la personalización del descubrimiento.**                                                                                                                                                  |
| Organization       | Proveedor del servicio: PERSONAL o STUDIO. Pertenece a un único Vertical. Guarda dos identificadores de Stripe distintos y no intercambiables: `stripeCustomerId` (su propia suscripción SaaS) y `stripeConnectedAccountId` (para recibir pagos de sus alumnos) — ver sección 13. |
| OrganizationMember | Relación User ↔ Organization con rol.                                                                                                                                                                                                                                             |
| Location           | Ubicación física con dirección y coordenadas.                                                                                                                                                                                                                                     |
| Room               | Salón dentro de una ubicación, con capacidad.                                                                                                                                                                                                                                     |
| Student            | Registro del alumno dentro de una organización; puede no tener User.                                                                                                                                                                                                              |
| Service            | Producto/servicio vendible: clase, privada, workshop, etc. Su disciplina proviene de la taxonomía del Vertical de su Organization.                                                                                                                                                |
| ClassSession       | Instancia concreta de un Service en una fecha/hora.                                                                                                                                                                                                                               |
| Booking            | Reserva de una persona para una sesión.                                                                                                                                                                                                                                           |
| Product            | Forma comercial: clase individual, paquete, membresía, etc.                                                                                                                                                                                                                       |
| Membership         | Estado y créditos/beneficios de una membresía.                                                                                                                                                                                                                                    |
| Payment            | Registro del cobro y método de pago.                                                                                                                                                                                                                                              |
| Attendance         | Registro de asistencia.                                                                                                                                                                                                                                                           |
| Event              | Evento especial, a desarrollar después del núcleo MVP.                                                                                                                                                                                                                            |
| EventParticipant   | Participante/instructor externo de un evento.                                                                                                                                                                                                                                     |
| Notification       | Notificaciones transaccionales.                                                                                                                                                                                                                                                   |
| AuditLog           | Historial de operaciones sensibles.                                                                                                                                                                                                                                               |

## 7. Funcionalidades del MVP

### 7.1 Cuenta y acceso

- Registro/login.
- Perfil básico.
- **Onboarding de intereses: en el primer login, el alumno elige los rubros/disciplinas de su interés (al lanzamiento, solo las disciplinas de danza están disponibles para elegir). Editable después desde el perfil sin restricción.**
- Una cuenta puede tener múltiples roles y organizaciones.
- Recuperación de acceso.
- Permisos evaluados siempre en backend.

### 7.2 Gestión de academias

- Crear organización PERSONAL o STUDIO, asociada a un Vertical (en MVP, Danza es la única opción visible al usuario; el campo existe para no requerir migración cuando se abra un segundo vertical).
- Nombre, descripción, teléfono, redes, imagen y datos públicos.
- Dirección y coordenadas.
- Configuración de zona horaria y moneda.
- Invitar miembros y asignar roles.

### 7.3 Salones

- Crear Location.
- Crear Room.
- Definir capacidad.
- Asignar salones a sesiones.

### 7.4 Profesores

- Invitar/agregar instructor.
- Un instructor puede pertenecer a varias academias.
- Asignar instructor a una sesión.
- Permitir instructor externo para eventos en fase posterior.

### 7.5 Alumnos

- Crear Student manualmente.
- Registrar nombre y datos mínimos.
- Student puede existir sin User.
- Vincular Student con User posteriormente.
- Conservar historial de reservas, pagos y asistencia.

### 7.6 Servicios y clases

- Crear Service con nombre, disciplina/nivel, precio y duración (la lista de disciplinas disponibles proviene del Vertical de la organización).
- Crear sesiones concretas.
- Soportar recurrencia básica.
- Asignar instructor, salón y capacidad.
- Clases grupales y privadas usando el mismo núcleo.

### 7.7 Descubrimiento

- Buscar academias cercanas.
- Filtrar por disciplina y otros criterios básicos.
- Priorizar resultados según los intereses guardados del alumno.
- Ver perfil público.
- Consultar horarios.
- Abrir ubicación en Google Maps.

### 7.8 Reservas

- Reservar una sesión.
- Reserva desde alumno o desde staff.
- Cancelar según reglas configuradas.
- Control de cupo.
- Lista de espera se deja como V1 si no es imprescindible.

### 7.9 Pagos

- Pago online.
- Pago manual en efectivo.
- Pago manual por transferencia.
- Estado del pago.
- Historial y conciliación básica.
- Webhooks idempotentes para pagos online.

### 7.10 Asistencia

- Ver roster.
- Marcar asistencia/no asistencia.
- Consultar historial básico.

### 7.11 Clases privadas

- Una organización PERSONAL o STUDIO puede ofrecer privadas.
- Definir precio y duración.
- Configurar disponibilidad del instructor.
- Reservar y pagar usando el mismo flujo.

## 8. Flujo principal del alumno

```
DESCUBRIR (filtrado por intereses guardados)
  ↓
ACADEMIA / SERVICIO
  ↓
HORARIO + CUPO
  ↓
RESERVAR
  ↓
PAGAR / USAR MEMBRESÍA
  ↓
CONFIRMACIÓN
  ↓
ASISTIR
  ↓
HISTORIAL
```

## 9. Flujo principal de academia

```
CREAR ORGANIZACIÓN (elige Vertical)
  ↓
UBICACIÓN + SALONES
  ↓
PROFESORES + STAFF
  ↓
ALUMNOS
  ↓
SERVICIOS + SESIONES
  ↓
RESERVAS + PAGOS
  ↓
ASISTENCIA + REPORTES
```

## 10. Escenarios clave y decisiones

| Escenario                                      | Comportamiento                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profesor trabaja en 3 academias                | Una cuenta User; tres OrganizationMember con rol INSTRUCTOR.                                                                                                                             |
| Profesor crea su propio negocio                | Crea Organization PERSONAL y queda como OWNER.                                                                                                                                           |
| Profesor usa salón de otra academia            | En MVP la otra academia lo invita/asigna a una sesión. La renta formal del salón queda para una fase posterior.                                                                          |
| Alumno llega sin registro                      | Staff crea Student sin User y registra reserva/pago manual.                                                                                                                              |
| Alumno posteriormente instala la app           | Se verifica/identifica el Student y se vincula al User; el historial permanece.                                                                                                          |
| Profesor invitado a workshop                   | EventParticipant; no requiere membresía permanente.                                                                                                                                      |
| Academia tiene 20 lugares y quedan 1           | Backend valida cupo dentro de una transacción; dos reservas simultáneas no pueden producir sobreventa.                                                                                   |
| Clase privada                                  | Service privado + disponibilidad + ClassSession/Booking.                                                                                                                                 |
| Pago fuera de la plataforma                    | Payment con método MANUAL_CASH, MANUAL_TRANSFER u otro método manual.                                                                                                                    |
| **Alumno no elige intereses en el onboarding** | **Se le puede pedir de nuevo más tarde o se le muestra descubrimiento sin filtrar; nunca bloquea el uso de la app.**                                                                     |
| **Se activa un segundo Vertical (ej. Yoga)**   | **Se crea la fila en Vertical con su taxonomía de disciplinas; las Organization nuevas pueden elegirlo desde el alta. No requiere cambios a Service, ClassSession, Booking ni Payment.** |

## 11. User stories

- US-01 — Como alumno quiero buscar academias cercanas para encontrar opciones de baile.
- US-02 — Como alumno quiero consultar horarios, precio y disponibilidad antes de reservar.
- US-03 — Como alumno quiero reservar y pagar una clase.
- US-04 — Como alumno quiero usar una membresía o paquete cuando corresponda.
- US-05 — Como propietario quiero crear mi academia y configurar su información.
- US-06 — Como propietario quiero crear salones y definir su capacidad.
- US-07 — Como propietario quiero agregar profesores y staff con permisos diferentes.
- US-08 — Como instructor quiero trabajar con varias academias desde una misma cuenta.
- US-09 — Como staff quiero registrar un alumno que llegó físicamente aunque no tenga cuenta.
- US-10 — Como staff quiero registrar pagos en efectivo o transferencia.
- US-11 — Como staff quiero reservar una clase para un alumno.
- US-12 — Como staff quiero vincular posteriormente un alumno invitado con su cuenta.
- US-13 — Como instructor quiero marcar asistencia.
- US-14 — Como instructor/academia quiero ofrecer clases privadas con disponibilidad.
- US-15 — Como sistema quiero impedir reservas que superen la capacidad.
- US-16 — Como organizador quiero invitar instructores externos a un evento.
- **US-17 — Como alumno nuevo quiero elegir qué me interesa en mi primer inicio de sesión, para ver contenido relevante desde el día uno.**
- **US-18 — Como alumno quiero poder cambiar mis intereses cuando quiera, sin tener que volver a hacer el onboarding completo.**
- **US-19 — Como equipo de producto quiero poder activar un nuevo Vertical (rubro) sin tocar el modelo de Service/ClassSession/Booking.**

## 12. Planes y monetización

Los precios siguientes son hipótesis iniciales para validar, no precios de mercado definitivos.

Hay dos flujos de pago distintos: el **SaaS B2B** (la academia paga una suscripción mensual a la plataforma) es la fuente principal de ingresos desde el MVP; el **marketplace** (el alumno paga a la academia por clase o membresía, con una posible comisión de la plataforma) se activa en una fase posterior. El alumno usa la app sin costo al inicio.

| Plan         | Usuario/cliente        | Funcionalidades                                                                                         |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Student Free | Alumno                 | Perfil, descubrimiento personalizado, horarios, reservas/pagos, historial básico.                       |
| Student Plus | Alumno                 | Filtros avanzados, favoritos, alertas, beneficios y funciones sociales futuras. No lanzar inicialmente. |
| Starter      | Academia               | Perfil, ubicación, catálogo, horarios y reservas básicas; límites de operación.                         |
| Pro          | Academia               | Alumnos, profesores, salones, cupos, reservas, pagos, membresías, asistencia y reportes básicos.        |
| Business     | Academia/empresa       | Multiubicación, más admins, eventos, automatizaciones, reportes avanzados.                              |
| Enterprise   | Organizaciones grandes | Precio personalizado, integraciones, SSO/SLA y soporte especializado.                                   |

Hipótesis inicial de precios: Starter $99 MXN/mes; Pro $249 MXN/mes; Business $499 MXN/mes. Son precios de partida para validar con entrevistas y pilotos antes de fijarlos.

## 13. Arquitectura de pagos y suscripciones

Hay dos integraciones de Stripe en la plataforma, completamente separadas — no comparten cuenta ni flujo de dinero, y no deben resolverse con el mismo mecanismo.

### 13.1 Suscripción SaaS (academia → plataforma)

Es el cobro mensual de Starter/Pro/Business. Se implementa con el **plugin de Stripe para Better Auth** (ya que el stack usa Better Auth como capa de autenticación):

- Crea automáticamente un customer de Stripe por Organization al darse de alta.
- Los planes (Starter/Pro/Business) se definen con sus límites y precio directamente en el plugin; el control de funcionalidades por plan se deriva del plan activo en Stripe, no se duplica a mano en la base de datos.
- Maneja el checkout, upgrades/downgrades, periodo de prueba (con prevención automática de abuso de trial) y cancelaciones.
- Procesa los webhooks de creación/actualización/cancelación de suscripción.
- Limitación a tener en cuenta: el plugin solo soporta **una suscripción activa o en trial por Organization a la vez** — no es un problema para este modelo (cada academia tiene un solo plan vigente en todo momento), pero si algún día se quisiera vender varios planes simultáneos a una misma Organization, habría que resolverlo aparte.
- El dinero de esta integración es ingreso **de la plataforma**, no de la academia.

### 13.2 Pagos de marketplace (alumno → academia)

Es el cobro de clases/membresías que el alumno le paga a la academia (Fase 8, fuera del alcance del MVP). Se implementa con **Stripe Connect** — un sistema distinto al de arriba, aunque viva dentro de la misma cuenta de Stripe de la plataforma:

- Cada academia conecta su propia cuenta de Stripe (cuentas **Express**: alta rápida hospedada por Stripe, dashboard simplificado).
- Los cargos se procesan como **direct charges**, directo en la cuenta de la academia; la plataforma se queda automáticamente con su comisión vía `application_fee_amount`.
- El dinero nunca pasa por una cuenta central de la plataforma — esto evita que la plataforma cargue con responsabilidad de transmisión de dinero, y aísla los contracargos en la cuenta de cada academia en vez de en la de la plataforma.
- Mercado Pago tiene su propio esquema equivalente (Mercado Pago Marketplace) por si se decide soportarlo como alternativa para academias que lo prefieran.

### 13.3 Por qué no deben mezclarse

Una misma Organization interactúa con Stripe en dos roles distintos, con dos identificadores distintos:

| Campo (en Organization)    | Para qué                                         | Integración                       |
| -------------------------- | ------------------------------------------------ | --------------------------------- |
| `stripeCustomerId`         | Pagar su propia suscripción SaaS a la plataforma | Plugin de Stripe para Better Auth |
| `stripeConnectedAccountId` | Recibir los pagos de sus alumnos                 | Stripe Connect                    |

Confundir estos dos IDs, o intentar resolver ambos flujos con el mismo mecanismo, es el error más común al construir esto — conviene dejarlo documentado desde ahora aunque la Fase 8 todavía no se construya.

## 14. Estrategia de MVP

| Fase                      | Objetivo                           | Entregables                                                                                            |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0 — Core                  | Base técnica                       | Auth, User, Organization, Vertical (con Danza como única fila activa), roles, DB, permisos, auditoría. |
| 1 — Operación             | Administrar academia               | Organizaciones, ubicaciones, salones, miembros, alumnos invitados.                                     |
| 2 — Clases                | Crear oferta                       | Services, sesiones, recurrencia, instructores, capacidad.                                              |
| 3 — Reservas              | Cerrar el ciclo                    | Booking, cancelaciones, staff booking, control transaccional de cupo.                                  |
| 4 — Monetización SaaS     | Empezar a facturar a las academias | Planes Starter/Pro/Business, suscripciones, control de funcionalidades por plan.                       |
| 5 — Descubrimiento        | Conectar oferta y demanda          | Búsqueda, geolocalización, perfiles públicos, Google Maps, onboarding de intereses.                    |
| 6 — Asistencia            | Operación diaria                   | Roster, asistencia, historial.                                                                         |
| 7 — Privadas              | Expandir oferta                    | Disponibilidad, clases 1:1 y reservas.                                                                 |
| 8 — Pagos alumno-academia | Monetizar el marketplace           | Pagos online, productos, membresías, webhooks y comisión de transacción.                               |
| 9 — Hardening             | Lanzamiento                        | Logs, seguridad, backups, observabilidad, pruebas de concurrencia y soporte.                           |

Al terminar la Fase 4 ya se puede empezar a cobrar a las academias — no se necesitan las diez fases completas para arrancar comercialmente.

## 15. Expansión a otros rubros (verticales)

Esta sección existe para que el equipo (y cualquier desarrollador que se sume después) entienda **qué tan lejos llega gratis la generalización, y dónde empieza a costar de verdad.**

### 15.1 Lo que ya viene generalizado desde el MVP

El motor `Organization → Service → ClassSession → Booking → Payment` no tiene nada específico de danza. Cualquier negocio cuyo producto sea "una clase con horario, salón y cupo" encaja sin cambios de modelo:

- Yoga, pilates, artes marciales, música, natación, patinaje, escuelas de canto, etc.

Para abrir uno de estos rubros solo hace falta:

1. Agregar una fila nueva en `Vertical` con su taxonomía de disciplinas.
2. Permitir que una `Organization` nueva elija ese Vertical al darse de alta.
3. Ajustar copy/branding específico de ese rubro en las pantallas de marketing (no en el core del producto).

No se toca `Service`, `ClassSession`, `Booking`, `Payment`, `Attendance` ni el motor de reservas.

### 15.2 Lo que NO viene gratis (fuera de alcance del MVP y de V1/V2)

Un **gimnasio de acceso libre** (pase de entrada, uso de equipo sin horario fijo, control de acceso físico) o una **escuela privada académica** (ciclos escolares, calificaciones, tutores) son negocios distintos con necesidades distintas. Extenderse ahí requiere:

- Un modelo de "acceso"/check-in independiente del modelo de reservas por sesión.
- Posiblemente integración con torniquetes/credenciales físicas.
- Lógica de facturación por uso en vez de por reserva.

Esto se trata como un roadmap aparte, no como "una configuración más" — no se debe prometer como parte del MVP ni de las fases inmediatas siguientes.

### 15.3 Secuencia recomendada

1. **MVP — Danza únicamente.** Validar el negocio con un solo rubro antes de fragmentar el esfuerzo comercial.
2. **V1 — primeras pruebas de verticales adyacentes** (yoga, artes marciales, música) con un puñado de academias piloto, reutilizando el mismo motor.
3. **V2/V3 — apertura formal de más verticales de clase programada**, y evaluación (como proyecto aparte) de si vale la pena construir el módulo de acceso libre tipo gimnasio.

## 16. V1, V2 y V3 — después del MVP

| Versión          | Funcionalidades                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 — Marketplace | Eventos, waitlists, perfiles de instructor más completos, reseñas, descubrimiento avanzado, primeras academias piloto de verticales adyacentes (yoga, artes marciales).                              |
| V2 — Social      | Feed, seguidores, videos, comunidades, mensajería, matching y contenido.                                                                                                                             |
| V3 — Ecosistema  | Renta de salones, marketplace de instructores, split payments/payouts, competencias, funcionalidades avanzadas, y evaluación del módulo de acceso libre (gimnasio tradicional) como proyecto aparte. |

## 17. Funcionalidades que NO construir al inicio

- Feed social completo.
- Stories.
- Chat interno.
- Algoritmo complejo de recomendaciones.
- Marketplace de renta de salones.
- Split payments y payouts automáticos a profesores.
- Gestión avanzada de competencias.
- Análisis de videos con IA.
- Publicidad.
- Una aplicación separada exclusivamente para profesores.
- **Verticales de acceso libre (gimnasios tradicionales, control de acceso físico).**
- **Verticales académicas (escuelas privadas con ciclos escolares y calificaciones).**

## 18. Reglas de negocio importantes

1. La autorización siempre debe comprobar la organización y el rol del usuario en backend.
2. Los datos de una organización no deben ser visibles/modificables por otra salvo relaciones explícitas.
3. El control de capacidad debe ser transaccional y resistente a reservas concurrentes.
4. Los webhooks de pagos deben ser idempotentes.
5. Pagos manuales, cancelaciones y modificaciones sensibles deben quedar auditados.
6. Student y User no deben ser la misma entidad: un alumno puede existir antes de registrarse.
7. La vinculación Student → User debe evitar duplicados y requerir validación suficiente.
8. Cada Service debe tener un responsable financiero claro en MVP.
9. Todas las fechas deben almacenarse de forma consistente y presentarse según la zona horaria de la organización.
10. La información de composición de género, si se incorpora, debe ser opcional, agregada y orientada a disponibilidad de pareja; no debe exponer atributos individuales.
11. **Toda Organization pertenece a exactamente un Vertical; el Vertical determina la taxonomía de disciplinas disponible para sus Services.**
12. **La lista de Verticales activos debe ser configurable (tabla/feature flag), no debe requerir un despliegue de código para activarse.**
13. **Los intereses del usuario (Interest) nunca deben bloquear el acceso a funcionalidades; son de personalización, no de permisos.**
14. **La suscripción SaaS de una Organization vive en Stripe vía el plugin de Better Auth; el control de acceso a funcionalidades por plan se deriva de ahí, nunca se duplica a mano en la base de datos.**
15. **Los pagos alumno → academia nunca pasan por una cuenta central de la plataforma; se procesan directo en la cuenta Stripe Connect de la academia, con la comisión de la plataforma descontada automáticamente (`application_fee_amount`).**
16. **El onboarding de intereses solo debe mostrar al usuario los Verticales activos (hoy, únicamente Danza). El catálogo puede tener filas para otros rubros (Fitness/Gym, Escuelas, Deportes, etc.) cargadas por adelantado, pero deben quedar como "próximamente"/deshabilitadas hasta que el negocio decida activarlas — no deben aparecer seleccionables en el MVP.**

## 19. Requisitos no funcionales

- Mobile-first para la experiencia del alumno.
- Backend TypeScript con separación clara de dominios.
- Turso/libSQL como base de datos principal; búsqueda geográfica calculada en el servidor (ver nota en sección 20 sobre límites de esta aproximación).
- Autorización multi-tenant por organización.
- Backups y estrategia de recuperación.
- Observabilidad: errores, logs, métricas y trazabilidad de pagos.
- Pruebas de concurrencia específicamente para reservas/cupo.
- Internacionalización de moneda, idioma y zona horaria.
- Minimización de datos personales y permisos restrictivos para notas internas.

## 20. Stack recomendado

Esta tabla refleja el stack real del proyecto, no una propuesta aparte — se actualiza aquí cada vez que el stack cambie, para que el PRD no quede desalineado con el código.

| Capa                                       | Tecnología actual                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Web                                        | Expo web                                                                                                                      |
| Mobile                                     | React Native + Expo                                                                                                           |
| Backend                                    | TypeScript API                                                                                                                |
| Database                                   | Turso / libSQL                                                                                                                |
| ORM                                        | Drizzle                                                                                                                       |
| Auth                                       | Better Auth                                                                                                                   |
| Suscripciones SaaS (academia → plataforma) | Stripe, vía el plugin de Stripe para Better Auth                                                                              |
| Pagos de marketplace (alumno → academia)   | Stripe Connect (cuentas Express, direct charges) + Mercado Pago Marketplace como alternativa, detrás de una abstracción común |
| Storage                                    | Aún sin definir — no hay manejo de archivos implementado todavía                                                              |
| Maps                                       | Google Maps / proveedor equivalente                                                                                           |

**Nota sobre búsqueda geográfica:** al no usar PostgreSQL/PostGIS, el cálculo de distancias para "academias cercanas" (sección 7.7) se hace en el servidor en vez de con funciones geoespaciales nativas de la base de datos. Es aceptable para el volumen del MVP; si el catálogo de academias crece mucho, conviene revisar si Turso/libSQL sigue siendo suficiente para esa consulta o si se necesita una solución geoespacial dedicada.

## 21. Criterios de aceptación del MVP

- Un usuario puede crear una organización PERSONAL o STUDIO, asociada al Vertical Danza.
- Un instructor puede pertenecer a múltiples organizaciones con una sola cuenta.
- Una organización puede crear ubicaciones, salones y capacidades.
- Una organización puede crear servicios y sesiones.
- No existe sobreventa bajo reservas concurrentes.
- Un alumno registrado puede elegir sus intereses en el onboarding, descubrir, reservar y pagar.
- Un alumno puede cambiar sus intereses en cualquier momento desde su perfil.
- Un alumno sin cuenta puede existir como Student.
- Staff puede registrar pagos y reservas manuales.
- Un Student puede vincularse posteriormente a un User sin perder historial.
- La academia puede administrar profesores, alumnos, reservas y asistencia.
- Cada servicio tiene un responsable financiero definido.
- El usuario puede abrir la ubicación de una academia en Google Maps.
- Las clases privadas utilizan el mismo motor de servicio/reserva.
- Agregar un segundo Vertical no requiere cambios en Service, ClassSession, Booking ni Payment.

## 22. Métrica principal del MVP

La métrica central recomendada es el número de reservas completadas y asistencias por organización activa, acompañada de indicadores operativos: academias activas, alumnos activos, sesiones creadas, tasa de ocupación, GMV procesado, pagos manuales registrados y retención mensual de academias.

La primera validación debe comprobar que una academia realmente sustituye procesos manuales y que los alumnos regresan a reservar. La red social debe depender de esa validación, no al revés. La apertura de nuevos verticales debe depender de haber validado Danza, no adelantarse a ella.

## 23. Roadmap resumido

MVP (fundaciones, operación, clases, reservas) → Monetización SaaS de academias → Descubrimiento (con onboarding de intereses) → Asistencia → Privadas → Pagos alumno-academia → Validación de mercado → primeras verticales adyacentes (piloto) → Eventos/marketplace → Social → Ecosistema (incluye evaluar acceso libre tipo gimnasio).

## 24. Nota de producto

La decisión estructural más importante es no crear una entidad separada para cada caso especial. PERSONAL y STUDIO cubren la mayoría de los escenarios iniciales; OrganizationMember permite múltiples relaciones profesionales; Student desacopla al alumno del registro de cuenta; Service + Session + Booking permite reutilizar el mismo motor para clases grupales, privadas, workshops y posteriormente eventos; y Vertical desacopla el "qué tipo de negocio es esto" del resto del modelo, para que crecer a otros rubros de clase programada sea una decisión de negocio, no un rediseño técnico.
