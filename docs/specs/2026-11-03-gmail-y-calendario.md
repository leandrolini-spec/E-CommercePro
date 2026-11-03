# Gmail y Google Calendar · Correo y agenda dentro del CRM

## 1. Overview

Hoy, para leer un correo de un cliente o ver la agenda hay que salir del sistema. Esta etapa conecta la cuenta de Google de cada negocio para **ver y responder correos** desde Carritix, y para **ver el calendario**, con cada correo y cada evento vinculado al cliente que corresponde.

## 2. Usuarios objetivo

- **Dueño del negocio:** quiere contestar un correo de un cliente viendo en la misma pantalla su historial de compras, y saber qué tiene hoy en la agenda.
- **Equipo:** lee y contesta los correos del negocio.
- **Quien vende el sistema (vos):** conecta la cuenta de Google de cada cliente.

## 3. Contexto del problema

- Hoy el sistema solo abre el correo "de afuera": el botón de correo de cada cliente abre una ventana de Gmail con el mensaje armado (`gmailLink` en `src/lib/contact.ts`). No se lee ni se guarda nada.
- No existe ninguna conexión con Google. Las integraciones que sí existen (Mercado Libre y Tienda Nube) siguen el mismo patrón: autorización del dueño, tokens cifrados, estado visible y sincronización programada.
- **Restricción de Google que condiciona todo.** Leer y responder correos exige permisos que Google clasifica como *restringidos*. Una aplicación pública que los usa tiene que pasar la verificación de Google y una **evaluación de seguridad anual de un tercero (CASA)**, con un costo que según las fuentes va de unos cientos a decenas de miles de dólares. Mientras la aplicación no está verificada, Google limita el uso a 100 usuarios y, en estado de prueba, hace vencer la autorización cada 7 días. Ver las opciones en la sección 6.
- Ver el calendario es más liviano: el permiso de solo lectura se clasifica como *sensible* y pide verificación, pero no la evaluación de seguridad (a confirmar con Google).

## 4. Alcance v1

### Fase A · Conexión con Google

**Incluye**
- Conectar **una cuenta de Google por empresa**, con el botón "Conectar Google" y el permiso que pide Google.
- Permisos **mínimos**: leer y modificar correo (para responder y marcar leído) y leer el calendario.
- Estado visible en Configuración (cuenta conectada, última sincronización, error) y opción de desconectar, que borra los tokens y los datos guardados.

### Fase B · Correo

**Incluye**
- Pantalla **Correo** con la bandeja de entrada: lista de conversaciones, búsqueda, abrir una conversación completa, marcar leído o no leído y archivar.
- **Responder y redactar** desde el sistema, con firma propia del negocio. La respuesta queda en la misma conversación de Gmail.
- Ver los adjuntos y descargarlos.
- **Vínculo con clientes:** si el remitente es un cliente (por su email), la conversación muestra su ficha, sus últimas compras y sus envíos.
- Aviso de correos nuevos en la campana de notificaciones.

### Fase C · Calendario

**Incluye**
- Pantalla **Calendario** de solo lectura: vista de mes, semana y agenda, con los calendarios que el negocio elija.
- Cada evento muestra su hora, lugar y asistentes, y se vincula con el cliente si algún asistente tiene su email en el sistema.
- "Hoy" en el Dashboard: los próximos eventos del día.

### No incluye

- Crear, mover o borrar eventos.
- Enviar correos con adjuntos desde el sistema (solo verlos y descargarlos).
- Varias cuentas de Google por empresa, ni cuentas de otros proveedores de correo.
- Reglas, etiquetas propias, borradores ni programación de envío.
- Respuestas automáticas con IA al correo.

## 5. Comportamiento esperado

**Responder un correo**
1. Entra un correo de Ana Rojas. En Correo aparece la conversación con un punto de "sin leer" y, al abrirla, a un costado su ficha: "Cliente desde 2025 · 4 compras · último envío entregado".
2. Toca "Responder", escribe y envía. El sistema manda la respuesta desde la cuenta de Gmail del negocio, en la misma conversación.
3. En Gmail la conversación aparece contestada, y en Carritix deja de figurar como pendiente.

