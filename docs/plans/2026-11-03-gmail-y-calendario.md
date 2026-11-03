# Plan · Gmail y Google Calendar · Correo y agenda dentro del CRM

## 1. Objetivo

Que cada empresa conecte su cuenta de Google y pueda leer y contestar correos, y ver su calendario, dentro de Carritix. Se avanza por fases y cada una deja algo usable. La Fase B (correo) y la C (calendario) se pueden usar por separado.

## 2. Contexto del problema

No hay ninguna conexión con Google. Hoy el botón de correo solo abre Gmail con el mensaje armado (`gmailLink`, `src/lib/contact.ts`). Las integraciones existentes (`src/integrations/mercadolibre` y `tiendanube`) ya resuelven lo que esta etapa necesita repetir: autorización con redirección (`connect` y `callback` en `src/app/api/integrations`), tokens cifrados (`encrypt` y `decrypt` de `src/integrations/mercadolibre/config.ts`, clave `TOKEN_ENC_KEY`), tabla de cuenta por empresa, estado visible y sincronización con tarea programada (`src/app/api/cron`).

## 3. El spec de referencia

`docs/specs/2026-11-03-gmail-y-calendario.md`

**Hallazgos y decisiones, a confirmar:**
- **Decisión previa a programar:** la sección 6 del spec (cómo conectar con Google). El plan está escrito para la **opción A** (una aplicación de Google por instalación, publicada sin verificar). Pasar a la opción B no cambia el código, solo agrega la verificación de Google y la evaluación de seguridad como trámite.
- **Permisos mínimos.** Correo: leer y modificar (necesario para responder y marcar leído). Calendario: solo lectura. No se pide acceso a contactos ni a Drive.
- **Se guarda lo mínimo.** Una tabla de caché con encabezados y un resumen por conversación, y el contenido se pide a Google al abrirla. Así un error de privacidad en el sistema expone menos.
- **Sincronización.** v1 sincroniza por consulta cada pocos minutos con una tarea programada, usando el historial de cambios de Gmail (`history.list`) para traer solo lo nuevo. Los avisos instantáneos (Pub/Sub) quedan para después. Para el calendario se usa la sincronización incremental de Google.
- **Seguridad del contenido.** Un correo es HTML de un tercero: se limpia con una librería de saneamiento y se muestra dentro de un marco aislado (`sandbox`), con las imágenes remotas bloqueadas hasta que el usuario las pida.
- **Aislamiento entre empresas.** Cada fila lleva `project_id` y las pruebas con dos empresas lo tienen que cubrir, igual que en la etapa 1.
- **Pruebas.** Las pruebas con Google real necesitan una cuenta de prueba y un proyecto de Google que tenés que crear vos. No uso tus cuentas ni creo proyectos sin avisarte.

## 4. Lo que tenés que hacer vos antes de programar (Tarea 0)

