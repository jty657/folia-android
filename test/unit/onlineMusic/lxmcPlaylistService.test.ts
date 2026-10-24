import { describe, expect, it } from 'vitest';
import { lxmcSongToUnifiedSong, parseLxmcJson } from '../../../src/services/lxmcPlaylistService';
import type { LxmcSongEntry } from '../../../src/services/lxmcPlaylistService';

// test/unit/onlineMusic/lxmcPlaylistService.test.ts
// .lxmc 洛雪歌单解析与 UnifiedSong 映射：网易云/酷狗 → providerId + mediaId + providerData。

const kgEntry: LxmcSongEntry = {
    id: '644076687_9B181325FAF26A3C93D0ECC3D471F8E5',
    name: '唯有追赶风的方向',
    singer: '知更鸟、HOYO-MiX、Chevy',
    source: 'kg',
    interval: '02:03',
    meta: {
        songId: 644076687,
        albumName: '崩坏星穹铁道',
        picUrl: 'http://imge.kugou.com/cover.jpg',
        albumId: '204833475',
        hash: '9B181325FAF26A3C93D0ECC3D471F8E5',
        qualitys: [{ type: '128k', size: '1.89 MB', hash: '9B181325FAF26A3C93D0ECC3D471F8E5' }],
    },
};

const wyEntry: LxmcSongEntry = {
    id: 'wy_413961906',
    name: 'STYX HELIX',
    singer: 'MYTH & ROID',
    source: 'wy',
    interval: '04:51',
    meta: {
        songId: 413961906,
        albumName: 'Re:Zero ED',
        picUrl: 'http://p1.music.126.net/cover.jpg',
        albumId: 34700546,
    },
};

describe('lxmc playlist parser', () => {
    it('maps a kugou entry to providerId kugou with hash as mediaId', () => {
        const song = lxmcSongToUnifiedSong(kgEntry, 0);
        expect(song).not.toBeNull();
        expect(song!.sourceRef?.kind).toBe('online');
        expect(song!.sourceRef?.providerId).toBe('kugou');
        expect(song!.sourceRef?.mediaId).toBe('9B181325FAF26A3C93D0ECC3D471F8E5');
        expect(song!.sourceRef?.providerData).toMatchObject({ hash: '9B181325FAF26A3C93D0ECC3D471F8E5' });
        expect(song!.name).toBe('唯有追赶风的方向');
        expect(song!.artists.map(a => a.name)).toEqual(['知更鸟', 'HOYO-MiX', 'Chevy']);
        expect(song!.durationMs).toBe(123000);
        expect(song!.album.coverUrl).toBe('http://imge.kugou.com/cover.jpg');
    });

    it('maps a netease entry to providerId netease with numeric songId as mediaId', () => {
        const song = lxmcSongToUnifiedSong(wyEntry, 0);
        expect(song!.sourceRef?.providerId).toBe('netease');
        expect(song!.sourceRef?.mediaId).toBe('413961906');
        expect(song!.durationMs).toBe(291000);
        expect(song!.album.name).toBe('Re:Zero ED');
    });

    it('parses a full lxmc JSON payload', () => {
        const payload = {
            type: 'playListPart_v2',
            data: {
                name: '3333333',
                source: 'wy',
                sourceListId: '17775530308',
                list: [kgEntry, wyEntry],
            },
        };
        const parsed = parseLxmcJson(JSON.stringify(payload));
        expect(parsed.name).toBe('3333333');
        expect(parsed.sourceListId).toBe('17775530308');
        expect(parsed.songs).toHaveLength(2);
        expect(parsed.songs[0].sourceRef?.providerId).toBe('kugou');
        expect(parsed.songs[1].sourceRef?.providerId).toBe('netease');
    });

    it('skips unsupported platforms (kw/mg)', () => {
        const kwEntry: LxmcSongEntry = { ...kgEntry, source: 'kw', id: 'kw_123' };
        expect(lxmcSongToUnifiedSong(kwEntry, 0)).toBeNull();
    });
});
