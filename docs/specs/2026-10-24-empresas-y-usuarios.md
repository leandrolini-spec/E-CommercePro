# Etapa 1 · Empresas y usuarios

## 1. Overview

Hoy el sistema abre siempre "el primer negocio creado" y tiene una sola cuenta de acceso para todos. Esta etapa hace que cada persona entre con su email y contraseña y vea únicamente los datos de su empresa. Así se puede instalar el mismo sistema para varios clientes sin que se mezclen datos.

## 2. Usuarios objetivo

- **Quien vende el sistema (vos):** da de alta la empresa y sus usuarios al instalar a un cliente nuevo.
- **Dueño de la empresa cliente:** entra todos los días a ver ventas, stock, envíos y mensajes de su negocio.
- **Miembro del equipo de la empresa:** entra con su propia cuenta para trabajar (por ahora con los mismos permisos que el dueño).

## 3. Contexto del problema

- El sistema nació para un solo negocio: una sola contraseña compartida, un email fijo en la configuración del servidor y siempre el primer proyecto.
- Para venderlo a otras empresas hace falta que cada una tenga sus propios usuarios y que nadie vea datos ajenos.
- Hoy no hay forma de saber quién hizo qué, ni de retirar el acceso a una persona sin cambiar la contraseña de todos.
- Los datos ya están separados por empresa en la base. Falta que el acceso respete esa separación.

## 4. Alcance v1

**Incluye**
- Ingreso con **email y contraseña** personales.
- Cada usuario pertenece a **una sola empresa** y entra directo a ella, sin pantalla de selección.
- Cada usuario tiene un rol, **dueño** o **miembro**. Se guarda el rol, pero por ahora los dos pueden hacer lo mismo.
- Un **comando para dar de alta** una empresa y sus usuarios (lo ejecutás vos).
- Mensajes entrantes de WhatsApp e Instagram y sincronizaciones automáticas de Mercado Libre y Tienda Nube asignados a la empresa correcta.
- Una **prueba de aislamiento**: con dos empresas de ejemplo, cada usuario ve solo lo suyo.
- El **modo demostración** sigue funcionando sin configurar nada.

**No incluye (queda para otras etapas)**
- Usuarios que pertenezcan a varias empresas ni selector de empresa.
- Pantalla para invitar o administrar usuarios desde el sistema.
- Permisos distintos según el rol.
- Cambiar o recuperar la contraseña desde la pantalla de login.
- Credenciales de integraciones por cliente (etapa 2) y asistente de alta (etapa 4).

## 5. Comportamiento esperado

**Alta de un cliente (vos)**
1. Ejecutás el comando de alta con el nombre de la empresa y el email del dueño.
2. El sistema crea la empresa, la configuración inicial vacía y el usuario dueño, y te muestra un mensaje de confirmación.
3. Le pasás al dueño su email y una contraseña inicial.

**Ingreso (dueño o miembro)**
1. Abre la dirección del sistema y ve la pantalla de login con dos campos: email y contraseña.
2. Entra y ve el Dashboard de su empresa. El nombre de su empresa aparece arriba a la izquierda, como hoy.
3. Si cierra sesión y entra otra persona de otra empresa, esa persona ve solo sus datos.

**Ejemplo de aislamiento**
- "Empresa A" tiene 10 ventas y "Empresa B" tiene 3. Quien entra a B ve 3 ventas en Ventas, Dashboard, Clientes, Stock, Reportes y Mensajes. Nunca aparece nada de A.

**Casos secundarios**
- **Contraseña o email incorrectos:** mensaje claro, "Email o contraseña incorrectos". No se aclara cuál de los dos falló.
- **Usuario sin empresa asignada:** mensaje "Tu cuenta no tiene una empresa asignada. Pedile acceso a quien administra el sistema". No ve ningún dato.
- **Sesión vencida:** vuelve al login y, al entrar, regresa al sistema.
- **Mensaje de WhatsApp o Instagram:** queda en la bandeja de la empresa dueña de ese número o cuenta. Si no se puede identificar la empresa, el mensaje no se guarda en ninguna y queda registrado el aviso.
- **Sincronización automática:** recorre todas las empresas con la integración conectada. Si una falla, las demás siguen.
- **Modo demostración:** entra directo, con datos de ejemplo y la franja "DEMO".

## 6. Posibles errores y mitigaciones

| Qué puede salir mal | Mitigación |
|---|---|
| Alguien ve datos de otra empresa | Todo acceso a datos parte de la empresa de la sesión. Prueba automática con dos empresas antes de dar la etapa por terminada. |
| Dejan de funcionar el ingreso o las pantallas actuales | Se verifica en el navegador cada pantalla principal con un usuario de ejemplo, y en celular y escritorio. |
| Se pierden mensajes de WhatsApp o Instagram por no reconocer la empresa | Se registra el aviso con el motivo. Se prueba con mensajes de ejemplo de dos empresas. |
| El cliente existente (una sola cuenta) queda sin acceso al actualizar | El comando permite asignar un usuario existente a la empresa existente. Se prueba el camino de actualización. |
| Una sincronización de una empresa frena a las demás | Cada empresa se procesa por separado, con su propio resultado. |
| Confusión por mensajes de error poco claros | Mensajes cortos y específicos por caso, sin términos técnicos. |
| Un usuario sin empresa queda en un bucle de login | Se le muestra el aviso en vez de redirigirlo al login. |