1. Crear un proyecto en Google Cloud y activar las APIs de Gmail y de Calendar.
2. Configurar la pantalla de consentimiento (nombre Carritix, correo de contacto, enlace a la política de privacidad).
3. Agregar los permisos: correo (leer y modificar) y calendario (solo lectura).
4. Crear las credenciales OAuth (aplicación web) con la dirección de retorno del sistema.
5. Anotar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env.local`.
6. Tener una cuenta de Gmail de prueba con algunos correos y eventos.

**Se verifica:** el aviso de "aplicación no verificada" de Google aparece al autorizar con la cuenta de prueba y la autorización se completa.

## 5. Lista de tareas

### Fase A · Conexión con Google

**Tarea 1 · Cuenta de Google por empresa**
- **Qué:** tabla `google_accounts` (`project_id` como clave, `email`, `access_token_enc`, `refresh_token_enc`, `expires_at`, `scope`, `status`, `last_error`, `connected_at`). RLS activado y sin políticas. Rutas `connect` y `callback` con el parámetro `state` firmado y el token de renovación guardado cifrado.
- **Toca:** migración nueva, `src/integrations/google/{config,oauth,client}.ts`, `src/app/api/integrations/google/{connect,callback}/route.ts`. Si el cifrado está en el archivo de Mercado Libre se mueve a un módulo común (`src/core/crypto.ts`) sin cambiar su comportamiento.
- **Se verifica:** conectar la cuenta de prueba, que los tokens queden cifrados, que la clave pública no pueda leer la tabla, y que renovar el token vencido funcione.

**Tarea 2 · Conexión en Configuración**
- **Qué:** tarjeta "Google" en Integraciones: estado, cuenta, última sincronización, botón de conectar o reconectar, y desconectar (revoca en Google y borra los datos guardados).
- **Se verifica:** conectada, con error y desconectada muestran el estado correcto, y desconectar borra todo lo guardado de esa empresa.

### Fase B · Correo

**Tarea 3 · Cliente de Gmail**
- **Qué:** listar conversaciones con búsqueda, leer una conversación, enviar una respuesta dentro de la misma conversación (armado del mensaje con los encabezados de respuesta y codificación correcta), marcar leído o no leído, archivar, y bajar un adjunto.
- **Se verifica:** pruebas con respuestas simuladas de Google para cada caso y un envío real a la cuenta de prueba que queda en la misma conversación en Gmail.

**Tarea 4 · Sincronización y caché**
- **Qué:** tabla `mail_threads` (`project_id`, `thread_id`, asunto, remitente, resumen, fecha, sin leer, `customer_id`) y una tarea programada que trae lo nuevo desde el último historial guardado. Si una cuenta falla, las demás siguen. Si Google responde que el historial es demasiado viejo, se hace una carga completa.
- **Toca:** migración nueva, `src/integrations/google/sync.ts`, `src/app/api/cron/google-sync/route.ts`.
- **Se verifica:** un correo nuevo aparece tras la siguiente sincronización, no se duplica y se detecta el aviso de historial vencido.

**Tarea 5 · Pantalla Correo**
- **Qué:** módulo `correo` en el menú. Lista de conversaciones, búsqueda, lectura con el contenido aislado y limpio, imágenes remotas bloqueadas, adjuntos y marcar leído. Mismo estilo del resto del sistema.
- **Toca:** `src/core/modules.ts`, `src/app/(app)/correo/`, un componente de lectura de correo.
- **Se verifica en el navegador:** un correo con HTML hostil de ejemplo (scripts, imágenes de rastreo, enlaces engañosos) no ejecuta nada y no carga imágenes. En escritorio y celular.

**Tarea 6 · Responder y redactar**
- **Qué:** formulario de respuesta (reutiliza la caja de respuesta de Mensajes) y de correo nuevo, con la firma configurable del negocio. Un error de envío conserva el texto.
- **Se verifica:** responder desde el sistema deja el mensaje en la conversación de Gmail, y un fallo de envío muestra el motivo sin perder lo escrito.

**Tarea 7 · Vínculo con clientes**
- **Qué:** al abrir una conversación, se busca al cliente por el email del remitente y se muestra su ficha resumida (compras, envíos). En la ficha de un cliente, un acceso a sus correos. Si no existe, "Crear cliente".
- **Se verifica:** con dos clientes de ejemplo, el correo de cada uno muestra la ficha correcta, y un remitente desconocido ofrece crearlo.

**Tarea 8 · Avisos de correo nuevo**
- **Qué:** los correos sin leer suman a la campana de notificaciones, con enlace a la conversación.
- **Se verifica:** llega un correo, aparece en la campana una sola vez y desaparece al leerlo.

### Fase C · Calendario

**Tarea 9 · Cliente y caché del calendario**
- **Qué:** lista de calendarios de la cuenta, elección de cuáles mostrar, y eventos por rango de fechas con sincronización incremental. Tabla `calendar_events` (`project_id`, `event_id`, título, inicio, fin, lugar, asistentes) y la misma tarea programada de la Tarea 4.
- **Se verifica:** los eventos de la semana coinciden con Google Calendar, y un evento cambiado o borrado en Google se refleja.

**Tarea 10 · Pantalla Calendario y Hoy**
- **Qué:** módulo `calendario` con vista de mes, semana y agenda. Los eventos con un asistente que es cliente muestran su nombre y enlazan a su ficha. En el Dashboard, un bloque "Hoy" con los próximos eventos.
- **Se verifica en el navegador:** los eventos de la cuenta de prueba aparecen en el día y la hora correctos (zona horaria de Argentina, eventos de todo el día y eventos repetidos). En escritorio y celular.

### Demostración

**Tarea 11 · Datos de ejemplo**
- **Qué:** correos y eventos ficticios para la demo, con respuestas en memoria. Los del demo reutilizan los clientes de ejemplo.
- **Se verifica:** el modo demostración muestra Correo y Calendario sin configurar nada y no envía nada.

## 6. Orden y entregas

1. **Tarea 0** (vos), **Fase A**: conectar la cuenta.
2. **Fase B**: correo completo (leer, responder, vínculo con clientes, avisos).
3. **Fase C**: calendario y bloque "Hoy".
4. **Tarea 11**: puede ir antes si se necesita mostrar la demo.

## 7. Riesgos

- **Verificación de Google.** Si más adelante se pasa a un sistema único para todos los clientes (opción B del spec), hay que verificar la aplicación y pasar una evaluación de seguridad anual de un tercero, con costo y semanas de trámite. Hasta entonces, la opción A evita ese trámite.
- **Vencimiento de la autorización.** En estado de prueba Google la hace vencer cada 7 días, así que la aplicación tiene que publicarse "en producción". A confirmar en la Tarea 0.
- **Privacidad.** Es el dato más sensible que maneja el sistema. Permisos mínimos, tokens cifrados, caché mínima, contenido aislado y borrado al desconectar.
- **Límites de Google.** Hay cuotas por usuario y por segundo. La sincronización trae solo lo nuevo y reintenta con espera.
