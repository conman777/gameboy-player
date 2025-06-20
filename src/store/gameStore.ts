import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getRomHash } from '../utils/getRomHash';

export interface LogEntry {
  timestamp: Date;
  type: 'info' | 'ai' | 'game' | 'error' | 'user';
  message: string;
}

export interface AIConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  provider?: 'openrouter' | 'lmstudio' | 'ollama';
  lmStudioUrl?: string;
  ollamaUrl?: string;
  goal?: string;
}

export interface UsageStats {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
  totalCost: number;
  sessionStartTime: Date;
}

export interface GameState {
  isPlaying: boolean;
  aiEnabled: boolean;
  currentGame: string | null;
  gameData: Uint8Array | null;
  currentRomId: string | null;
  aiStatus: 'idle' | 'thinking' | 'playing' | 'error';
  logs: LogEntry[];
  isMuted: boolean;
  aiConfig: AIConfig;
  usageStats: UsageStats;
}

export interface GameStore extends GameState {
  loadGame: (gameData: Uint8Array, fileName: string) => Promise<void>;
  togglePlayPause: () => void;
  stopGame: () => void;
  toggleAI: () => void;
  toggleMute: () => void;
  addLog: (type: LogEntry['type'], message: string) => void;
  clearLogs: () => void;
  updateAIConfig: (config: AIConfig) => void;
  setAIStatus: (status: GameState['aiStatus']) => void;
  updateUsageStats: (promptTokens: number, completionTokens: number, cost: number) => void;
  resetUsageStats: () => void;
}

const initialState: GameState = {
  isPlaying: false,
  aiEnabled: false,
  currentGame: null,
  gameData: null,
  currentRomId: null,
  aiStatus: 'idle',
  logs: [],
  isMuted: false,
  aiConfig: {
    apiKey: '',
    model: '',
    temperature: 0.7,
    maxTokens: 1000,
    provider: 'openrouter',
    lmStudioUrl: 'http://localhost:1234',
    ollamaUrl: 'http://localhost:11434',
    goal: ''
  },
  usageStats: {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalRequests: 0,
    totalCost: 0,
    sessionStartTime: new Date()
  }
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      loadGame: async (gameData: Uint8Array, fileName: string) => {
        try {
          const romId = await getRomHash(gameData);
          set({
            currentGame: fileName,
            gameData,
            currentRomId: romId,
            isPlaying: false
          });
          get().addLog('game', `Loaded: ${fileName} (ROM ID: ${romId.substring(0, 8)}...)`);
        } catch (error) {
          console.error('Error computing ROM hash:', error);
          set({
            currentGame: fileName,
            gameData,
            currentRomId: null,
            isPlaying: false
          });
          get().addLog('game', `Loaded: ${fileName} (ROM ID computation failed)`);
        }
      },
      
      togglePlayPause: () => {
        const state = get();
        if (!state.currentGame) {
          state.addLog('error', 'No game loaded');
          return;
        }
        
        const newIsPlaying = !state.isPlaying;
        set({ isPlaying: newIsPlaying });
        
        if (!newIsPlaying && state.aiEnabled) {
          state.addLog('info', 'Manually stopping AI due to pause');
        }
      },
      
      stopGame: () => {
        set({
          isPlaying: false,
          aiEnabled: false,
          aiStatus: 'idle'
        });
        get().addLog('game', 'Game stopped and reset');
      },
      
      toggleAI: () => {
        const newAIEnabled = !get().aiEnabled;
        set({
          aiEnabled: newAIEnabled,
          aiStatus: newAIEnabled ? 'idle' : 'idle'
        });
        
        if (!newAIEnabled) {
          get().addLog('info', 'Manually stopping AI');
        }
      },
      
      toggleMute: () => {
        const newMuteState = !get().isMuted;
        set({ isMuted: newMuteState });
        localStorage.setItem('gameboy-ai-muted', newMuteState.toString());
        get().addLog('info', `Audio ${newMuteState ? 'muted' : 'unmuted'}`);
      },
      
      addLog: (type: LogEntry['type'], message: string) => {
        set(state => ({
          ...state,
          logs: [
            ...state.logs,
            {
              timestamp: new Date(),
              type,
              message
            }
          ]
        }));
      },
      
      clearLogs: () => {
        set({ logs: [] });
        get().addLog('info', 'Activity log cleared');
      },
      
      updateAIConfig: (config: AIConfig) => {
        set({ aiConfig: config });
        if (config.apiKey !== get().aiConfig.apiKey) {
          localStorage.setItem('gameboy-ai-api-key', config.apiKey);
          if (config.apiKey) {
            get().addLog('info', 'API key saved locally');
          }
        }
      },
      
      setAIStatus: (status: GameState['aiStatus']) => {
        set({ aiStatus: status });
      },

      updateUsageStats: (promptTokens: number, completionTokens: number, cost: number) => {
        set(state => ({
          usageStats: {
            ...state.usageStats,
            totalPromptTokens: state.usageStats.totalPromptTokens + promptTokens,
            totalCompletionTokens: state.usageStats.totalCompletionTokens + completionTokens,
            totalRequests: state.usageStats.totalRequests + 1,
            totalCost: state.usageStats.totalCost + cost
          }
        }));
      },

      resetUsageStats: () => {
        set({
          usageStats: {
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            totalRequests: 0,
            totalCost: 0,
            sessionStartTime: new Date()
          }
        });
        get().addLog('info', 'Usage statistics reset');
      }
    }),
    {
      name: 'gameboy-ai-store',
      partialize: state => ({
        isMuted: state.isMuted,
        aiConfig: state.aiConfig
      })
    }
  )
);