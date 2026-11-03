# Plan · WhatsApp y Meta · Bandeja, avisos automáticos y medición de ventas

## 1. Objetivo

Contestar WhatsApp desde Mensajes con la API oficial de Meta, mandar avisos automáticos de envío y, después, medir las ventas que entran por anuncios de Meta. Se avanza por fases, y cada una deja algo usable. La Fase A y la B se pueden usar sin la C, la D ni la E.

## 2. Contexto del problema

La entrada ya está hecha: `src/app/api/messaging/whatsapp/route.ts` verifica la firma de Meta (`src/lib/meta-webhook.ts`), asigna el aviso a la empresa dueña del número (`src/modules/channel-project.ts`, tabla `channel_accounts`) y lo guarda con `addInboxMessage` (`src/modules/inbox.ts`). Falta todo lo que sale: no hay cliente de la API, ni estados de entrega, ni plantillas, ni registro de consentimiento, ni lectura de anuncios. Los tokens se guardan cifrados con `encrypt` y `decrypt` de `src/integrations/mercadolibre/config.ts` (clave `TOKEN_ENC_KEY`), y las integraciones siguen el patrón de las carpetas `src/integrations/mercadolibre` y `tiendanube`.

## 3. El spec de referencia

`docs/specs/2026-11-03-whatsapp-y-meta.md`

**Hallazgos y decisiones, a confirmar:**
- **Conexión.** En la Fase A la conexión de cada número la hacés vos (token de acceso del negocio guardado cifrado). El alta con un botón (Embedded Signup) queda para la Fase E porque exige ser proveedor tecnológico aprobado.
- **Una sola vía de envío.** Todo lo que sale (respuestas, avisos, asistente de IA) pasa por una función `sendWhatsApp` que revisa la ventana de 24 horas, el consentimiento y el estado del número, y deja registro. Nada llama a la API por otro camino.
- **Idempotencia.** Los avisos automáticos llevan una clave (envío + etapa + plantilla) para no mandarse dos veces si el sistema reintenta.
- **Mercado Libre queda aparte.** A los compradores de Mercado Libre no se les escribe por WhatsApp desde acá: se les contesta por la mensajería de Mercado Libre, como hoy. Los avisos de WhatsApp salen a clientes de Tienda Nube, ventas directas y a quien escribió por WhatsApp.
- **Claves de las tablas.** `inbox_threads` usa el id `canal:identificador` como clave global. Con dos empresas en la misma base, un mismo teléfono podría pisar la conversación de la otra (riesgo ya anotado en la etapa 1, hoy sin efecto con un despliegue por cliente). Esta etapa no lo cambia, pero las pruebas de aislamiento lo tienen que cubrir.
- **Modo demostración.** Conversaciones y números de Meta de ejemplo, que no salen a ningún lado.
- **Demo primero (decidido).** Se construye todo funcionando en el modo demostración y con el código real listo para conectar: formulario de conexión, cliente de la API y webhook. Lo que depende de Meta (envío real, estados, plantillas aprobadas, gasto real) queda sin probar contra Meta hasta que un negocio conecte su cuenta.
- **Plantillas (decidido).** Las crea cada cliente desde el sistema; no se preargan.
- **Anuncios (decidido).** Meta (a WhatsApp, Instagram o a la tienda) y Tienda Nube. Ventana de atribución de 30 días.
- **Pruebas.** Las pruebas con Meta real necesitan un número de prueba y una app de Meta que tenés que crear vos. No se usan claves ni se crean cuentas sin avisarte.

## 4. Lo que tenés que hacer vos antes de programar (Tarea 0)

1. Verificar tu empresa en Meta (Business Verification, con los documentos de la empresa).
2. Crear la app de Meta con los productos WhatsApp e Instagram.
3. Crear la cuenta de WhatsApp Business y un número de prueba.
4. Cargar un medio de pago en esa cuenta de WhatsApp.
5. Anotar `META_APP_SECRET` y `META_VERIFY_TOKEN` en `.env.local`, y registrar el webhook con `…/api/messaging/whatsapp`.
6. Para la Fase D: pedir el permiso `ads_read` y tener a mano la cuenta publicitaria de un cliente de prueba.

**Se verifica:** el webhook responde a la verificación de Meta y un mensaje al número de prueba aparece en Mensajes → WhatsApp.

## 5. Lista de tareas

### Fase A · Conexión y bandeja

**Tarea 1 · Cuenta de WhatsApp por empresa**
- **Qué:** tabla `whatsapp_accounts` (`project_id`, `phone_number_id`, `waba_id`, `display_phone`, `token_enc`, `status`, `last_error`, `connected_at`). Al guardar una cuenta también se registra en `channel_accounts`. RLS activado y sin políticas.
- **Toca:** migración nueva, `src/integrations/whatsapp/config.ts`. El cifrado se mueve a un módulo común (`src/core/crypto.ts`) y Mercado Libre y Tienda Nube lo importan de ahí, sin cambiar su comportamiento.
- **Se verifica:** el cifrado ida y vuelta devuelve el mismo token, la clave pública no puede leer la tabla y las integraciones de Mercado Libre y Tienda Nube siguen igual.

