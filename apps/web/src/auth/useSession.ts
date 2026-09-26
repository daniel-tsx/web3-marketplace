import { useQuery } from '@tanstack/react-query';
import { getSession } from './api';

export const sessionKey = ['application-session'] as const;
export function useSession() {
  return useQuery({ queryKey: sessionKey, queryFn: getSession, retry: false, staleTime: 30_000 });
}
