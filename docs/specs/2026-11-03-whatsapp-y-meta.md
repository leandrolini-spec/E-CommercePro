# WhatsApp y Meta · Bandeja, avisos automáticos y medición de ventas

## 1. Overview

Hoy un mensaje de WhatsApp entra solo a la bandeja de Mensajes, pero para contestar hay que salir del sistema (el botón abre WhatsApp con el chat listo). Esta etapa conecta el número de WhatsApp de cada negocio con la **API oficial de Meta** para poder contestar sin salir de Carritix, mandar avisos automáticos (por ejemplo, "tu pedido salió") y, con el tiempo, atender consultas con un asistente de IA. Además conecta **Meta Ads** para medir cuántas ventas entran por los anuncios que abren WhatsApp o Instagram, y cuánto retorno dan.

## 2. Usuarios objetivo

- **Dueño del negocio:** quiere atender a sus clientes por WhatsApp sin perder mensajes y saber si la plata que pone en anuncios vuelve en ventas.
- **Equipo del negocio:** contesta desde la bandeja, con respuestas rápidas.
- **Quien vende el sistema (vos):** conecta el número de cada cliente y cuida que no se mezclen datos entre empresas.

## 3. Contexto del problema

**Lo que ya existe**
- Un aviso de Meta por cada mensaje que entra: se verifica la firma, se asigna a la empresa dueña del número (`channel_accounts`) y se guarda en la bandeja (`inbox_threads` e `inbox_messages`).
- La pantalla Mensajes con las secciones de Mercado Libre, Tienda Nube, WhatsApp e Instagram, y las respuestas rápidas.
- Cada etapa de un envío puede tener un texto de WhatsApp, pero se manda a mano.
- Ventas con los canales "WhatsApp", "Instagram" y "Campaña Meta", cargados a mano.
- Los tokens de las integraciones se guardan cifrados (`TOKEN_ENC_KEY`).

**Lo que falta**
- Enviar por la API: no se puede contestar ni avisar desde el sistema, ni saber si el mensaje se entregó o se leyó.
- Plantillas aprobadas por Meta, necesarias para escribir fuera de las 24 horas posteriores al último mensaje del cliente.
- Registrar quién aceptó recibir mensajes.
- Saber de qué anuncio vino una conversación, cuánto se gastó y qué ventas dejó.

**Decisión previa:** se evaluaron Arturito y SalesInbox y se descartaron. Arturito cobra USD 49 a 390 por mes por cliente y solo da API en el plan más caro; de SalesInbox no hay API ni documentación pública. Con un plan de USD 70 por mes, ninguna cierra. Se usa la API oficial de Meta, donde cada negocio paga a Meta directamente por los mensajes con plantilla.

## 4. Alcance

### Fase A · Conexión y bandeja

**Incluye**
- Conectar **un número de WhatsApp por empresa**. En esta fase la conexión la hacés vos.
- **Contestar desde Mensajes**, con respuestas rápidas y aviso de cuánto falta para que se cierre la ventana de 24 horas.
- Estado de cada mensaje enviado: enviado, entregado, leído o con error.
- Pantalla de conexión en Configuración, con el estado del número.

### Fase B · Avisos automáticos

**Incluye**
- Registro de **quién aceptó recibir mensajes** y baja con una palabra clave.
- **Plantillas** de Meta con su estado (aprobada, en revisión, rechazada).
- Aviso al cliente en cada etapa del envío y bienvenida después de una compra, solo a quien aceptó y tiene teléfono.
- Registro de todo lo enviado, con el motivo si falló.

### Fase C · Asistente de IA

**Incluye**
- Respuestas automáticas a consultas, **apagadas por defecto** y activables por el negocio.
- El asistente solo afirma lo que el negocio cargó (política y textos), con los mismos frenos que ya usa el de preguntas de Mercado Libre.
- Pasa a una persona cuando no está seguro, y se pausa en esa conversación cuando una persona contesta.

### Fase D · Medición de ventas de Meta

**Incluye**
- Guardar de qué anuncio vino cada conversación que empezó desde un anuncio que abre WhatsApp.
- Conectar la cuenta publicitaria de Meta **en modo lectura** para traer gasto, clics y campañas.
- Vincular la conversación con el cliente y con sus ventas, y marcar esas ventas como "Campaña Meta".
- Atribuir también las ventas de Tienda Nube que llegan por un anuncio, a partir del enlace de entrada del pedido.
- Un reporte con gasto, conversaciones, ventas, costo por venta y retorno por campaña, y una tarjeta en el Dashboard.

