import type { ImportedOnlinePlaylist, UnifiedSong } from '../types';
import { getFromCache, saveToCache } from './db';

// src/services/importedOnlinePlaylistService.ts
// 「导入的在线歌单」（从洛雪 .lxmc 文件导入）的持久化：与本地 LocalPlaylist（存本地文件 id）
// 分开，歌曲是 UnifiedSong（在线来源），播放时走 omni.getAudioSource（第三方音源取流）。

const IMPORTED_PLAYLISTS_CACHE_KEY = 'imported_online_playlists';

const createPlaylistId = () => `lxmc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const dedupeSongs = (songs: UnifiedSong[]): UnifiedSong[] => {
    const seen = new Set<string>();
    const deduped: UnifiedSong[] = [];
    songs.forEach(song => {
        const key = song.sourceRef?.kind === 'online'
            ? `${song.sourceRef.providerId}:${song.sourceRef.mediaId}`
            : String(song.id);
        if (!key || seen.has(key)) return;
        seen.add(key);
        deduped.push(song);
    });
    return deduped;
};

export const getImportedOnlinePlaylists = async (): Promise<ImportedOnlinePlaylist[]> => {
    const cached = await getFromCache<ImportedOnlinePlaylist[]>(IMPORTED_PLAYLISTS_CACHE_KEY);
    return Array.isArray(cached) ? cached : [];
};

const persistImportedOnlinePlaylists = async (playlists: ImportedOnlinePlaylist[]): Promise<void> => {
    await saveToCache(IMPORTED_PLAYLISTS_CACHE_KEY, playlists);
};

export const importLxmcPlaylist = async (
    name: string,
    sourceListId: string | null,
    songs: UnifiedSong[],
): Promise<ImportedOnlinePlaylist> => {
    const playlists = await getImportedOnlinePlaylists();
    const now = Date.now();
    const playlist: ImportedOnlinePlaylist = {
        id: createPlaylistId(),
        name: name.trim() || 'Imported Playlist',
        sourceListId,
        songs: dedupeSongs(songs),
        createdAt: now,
        updatedAt: now,
    };
    await persistImportedOnlinePlaylists([...playlists, playlist]);
    return playlist;
};

export const deleteImportedOnlinePlaylist = async (playlistId: string): Promise<void> => {
    const playlists = await getImportedOnlinePlaylists();
    await persistImportedOnlinePlaylists(playlists.filter(playlist => playlist.id !== playlistId));
};
