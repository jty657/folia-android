import type { SongResult } from '../../types';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import type { LxMusicInfo, LxQuality, LxSourceKey } from './types';

// src/services/customSource/musicInfoMapper.ts
// 把 Folia 三家在线歌曲（网易云/酷狗/QQ）映射成洛雪音源脚本认识的 musicInfo。平台 key 映射：
// netease→wy、kugou→kg、qq→tx。字段名与取值对齐洛雪 MusicInfoOnline（见项目记忆
// lx-music-source-protocol）。

/** Folia 平台 id → 洛雪源 key 映射（三家平台）；洛雪歌单导入也复用这份映射（反向）。 */
export const PLATFORM_TO_LX_SOURCE: Record<string, LxSourceKey> = {
    netease: 'wy',
    kugou: 'kg',
    qq: 'tx',
};

const formatInterval = (durationMs: number): string | undefined => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return undefined;
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const artistNames = (song: SongResult): string => (song.artists ?? []).map((artist) => artist.name).join('、');

/**
 * 一首歌能否交给第三方音源取流：仅三家在线平台（网易云/酷狗/QQ），且不是云盘变体。
 * 返回可映射的洛雪源 key，否则返回 null。
 */
export const lxSourceKeyForSong = (song: SongResult): LxSourceKey | null => {
    const sourceRef = getPlaybackSourceRef(song);
    if (sourceRef.kind !== 'online') return null;
    return PLATFORM_TO_LX_SOURCE[sourceRef.providerId] ?? null;
};

/** 把歌曲映射成洛雪 musicInfo；`lxSourceKeyForSong` 判定通过后才调用。 */
export const toLxMusicInfo = (song: SongResult, sourceKey: LxSourceKey): LxMusicInfo => {
    const sourceRef = getPlaybackSourceRef(song);
    const providerData = (sourceRef.kind === 'online' ? sourceRef.providerData : undefined) ?? {};
    const mediaId = sourceRef.kind === 'online' ? sourceRef.mediaId : String(song.id);

    const info: LxMusicInfo = {
        name: song.name,
        singer: artistNames(song),
        source: sourceKey,
        songmid: mediaId,
        ...(song.album?.name ? { albumName: song.album.name } : {}),
        ...(song.album?.id ? { albumId: song.album.id } : {}),
        ...(formatInterval(song.durationMs) ? { interval: formatInterval(song.durationMs)! } : {}),
        ...(song.album?.coverUrl ? { img: song.album.coverUrl } : {}),
    };

    // 平台特有 ID，音源脚本按 source key 读取。
    if (sourceKey === 'kg' && typeof providerData.hash === 'string') info.hash = providerData.hash;
    if (sourceKey === 'tx') {
        const songMid = typeof providerData.songMid === 'string' ? providerData.songMid : (song.qqMid ?? mediaId);
        if (songMid) info.songmid = songMid;
        if (typeof providerData.strMediaMid === 'string') info.strMediaMid = providerData.strMediaMid;
        if (typeof providerData.albumMid === 'string') info.albumMid = providerData.albumMid;
    }

    return info;
};

/** 音质偏好映射到洛雪音质档位；第三方源通常只分 128k/320k/flac。 */
export const toLxQuality = (quality: 'standard' | 'high' | 'ultra' | 'lossless' | 'hires'): LxQuality => {
    switch (quality) {
        case 'hires': return 'flac24bit';
        case 'lossless': return 'flac';
        case 'high':
        case 'ultra': return '320k';
        case 'standard':
        default: return '128k';
    }
};
