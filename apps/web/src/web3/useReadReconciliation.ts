import { useRef } from 'react';
import { createReadReconciliation, type ReconciliationPhase } from './reconciliation';

export function useReadReconciliation<T extends object>(publish: (phase: T & ReconciliationPhase) => void) {
  const controller = useRef<ReturnType<typeof createReadReconciliation<T>> | null>(null);
  if (!controller.current) controller.current = createReadReconciliation(publish);
  return controller.current;
}
