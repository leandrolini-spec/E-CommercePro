/** Páginas públicas (sin menú ni sesión): lo que se comparte con clientes. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-black">{children}</div>;
}
