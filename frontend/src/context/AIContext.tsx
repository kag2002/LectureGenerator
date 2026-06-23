'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface AIUsageLog {
  id: string;
  timestamp: string;
  operation: string;
  model: string;
  latency: number;
  cost: number;
  tokens: number;
  status: 'success' | 'error';
}

export interface AIMonitorStats {
  totalCost: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
  averageLatency: number;
  modelName: string;
  logs: AIUsageLog[];
}

export interface AIGlobalStatus {
  isProcessing: boolean;
  message: string;
}

interface AIContextType {
  monitorStats: AIMonitorStats;
  globalAIStatus: AIGlobalStatus;
  recordAIUsage: (usage: {
    operation: string;
    model?: string;
    latency: number;
    cost?: number;
    tokens?: { prompt: number; completion: number };
    status: 'success' | 'error';
  }) => void;
  clearMonitorStats: () => void;
  setAIProcessingStatus: (isProcessing: boolean, message?: string) => void;
}

const AIContext = createContext<AIContextType | null>(null);

export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [monitorStats, setMonitorStats] = useState<AIMonitorStats>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai_monitor_stats');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Lỗi khi parse ai_monitor_stats:', e);
        }
      }
    }
    return {
      totalCost: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalRequests: 0,
      averageLatency: 0,
      modelName: 'gpt-4o',
      logs: []
    };
  });

  const [globalAIStatus, setGlobalAIStatus] = useState<AIGlobalStatus>({
    isProcessing: false,
    message: ''
  });

  useEffect(() => {
    localStorage.setItem('ai_monitor_stats', JSON.stringify(monitorStats));
  }, [monitorStats]);

  const recordAIUsage = (usage: {
    operation: string;
    model?: string;
    latency: number;
    cost?: number;
    tokens?: { prompt: number; completion: number };
    status: 'success' | 'error';
  }) => {
    setMonitorStats(prev => {
      const promptTokens = usage.tokens?.prompt || 0;
      const completionTokens = usage.tokens?.completion || 0;
      const cost = usage.cost || 0;
      const currentModel = usage.model || prev.modelName;

      const newLog: AIUsageLog = {
        id: Date.now().toString() + Math.random().toString().slice(2, 6),
        timestamp: new Date().toLocaleTimeString(),
        operation: usage.operation,
        model: currentModel,
        latency: Number(usage.latency),
        cost: cost,
        tokens: promptTokens + completionTokens,
        status: usage.status
      };

      const newLogs = [newLog, ...prev.logs].slice(0, 50);
      const newTotalRequests = prev.totalRequests + 1;
      const newAverageLatency = Number(
        ((prev.averageLatency * prev.totalRequests + Number(usage.latency)) / newTotalRequests).toFixed(2)
      );

      return {
        totalCost: Number((prev.totalCost + cost).toFixed(4)),
        totalPromptTokens: prev.totalPromptTokens + promptTokens,
        totalCompletionTokens: prev.totalCompletionTokens + completionTokens,
        totalRequests: newTotalRequests,
        averageLatency: newAverageLatency,
        modelName: currentModel,
        logs: newLogs
      };
    });
  };

  const clearMonitorStats = () => {
    setMonitorStats({
      totalCost: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalRequests: 0,
      averageLatency: 0,
      modelName: 'gpt-4o',
      logs: []
    });
  };

  const setAIProcessingStatus = (isProcessing: boolean, message: string = '') => {
    setGlobalAIStatus({ isProcessing, message });
  };

  return (
    <AIContext.Provider value={{ monitorStats, globalAIStatus, recordAIUsage, clearMonitorStats, setAIProcessingStatus }}>
      {children}
    </AIContext.Provider>
  );
};