**Tarea 2 · Cliente de la API**
- **Qué:** `src/integrations/whatsapp/client.ts` con enviar texto, marcar leído y bajar un archivo. Traduce los errores de Meta a mensajes claros (por ejemplo, fuera de la ventana de 24 horas). La versión de la API queda en una constante.
- **Se verifica:** pruebas con `fetch` simulado para cada error, y un envío real al número de prueba.

**Tarea 3 · Estado de los mensajes**
- **Qué:** el webhook también procesa `statuses` (enviado, entregado, leído, error) y actualiza el mensaje.
- **Toca:** la ruta del webhook, `src/modules/inbox.ts`.
- **Se verifica:** con cargas de ejemplo de Meta, el mensaje pasa por cada estado y un error guarda su motivo.

**Tarea 4 · Contestar desde Mensajes**
- **Qué:** acción de servidor `sendWhatsApp(threadId, texto)` y el formulario de respuesta (reutiliza `ReplyForm` y las respuestas rápidas). Muestra la cuenta regresiva de la ventana de 24 horas y bloquea el texto libre cuando se cerró.
- **Toca:** `src/integrations/whatsapp/actions.ts`, `src/app/(app)/mensajes/page.tsx`.
- **Se verifica en el navegador:** respuesta con el número de prueba, estados visibles, ventana vencida bloqueada y modo demostración simulado. En escritorio y celular.

**Tarea 5 · Conexión en Configuración**
- **Qué:** tarjeta de WhatsApp en Integraciones: estado, número, calidad y botón de reconectar. La franja "WhatsApp sin conectar" de Mensajes pasa a depender de la cuenta de la empresa.
- **Se verifica:** conectada, desconectada y token vencido muestran el estado correcto.

### Fase B · Avisos automáticos

**Tarea 6 · Consentimiento**
- **Qué:** columnas de consentimiento en clientes (aceptó, fecha, origen). Una palabra clave de baja ("BAJA") entrante lo quita y se avisa en la ficha.
- **Se verifica:** un cliente sin consentimiento nunca recibe un aviso.

**Tarea 7 · Plantillas**
- **Qué:** tabla `whatsapp_templates` (nombre, idioma, categoría, estado, texto, variables) que se actualiza desde Meta. Pantalla donde **cada cliente crea sus propias plantillas** y ve su estado, con la categoría (utilidad o marketing) antes de usarlas.
- **Se verifica:** una plantilla aprobada y una rechazada se ven bien y la rechazada no se puede usar.

**Tarea 8 · Avisos de envío**
- **Qué:** al mover un envío (`moveShipment` en `src/modules/actions.ts`) se envía la plantilla de esa etapa, tomando el texto que ya tiene cada etapa (`ShipStage.message`) como base. Registro en `whatsapp_outbox` con clave de idempotencia, resultado y motivo del error. Interruptor por etapa.
- **Se verifica:** mover un envío manda un aviso una sola vez, un reintento no lo repite y un cliente sin consentimiento o sin teléfono queda registrado sin enviarse.

**Tarea 9 · Bienvenida después de una compra**
- **Qué:** plantilla de bienvenida para ventas de Tienda Nube y directas con teléfono y consentimiento.
- **Se verifica:** misma lista de casos que la Tarea 8.

### Fase C · Asistente de IA

**Tarea 10 · Asistente con frenos**
- **Qué:** reutiliza el patrón de `src/modules/question-ai.ts` y `question-bot.ts`: contesta solo con lo que cargó el negocio, sin precios ni datos de contacto, y pasa a una persona cuando no está seguro. Configuración en Configuración, apagado por defecto. Se pausa en la conversación en cuanto una persona contesta.
- **Se verifica:** un conjunto de preguntas de ejemplo (envíos, factura, precio, un reclamo, un pedido a medida) donde el asistente contesta solo lo permitido y pasa a una persona en el resto.

### Fase D · Medición de ventas de Meta

**Tarea 11 · De qué anuncio vino la conversación**
- **Qué:** el webhook guarda el dato de origen que Meta manda en la conversación iniciada desde un anuncio (identificador del anuncio, titular, enlace y clic). Columnas nuevas en la conversación y una etiqueta "Anuncio" en la bandeja.
- **Se verifica:** con una carga de ejemplo de Meta, la conversación queda marcada con su anuncio.

**Tarea 12 · Conexión de Meta Ads (solo lectura)**
- **Qué:** tablas `meta_ad_accounts` (cuenta publicitaria y token cifrado) y `meta_ad_spend` (fecha, campaña, anuncio, gasto, impresiones, clics, moneda). Una tarea programada diaria trae el gasto de cada empresa conectada, y si una falla, las demás siguen.
- **Toca:** `src/integrations/meta-ads/`, `src/app/api/cron/`.
- **Se verifica:** el gasto de un período coincide con el del Administrador de Anuncios para la cuenta de prueba.

