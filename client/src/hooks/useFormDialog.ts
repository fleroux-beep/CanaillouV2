import { useState, useCallback } from "react";

/**
 * Shared hook for CRUD form dialog state management.
 * Eliminates repeated 4-state + 2-handler pattern across 15+ pages (M3.3).
 */
export function useFormDialog<T extends { id: string }>(defaults: Partial<T> = {}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Partial<T>>(defaults);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(defaults);
    setDialogOpen(true);
  }, [defaults]);

  const openEdit = useCallback((item: T) => {
    setEditing(item);
    setForm(item);
    setDialogOpen(true);
  }, []);

  const close = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const onChange = useCallback((name: string, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
  }, []);

  return {
    dialogOpen,
    editing,
    form,
    deleteId,
    setDeleteId,
    openCreate,
    openEdit,
    close,
    onChange,
    setForm,
  };
}
