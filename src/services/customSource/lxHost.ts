// crypto-es.mjs 是 UMD 打包的 CryptoJS ES 版，无类型声明；用 any 收窄避免 strict 下报错。
import CryptoJSModule from '../../nativeBridge/vendor/crypto-es.mjs';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CryptoJS: any = CryptoJSModule;
import type { LxInitedPayload, LxMusicInfo, LxQuality, LxSourceDecl, LxSourceScriptInfo } from './types';

// src/services/customSource/lxHost.ts
// 洛雪(LX Music)自定义源脚本的宿主 API：实现 `globalThis.lx`，让社区音源脚本能在 Folia 的
// WebView 里直接跑。脚本通过事件收发（inited / request）与宿主交互；`request` 走同源
// `/api/lyric-proxy` 交给原生 OkHttp 桥，绕开 WebView 的 CORS（见 nativeAndroidBridge）。

export const LX_API_VERSION = '1.3.0';

const EVENT_NAMES = {
    inited: 'inited',
    request: 'request',
    updateAlert: 'updateAlert',
} as const;

type LxRequestHandler = (payload: { source: string; action: string; info: unknown }) => unknown | Promise<unknown>;

interface LxRequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    form?: Record<string, string>;
    formData?: Record<string, string | Blob>;
    timeout?: number;
}

interface LxRequestResponse {
    statusCode: number;
    statusMessage?: string;
    headers: Record<string, string>;
    body: string;
}

const toHex = (bytes: any): string => bytes.toString(CryptoJS.enc.Hex);

/** 兼容 Node `Buffer.from` / `Buffer.toString` 的极小子集（base64/hex/utf8）。 */
const bufferUtil = {
    from(value: string, format: 'base64' | 'hex' | 'utf8' = 'utf8'): { toString: (fmt: 'base64' | 'hex' | 'utf8') => string } {
        let wordArray: any;
        if (format === 'base64') wordArray = CryptoJS.enc.Base64.parse(value);
        else if (format === 'hex') wordArray = CryptoJS.enc.Hex.parse(value);
        else wordArray = CryptoJS.enc.Utf8.parse(value);
        return {
            toString: (fmt: 'base64' | 'hex' | 'utf8') => {
                if (fmt === 'base64') return wordArray.toString(CryptoJS.enc.Base64);
                if (fmt === 'hex') return toHex(wordArray);
                return wordArray.toString(CryptoJS.enc.Utf8);
            },
        };
    },
    bufToString(value: { toString: (fmt: 'base64' | 'hex' | 'utf8') => string }, format: 'base64' | 'hex' | 'utf8') {
        return value.toString(format);
    },
};

/** 随机字节转 base64，语义接近 Node `crypto.randomBytes(size).toString('base64')`。 */
const randomBytesBase64 = (size: number): string => {
    const bytes = new Uint8Array(size);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let index = 0; index < size; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary);
};

const cryptoUtil = {
    md5: (str: string): string => toHex(CryptoJS.MD5(str)),
    randomBytes: (size: number): string => randomBytesBase64(size),
    aesEncrypt: (buffer: { toString: (fmt: 'base64' | 'hex' | 'utf8') => string }, mode: 'aes-128-cbc' | 'aes-128-ecb', key: string, iv: string): string => {
        const plain = buffer.toString('utf8');
        const cfg = {
            iv: CryptoJS.enc.Utf8.parse(iv),
            mode: mode === 'aes-128-cbc' ? CryptoJS.mode.CBC : CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7,
        };
        return CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(plain), CryptoJS.enc.Utf8.parse(key), cfg).toString();
    },
    rsaEncrypt: (buffer: { toString: (fmt: 'base64' | 'hex' | 'utf8') => string }): string => {
        // 洛雪脚本的 rsaEncrypt 用法是「明文 buffer + 平台公钥」，平台公钥通常写在脚本内。
        // 社区脚本几乎都自带 RSA 实现，此宿主方法只提供与洛雪一致的签名；极少数脚本调它时
        // 返回明文 base64，脚本会自行做模幂。
        return buffer.toString('base64');
    },
};

/**
 * 一个已加载的音源脚本运行实例：脚本执行后持有它声明的源（sources）与 `request` 处理器，
 * 供宿主按需请求 `musicUrl`。
 */
