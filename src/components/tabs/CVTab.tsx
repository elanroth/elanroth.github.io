export function CVTab() {
  // PDF placed in the `public/` folder; files there are served at the site root.
  // This project already contains `public/Elan Roth CV Nov 25.pdf` — we URL-encode spaces.
  const pdfUrl = '/Elan%20Roth%20CV%20Nov%2025.pdf';

  // Render only the PDF, full viewport (no surrounding UI)
  return (
    <iframe
      src={pdfUrl}
      title="Curriculum Vitae PDF"
      className="w-full h-[calc(100vh)] border-0"
      style={{ display: 'block' }}
    />
  );
}
