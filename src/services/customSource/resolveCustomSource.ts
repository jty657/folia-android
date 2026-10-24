import type { SongResult } from '../../types';
import type { AudioQualityPreference, ProviderAudioSource } from '../../types/onlineMusic';
import { activeCustomSourceRunner, isCustomSourceArmed } from './sourceStore';
import { lxSourceKeyForSong, toLxMusicInfo, toLxQuality } from './musicInfoMapper';

// src/services/customSource/resolveCustomSource.ts
// 第三方音源取流的唯一入口：omni.getAudioSource 在内置 provider 之前调用它。若用户已启用
// 第三方音源、且歌曲属于网易云/酷狗/QQ，则把歌曲交给音源脚本的 musicUrl action 拿播放地址；
// 拿不到（未启用 / 脚本失败 / 无匹配源）返回 null，由 omni 回退内置 provider。

export const resolveCustomSourceAudio = async (
    song: SongResult,
    quality: AudioQualityPreference,
): Promise<ProviderAudioSource | null> => {
    if (!isCustomSourceArmed()) return null;

    const sourceKey = lxSourceKeyForSong(song);
    if (!sourceKey) return null;

    const runner = activeCustomSourceRunner();
    if (!runner) return null;
    if (!runner.sources[sourceKey]?.actions.includes('musicUrl')) return null;

    const musicInfo = toLxMusicInfo(song, sourceKey);
    const lxQuality = toLxQuality(quality);
    const url = await runner.requestMusicUrl(sourceKey, musicInfo, lxQuality);
    if (!url || !/^https?:\/\//.test(url)) return null;

    return {
        url,
        fetchedAt: Date.now(),
        quality,
    };
};
