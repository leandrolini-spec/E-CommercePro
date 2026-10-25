# Plan · Etapa 1 · Empresas y usuarios

## 1. Objetivo

Que el proyecto activo salga de la sesión del usuario (tabla `project_members`) en vez de ser "el primero creado". El login pasa a email y contraseña personales. Los procesos sin sesión (webhooks de Meta, tareas programadas) pasan a resolver la empresa por su cuenta y no por el proyecto activo. El aislamiento entre empresas se prueba con dos empresas de ejemplo.

## 2. Contexto del problema

El sistema nació para un solo negocio: una cuenta de acceso (`APP_LOGIN_EMAIL` más una contraseña) y `activeProjectId()` en `src/modules/repo/supabase.ts`, que devuelve el primer proyecto y lo guarda en una variable global del servidor durante 10 minutos. Esa función se llama desde unos 94 lugares. Los datos ya llevan `project_id`, así que la separación en la base existe y falta el acceso. Estrategia comercial: un despliegue por cliente (Vercel y Supabase propios).

## 3. El spec de referencia

`docs/specs/2026-10-24-empresas-y-usuarios.md`

**Cambios y hallazgos frente al spec, a confirmar:**
- **Migraciones incompletas.** `supabase/migrations` solo crea 13 tablas base y las de Tienda Nube. Faltan `ml_accounts`, `ml_resources`, `ml_item_links`, `ml_oauth_states`, `inbox_messages`, `shipments`, `sync_logs` y otras, que el código usa. Un Supabase vacío para un cliente nuevo no arrancaría, y tampoco se puede probar el aislamiento. Se agrega la tarea 0 como prerrequisito. No estaba en el spec.
- **Tareas programadas.** `runScheduledSync` y `runScheduledTnSync` ya recorren las cuentas conectadas de todas las empresas, así que casi no hay que cambiarlas.
- **Prueba de aislamiento.** Necesita un Supabase de prueba, vacío, que cargues vos. No uso tus claves ni creo proyectos pagos sin avisarte.
- **Enlaces públicos sin sesión (hallazgo de la tarea 5).** El presupuesto para el cliente (`/p/[token]`), el seguimiento de un pedido (`/seguimiento/[token]`, con su imagen de vista previa) y el informe para la contadora (`/api/informe?t=`) se abren sin sesión y leían "la empresa activa". Se resuelven ahora por el propio enlace: el código del presupuesto, el id del envío y, para el informe, un enlace firmado que incluye la empresa (los enlaces anteriores siguen sirviendo si hay una sola empresa). No estaba en el plan.
- **`diag` no cambia:** exige sesión, así que `activeProjectId()` ya funciona ahí.
- **Riesgo de claves primarias (para la etapa 5).** Varias tablas usan `id` de texto como clave primaria global, sin la empresa (`inbox_threads` = `canal:identificador`, `customers` = `mlb_<comprador>`, `products` = `mli_<publicación>`). Con dos empresas en la misma base, un mismo teléfono o comprador de Mercado Libre podría pisar la fila de la otra empresa. Con un despliegue por cliente no ocurre. Para un sistema único para todos hay que pasar esas claves a (empresa, id).
- **Modo demostración.** Hoy exige `DEV_BYPASS_AUTH=1` y `DATA_SOURCE=file`. Se corrige para cumplir el spec.

## 4. Lista de tareas

### Tarea 0 · Completar las migraciones
- **Qué:** reconstruir el esquema completo en archivos de migración ordenados. Se parte del esquema real de tu Supabase (lectura, con tu autorización) y se verifica contra el uso en el código.
- **Toca:** `supabase/migrations/` (archivos nuevos; los existentes no se editan).
- **Se verifica:** aplicadas todas sobre un Supabase vacío, el asesor de Supabase no marca tablas faltantes y `npm run build` y las pantallas cargan sin error de tabla inexistente.

### Tarea 1 · Tablas de membresías y de cuentas de canales
- **Qué:** migración nueva con `project_members` (`user_id`, `project_id`, `role` con valores `owner` o `member`; un usuario, una empresa) y `channel_accounts` (`project_id`, `channel` con valores `whatsapp` o `instagram`, `external_id` único por canal). Ambas con RLS activado y sin políticas: solo las lee el servidor.
- **Toca:** `supabase/migrations/20261024000001_members_and_channels.sql`.
- **Se verifica:** la migración se aplica sin error en el Supabase de prueba, y la clave pública no puede leer ninguna de las dos tablas.

### Tarea 2 · Sesión con usuario y empresa
- **Qué:** `verifySession` devuelve también el `userId` (`sub` del token). Un resolver nuevo busca la empresa del usuario en `project_members` y la guarda en memoria por usuario, por poco tiempo y con la clave `userId`, no una global.
- **Toca:** `src/core/session.ts`, nuevo `src/core/membership.ts`.
- **Se verifica:** con dos usuarios de prueba el resolver devuelve su empresa a cada uno, y a un usuario sin fila le devuelve "sin empresa" (no un error genérico).