### Fase E · Más adelante

- Alta de cada cliente con un botón (Embedded Signup), que exige ser proveedor tecnológico aprobado por Meta.
- Campañas masivas con plantillas, solo a quienes aceptaron.
- Enviar las compras de vuelta a Meta (API de Conversiones) para mejorar los anuncios.

### No incluye

- Grupos, llamadas, catálogo ni pagos dentro de WhatsApp.
- Asignar conversaciones a distintos agentes ni permisos por rol.
- Armador de bots sin código.
- Mensajes directos de Instagram: solo se leen, como hoy.

## 5. Comportamiento esperado

**Contestar un mensaje (dueño o equipo)**
1. Entra un mensaje de Ana y aparece en Mensajes → WhatsApp.
2. Abre la conversación. Arriba dice "Podés contestar libremente por 23 h 40 min".
3. Escribe o elige una respuesta rápida y envía. El mensaje aparece con una tilde que pasa de "enviado" a "entregado" y "leído".

**Aviso automático**
1. El negocio marca un envío como "En viaje".
2. Si Ana aceptó recibir mensajes y tiene teléfono, le llega la plantilla "Tu pedido salió" con su nombre y el seguimiento.
3. En el registro queda enviado, y si Meta lo rechaza, queda el motivo.

**Medición (ejemplo)**
- El negocio gastó $50.000 en la campaña "Termos 20 %". Entraron 40 conversaciones y 6 terminaron en venta por $180.000.
- El reporte muestra: gasto $50.000, ventas $180.000, retorno 3,6 veces y $8.333 por venta.

**Casos secundarios**
- **Pasaron más de 24 horas:** no se puede escribir libre. El sistema ofrece enviar una plantilla.
- **El cliente pidió la baja:** no se le mandan más avisos y la ficha lo indica.
- **Mensaje con error:** queda marcado con el motivo en lenguaje claro.
- **Plantilla rechazada:** se avisa y no se envía.
- **Token vencido o número desconectado:** franja visible "Reconectá WhatsApp" y no se pierden los mensajes recibidos.
- **Dos empresas en la misma base:** cada número y cada token pertenecen a una sola empresa; nadie ve conversaciones ni gasto ajeno.
- **Cliente sin teléfono o sin aceptación:** el aviso no sale y se registra por qué.
- **Modo demostración:** muestra conversaciones y números de Meta de ejemplo. Lo que se escribe queda en memoria y no sale a ningún lado.

## 6. Costos y reglas de Meta

- Contestar al cliente dentro de las 24 horas posteriores a su último mensaje es **gratis**. Los avisos con plantilla y las campañas se cobran a cada negocio directo en su cuenta de WhatsApp, y las tarifas de Argentina hay que confirmarlas en el panel de Meta.
- Meta decide si una plantilla es de **utilidad** o de **marketing**; la de marketing cuesta varias veces más. El sistema muestra la categoría antes de enviar.
- Meta exige **verificación de la empresa**, un medio de pago cargado en la cuenta de WhatsApp de cada negocio y la aprobación de los permisos de la app.
- Para leer el gasto de anuncios hace falta el permiso `ads_read`, que Meta también revisa.

## 7. Criterios de éxito

- Un mensaje recibido se contesta desde Carritix y el estado llega a "leído".
- Un cambio de etapa dispara el aviso correcto, una sola vez, solo a quien aceptó.
- Con dos empresas de prueba, ninguna ve datos de la otra.
- El reporte de Meta coincide con el gasto que muestra el Administrador de Anuncios para el mismo período.

## 8. Decisiones tomadas

- **Demo primero.** La primera versión funciona completa en el modo demostración, con conversaciones, plantillas y números de Meta ficticios, y queda lista para que cada negocio conecte su propio número y su cuenta publicitaria cuando quiera. No hay un cliente ni un número de prueba definidos por ahora.
- **Anuncios.** Los clientes anuncian en Meta (con destino a WhatsApp, Instagram o a la tienda) y en Tienda Nube. Por eso la medición cubre las conversaciones que empiezan en un anuncio y también las ventas de Tienda Nube que llegan por un anuncio, usando el enlace de entrada del pedido (a confirmar con un pedido real de Tienda Nube).
- **Ventana de atribución:** 30 días.
- **Plantillas.** Las crea cada cliente a su manera, desde el sistema; no hay plantillas preargadas.
