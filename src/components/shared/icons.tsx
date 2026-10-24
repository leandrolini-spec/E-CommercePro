/** Íconos de línea chicos para botones (mismo trazo que el menú). */
const base = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", className: "h-4 w-4 shrink-0", "aria-hidden": true } as const;

export const IconPencil = () => (
  <svg {...base}><path d="M13.5 3.5a1.8 1.8 0 0 1 2.5 2.5L7 15l-3.5 1 1-3.5 9-9Z" /><path d="m12 5 3 3" /></svg>
);
export const IconArrowLeft = () => (
  <svg {...base}><path d="M16 10H4M9 5l-5 5 5 5" /></svg>
);

export const IconPrint = () => (
  <svg {...base}><path d="M6 7V3h8v4M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="M6 11h8v6H6z" /></svg>
);
export const IconSend = () => (
  <svg {...base}><path d="M17 3 8.5 11.5M17 3l-5.5 14-3-5.5L3 8.5 17 3Z" /></svg>
);
export const IconCheck = () => (
  <svg {...base}><path d="m4 10.5 4 4 8-9" /></svg>
);
export const IconX = () => (
  <svg {...base}><path d="m5 5 10 10M15 5 5 15" /></svg>
);
export const IconWhatsApp = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden><path d="M10 2a8 8 0 0 0-6.9 12l-1 3.6a.6.6 0 0 0 .7.8l3.7-1A8 8 0 1 0 10 2Zm4.2 11.3c-.2.5-1.1 1-1.5 1-.4.1-.9.1-2.4-.5-2-.9-3.3-2.9-3.4-3-.1-.1-.8-1.1-.8-2s.5-1.4.7-1.6c.2-.2.4-.2.5-.2h.4c.1 0 .3 0 .4.3l.6 1.5c.1.1.1.3 0 .4l-.3.4-.3.3c-.1.1-.2.3-.1.4.5.9 1.2 1.6 2.1 2.1.2.1.3.1.4 0l.5-.6c.1-.2.3-.2.5-.1l1.4.7c.2.1.3.2.3.3 0 .2 0 .7-.2 1.1Z" /></svg>
);
export const IconMail = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden><path d="M2.5 5.4A2 2 0 0 1 4.5 3.5h11a2 2 0 0 1 1.9 1.9L10 10.2 2.5 5.4Zm0 1.9v7.3a2 2 0 0 0 2 1.9h11a2 2 0 0 0 2-1.9V7.3l-7 4.5a1 1 0 0 1-1 0l-7-4.5Z" /></svg>
);
export const IconDownload = () => (
  <svg {...base}><path d="M10 3v9M6 9l4 4 4-4M4 16h12" /></svg>
);
export const IconTrash = () => (
  <svg {...base}><path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h5.6a1.5 1.5 0 0 0 1.5-1.4l.7-10M8.5 9v4.5M11.5 9v4.5" /></svg>
);
