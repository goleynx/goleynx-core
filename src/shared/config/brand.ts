/**
 * @file 品牌配置
 * @module shared/config/brand
 */

export const BRAND = {
  appName: 'Goleynx',
  appShortName: 'Goleynx',
  appDescription: '多Agent协同开发桌面平台',
  appIcon: 'assets/icons/icon.png',
  version: '0.1.0',
  themeColor: '#4A90D9',
  author: '',
  website: '',
} as const

export type BrandConfig = typeof BRAND
