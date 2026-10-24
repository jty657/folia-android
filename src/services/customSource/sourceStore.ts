import { create } from 'zustand';
import { getStoredBoolean, getStoredJson, setStoredBoolean, setStoredJson } from '../../stores/storagePrimitives';
import type { LxSourceScriptInfo } from './types';
import { runSourceScript, type LxSourceRunner } from './lxHost';

// src/services/customSource/sourceStore.ts
// 第三方音源的持久化与运行时状态：哪些脚本已导入、是否启用、当前加载好的 runner。
// 只存「导入清单 + 启用开关 + 脚本原文」；脚本执行产物（runner）在内存里，按需重建。

export const CUSTOM_SOURCE_ENABLED_KEY = 'custom_source_enabled';
export const CUSTOM_SOURCE_SCRIPTS_KEY = 'custom_source_scripts';
export const CUSTOM_SOURCE_ACTIVE_ID_KEY = 'custom_source_active_id';

export interface StoredSourceScript {
    id: string;
    scriptInfo: LxSourceScriptInfo;
    rawScript: string;
    importedAt: number;
    origin: 'local' | 'remote';
    originUrl?: string;
}

interface CustomSourceState {
    enabled: boolean;
    scripts: StoredSourceScript[];
    activeScriptId: string | null;
    /** 当前加载好的 runner（内存态，不持久化）。 */
    runner: LxSourceRunner | null;
    runnerForScriptId: string | null;
    setEnabled: (enabled: boolean) => void;
    addScript: (script: StoredSourceScript) => void;
    removeScript: (id: string) => void;
    setActiveScript: (id: string | null) => void;
    /** 加载/重建指定脚本的 runner；失败回 null 并打日志。 */
    loadRunner: (id: string) => Promise<LxSourceRunner | null>;
}

export const useCustomSourceStore = create<CustomSourceState>((set, get) => ({
    enabled: getStoredBoolean(CUSTOM_SOURCE_ENABLED_KEY, false),
    scripts: getStoredJson<StoredSourceScript[]>(CUSTOM_SOURCE_SCRIPTS_KEY, []),
    activeScriptId: getStoredJson<string | null>(CUSTOM_SOURCE_ACTIVE_ID_KEY, null),
    runner: null,
    runnerForScriptId: null,

    setEnabled: (enabled) => {
        setStoredBoolean(CUSTOM_SOURCE_ENABLED_KEY, enabled);
        set({ enabled });
    },

    addScript: (script) => {
        const next = [...get().scripts.filter((item) => item.id !== script.id), script];
        setStoredJson(CUSTOM_SOURCE_SCRIPTS_KEY, next);
        set({ scripts: next });
    },

    removeScript: (id) => {
        const next = get().scripts.filter((item) => item.id !== id);
        setStoredJson(CUSTOM_SOURCE_SCRIPTS_KEY, next);
        set({
            scripts: next,
            ...(get().activeScriptId === id ? { activeScriptId: null, runner: null, runnerForScriptId: null } : {}),
        });
        setStoredJson(CUSTOM_SOURCE_ACTIVE_ID_KEY, get().activeScriptId);
    },

    setActiveScript: (id) => {
        setStoredJson(CUSTOM_SOURCE_ACTIVE_ID_KEY, id);
        set({ activeScriptId: id });
    },

    loadRunner: async (id) => {
        const script = get().scripts.find((item) => item.id === id);
        if (!script) {
            console.warn('[CustomSource] loadRunner: script not found', id);
            return null;
        }
        try {
            const runner = await runSourceScript(script.rawScript, script.scriptInfo);
            set({ runner, runnerForScriptId: id });
            return runner;
        } catch (error) {
            console.warn('[CustomSource] loadRunner: script failed to initialize', error);
            return null;
        }
    },
}));

/** 当前应使用的 runner：启用且已加载到匹配脚本时才返回。 */
export const activeCustomSourceRunner = (): LxSourceRunner | null => {
    const state = useCustomSourceStore.getState();
    if (!state.enabled || !state.runner || !state.activeScriptId) return null;
    return state.runnerForScriptId === state.activeScriptId ? state.runner : null;
};

/** 判断当前是否具备「第三方音源可用」的前提：启用且有活动脚本。 */
export const isCustomSourceArmed = (): boolean => {
    const state = useCustomSourceStore.getState();
    return state.enabled && Boolean(state.activeScriptId);
};
