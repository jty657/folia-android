import React from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp, Link2, Trash2 } from 'lucide-react';
import { useCustomSourceStore } from '../../../services/customSource/sourceStore';
import type { StoredSourceScript } from '../../../services/customSource/sourceStore';
import { runSourceScript } from '../../../services/customSource/lxHost';
import type { LxSourceScriptInfo } from '../../../services/customSource/types';

// src/components/command-palette/surfaces/CustomSourceManager.tsx
// 第三方音源（洛雪式脚本）导入与管理界面：导入 .js 脚本 / 粘贴在线地址、查看脚本声明的源、
// 启用开关与选中脚本。挂在命令面板里（settingsCommands 的 custom-source-manager 命令）。

interface CustomSourceManagerProps {
    theme?: unknown;
}

const parseScriptHeader = (raw: string): LxSourceScriptInfo => {
    const name = raw.match(/@name\s+([^\n*]+)/)?.[1]?.trim() ?? 'Untitled source';
    const description = raw.match(/@description\s+([^\n*]+)/)?.[1]?.trim();
    const version = raw.match(/@version\s+([^\n*]+)/)?.[1]?.trim();
    const author = raw.match(/@author\s+([^\n*]+)/)?.[1]?.trim();
    const homepage = raw.match(/@homepage\s+([^\n*]+)/)?.[1]?.trim();
    return { name, ...(description ? { description } : {}), ...(version ? { version } : {}), ...(author ? { author } : {}), ...(homepage ? { homepage } : {}) };
};

const makeId = (): string => `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const CustomSourceManager: React.FC<CustomSourceManagerProps> = () => {
    const { t } = useTranslation();
    const { enabled, scripts, activeScriptId, setEnabled, addScript, removeScript, setActiveScript, loadRunner } = useCustomSourceStore();
    const [remoteUrl, setRemoteUrl] = React.useState('');
    const [status, setStatus] = React.useState<{ type: 'ok' | 'error'; text: string } | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const importRaw = async (raw: string, origin: 'local' | 'remote', originUrl?: string) => {
        if (!raw.trim()) return;
        const scriptInfo = parseScriptHeader(raw);
        // 先试跑一遍验证脚本能 init，成功才入库。
        try {
            await runSourceScript(raw, scriptInfo);
        } catch (error) {
            setStatus({ type: 'error', text: t('customSource.importFailed', 'Script failed to initialize') });
            console.warn('[CustomSource] import validation failed', error);
            return;
        }
        const script: StoredSourceScript = {
            id: makeId(),
            scriptInfo,
            rawScript: raw,
            importedAt: Date.now(),
            origin,
            ...(originUrl ? { originUrl } : {}),
        };
        addScript(script);
        if (!activeScriptId) setActiveScript(script.id);
        setStatus({ type: 'ok', text: t('customSource.imported', 'Source imported') });
    };

    const onPickFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const raw = await file.text();
            await importRaw(raw, 'local');
        } catch (error) {
            setStatus({ type: 'error', text: t('customSource.readFailed', 'Failed to read the file') });
            console.warn('[CustomSource] file read failed', error);
        }
    };

    const onImportRemote = async () => {
        if (!remoteUrl.trim()) return;
        try {
            const response = await fetch(`/api/lyric-proxy?url=${encodeURIComponent(remoteUrl.trim())}`);
            const raw = await response.text();
            await importRaw(raw, 'remote', remoteUrl.trim());
        } catch (error) {
            setStatus({ type: 'error', text: t('customSource.remoteFailed', 'Failed to fetch the remote source') });
            console.warn('[CustomSource] remote import failed', error);
        }
    };

    const onToggleScript = async (id: string) => {
        if (activeScriptId === id) {
            setActiveScript(null);
            return;
        }
        setActiveScript(id);
        await loadRunner(id);
    };

    return (
        <div className="custom-source-manager flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-semibold">{t('customSource.title', 'Third-party sound sources')}</div>
                    <div className="text-xs opacity-70">{t('customSource.desc', 'Use LX Music style source scripts to resolve playable audio URLs.')}</div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) => setEnabled(event.target.checked)}
                        className="h-4 w-4"
                    />
                    {t('customSource.enable', 'Enable')}
                </label>
            </div>

            <div className="flex gap-2">
                <input ref={fileInputRef} type="file" accept=".js,text/javascript,application/javascript" className="hidden" onChange={onPickFile} />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg border border-[var(--st-line)] px-3 py-2 text-sm hover:bg-[var(--st-hover)]"
                >
                    <FileUp size={16} />
                    {t('customSource.importLocal', 'Import file')}
                </button>
                <input
                    type="text"
                    value={remoteUrl}
                    onChange={(event) => setRemoteUrl(event.target.value)}
                    placeholder={t('customSource.remotePlaceholder', 'Paste a source script URL')}
                    className="flex-1 rounded-lg border border-[var(--st-line)] bg-transparent px-3 py-2 text-sm"
                />
                <button
                    type="button"
                    onClick={onImportRemote}
                    className="flex items-center gap-2 rounded-lg border border-[var(--st-line)] px-3 py-2 text-sm hover:bg-[var(--st-hover)]"
                >
                    <Link2 size={16} />
                    {t('customSource.importRemote', 'Import')}
                </button>
            </div>

            {status && (
                <div className={`text-xs ${status.type === 'ok' ? 'text-emerald-500' : 'text-red-500'}`}>{status.text}</div>
            )}

            <div className="flex flex-col gap-2">
                {scripts.length === 0 && (
                    <div className="py-4 text-center text-sm opacity-60">{t('customSource.empty', 'No source scripts imported yet.')}</div>
                )}
                {scripts.map((script) => (
                    <div key={script.id} className="flex items-center gap-3 rounded-lg border border-[var(--st-line)] p-3">
                        <input
                            type="radio"
                            name="custom-source-active"
                            checked={activeScriptId === script.id}
                            onChange={() => void onToggleScript(script.id)}
                            className="h-4 w-4"
                        />
                        <div className="flex-1">
                            <div className="text-sm font-medium">{script.scriptInfo.name}</div>
                            <div className="text-xs opacity-60">
                                {script.scriptInfo.version ? `v${script.scriptInfo.version} · ` : ''}
                                {script.origin === 'local' ? t('customSource.fromLocal', 'local file') : script.originUrl}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => removeScript(script.id)}
                            className="rounded p-1 text-red-500 hover:bg-[var(--st-hover)]"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CustomSourceManager;
