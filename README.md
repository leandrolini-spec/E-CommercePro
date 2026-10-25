# CRM E-Commerce

Sistema de gestión para vender por varios canales (Mercado Libre, Tienda Nube, WhatsApp, Instagram): ventas, stock, envíos, mensajes unificados, clientes, gastos, socios, presupuestos y reportes.

Next.js (App Router) · React 19 · Tailwind 4 · Supabase (Postgres) · pensado para desplegar en Vercel.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completá las variables
npm run dev                  # http://localhost:4850
```

Sin variables de Supabase y fuera de producción, la app arranca en **modo demostración**: abre directo con datos de ejemplo guardados en un archivo local (`/data`, ignorado por git), sin pantalla de ingreso. En producción nunca se activa: si falta la configuración, avisa "Configuración incompleta".

## Variables de entorno

Los nombres y qué hace cada una están en `.env.example`. Nunca subas un `.env*` con valores reales.

## Base de datos

El esquema está en `supabase/migrations`. Aplicalas en orden sobre un proyecto de Supabase vacío (o con `supabase db push`). El esquema base (`20261012000001`) se aplica una sola vez; las demás se pueden volver a aplicar sin romper nada.

## Empresas y usuarios

Cada persona entra con su **email y contraseña** y ve solo los datos de **su empresa**. La pertenencia está en la tabla `project_members` (un usuario, una empresa, rol `owner` o `member`; por ahora los dos roles pueden lo mismo). Los números de WhatsApp y las cuentas de Instagram se asignan a una empresa en `channel_accounts`; si la base tiene una sola empresa, los avisos de una cuenta sin registrar van a esa.

Quien instala el sistema da de alta una empresa y su dueño con un comando (necesita `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`):

```bash
# Muestra qué haría, sin cambiar nada
npm run empresa:alta -- --nombre "Mi Empresa" --email dueno@ejemplo.com
# Lo hace (agrega --confirmar). Muestra una sola vez la contraseña inicial del usuario nuevo
npm run empresa:alta -- --nombre "Mi Empresa" --email dueno@ejemplo.com --confirmar

# Sumar a alguien del equipo a una empresa existente
npm run empresa:alta -- --proyecto <id> --email persona@ejemplo.com --rol member --confirmar

# Actualizar un cliente que ya tenía usuario: asignarlo a la única empresa de la base
npm run empresa:alta -- --proyecto unico --email usuario@ejemplo.com --confirmar
```

Un usuario sin empresa asignada no puede entrar y ve un aviso. Con `--ayuda` el comando lista todas las opciones.

**Importante:** hoy se instala **un despliegue por cliente** (Vercel y Supabase propios). Varias empresas dentro de una misma base todavía no es seguro del todo: varias tablas usan un `id` de texto como clave primaria sin la empresa (conversaciones, compradores de Mercado Libre, publicaciones), y dos empresas podrían pisarse un mismo teléfono o comprador. Antes de un sistema único para todos hay que pasar esas claves a (empresa, id).

## Enlaces sin iniciar sesión

El presupuesto para el cliente, el seguimiento de un pedido y el informe para la contadora se abren sin ingresar. La empresa se descubre por el propio enlace (código del presupuesto, id del envío, o enlace del informe firmado con la empresa).

## Integraciones

- **Mercado Libre**: autorización OAuth oficial, sincronización de ventas, publicaciones, preguntas y mensajes.
- **Tienda Nube**: pedidos, productos, stock y clientes.
- **Avisos al celular**: notificaciones con [ntfy](https://ntfy.sh).

Las tareas programadas están en `vercel.json`.

## Scripts

```bash
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm run build          # build de producción
npm run empresa:alta   # alta de empresas y usuarios (ver arriba)
```
