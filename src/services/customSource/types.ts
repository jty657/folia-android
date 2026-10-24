import type { JsonValue } from '../../types/onlineMusic';

// src/services/customSource/types.ts
// 第三方音源（洛雪 LX Music 风格）兼容层的类型契约。只描述「导入脚本 → 声明源 → 按需取
// 播放地址」这条链路，不涉及搜索与歌词：那两者继续走内置 provider（见 onlineMusic/omni.ts）。

/** 洛雪源 key。与洛雪社区音源脚本的 sources 键一致：wy=网易云 kg=酷狗 tx=QQ kw=酷我 mg=咪咕。 */
export type LxSourceKey = 'wy' | 'kg' | 'tx' | 'kw' | 'mg' | 'local' | (string & {});

/** 音质档位，与洛雪脚本 qualitys 的取值一致。 */
export type LxQuality = '128k' | '320k' | 'flac' | 'flac24bit';

/** 脚本 `inited` 事件里声明的单个源。 */
export interface LxSourceDecl {
    name: string;
    type: 'music';
    actions: Array<'musicUrl' | 'lyric' | 'pic'>;
    qualitys: LxQuality[];
}

/** 脚本 `inited` 事件整体载荷。 */
export interface LxInitedPayload {
    openDevTools?: boolean;
    sources: Record<string, LxSourceDecl>;
}

/** `musicUrl` 请求的 info：type 为音质（local 源为 null），musicInfo 为歌曲信息。 */
export interface LxMusicUrlInfo {
    type: LxQuality | null;
    musicInfo: LxMusicInfo;
}

/** 传给音源脚本的歌曲信息（洛雪 MusicInfoOnline 的必需字段 + 平台 cookie 附加字段）。 */
export interface LxMusicInfo {
    name: string;
    singer: string;
    source: string;
    songmid: string | number;
    albumId?: string | number;
    albumName?: string;
    interval?: string;
    img?: string;
    // 平台特有字段，音源脚本按需读取。
    hash?: string;
    strMediaMid?: string;
    albumMid?: string;
    copyrightId?: string;
    // 社区音源（六音等）可能需要用户自填的平台 cookie。
    neteaseCookie?: string;
    tencentCookie?: string;
    kugouCookie?: string;
    [key: string]: JsonValue | undefined;
}

/** 脚本元信息（头部注释解析结果）。 */
export interface LxSourceScriptInfo {
    name: string;
    description?: string;
    version?: string;
    author?: string;
    homepage?: string;
}

/** 一条已导入并解析的音源脚本。 */
export interface ImportedSourceScript {
    id: string;
    scriptInfo: LxSourceScriptInfo;
    /** 脚本声明的源（`inited` 载荷里 sources 的内容）。 */
    sources: Record<string, LxSourceDecl>;
    /** 原始脚本文本，用于持久化与重新执行。 */
    rawScript: string;
    importedAt: number;
    /** 导入方式：本地文件或在线 URL。 */
    origin: 'local' | 'remote';
    originUrl?: string;
}
