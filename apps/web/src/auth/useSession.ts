import { useQuery } from '@tanstack/react-query';
import { getSession } from './api';
import { sessionKey } from './sessionTransitions';

export { sessionKey } from './sessionTransitions';
export function useSession() {
  return useQuery({ queryKey: sessionKey, queryFn: ({ signal }) => getSession(signal), retry: false, staleTime: 30_000 });
}
