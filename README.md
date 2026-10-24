# CRM E-Commerce

Sistema de gestión para vender por varios canales (Mercado Libre, Tienda Nube, WhatsApp, Instagram): ventas, stock, envíos, mensajes unificados, clientes, gastos, socios, presupuestos y reportes.

Next.js (App Router) · React 19 · Tailwind 4 · Supabase (Postgres) · pensado para desplegar en Vercel.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completá las variables
npm run dev                  # http://localhost:4850
```

Sin variables de Supabase, la app arranca en **modo demostración** con datos de ejemplo guardados en un archivo local (`/data`, ignorado por git).

## Variables de entorno

Los nombres están en `.env.example`. Nunca subas un `.env*` con valores reales.

## Base de datos

El esquema está en `supabase/migrations`. Aplicalo en tu proyecto de Supabase antes de usar la base real.

## Integraciones

- **Mercado Libre**: autorización OAuth oficial, sincronización de ventas, publicaciones, preguntas y mensajes.
- **Tienda Nube**: pedidos, productos, stock y clientes.
- **Avisos al celular**: notificaciones con [ntfy](https://ntfy.sh).

Las tareas programadas están en `vercel.json`.

## Scripts

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm run build       # build de producción
```