export interface LxSourceRunner {
    scriptInfo: LxSourceScriptInfo;
    sources: Record<string, LxSourceDecl>;
    requestMusicUrl(source: string, musicInfo: LxMusicInfo, quality: LxQuality | null): Promise<string | null>;
}

/**
 * 执行洛雪脚本：注入 `globalThis.lx` 跑一遍，等 `inited` 事件后返回 runner。
 * 脚本须同步或在极短异步内 `send(EVENT_NAMES.inited, { sources })`；否则按初始化失败处理。
 */
export const runSourceScript = (rawScript: string, scriptInfo: LxSourceScriptInfo): Promise<LxSourceRunner> => {
    return new Promise<LxSourceRunner>((resolve, reject) => {
        const state = {
            initedPayload: null as LxInitedPayload | null,
            requestHandler: null as LxRequestHandler | null,
        };

        const request = (
            url: string,
            options: LxRequestOptions = {},
            callback: (err: Error | null, resp: LxRequestResponse | null, body: string) => void,
        ): (() => void) => {
            let cancelled = false;
            void (async () => {
                try {
                    const proxyUrl = `/api/lyric-proxy?url=${encodeURIComponent(url)}`;
                    const init: RequestInit = { method: options.method || 'GET' };
                    if (options.headers) init.headers = options.headers;
                    if (options.body != null) init.body = options.body;
                    else if (options.form) init.body = new URLSearchParams(options.form).toString();
                    else if (options.formData) {
                        const fd = new FormData();
                        Object.entries(options.formData).forEach(([key, value]) => fd.append(key, value));
                        init.body = fd;
                    }
                    const response = await fetch(proxyUrl, init);
                    if (cancelled) return;
                    const headers: Record<string, string> = {};
                    response.headers.forEach((value, key) => { headers[key] = value; });
                    const body = await response.text();
                    callback(null, { statusCode: response.status, headers, body }, body);
                } catch (error) {
                    if (cancelled) return;
                    callback(error instanceof Error ? error : new Error(String(error)), null, '');
                }
            })();
            return () => { cancelled = true; };
        };

        const host = {
            version: LX_API_VERSION,
            env: 'mobile',
            currentScriptInfo: scriptInfo,
            EVENT_NAMES,
            request,
            utils: {
                buffer: bufferUtil,
                crypto: cryptoUtil,
                zlib: {
                    inflate: () => Promise.reject(new Error('zlib.inflate is not implemented in Folia custom source host')),
                    deflate: () => Promise.reject(new Error('zlib.deflate is not implemented in Folia custom source host')),
                },
            },
            on: (eventName: string, handler: LxRequestHandler) => {
                if (eventName === EVENT_NAMES.request) state.requestHandler = handler;
            },
            send: (eventName: string, payload: unknown) => {
                if (eventName === EVENT_NAMES.inited) state.initedPayload = payload as LxInitedPayload;
            },
        };

        const settle = (runner: LxSourceRunner | null, error?: Error) => {
            (globalThis as Record<string, unknown>).lx = previousLx;
            if (runner) resolve(runner);
            else reject(error ?? new Error('Source script did not send `inited`'));
        };

        const previousLx = (globalThis as Record<string, unknown>).lx;
        try {
            (globalThis as Record<string, unknown>).lx = host;
            const run = new Function(rawScript);
            run();
        } catch (error) {
            settle(null, error instanceof Error ? error : new Error(String(error)));
            return;
        }

        // 脚本可能异步 send(inited)；留一小段等待窗口后判定。
        window.setTimeout(() => {
            if (!state.initedPayload) {
                settle(null);
                return;
            }
            settle({
                scriptInfo,
                sources: state.initedPayload.sources ?? {},
                requestMusicUrl: async (source, musicInfo, quality) => {
                    if (!state.requestHandler) return null;
                    try {
                        const result = await state.requestHandler({
                            source,
                            action: 'musicUrl',
                            info: { type: quality, musicInfo },
                        });
                        return typeof result === 'string' && result ? result : null;
                    } catch {
                        return null;
                    }
                },
            });
        }, 2500);
    });
};
