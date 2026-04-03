import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { useCrud } from "../../hooks/useCrud";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { FormDialog } from "../../components/ui/form-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import {
  FileText, FolderOpen, Pencil, Trash2, Search, Calendar,
  File, FileImage, FileSpreadsheet,
} from "lucide-react";

interface Document {
  id: string;
  bailId?: string;
  name: string;
  type: string;
  category?: string;
  storageUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  dateDocument?: string;
  notes?: string;
}

const categoryConfig: Record<string, { label: string; variant: "primary" | "success" | "warning" | "danger" }> = {
  bail: { label: "Bail", variant: "primary" },
  facture: { label: "Facture", variant: "success" },
  quittance: { label: "Quittance", variant: "warning" },
  avenant: { label: "Avenant", variant: "danger" },
  etat_des_lieux: { label: "État des lieux", variant: "primary" },
  assurance: { label: "Assurance", variant: "success" },
  diagnostique: { label: "Diagnostique", variant: "warning" },
  correspondance: { label: "Correspondance", variant: "primary" },
  autre: { label: "Autre", variant: "primary" },
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getFileIcon(mimeType?: string) {
  if (!mimeType) return File;
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  return FileText;
}

export default function DocumentsGLPage() {
  const { data: documents, create, update, remove, creating, updating, deleting } =
    useCrud<Document>("/api/gl/documents", "Document");
  const { data: baux = [] } = useQuery({
    queryKey: ["/api/gl/baux"],
    queryFn: () => apiRequest("/api/gl/baux"),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBail, setSelectedBail] = useState("all");

  const activeBaux = baux.filter((b: any) => !b.archived);
  const bauxMap = Object.fromEntries(activeBaux.map((b: any) => [b.id, b.nom]));

  const filtered = useMemo(() => {
    return (documents || []).filter((d: any) => {
      if (selectedCategory !== "all" && d.category !== selectedCategory) return false;
      if (selectedBail !== "all" && d.bailId !== selectedBail) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          d.name?.toLowerCase().includes(q) ||
          d.type?.toLowerCase().includes(q) ||
          d.fileName?.toLowerCase().includes(q) ||
          d.notes?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [documents, selectedCategory, selectedBail, searchQuery]);

  // KPIs
  const allDocs = documents || [];
  const totalSize = allDocs.reduce((s: number, d: any) => s + (d.fileSize || 0), 0);
  const categoryCounts = allDocs.reduce<Record<string, number>>((acc, d: any) => {
    const cat = d.category || "autre";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const payload: Record<string, any> = {};
    fd.forEach((v, k) => { payload[k] = v; });
    if (editing) {
      await update({ id: editing.id, ...payload } as Document);
    } else {
      await create(payload as Partial<Document>);
    }
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Documents"
          description="Gestion documentaire — baux, factures, quittances"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Total documents"
            value={allDocs.length}
            icon={FolderOpen}
            variant="primary"
            gradient
            delay={0}
          />
          <KpiCard
            label="Catégories"
            value={Object.keys(categoryCounts).length}
            icon={FileText}
            variant="success"
            gradient
            delay={1}
          />
          <KpiCard
            label="Taille totale"
            value={totalSize}
            formatFn={formatFileSize}
            icon={File}
            variant="warning"
            gradient
            delay={2}
          />
        </div>

        {/* Filters + search + add */}
        <GlassCard delay={3}>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Recherche</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un document..."
                  className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Catégorie</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="all">Toutes</option>
                {Object.entries(categoryConfig).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Bail / Crèche</label>
              <select
                value={selectedBail}
                onChange={(e) => setSelectedBail(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="all">Tous les baux</option>
                {activeBaux.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.nom}</option>
                ))}
              </select>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setEditing(null); setFormOpen(true); }}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              + Nouveau document
            </motion.button>
          </div>
        </GlassCard>

        {/* Category breakdown */}
        {Object.keys(categoryCounts).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => {
                const cfg = categoryConfig[cat] || { label: cat, variant: "primary" as const };
                return (
                  <motion.button
                    key={cat}
                    whileHover={{ scale: 1.05 }}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? "all" : cat)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      selectedCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    {cfg.label}
                    <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                      {count}
                    </span>
                  </motion.button>
                );
              })}
          </div>
        )}

        {/* Documents list */}
        <Section title={`Documents (${filtered.length})`} delay={4}>
          {filtered.length === 0 ? (
            <GlassCard hover={false}>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Aucun document</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {allDocs.length === 0
                    ? "Commencez par ajouter vos documents"
                    : "Aucun document ne correspond aux filtres"}
                </p>
              </div>
            </GlassCard>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-semibold">Nom</th>
                    <th className="px-4 py-3 text-left font-semibold">Bail</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Catégorie</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-right font-semibold">Taille</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((doc: any, i: number) => {
                    const Icon = getFileIcon(doc.mimeType);
                    const cfg = categoryConfig[doc.category || ""] || { label: doc.category || "—", variant: "primary" as const };
                    return (
                      <motion.tr
                        key={doc.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="border-t transition-colors hover:bg-muted/20"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <span className="font-medium">{doc.name}</span>
                              {doc.fileName && (
                                <p className="text-xs text-muted-foreground">{doc.fileName}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {bauxMap[doc.bailId] || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{doc.type}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {doc.dateDocument || "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {formatFileSize(doc.fileSize)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setEditing(doc); setFormOpen(true); }}
                              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteId(doc.id)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Form Dialog */}
        <FormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          title={editing ? "Modifier le document" : "Nouveau document"}
          onSubmit={handleSubmit}
          loading={creating || updating}
          size="lg"
        >
          <FormGrid cols={2}>
            <FormField name="name" label="Nom du document" required defaultValue={editing?.name || ""} />
            <FormField name="bailId" label="Bail / Crèche" defaultValue={editing?.bailId || ""}
              options={[
                { value: "", label: "— Aucun —" },
                ...activeBaux.map((b: any) => ({ value: b.id, label: b.nom })),
              ]}
            />
          </FormGrid>
          <FormGrid cols={2}>
            <FormField name="type" label="Type" required defaultValue={editing?.type || ""} />
            <FormField name="category" label="Catégorie" defaultValue={editing?.category || ""}
              options={Object.entries(categoryConfig).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </FormGrid>
          <FormGrid cols={2}>
            <FormField name="dateDocument" label="Date du document" type="date" defaultValue={editing?.dateDocument || ""} />
            <FormField name="fileName" label="Nom du fichier" defaultValue={editing?.fileName || ""} />
          </FormGrid>
          <FormField name="notes" label="Notes" rows={3} defaultValue={editing?.notes || ""} />
        </FormDialog>

        {/* Delete confirmation */}
        <ConfirmDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }}
          title="Supprimer ce document ?"
          loading={deleting}
        />
      </motion.div>
    </AnimatePresence>
  );
}
