import { create } from 'zustand';
import type { ImportedOnlinePlaylist, UnifiedSong } from '../types';
import {
    deleteImportedOnlinePlaylist,
    getImportedOnlinePlaylists,
    importLxmcPlaylist,
} from '../services/importedOnlinePlaylistService';

// src/stores/useImportedOnlinePlaylistStore.ts
// 「导入的在线歌单」（.lxmc）的运行时状态：内存里一份 + IndexedDB 持久化。本地首页「导入歌单」
// 分类从这里读；导入 / 删除时更新。与 useLocalLibrarySettingsStore 一样是 zustand store。

interface ImportedOnlinePlaylistState {
    playlists: ImportedOnlinePlaylist[];
    loaded: boolean;
    load: () => Promise<void>;
    importPlaylist: (name: string, sourceListId: string | null, songs: UnifiedSong[]) => Promise<ImportedOnlinePlaylist>;
    removePlaylist: (id: string) => Promise<void>;
}

export const useImportedOnlinePlaylistStore = create<ImportedOnlinePlaylistState>((set, get) => ({
    playlists: [],
    loaded: false,

    load: async () => {
        try {
            const playlists = await getImportedOnlinePlaylists();
            set({ playlists, loaded: true });
        } catch (error) {
            console.error('[ImportedOnlinePlaylist] failed to load', error);
        }
    },

    importPlaylist: async (name, sourceListId, songs) => {
        const playlist = await importLxmcPlaylist(name, sourceListId, songs);
        set({ playlists: [...get().playlists, playlist] });
        return playlist;
    },

    removePlaylist: async (id) => {
        await deleteImportedOnlinePlaylist(id);
        set({ playlists: get().playlists.filter(playlist => playlist.id !== id) });
    },
}));

/** 启动时加载一次（幂等）。 */
export const ensureImportedOnlinePlaylistsLoaded = (): void => {
    const state = useImportedOnlinePlaylistStore.getState();
    if (!state.loaded) {
        void state.load();
    }
};

/** 导入一个 .lxmc 歌单并触发持久化。 */
export const importImportedOnlinePlaylist = (
    name: string,
    sourceListId: string | null,
    songs: UnifiedSong[],
): Promise<ImportedOnlinePlaylist> => useImportedOnlinePlaylistStore.getState().importPlaylist(name, sourceListId, songs);
