import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "../../lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  searchKeys?: string[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  actions?: React.ReactNode;
  pageSize?: number;
  exportFileName?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  onRowClick,
  searchKeys = [],
  searchPlaceholder = "Rechercher...",
  emptyMessage = "Aucune donnée",
  actions,
  pageSize = 15,
  exportFileName = "export",
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    let result = data;
    if (search && searchKeys.length > 0) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        searchKeys.some((key) => {
          const val = row[key];
          return val && String(val).toLowerCase().includes(q);
        })
      );
    }
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortKey] ?? "";
        const bVal = b[sortKey] ?? "";
        const cmp = String(aVal).localeCompare(String(bVal), "fr", { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [data, search, searchKeys, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const safePage = Math.min(currentPage, totalPages);

  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push("...");
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) {
        pages.push(i);
      }
      if (safePage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCSV = () => {
    const headers = columns.map((col) => col.label);
    const rows = filtered.map((row) =>
      columns.map((col) => {
        const val = row[col.key];
        const str = val == null ? "" : String(val);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3" role="toolbar" aria-label="Actions du tableau">
        {searchKeys.length > 0 && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full rounded-lg border bg-background py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={exportCSV}
          aria-label="Exporter en CSV"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter
        </button>
        {actions}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm" aria-label="Tableau de données">
          <thead>
            <tr className="border-b bg-muted/30">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    col.sortable && sortKey === col.key
                      ? sortDir === "asc" ? "ascending" : "descending"
                      : undefined
                  }
                  className={cn(
                    "px-4 py-3 font-semibold",
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                    col.sortable && "cursor-pointer select-none hover:text-primary",
                    col.className
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  onKeyDown={col.sortable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort(col.key); } } : undefined}
                  tabIndex={col.sortable ? 0 : undefined}
                  role={col.sortable ? "button" : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      sortKey === col.key ? (
                        sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />
                      )
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground" role="status">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, i) => (
                  <motion.tr
                    key={row.id || i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.5) }}
                    onClick={() => onRowClick?.(row)}
                    onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(row); } : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? "button" : undefined}
                    className={cn(
                      "border-t transition-colors",
                      onRowClick && "cursor-pointer hover:bg-muted/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 py-3",
                          col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                          col.className
                        )}
                      >
                        {col.render ? col.render(row) : row[col.key] ?? "—"}
                      </td>
                    ))}
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {filtered.length} {filtered.length > 1 ? "résultats" : "résultat"}
        </div>
        {totalPages > 1 && (
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Page précédente"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            {getPageNumbers().map((page, i) =>
              page === "..." ? (
                <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden="true">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  aria-label={`Page ${page}`}
                  aria-current={safePage === page ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors",
                    safePage === page
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  {page}
                </button>
              )
            )}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Page suivante"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="ml-2 text-sm text-muted-foreground" aria-hidden="true">
              Page {safePage} sur {totalPages}
            </span>
          </nav>
        )}
      </div>
    </div>
  );
}
