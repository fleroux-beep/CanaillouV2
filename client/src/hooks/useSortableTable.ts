import { useState, useCallback, useMemo } from "react";
import React from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "../lib/utils";

// ── Hook ────────────────────────────────────────────────────────────────

export function useSortableTable() {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const collator = useMemo(() => new Intl.Collator(undefined, { numeric: true }), []);

  const sortData = useCallback(
    <T extends Record<string, any>>(data: T[]): T[] => {
      if (!sortKey) return data;
      return [...data].sort((a, b) => {
        const aVal = a[sortKey] ?? "";
        const bVal = b[sortKey] ?? "";
        const cmp = collator.compare(String(aVal), String(bVal));
        return sortDir === "asc" ? cmp : -cmp;
      });
    },
    [sortKey, sortDir, collator]
  );

  return { sortKey, sortDir, handleSort, sortData } as const;
}

// ── SortHeader component ────────────────────────────────────────────────

interface SortHeaderProps {
  children?: React.ReactNode;
  label?: React.ReactNode;
  sortKey: string;
  currentSortKey: string | null;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
}

export function SortHeader({
  children,
  label,
  sortKey,
  currentSortKey,
  sortDir,
  onSort,
  align,
  className,
}: SortHeaderProps) {
  const content = children ?? label;
  const isActive = currentSortKey === sortKey;

  const icon = isActive
    ? sortDir === "asc"
      ? React.createElement(ChevronUp, { className: "h-3.5 w-3.5", "aria-hidden": true })
      : React.createElement(ChevronDown, { className: "h-3.5 w-3.5", "aria-hidden": true })
    : React.createElement(ChevronsUpDown, { className: "h-3.5 w-3.5 opacity-30", "aria-hidden": true });

  return React.createElement(
    "th",
    {
      scope: "col",
      "aria-sort": isActive ? (sortDir === "asc" ? "ascending" : "descending") : undefined,
      className: cn(
        "px-4 py-3 font-semibold cursor-pointer select-none hover:text-foreground transition-colors text-muted-foreground",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className
      ),
      onClick: () => onSort(sortKey),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSort(sortKey);
        }
      },
      tabIndex: 0,
      role: "button",
    },
    React.createElement("span", { className: "inline-flex items-center gap-1.5" }, content, icon)
  );
}
