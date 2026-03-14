import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { useToast } from "./toaster";

interface CsvImportProps {
  /** The API endpoint to POST parsed rows to, e.g. "/api/import/am/baux" */
  endpoint: string;
  /** Callback fired after a successful import */
  onSuccess?: () => void;
}

export function CsvImport({ endpoint, onSuccess }: CsvImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  function handleClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        toast({ title: "Fichier vide", description: "Aucune ligne trouvée dans le fichier.", variant: "warning" });
        return;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: rows }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast({
          title: "Erreur d'import",
          description: result.error || "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Import reussi",
        description: `${result.count} enregistrement(s) importe(s).`,
        variant: "success",
      });

      onSuccess?.();
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de lire le fichier.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <Upload className="h-4 w-4" />
        {loading ? "Import en cours..." : "Importer CSV/Excel"}
      </button>
    </>
  );
}
