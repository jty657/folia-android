import { describe, expect, it } from 'vitest';
import { lxSourceKeyForSong, toLxMusicInfo, toLxQuality } from '../../../src/services/customSource/musicInfoMapper';
import type { SongResult } from '../../../src/types';

// test/unit/onlineMusic/customSourceMapper.test.ts
// 第三方音源歌曲映射：三家平台 → 洛雪 source key / musicInfo 字段，以及音质档位换算。

const baseSong: SongResult = {
    id: '1',
    name: 'Test Song',
    artists: [{ id: 'a1', name: 'Singer A' }, { id: 'a2', name: 'Singer B' }],
    album: { id: '100', name: 'Album X', coverUrl: 'https://img.example/cover.jpg' },
    durationMs: 235000,
};

describe('custom source musicInfo mapper', () => {
    it('maps netease to wy and uses the numeric media id as songmid', () => {
        const song: SongResult = { ...baseSong, sourceRef: { kind: 'online', providerId: 'netease', mediaId: '123456' } };
        expect(lxSourceKeyForSong(song)).toBe('wy');
        const info = toLxMusicInfo(song, 'wy');
        expect(info.source).toBe('wy');
        expect(info.songmid).toBe('123456');
        expect(info.name).toBe('Test Song');
        expect(info.singer).toBe('Singer A、Singer B');
        expect(info.albumName).toBe('Album X');
        expect(info.interval).toBe('03:55');
        expect(info.img).toBe('https://img.example/cover.jpg');
    });

    it('maps kugou to kg and carries the hash', () => {
        const song: SongResult = {
            ...baseSong,
            kgHash: 'HASH123',
            sourceRef: { kind: 'online', providerId: 'kugou', mediaId: 'HASH123', providerData: { hash: 'HASH123', albumId: '999' } },
        };
        expect(lxSourceKeyForSong(song)).toBe('kg');
        const info = toLxMusicInfo(song, 'kg');
        expect(info.source).toBe('kg');
        expect(info.songmid).toBe('HASH123');
        expect(info.hash).toBe('HASH123');
    });

    it('maps qq to tx and prefers songMid over numeric id', () => {
        const song: SongResult = {
            ...baseSong,
            qqMid: 'MID123',
            sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'MID123', providerData: { songId: 456, songMid: 'MID123', albumMid: 'AMID' } },
        };
        expect(lxSourceKeyForSong(song)).toBe('tx');
        const info = toLxMusicInfo(song, 'tx');
        expect(info.source).toBe('tx');
        expect(info.songmid).toBe('MID123');
        expect(info.albumMid).toBe('AMID');
    });

    it('returns null for non-online or non-three-platform songs', () => {
        expect(lxSourceKeyForSong({ ...baseSong, sourceRef: { kind: 'local', mediaId: 'x' } })).toBeNull();
        expect(lxSourceKeyForSong({ ...baseSong, sourceRef: { kind: 'navidrome', mediaId: 'x' } })).toBeNull();
        expect(lxSourceKeyForSong({ ...baseSong, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'x' } })).toBeNull();
    });

    it('maps audio quality preferences to lx quality tiers', () => {
        expect(toLxQuality('standard')).toBe('128k');
        expect(toLxQuality('high')).toBe('320k');
        expect(toLxQuality('ultra')).toBe('320k');
        expect(toLxQuality('lossless')).toBe('flac');
        expect(toLxQuality('hires')).toBe('flac24bit');
    });
});
