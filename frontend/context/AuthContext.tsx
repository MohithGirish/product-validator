import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { User, ValidationRecord } from '../types';
import { databaseService } from '../services/databaseService';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  history: ValidationRecord[];
  addHistoryRecord: (record: Omit<ValidationRecord, 'id' | 'timestamp' | 'userId'>) => void;
  clearHistory: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<ValidationRecord[]>([]);

  // Fetch history when user logs in
  useEffect(() => {
    const fetchHistory = async () => {
      if (user) {
        const allHistory = await databaseService.getHistory();
        if (user.role === 'admin') {
          // Admins see all validation history from all users.
          setHistory(allHistory);
        } else {
          // Staff users only see their own validation history.
          const userSpecificHistory = allHistory.filter(record => record.userId === user.id);
          setHistory(userSpecificHistory);
        }
      } else {
        setHistory([]);
      }
    };
    fetchHistory();
  }, [user]);

  const login = async (username: string, password: string): Promise<boolean> => {
    const foundUser = await databaseService.findUserByUsernameAndPassword(username, password);
    if (foundUser) {
      setUser(foundUser);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
  };

  const addHistoryRecord = useCallback(async (record: Omit<ValidationRecord, 'id' | 'timestamp' | 'userId'>) => {
    if(!user) return;
    
    const newRecord: ValidationRecord = {
      ...record,
      id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      userId: user.id,
    };

    await databaseService.addHistoryRecord(newRecord);
    
    // Optimistically update the local history state
    if (user.role === 'staff') {
        // For staff, only add if it's their own record (which it always will be)
        setHistory(prevHistory => [newRecord, ...prevHistory]);
    } else {
        // For admins, add to their global view
        setHistory(prevHistory => [newRecord, ...prevHistory]);
    }

  }, [user]);

  const clearHistory = useCallback(async () => {
    await databaseService.clearHistory();
    setHistory([]);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, history, addHistoryRecord, clearHistory }}>
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