import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { getTheme } from '../theme';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'ui-theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * 主题 Provider：
 * - 初始值读取 localStorage['ui-theme']（默认 'light'）
 * - toggle/setMode 时同步写入 localStorage 并给 <html data-theme> 打标
 * - 内部用 getTheme(mode) + algorithm 包 ConfigProvider（保留中文 locale）
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = (next: ThemeMode) => setModeState(next);
  const toggle = () => setModeState((prev) => (prev === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ mode, toggle, setMode }}>
      <ConfigProvider locale={zhCN} theme={getTheme(mode)}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme 必须在 <ThemeProvider> 内部使用');
  }
  return ctx;
}
