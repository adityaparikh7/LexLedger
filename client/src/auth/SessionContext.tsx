import { createContext, useContext } from 'react';
import type { SessionUser } from '../api';

export interface SessionContextType {
  /** 'desktop' when talking to the local SQLite server (no sign-in), 'cloud' otherwise */
  mode: 'desktop' | 'cloud';
  user: SessionUser | null;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextType>({
  mode: 'desktop',
  user: null,
  signOut: async () => {},
});
export const useSession = () => useContext(SessionContext);
