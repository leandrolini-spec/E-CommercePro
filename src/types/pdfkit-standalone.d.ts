// Versión de pdfkit con las tipografías incluidas (funciona en el servidor de Vercel sin leer archivos sueltos).
declare module "pdfkit/js/pdfkit.standalone.js" {
  import PDFDocument from "pdfkit";
  export default PDFDocument;
}