**Tarea 13 · Atribución de ventas**
- **Qué:** cuando entra una venta de un cliente que tiene una conversación de anuncio dentro de la ventana de atribución (30 días desde el primer mensaje), la venta se marca "Campaña Meta" con su anuncio. Se puede corregir a mano. Se busca al cliente por teléfono con `customerByPhone`.
- **Se verifica:** pruebas con casos de borde (dos anuncios, venta fuera de la ventana, mismo teléfono en dos empresas).

**Tarea 13b · Ventas de Tienda Nube que llegan por un anuncio**
- **Qué:** si el pedido de Tienda Nube trae el enlace de entrada con los datos del anuncio (a confirmar con un pedido real), la venta se atribuye a esa campaña sin necesidad de una conversación previa.
- **Se verifica:** con un pedido de ejemplo con y sin datos de anuncio.

**Tarea 14 · Reporte y tarjeta de retorno**
- **Qué:** en Reportes, una vista de Meta con gasto, conversaciones, ventas, costo por venta y retorno por campaña. En el Dashboard, una tarjeta con el retorno del período. Mismo estilo y animaciones del resto del sistema.
- **Se verifica:** las cifras del ejemplo del spec dan 3,6 veces de retorno y $8.333 por venta. Se revisa en escritorio y celular.

### Fase E · Más adelante (no se planifica en detalle todavía)

- Alta con un botón (Embedded Signup) y aprobación como proveedor tecnológico.
- Campañas masivas con plantillas y consentimiento.
- Envío de compras a la API de Conversiones de Meta.

## 6. Orden y entregas

1. **Tarea 0** (vos) y **Fase A**: ya se puede atender WhatsApp desde el sistema.
2. **Fase B**: los avisos de envío salen solos.
3. **Fase D**: se mide el retorno de los anuncios. Va antes que la C porque aporta valor propio y no depende del asistente.
4. **Fase C**: el asistente de IA.
5. **Fase E**: cuando haya varios clientes.

## 7. Riesgos

- **Aprobaciones de Meta.** La verificación de la empresa y los permisos pueden tardar días o semanas. Se empieza por la Tarea 0 y la Fase A se puede probar mientras tanto con el número de prueba.
- **Reglas de Meta.** Cambian seguido (tarifas, categorías de plantillas, versiones de la API). Las tarifas y la versión se tratan como datos configurables, no fijos en el código.
- **Calidad del número.** Muchas bajas o reclamos bajan la calidad y limitan el envío. Por eso el consentimiento y la baja van antes de los avisos.
- **IA hablando por el negocio.** Se activa solo si el negocio lo pide, con frenos y con registro de lo que contestó.
- **Costos que no controlamos.** El sistema muestra la categoría de cada plantilla antes de enviar, pero lo que cobra Meta lo ve cada negocio en su cuenta.

## 8. Avance (2026-11-03)

**Hecho, funcionando en el modo demostración y con el código real listo para conectar:**
- **Tarea 1:** migración `20261103000001_whatsapp_y_meta.sql` (cuenta de WhatsApp, registro de envíos, consentimiento, cuenta publicitaria de Meta y su gasto) y cifrado común en `src/core/crypto.ts`. La migración está escrita y **no se aplicó** a ninguna base.
- **Tarea 2:** cliente de la API de WhatsApp (`src/integrations/whatsapp/client.ts`) con errores de Meta traducidos.
- **Tarea 3:** el webhook procesa los estados de entrega, guarda de qué anuncio vino la conversación (Tarea 11) y registra el consentimiento de quien escribe.
- **Tarea 4:** contestar desde Mensajes con la ventana de 24 horas, tildes de entrega y envío de plantilla cuando la ventana está cerrada. Mensajes ahora funciona también en la demostración, con conversaciones de WhatsApp, Instagram y Tienda Nube de ejemplo.
- **Tarea 5:** sección WhatsApp (conexión, plantillas, avisos automáticos y registro) y estado en Configuración → Integraciones.
- **Tareas 6 a 8 (parcial):** consentimiento por mensaje entrante y por la palabra «BAJA»; plantillas que crea cada cliente; aviso automático al mover un envío de etapa, con clave para que no se repita.
- **Tarea 12:** conexión de la cuenta publicitaria de Meta en solo lectura, traslado diario del gasto (`/api/cron/meta-sync`) y pantalla Anuncios.
- **Tarea 14:** pantalla Anuncios con inversión, conversaciones, ventas atribuidas, retorno y costo por venta por campaña, y sección en el Dashboard.

**Sin probar contra Meta (hace falta un número y una cuenta de prueba):** envío real, estados de entrega, plantillas aprobadas, gasto real y webhook de anuncios.

**Falta:**
- **Tarea 0** (a cargo del dueño) y la prueba real de la Fase A.
- **Tareas 9 y 13:** bienvenida por WhatsApp después de una compra y la atribución real de ventas a anuncios (hoy la atribución solo está en la demostración); **Tarea 13b** (Tienda Nube por enlace de entrada).
- **Fase C** (asistente de IA) y **Fase E**.
