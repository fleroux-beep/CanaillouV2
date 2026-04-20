import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "../components/ui/toaster";

export function useCrud<T extends { id: string }>(basePath: string, label: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = [basePath];

  const { data = [], isLoading, isError, error } = useQuery<T[]>({
    queryKey,
    queryFn: () => apiRequest(basePath),
    staleTime: 30 * 1000, // 30 seconds — avoid excessive refetches
  });

  const createMutation = useMutation({
    mutationFn: (body: Partial<T>) =>
      apiRequest<T>(basePath, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: `${label} cree(e)` });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: Partial<T> & { id: string }) =>
      apiRequest<T>(`${basePath}/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: `${label} mis(e) a jour` });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`${basePath}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: `${label} supprime(e)` });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  return {
    data,
    isLoading,
    isError,
    error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    creating: createMutation.isPending,
    updating: updateMutation.isPending,
    deleting: deleteMutation.isPending,
  };
}
