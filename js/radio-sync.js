/**
 * ============================================================================
 * QDG RADIO // REAL-TIME BROADCAST SYNC & STORAGE BUS (js/radio-sync.js)
 * Connects the Admin Control Room (admin.html) with Listener Screens (index.html)
 * Uses:
 *  1. BroadcastChannel ('qdg_radio_live_bus') for instant real-time events & audio chunks
 *  2. localStorage ('qdg_radio_broadcast_state') for persistent state & cross-tab sync
 *  3. IndexedDB ('QDGRadioMediaDB') for storing uploaded MP3/WAV files in browser
 *  4. Optional HTTP Backend API (/api/state, /api/upload) when server.py is active
 * ============================================================================
 */

(function (global) {
    'use strict';

    const STORAGE_KEY = 'qdg_radio_broadcast_state_v1';
    const CHANNEL_NAME = 'qdg_radio_live_bus';
    const DB_NAME = 'QDGRadioMediaDB';
    const DB_VERSION = 1;
    const STORE_TRACKS = 'uploaded_tracks';

    // Default Preset External Radio Streams (Real working Icecast/HTTPS streams + Local Track)
    const DEFAULT_PLAYLIST = [
        {
            id: 'trk-local-1',
            title: 'QDG PIRATE ANTHEM (MASTER MIX)',
            artist: 'DJ MARCO BETTIN',
            page: '100',
            bpm: 128,
            freq: 55,
            preset: 'pirate',
            sourceType: 'file',
            url: 'test-track.mp3',
            duration: '03:12'
        },
        {
            id: 'trk-stream-techno',
            title: 'DEFCON UNDERGROUND STREAM',
            artist: 'SOMAFM LIVE RELAY',
            page: '500',
            bpm: 135,
            freq: 55,
            preset: 'techno',
            sourceType: 'stream',
            url: 'https://ice1.somafm.com/defcon-128-mp3',
            duration: 'LIVE 24/7'
        },
        {
            id: 'trk-stream-synth',
            title: 'NIGHTRIDE FM // CYBER SYNTHWAVE',
            artist: 'NIGHTRIDE STREAM',
            page: '550',
            bpm: 118,
            freq: 49,
            preset: 'vapor',
            sourceType: 'stream',
            url: 'https://stream.nightride.fm/nightride.m4a',
            duration: 'LIVE 24/7'
        },
        {
            id: 'trk-stream-ambient',
            title: 'DRONE ZONE // DEEP AMBIENT',
            artist: 'SOMAFM AMBIENT',
            page: '200',
            bpm: 110,
            freq: 42,
            preset: 'ambient',
            sourceType: 'stream',
            url: 'https://ice1.somafm.com/dronezone-128-mp3',
            duration: 'LIVE 24/7'
        },
        {
            id: 'trk-stream-detroit',
            title: 'BEAT BLENDER // DEEP HOUSE & DETROIT',
            artist: 'SOMAFM CLUB',
            page: '540',
            bpm: 130,
            freq: 60,
            preset: 'detroit',
            sourceType: 'stream',
            url: 'https://ice1.somafm.com/beatblender-128-mp3',
            duration: 'LIVE 24/7'
        },
        {
            id: 'trk-synth-acid',
            title: 'ACID 303 LIVE GENERATOR',
            artist: 'QDG SYNTH ENGINE',
            page: '777',
            bpm: 138,
            freq: 73,
            preset: 'acid',
            sourceType: 'synth',
            url: '',
            duration: 'GENERATIVE'
        }
    ];

    const DEFAULT_STATE = {
        isBroadcasting: false,
        broadcastStartTime: null,
        sourceMode: 'autodj', // 'autodj' | 'stream' | 'live_mic' | 'synth'
        statusBadge: 'STANDBY',
        activePage: '100',
        nowPlaying: {
            id: 'trk-local-1',
            title: 'A Z INDEX // QDG PIRATE MIX',
            artist: 'QDG STUDIO REGIA',
            bpm: 128,
            freq: 55,
            preset: 'pirate',
            sourceType: 'file',
            url: 'test-track.mp3',
            seekTime: 0,
            updatedAt: Date.now()
        },
        externalStreamUrl: 'https://ice1.somafm.com/defcon-128-mp3',
        marqueeText: '*** QDG RADIO ONLINE *** CLICCA SU UNA TRACCIA O PREMI PLAY [100] PER ASCOLTARE LO STREAMING ***',
        subHeadline: 'ARCHIVIO MIXATI & STREAMING DIRETTA',
        networkSlogan: 'QDG RADIO NETWORK // PIRATE CRT BROADCAST',
        alertBanner: {
            active: false,
            text: 'AVVISO DI TRASMISSIONE // EDIZIONE STRAORDINARIA IN ONDA'
        },
        audioConfig: {
            masterVolume: 0.85,
            musicGain: 0.90,
            micGain: 1.0,
            talkoverActive: false,
            eqLow: 0,
            eqMid: 0,
            eqHigh: 0,
            bitrate: 192
        },
        playlist: DEFAULT_PLAYLIST,
        customPages: {} // Optional overrides per page number: { "500": { cat: "TECHNO BEATS", bpm: 135, url: "..." } }
    };

    class QDGRadioSyncBus {
        constructor() {
            this.channel = typeof BroadcastChannel !== 'undefined'
                ? new BroadcastChannel(CHANNEL_NAME)
                : null;
            this.listeners = new Set();
            this.eventListeners = new Set();
            this.dbPromise = this.initIndexedDB();
            this.serverAvailable = false;

            this.setupListeners();
            this.probeServer();
        }

        initIndexedDB() {
            return new Promise((resolve) => {
                if (typeof indexedDB === 'undefined') {
                    resolve(null);
                    return;
                }
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_TRACKS)) {
                        db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
                    }
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = () => resolve(null);
            });
        }

        async saveAudioBlob(id, fileBlob, metadata) {
            // 1. Try uploading to local Python server if running
            if (this.serverAvailable) {
                try {
                    const formData = new FormData();
                    formData.append('file', fileBlob, metadata.filename || `${id}.mp3`);
                    const res = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.url) {
                            return { storedIn: 'server', url: data.url };
                        }
                    }
                } catch (_) {
                    // Fallback to IndexedDB
                }
            }

            // 2. Store in IndexedDB for persistent browser access
            const db = await this.dbPromise;
            if (!db) {
                return { storedIn: 'memory', url: URL.createObjectURL(fileBlob) };
            }

            return new Promise((resolve) => {
                const tx = db.transaction(STORE_TRACKS, 'readwrite');
                const store = tx.objectStore(STORE_TRACKS);
                store.put({
                    id,
                    blob: fileBlob,
                    metadata,
                    createdAt: Date.now()
                });
                tx.oncomplete = () => resolve({ storedIn: 'idb', url: `idb://${id}` });
                tx.onerror = () => resolve({ storedIn: 'memory', url: URL.createObjectURL(fileBlob) });
            });
        }

        async resolveAudioUrl(url) {
            if (!url || !url.startsWith('idb://')) return url;
            const id = url.replace('idb://', '');
            const db = await this.dbPromise;
            if (!db) return null;

            return new Promise((resolve) => {
                const tx = db.transaction(STORE_TRACKS, 'readonly');
                const store = tx.objectStore(STORE_TRACKS);
                const req = store.get(id);
                req.onsuccess = () => {
                    if (req.result && req.result.blob) {
                        resolve(URL.createObjectURL(req.result.blob));
                    } else {
                        resolve(null);
                    }
                };
                req.onerror = () => resolve(null);
            });
        }

        async probeServer() {
            try {
                const res = await fetch('/api/state', { method: 'GET', cache: 'no-store' });
                if (res.ok) {
                    this.serverAvailable = true;
                    const serverState = await res.json();
                    if (serverState && serverState.updatedAt) {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverState));
                        this.notifyStateChange(serverState);
                    }
                }
            } catch (_) {
                this.serverAvailable = false;
            }
        }

        getState() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
                const parsed = JSON.parse(raw);
                return Object.assign({}, DEFAULT_STATE, parsed, {
                    nowPlaying: Object.assign({}, DEFAULT_STATE.nowPlaying, parsed.nowPlaying || {}),
                    audioConfig: Object.assign({}, DEFAULT_STATE.audioConfig, parsed.audioConfig || {}),
                    alertBanner: Object.assign({}, DEFAULT_STATE.alertBanner, parsed.alertBanner || {})
                });
            } catch (_) {
                return JSON.parse(JSON.stringify(DEFAULT_STATE));
            }
        }

        updateState(partial) {
            const current = this.getState();
            const next = Object.assign({}, current, partial, {
                updatedAt: Date.now()
            });
            if (partial.nowPlaying) {
                next.nowPlaying = Object.assign({}, current.nowPlaying, partial.nowPlaying, {
                    updatedAt: Date.now()
                });
            }
            if (partial.audioConfig) {
                next.audioConfig = Object.assign({}, current.audioConfig, partial.audioConfig);
            }
            if (partial.alertBanner) {
                next.alertBanner = Object.assign({}, current.alertBanner, partial.alertBanner);
            }

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch (_) {}

            if (this.channel) {
                this.channel.postMessage({ type: 'STATE_UPDATE', state: next });
            }

            if (this.serverAvailable) {
                fetch('/api/state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(next)
                }).catch(() => {});
            }

            this.notifyStateChange(next);
            return next;
        }

        sendEvent(eventName, payload = {}) {
            const packet = {
                type: 'LIVE_EVENT',
                eventName,
                payload,
                timestamp: Date.now()
            };
            if (this.channel) {
                this.channel.postMessage(packet);
            }
            // Also trigger a lightweight storage pulse for tabs without BroadcastChannel
            try {
                localStorage.setItem('qdg_radio_last_event', JSON.stringify(packet));
            } catch (_) {}

            if (this.serverAvailable && eventName !== 'MIC_PCM_CHUNK') {
                fetch('/api/event', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(packet)
                }).catch(() => {});
            }

            this.notifyEvent(packet);
        }

        setupListeners() {
            if (this.channel) {
                this.channel.onmessage = (e) => {
                    const msg = e.data;
                    if (!msg) return;
                    if (msg.type === 'STATE_UPDATE' && msg.state) {
                        this.notifyStateChange(msg.state);
                    } else if (msg.type === 'LIVE_EVENT') {
                        this.notifyEvent(msg);
                    }
                };
            }

            window.addEventListener('storage', (e) => {
                if (e.key === STORAGE_KEY && e.newValue) {
                    try {
                        this.notifyStateChange(JSON.parse(e.newValue));
                    } catch (_) {}
                } else if (e.key === 'qdg_radio_last_event' && e.newValue) {
                    try {
                        this.notifyEvent(JSON.parse(e.newValue));
                    } catch (_) {}
                }
            });
        }

        onStateChange(cb) {
            this.listeners.add(cb);
            return () => this.listeners.delete(cb);
        }

        onEvent(cb) {
            this.eventListeners.add(cb);
            return () => this.eventListeners.delete(cb);
        }

        notifyStateChange(state) {
            this.listeners.forEach((cb) => {
                try { cb(state); } catch (e) { console.error(e); }
            });
        }

        notifyEvent(packet) {
            this.eventListeners.forEach((cb) => {
                try { cb(packet.eventName, packet.payload, packet); } catch (e) { console.error(e); }
            });
        }
    }

    global.QDGRadioSync = new QDGRadioSyncBus();
})(window);
