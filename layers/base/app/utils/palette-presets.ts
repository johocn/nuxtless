// 模板配色方案预设字典（L0 全局默认兜底）：C 端内置，与后端模板库的
// theme.palette.scheme 一一对应；各端（nshop/vshop）共用同一份语义。
export interface PaletteToken {
  primaryColor?: string;
  accentColor?: string;
  radius?: number | string;
  [key: string]: unknown;
}
export interface ThemePaletteDef {
  scheme: string;     // 调色板标识（模板 theme.palette.scheme 引用）
  name: string;       // 中文名（后台展示）
  tokens: PaletteToken; // 展开为 CSS 变量的 token 集
}

// 8 套预设（平台对标风 4 + 气质品牌风 4），默认 dawn-gold
export const PALETTE_PRESETS: Record<string, ThemePaletteDef> = {
  'dawn-gold': { scheme: 'dawn-gold', name: '晨曦金', tokens: { primaryColor: '#d4a574', accentColor: '#fdf6ee', radius: 8 } },
  'jd-red': { scheme: 'jd-red', name: '京东红', tokens: { primaryColor: '#e1251b', accentColor: '#ffeceb', radius: 8 } },
  'taobao-orange': { scheme: 'taobao-orange', name: '淘宝橙', tokens: { primaryColor: '#ff5000', accentColor: '#fff0e6', radius: 8 } },
  'pdd-red': { scheme: 'pdd-red', name: '拼多多红', tokens: { primaryColor: '#e02e24', accentColor: '#ffe9e7', radius: 8 } },
  'vip-blue': { scheme: 'vip-blue', name: '唯品会蓝紫', tokens: { primaryColor: '#4a5cff', accentColor: '#edefff', radius: 8 } },
  'tech-blue': { scheme: 'tech-blue', name: '科技蓝', tokens: { primaryColor: '#0066ff', accentColor: '#e6f0ff', radius: 10 } },
  'fresh-green': { scheme: 'fresh-green', name: '清雅绿', tokens: { primaryColor: '#07b873', accentColor: '#e6f9f0', radius: 10 } },
  'midnight': { scheme: 'midnight', name: '极夜黑', tokens: { primaryColor: '#1c1c1e', accentColor: '#333333', radius: 8 } },
};