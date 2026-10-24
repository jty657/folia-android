import type { UnifiedSong } from '../types';
import type { MediaId } from '../types/onlineMusic';
import { PLATFORM_TO_LX_SOURCE } from './customSource/musicInfoMapper';

// src/services/lxmcPlaylistService.ts
// 解析洛雪音乐(LX Music)导出的 .lxmc 歌单文件（gzip 压缩的 playListPart_v2 JSON），
// 把里面的歌曲条目映射成 Folia 的 UnifiedSong，供「导入的在线歌单」分类播放。
// 取流依赖第三方音源（customSource）：播放时 omni.getAudioSource 优先走洛雪音源脚本。

interface LxmcQuality {
    type: string;
    size?: string;
    hash?: string;
}

interface LxmcSongMeta {
    songId?: number | string;
    albumName?: string;
    picUrl?: string;
    albumId?: number | string;
    hash?: string;
    strMediaMid?: string;
    albumMid?: string;
    copyrightId?: string;
    qualitys?: LxmcQuality[];
    _qualitys?: Record<string, LxmcQuality>;
}

export interface LxmcSongEntry {
    id: string;
    name: string;
    singer: string;
    source: string;
    interval?: string;
    meta?: LxmcSongMeta;
}

interface LxmcPlaylistData {
    name?: string;
    id?: string;
    source?: string;
    sourceListId?: string | number;
    list?: LxmcSongEntry[];
}

interface LxmcPayload {
    type?: string;
    data?: LxmcPlaylistData;
}

export interface ParsedLxmcPlaylist {
    name: string;
    sourceListId: string | null;
    songs: UnifiedSong[];
}

/** 洛雪 source key → Folia providerId（由第三方音源的平台↔洛雪 key 映射反向得到；kw/mg 无对应）。 */
const LX_SOURCE_TO_PROVIDER: Record<string, string> = Object.fromEntries(
    Object.entries(PLATFORM_TO_LX_SOURCE).map(([providerId, lxKey]) => [lxKey, providerId]),
);

const text = (value: unknown): string => (value == null ? '' : String(value));

const splitArtists = (singer: string): string[] => singer
    .split(/[、,，;；/&]+/)
    .map(name => name.trim())
    .filter(Boolean);

const intervalToMs = (interval: string | undefined): number => {
    if (!interval) return 0;
    const parts = interval.split(':').map(Number);
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    return 0;
};

const pickHash = (meta: LxmcSongMeta | undefined): string | null => {
    if (!meta) return null;
    if (typeof meta.hash === 'string' && meta.hash) return meta.hash;
    // 酷狗：qualitys 里 128k 档的 hash 作为稳定 hash（meta.hash 缺失时回退）。
    const first = meta.qualitys?.find(q => q.type === '128k')?.hash;
    return typeof first === 'string' && first ? first : null;
};

/**
 * 把 .lxmc 里的一条歌曲映射成 UnifiedSong。返回 null 表示该平台 Folia 不支持（kw/mg）。
 */
export const lxmcSongToUnifiedSong = (entry: LxmcSongEntry, index: number): UnifiedSong | null => {
    const providerId = LX_SOURCE_TO_PROVIDER[entry.source];
    if (!providerId) return null;

    const meta = entry.meta ?? {};
    const songId = meta.songId;
    const hash = pickHash(meta);
    const albumId = meta.albumId != null ? text(meta.albumId) : '';
    const coverUrl = text(meta.picUrl);

    let mediaId: MediaId;
    const providerData: Record<string, string | number> = {};

    if (entry.source === 'kg') {
        // 酷狗以 hash 为稳定播放身份；songId 作为详情/歌词参数。
        mediaId = hash ?? text(songId);
        if (hash) providerData.hash = hash;
        if (songId != null) providerData.songId = text(songId);
        if (albumId) providerData.albumId = albumId;
    } else if (entry.source === 'tx') {
        mediaId = text(songId);
        if (typeof meta.strMediaMid === 'string' && meta.strMediaMid) providerData.strMediaMid = meta.strMediaMid;
        if (typeof meta.albumMid === 'string' && meta.albumMid) providerData.albumMid = meta.albumMid;
        if (songId != null) providerData.songId = text(songId);
    } else {
        // 网易云（wy）：数字 songId 即稳定身份。
        mediaId = text(songId);
        if (songId != null) providerData.songId = text(songId);
    }

    const artists = splitArtists(entry.singer).map((name, artistIndex) => ({
        id: `lxmc-${index}-${artistIndex}`,
        name,
    }));

    return {
        id: mediaId,
        name: entry.name || 'Unknown Song',
        artists,
        album: {
            id: albumId || `lxmc-${index}-album`,
            name: text(meta.albumName),
            ...(coverUrl ? { coverUrl } : {}),
        },
        durationMs: intervalToMs(entry.interval),
        sourceRef: {
            kind: 'online',
            providerId,
            mediaId: String(mediaId),
            ...(Object.keys(providerData).length > 0 ? { providerData } : {}),
        },
    };
};

/**
 * 解析 .lxmc 文件内容（已解压的 JSON 文本）为一个歌单对象。
 */
export const parseLxmcJson = (rawText: string): ParsedLxmcPlaylist => {
    let payload: LxmcPayload;
    try {
        payload = JSON.parse(rawText) as LxmcPayload;
    } catch {
        throw new Error('Invalid .lxmc file: not valid JSON');
    }

    if (!payload || typeof payload !== 'object' || !payload.data) {
        throw new Error('Invalid .lxmc file: missing playlist data');
    }

    const data = payload.data;
    const entries = Array.isArray(data.list) ? data.list : [];
    const songs = entries
        .map((entry, index) => lxmcSongToUnifiedSong(entry, index))
        .filter((song): song is UnifiedSong => song !== null);

    return {
        name: text(data.name).trim() || 'Imported Playlist',
        sourceListId: data.sourceListId != null ? text(data.sourceListId) : null,
        songs,
    };
};

/**
 * 解析 .lxmc 文件（File 对象，gzip 压缩），返回歌单对象。
 */
export const parseLxmcFile = async (file: File): Promise<ParsedLxmcPlaylist> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let rawText: string;

    // .lxmc 是 gzip 压缩的 JSON；先尝试 gzip 解压，失败则按纯文本处理。
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const decompressed = await decompressGzip(bytes);
        rawText = new TextDecoder('utf-8').decode(decompressed);
    } else {
        rawText = new TextDecoder('utf-8').decode(bytes);
    }

    return parseLxmcJson(rawText);
};

/** 用浏览器原生 DecompressionStream 解压 gzip；不支持时回退抛出错误。 */
const decompressGzip = async (bytes: Uint8Array): Promise<Uint8Array> => {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('gzip decompression is not supported in this environment');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const result = await new Response(stream).arrayBuffer();
    return new Uint8Array(result);
};
