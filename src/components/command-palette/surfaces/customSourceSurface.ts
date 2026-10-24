import type { CommandPaletteSurface, CommandSurfaceRenderArgs } from './types';

// src/components/command-palette/surfaces/customSourceSurface.ts
// 第三方音源管理命令的面板接管：懒加载管理界面，保持命令注册表是纯 TS 模块。

const buildViewProps = ({ theme }: CommandSurfaceRenderArgs) => ({ theme });

export const customSourceSurface: CommandPaletteSurface = {
    load: () => import('./CustomSourceManager'),
    mapProps: buildViewProps,
};
