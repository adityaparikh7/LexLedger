import { useEffect } from 'react';
import { SYNC_REJECTED_EVENT } from '../local/sync';
import { useToast } from '../context/ToastContext';

/** Shows a toast for each change the server refused. Render once. */
export function useSyncRejectionToasts() {
  const { addToast } = useToast();
  useEffect(() => {
    const onRejected = (e: Event) => {
      for (const reason of (e as CustomEvent<string[]>).detail) addToast(`Not saved: ${reason}`, 'error');
    };
    window.addEventListener(SYNC_REJECTED_EVENT, onRejected);
    return () => window.removeEventListener(SYNC_REJECTED_EVENT, onRejected);
  }, [addToast]);
}
