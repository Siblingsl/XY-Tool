/**
 * AntD 主题配置 —— 「暖墨 Sunlit Ink」
 * 所有色彩/圆角/字体 Token 取自 ui-redesign/design-system.md，
 * 不再出现硬编码的靛蓝（#4F46E5）等旧色值。
 */
import { theme, type ThemeConfig } from 'antd';

const FONT_BODY =
  "'Plus Jakarta Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
const FONT_DISPLAY =
  "'Space Grotesk', 'Plus Jakarta Sans', 'Noto Sans SC', sans-serif";

/** 亮色 Token（design-system.md §3.1 Light） */
const lightToken = {
  colorPrimary: '#B45309',
  colorLink: '#B45309',
  colorInfo: '#2D6FE0',
  colorSuccess: '#1F9D6B',
  colorWarning: '#C77800',
  colorError: '#D63A3A',
  colorBgLayout: '#FBF8F3',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',
  colorBorder: '#ECE5D9',
  colorBorderSecondary: '#F1EBDF',
  colorSplit: '#F1EBDF',
  colorText: '#1E1A14',
  colorTextSecondary: '#6B635A',
  colorTextTertiary: '#8A8076',
  borderRadius: 12,
  borderRadiusLG: 16,
  borderRadiusSM: 8,
  fontFamily: FONT_BODY,
  fontSize: 14,
};

/** 暗色 Token（design-system.md §3.1 Dark）—— 品牌色提亮，避免霓虹感 */
const darkToken = {
  colorPrimary: '#F59E0B',
  colorLink: '#F59E0B',
  colorInfo: '#60A5FA',
  colorSuccess: '#34D399',
  colorError: '#F87171',
  colorWarning: '#FBBF24',
  colorBgLayout: '#15110C',
  colorBgContainer: '#1F1A13',
  colorBgElevated: '#1F1A13',
  colorBgSpotlight: '#261F16',
  colorBorder: '#2E271D',
  colorBorderSecondary: '#241E16',
  colorSplit: '#241E16',
  colorText: '#F4ECE0',
  colorTextSecondary: '#A89E92',
  colorTextTertiary: '#8A8175',
  borderRadius: 12,
  borderRadiusLG: 16,
  borderRadiusSM: 8,
  fontFamily: FONT_BODY,
  fontSize: 14,
};

const lightComponents = {
  Layout: { siderBg: '#FFFFFF', headerBg: '#FFFFFF', bodyBg: '#FBF8F3' },
  Menu: {
    itemBg: 'transparent',
    itemSelectedBg: '#FCF3E3',
    itemSelectedColor: '#9A4A06',
    itemHoverBg: '#F6F1E9',
    itemHoverColor: '#1E1A14',
    itemColor: '#6B635A',
    itemBorderRadius: 8,
    itemHeight: 42,
    itemMarginInline: 8,
    iconSize: 16,
    subMenuItemBg: 'transparent',
  },
  Card: { borderRadiusLG: 16 },
  Button: { borderRadius: 10, primaryShadow: 'none' },
  Statistic: { contentFontSize: 30 },
};

const darkComponents = {
  Layout: { siderBg: '#1F1A13', headerBg: '#1F1A13', bodyBg: '#15110C' },
  Menu: {
    itemBg: 'transparent',
    itemSelectedBg: 'rgba(245,158,11,.14)',
    itemSelectedColor: '#FBBF24',
    itemHoverBg: '#261F16',
    itemHoverColor: '#F4ECE0',
    itemColor: '#A89E92',
    itemBorderRadius: 8,
    itemHeight: 42,
    itemMarginInline: 8,
    iconSize: 16,
    subMenuItemBg: 'transparent',
  },
  Card: { borderRadiusLG: 16 },
  Button: { borderRadius: 10 },
  Statistic: { contentFontSize: 30 },
};

/**
 * 按 mode 返回对应的 AntD 主题对象。
 * 暗色模式下叠加 theme.darkAlgorithm，并由 ConfigProvider 注入。
 */
export function getTheme(mode: 'light' | 'dark'): ThemeConfig {
  if (mode === 'dark') {
    return {
      algorithm: theme.darkAlgorithm,
      token: darkToken,
      components: darkComponents,
    };
  }
  return {
    token: lightToken,
    components: lightComponents,
  };
}

export const FONTS = { body: FONT_BODY, display: FONT_DISPLAY };
