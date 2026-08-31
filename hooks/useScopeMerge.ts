import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useScopeMerge(scope_a: string, scope_b: string) {
  const queryClient = useQueryClient();

  const voteMutation = useMutation({
    mutationFn: ({ vote, voter_id }: { vote: 'yes' | 'no'; voter_id: string }) =>
      fetch('/api/scopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope_a, scope_b, vote, voter_id }),
      }).then(res => res.json()),
    
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scope-resolution', scope_a, scope_b] });
    },
  });

  const resolution = useQuery({
    queryKey: ['scope-resolution', scope_a, scope_b],
    queryFn: async () => {
      const response = await fetch(`/api/scopes?a=${encodeURIComponent(scope_a)}&b=${encodeURIComponent(scope_b)}`);
      return response.json();
    },
    retry: false,
    enabled: !!scope_a && !!scope_b,
  });

  return {
    vote: voteMutation.mutate,
    isLoading: voteMutation.isPending,
    resolution: resolution.data?.resolution,
    votes: resolution.data?.votes,
    error: resolution.error,
  };
}