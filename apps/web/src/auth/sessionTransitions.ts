import type { QueryClient } from '@tanstack/react-query';
import type { Session } from './api';

export const sessionKey = ['application-session'] as const;
export async function clearSession(client: QueryClient) {
  await client.cancelQueries({ queryKey: sessionKey, exact: true });
  client.setQueryData(sessionKey, null);
}
export async function refreshSession(client: QueryClient, read: (signal: AbortSignal) => Promise<Session | null>) {
  await client.cancelQueries({ queryKey: sessionKey, exact: true });
  return client.fetchQuery({ queryKey: sessionKey, queryFn: ({ signal }) => read(signal), staleTime: 0, retry: false });
}
