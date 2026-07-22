import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';

const theme = {
  token: {
    colorPrimary: '#4F46E5',
    borderRadius: 6,
    colorBgLayout: '#F8FAFC',
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
  components: {
    Layout: {
      siderBg: '#ffffff',
      headerBg: '#ffffff',
      bodyBg: '#F8FAFC',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: '#EEF2FF',
      itemSelectedColor: '#4F46E5',
      itemHoverBg: '#F1F5F9',
      itemHoverColor: '#334155',
      itemColor: '#64748B',
      itemBorderRadius: 6,
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={theme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