### Tarea 3 · `activeProjectId()` sale de la sesión
- **Qué:** `activeProjectId()` lee las cookies de la petición, resuelve la empresa con la tarea 2 y la memoriza por petición con `React.cache`. Se elimina la variable global `activeCache`. Si se llama sin sesión lanza un error claro. `invalidateDb()` recibe el `projectId` como argumento opcional.
- **Toca:** `src/modules/repo/supabase.ts`, `src/modules/data.ts` (usa `activeProjectId` en `loadCurrent`, `invalidateDb`, `persist`). Los demás archivos que la llaman (`actions.ts`, `inbox-actions.ts`, las pantallas) no cambian.
- **Se verifica:** con A y B, `getDb()` devuelve solo datos de la empresa del usuario. Una búsqueda en el código confirma que no queda ningún `activeCache` ni consulta de "primer proyecto".

### Tarea 4 · Login con email y contraseña
- **Qué:** `/api/login` recibe email y contraseña y, tras `signInWithPassword`, comprueba la membresía. Mensajes: "Email o contraseña incorrectos" y "Tu cuenta no tiene una empresa asignada...". La pantalla de login agrega el campo email (mismo diseño, textos centrados y del mismo tamaño). El layout de `(app)` muestra el aviso de "sin empresa" en vez de redirigir al login. Se elimina `APP_LOGIN_EMAIL` del esquema de variables y de `.env.example`.
- **Toca:** `src/app/api/login/route.ts`, `src/app/login/page.tsx`, `src/app/(app)/layout.tsx`, `src/core/env.ts`, `.env.example`, `README.md`.
- **Se verifica en el navegador:** ingreso correcto lleva al Dashboard de la empresa. Contraseña mala muestra el mensaje. Usuario sin empresa muestra el aviso sin bucle. Se revisa en escritorio y celular.

### Tarea 5 · Procesos sin sesión: webhooks de Meta y rutas de diagnóstico
- **Qué:** función `projectForChannel(channel, externalId)`: busca en `channel_accounts`. Si no hay fila y existe una sola empresa en la base (caso de un despliegue por cliente), usa esa. Si no la puede determinar, no guarda el mensaje y deja un aviso en el registro. Los webhooks de WhatsApp (`entry.id` / `metadata.phone_number_id`) e Instagram (`entry.id`) la usan dentro de `after()`. `ml-probe` y `diag` pasan a recibir el proyecto explícitamente, con el secreto del servidor.
- **Toca:** nuevo `src/modules/channel-project.ts`, `src/app/api/messaging/whatsapp/route.ts`, `src/app/api/messaging/instagram/route.ts`, `src/app/api/cron/ml-probe/route.ts`, `src/app/api/diag/route.ts`.
- **Se verifica:** mensajes de ejemplo para el número de A y el de B (firmados con un secreto de prueba) quedan cada uno en la bandeja de su empresa. Uno desconocido no se guarda y deja aviso. Las sincronizaciones programadas se prueban con dos cuentas de ejemplo y una forzada a fallar: la otra completa igual.

### Tarea 6 · Comando de alta de empresa y usuarios
- **Qué:** script que recibe nombre de empresa y email del dueño (y opcionalmente una contraseña inicial). Crea el proyecto, su configuración inicial vacía, el usuario en Supabase Auth y la fila de membresía. Con `--proyecto-existente` asigna un usuario ya existente a la empresa ya existente (camino de actualización para el cliente actual). Se ejecuta con `tsx` y `.env.local`. No imprime claves.
- **Toca:** nuevo `scripts/empresa.ts`, `package.json` (script `empresa:alta`), `README.md`.
- **Se verifica:** crear empresa A y B de prueba, entrar con cada dueño y ver la empresa correcta. Correr el comando de actualización sobre una base con un proyecto y un usuario existentes y comprobar que ese usuario sigue entrando.

### Tarea 7 · Modo demostración sin configuración
- **Qué:** cuando no hay claves de Supabase y no es producción, se entra directo a los datos de ejemplo, sin login ni variables de desarrollo. En producción sigue exigiendo configuración completa.
- **Toca:** `src/core/env.ts`, `src/app/(app)/layout.tsx`, `src/proxy.ts`, `src/core/session.ts` (`hasValidSession`).
- **Se verifica:** con `.env.local` vacío, `npm run dev` abre el Dashboard con la franja "DEMO". Con `NODE_ENV=production` sin claves muestra "Configuración incompleta".

### Tarea 8 · Prueba de aislamiento
- **Qué:** script de verificación que crea dos empresas de ejemplo con datos distintos (ventas, clientes, mensajes), entra con cada una y comprueba que cada API y pantalla solo trae lo propio, incluida una consulta cruzada (el usuario de A pide un id de B). Luego, verificación manual en el navegador de las pantallas principales.
- **Toca:** nuevo `scripts/verify-isolation.ts`, `package.json`.
- **Se verifica:** el script termina sin diferencias, y en el navegador (escritorio y celular) A ve 10 ventas y B ve 3 en Dashboard, Ventas, Clientes, Stock, Mensajes y Reportes. **Requiere el Supabase de prueba.**

### Tarea 9 · Cierre
- **Qué:** actualizar `README.md` y `.env.example`, y borrar los datos de prueba.
- **Antes de cada commit:** `npx tsc --noEmit && npx eslint src && npm run build`. Mensajes de commit en español. No se sube `.env*` ni `/data`.

## Orden y dependencias

0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. La 7 puede ir antes de la 4 si preferís ver el demo arreglado primero. Cada tarea se verifica antes de pasar a la siguiente.

## Qué necesito de vos antes de empezar

1. Autorización para leer el esquema de tu Supabase real (solo lectura) para la tarea 0.
2. Un Supabase de prueba vacío para las tareas 0, 1, 6 y 8. Las claves las cargás vos en `.env.local`.
