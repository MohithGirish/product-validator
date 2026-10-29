// Signed-in user and validation history, shared through useAuth().
// Sign-in is checked by the backend, which returns a session token (kept in
// localStorage by apiClient.ts). On page load the stored token is checked with
// the server, so a reload keeps the user signed in; while that check runs,
// `isRestoring` is true. Any 401 from the API signs the user out.
// History lives on the server (staff get their own records, admins get all).
// A result that can't reach the server is kept on this device and uploaded
// later, as is history saved by older versions of the app: after sign-in and
// after each successful save. Staff upload their own waiting records, admins
// upload everyone's.
import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { User, ValidationRecord } from '../types';
import { databaseService } from '../services/databaseService';
import { AUTH_EXPIRED_EVENT, getToken } from '../services/apiClient';
import { prepareHistoryImage } from '../utils/imageUtils';
import { useToast } from '../components/common/Toast';

interface AuthContextType {
  user: User | null;
  /** True while a stored sign-in is being checked on page load. */
  isRestoring: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  history: ValidationRecord[];
  addHistoryRecord: (record: Omit<ValidationRecord, 'id' | 'timestamp' | 'userId'>) => void;
  clearHistory: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Records uploaded at the same time; keeps a large backlog from taking minutes.
const UPLOAD_BATCH_SIZE = 4;

const uploadOne = async (record: ValidationRecord): Promise<void> => {
  const [barcode, batch] = await Promise.all([
    prepareHistoryImage(record.barcodeImageUrl),
    prepareHistoryImage(record.batchImageUrl),
  ]);
  await databaseService.addHistoryRecord(
    { ...record, barcodeImageUrl: barcode.thumb ?? undefined, batchImageUrl: batch.thumb ?? undefined },
    { barcode: barcode.full, batch: batch.full },
  );
};

// Uploads the history waiting on this device that `user` may own, removes what
// was uploaded, and returns how many records went up. Records that fail stay
// on the device for the next attempt.
const uploadLocalHistory = async (user: User): Promise<number> => {
  const pending = databaseService.getLocalHistory()
    .filter(r => user.role === 'admin' || r.userId === user.id);
  const uploaded = new Set<string>();
  for (let i = 0; i < pending.length; i += UPLOAD_BATCH_SIZE) {
    await Promise.all(pending.slice(i, i + UPLOAD_BATCH_SIZE).map(record =>
      uploadOne(record)
        .then(() => { uploaded.add(record.id); })
        .catch(error => console.warn(`Could not upload history record ${record.id}; will retry later.`, error))
    ));
  }
  if (uploaded.size) databaseService.forgetLocalHistory(uploaded);
  return uploaded.size;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(() => Boolean(getToken()));
  const [history, setHistory] = useState<ValidationRecord[]>([]);
  const { showToast } = useToast();

  // Restore a stored sign-in once on load.
  useEffect(() => {
    if (!getToken()) return;
    databaseService.getCurrentUser()
      .then(setUser)
      .catch(error => console.warn('Could not restore sign-in:', error))
      .finally(() => setIsRestoring(false));
  }, []);

  // The server rejected our token (expired, or the user was removed): sign out.
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      showToast('Your session has ended. Please sign in again.', 'info');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [showToast]);

  // Load history when a user signs in, then upload any records waiting on this
  // device and reload if some went up. Loading first keeps History usable while
  // a large backlog uploads.
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const records = await databaseService.getHistory();
        if (!cancelled) setHistory(records);
      } catch (error: any) {
        if (!cancelled) showToast(error.message || 'Failed to load history.', 'error');
      }
    };
    (async () => {
      await load();
      if ((await uploadLocalHistory(user)) > 0) await load();
    })();
    return () => { cancelled = true; };
  }, [user, showToast]);

  const login = async (username: string, password: string): Promise<boolean> => {
    const foundUser = await databaseService.login(username, password);
    if (foundUser) {
      setUser(foundUser);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    databaseService.logout();
  };

  const addHistoryRecord = useCallback(async (record: Omit<ValidationRecord, 'id' | 'timestamp' | 'userId'>) => {
    if (!user) return;

    const [barcode, batch] = await Promise.all([
      prepareHistoryImage(record.barcodeImageUrl),
      prepareHistoryImage(record.batchImageUrl),
    ]);
    const newRecord: ValidationRecord = {
      ...record,
      barcodeImageUrl: barcode.thumb ?? undefined,
      batchImageUrl: batch.thumb ?? undefined,
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      timestamp: new Date().toISOString(),
      userId: user.id,
    };

    try {
      await databaseService.addHistoryRecord(newRecord, { barcode: barcode.full, batch: batch.full });
      setHistory(prevHistory => [newRecord, ...prevHistory]);
    } catch (error: any) {
      if (!databaseService.isOffline(error)) {
        showToast(`Result not saved to history: ${error.message || 'server error'}`, 'error');
        return;
      }
      // Server unreachable: keep the result on this device; it is uploaded after
      // the next successful save or sign-in. Larger photos first, thumbnails
      // only if device storage is too full for them.
      const queued = databaseService.queueLocalHistory({
        ...newRecord,
        barcodeImageUrl: barcode.full ?? undefined,
        batchImageUrl: batch.full ?? undefined,
      }) || databaseService.queueLocalHistory(newRecord);
      if (!queued) {
        showToast('Result not saved: the server is unreachable and this device is out of storage.', 'error');
        return;
      }
      setHistory(prevHistory => [newRecord, ...prevHistory]);
      showToast('Saved on this device. It will upload when the server is reachable.', 'info');
      return;
    }

    // Back online: send anything that was waiting on this device.
    if ((await uploadLocalHistory(user)) > 0) {
      databaseService.getHistory().then(setHistory).catch(() => {});
    }
  }, [user, showToast]);

  const clearHistory = useCallback(async () => {
    await databaseService.clearHistory();
    setHistory([]);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isRestoring, login, logout, history, addHistoryRecord, clearHistory }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
