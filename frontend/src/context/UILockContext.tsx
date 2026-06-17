import React, { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';

export interface Lock {
  context_key: string;
  locked_by: string;
  expires_at: string;
}

export interface LockState {
  [contextKey: string]: {
    lockedBy: string;
    expiresAt: string;
  };
}

interface UILockContextType {
  locks: LockState;
  acquireLock: (courseId: number, contextKey: string, lockedBy: string, durationSeconds: number) => Promise<boolean>;
  releaseLock: (courseId: number, contextKey: string) => Promise<boolean>;
  fetchLocks: (courseId: number) => Promise<void>;
  isLocked: (contextKey: string) => boolean;
  getLockOwner: (contextKey: string) => string | null;
  setLocksDirectly: (locks: LockState) => void;
}

const UILockContext = createContext<UILockContextType | null>(null);

export const useUILock = () => {
  const context = useContext(UILockContext);
  if (!context) {
    throw new Error('useUILock must be used within a UILockProvider');
  }
  return context;
};

export const UILockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locks, setLocks] = useState<LockState>({});

  const fetchLocks = async (courseId: number) => {
    try {
      const res = await client.get(`/api/autopilot/courses/${courseId}/locks`);
      const activeLocks: LockState = {};
      res.data.forEach((lock: Lock) => {
        activeLocks[lock.context_key] = {
          lockedBy: lock.locked_by,
          expiresAt: lock.expires_at,
        };
      });
      setLocks(activeLocks);
    } catch (err) {
      console.error('Failed to fetch locks:', err);
    }
  };

  const acquireLock = async (courseId: number, contextKey: string, lockedBy: string, durationSeconds: number) => {
    try {
      await client.post(`/api/autopilot/courses/${courseId}/locks/acquire`, {
        context_key: contextKey,
        locked_by: lockedBy,
        duration_seconds: durationSeconds,
      });
      setLocks((prev) => ({
        ...prev,
        [contextKey]: {
          lockedBy,
          expiresAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
        },
      }));
      return true;
    } catch (err: any) {
      console.error('Failed to acquire lock:', err);
      fetchLocks(courseId); // Đồng bộ lại nếu có tranh chấp
      return false;
    }
  };

  const releaseLock = async (courseId: number, contextKey: string) => {
    try {
      await client.post(`/api/autopilot/courses/${courseId}/locks/release`, {
        context_key: contextKey,
      });
      setLocks((prev) => {
        const next = { ...prev };
        delete next[contextKey];
        return next;
      });
      return true;
    } catch (err) {
      console.error('Failed to release lock:', err);
      return false;
    }
  };

  const isLocked = (contextKey: string) => {
    const lock = locks[contextKey];
    if (!lock) return false;
    const isExpired = new Date(lock.expiresAt).getTime() < Date.now();
    return !isExpired;
  };

  const getLockOwner = (contextKey: string) => {
    if (!isLocked(contextKey)) return null;
    return locks[contextKey].lockedBy;
  };

  const setLocksDirectly = (newLocks: LockState) => {
    setLocks(newLocks);
  };

  // Quét định kỳ mỗi giây để tự động xóa khóa hết hạn trên giao diện
  useEffect(() => {
    const timer = setInterval(() => {
      setLocks((prev) => {
        const next: LockState = {};
        let changed = false;
        Object.entries(prev).forEach(([key, val]) => {
          if (new Date(val.expiresAt).getTime() > Date.now()) {
            next[key] = val;
          } else {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <UILockContext.Provider
      value={{
        locks,
        acquireLock,
        releaseLock,
        fetchLocks,
        isLocked,
        getLockOwner,
        setLocksDirectly,
      }}
    >
      {children}
    </UILockContext.Provider>
  );
};