**Calendario**
- El dueño abre Calendario y ve la semana. Un evento "Reunión con Estudio Lamas" muestra el nombre del cliente enlazado a su ficha.

**Casos secundarios**
- **Autorización vencida o revocada desde Google:** franja "Reconectá Google". No se pierde nada de lo ya guardado.
- **Correo con imágenes o enlaces:** las imágenes remotas no se cargan hasta que se pide, y el contenido se muestra aislado para que un correo malicioso no pueda tocar el sistema.
- **Remitente que no es cliente:** se muestra igual, con la opción de crearlo como cliente.
- **Error al enviar:** el texto escrito no se pierde y se explica el motivo.
- **Dos empresas en la misma base:** cada cuenta de Google pertenece a una sola empresa y nadie ve correos ni agenda ajenos.
- **Desconectar:** se revoca la autorización en Google y se borran del sistema los datos de correo y calendario guardados.
- **Modo demostración:** correos y eventos de ejemplo. Lo que se escribe queda en memoria y no sale.

## 6. Cómo conectar con Google (decisión pendiente)

| Opción | Cómo funciona | Ventajas | Límites |
|---|---|---|---|
| **A · Una aplicación de Google por instalación** (recomendada para empezar) | En cada instalación del cliente se crea su propio proyecto de Google y se publica "en producción" sin verificar. El dueño ve una vez el aviso de "aplicación no verificada" y acepta. | Sin evaluación de seguridad ni costo de verificación. Sirve con el modelo de un despliegue por cliente. | Máximo 100 usuarios por aplicación (sobra para un negocio). Hay que crear el proyecto de Google en cada instalación. A confirmar con Google que la autorización no vence en este modo. |
| **B · Una sola aplicación verificada para todos** | Una aplicación única de Carritix pasa la verificación y la evaluación de seguridad anual. | Alta con un botón, sin tocar Google en cada cliente. | Costo anual de la evaluación (varía mucho según la fuente) y semanas de trámite. Obligatoria para vender como sistema único. |
| **C · Un proveedor intermedio** (Nylas, Unipile u otros) | Ya pasaron la verificación; se conecta contra su API. | Rápido de integrar y sirve también para Outlook. | Mensualidad por cuenta conectada que se come el margen del plan, y dependencia de un tercero. |
| **D · Correo por IMAP con contraseña de aplicación** | El dueño genera una contraseña de aplicación en Google. | Sin verificación de Google. | Solo correo (no calendario), más fricción para el dueño, sin avisos en tiempo real. |

## 7. Privacidad y seguridad

- Se piden solo los permisos necesarios y se explica para qué.
- Los tokens se guardan cifrados, igual que los de Mercado Libre.
- Se guarda lo mínimo del correo (encabezados y un resumen) y se pide el contenido a Google al abrir la conversación.
- Todo el contenido HTML del correo se limpia y se muestra aislado.
- Al desconectar se borran los datos guardados.
- Las políticas de privacidad y términos de Carritix tienen que mencionar el uso de datos de Google, lo exige la verificación.

## 8. Criterios de éxito

- Un correo recibido en Gmail aparece en Correo en pocos minutos y se contesta desde el sistema, quedando en la misma conversación de Gmail.
- La ficha del cliente aparece al abrir un correo suyo.
- El calendario muestra los mismos eventos que Google Calendar para la semana elegida.
- Con dos empresas de prueba, ninguna ve datos de la otra.

## 9. Preguntas abiertas

- ¿Qué opción de la sección 6 se usa? Recomiendo empezar con la A.
- ¿Los clientes usan cuentas de Gmail comunes o Google Workspace (correo con su dominio)? Cambia el camino de conexión.
- ¿Querés poder crear eventos desde el sistema más adelante?
- ¿Se prefiere ver el correo de la cuenta personal del dueño o de un correo del negocio (ventas@…)?
