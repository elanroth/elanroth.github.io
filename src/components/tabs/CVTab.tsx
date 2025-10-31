import { useState } from 'react';
import { FileText } from 'lucide-react';

export function CVTab() {
  const [pdfUrl] = useState("https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf");
  
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="mb-2">Curriculum Vitae</h2>
        <p className="text-muted-foreground">
          View my CV below. Replace the PDF URL in the code with your actual CV link.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
        <div className="bg-secondary/50 px-6 py-4 border-b border-border flex items-center space-x-3">
          <FileText className="text-primary" size={20} />
          <span>CV.pdf</span>
        </div>
        
        <div className="p-4">
          <iframe
            src={pdfUrl}
            className="w-full h-[800px] border-0"
            title="CV PDF"
          />
        </div>
      </div>

      <p className="text-muted-foreground mt-4 text-center">
        To use your own CV, update the <code className="bg-secondary px-2 py-1 rounded">pdfUrl</code> variable with your PDF link
      </p>
    </div>
  );
}
