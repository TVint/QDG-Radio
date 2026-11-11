/**
 * ============================================================================
 * QDG RADIO // TELEVIDEO ARCHIVE - WEB AUDIO & LIVE STREAM RECEIVER (js/televideo.js)
 * Pure Vanilla ES6 JavaScript | Zero External Dependencies
 * Synchronized in Real Time with P999 Master Control Room (admin.html)
 * ============================================================================
 */

(() => {
    'use strict';

    const syncBus = window.QDGRadioSync;

    const CONFIG = {
        fftSize: 256,
        smoothingTimeConstant: 0.78,
        vuTotalChars: 15,
        charFull: '█',
        charEmpty: '▒',
        defaultVolume: 0.85
    };

    const PRESETS = {
        pirate:    { bpm: 128, rootFreq: 55,  pattern: [1, 1, 1.5, 1, 1.2, 1, 1.8, 1.5], filterQ: 8 },
        techno:    { bpm: 135, rootFreq: 50,  pattern: [1, 1.5, 1, 2, 1, 1.33, 1, 1.5],   filterQ: 10 },
        detroit:   { bpm: 130, rootFreq: 58,  pattern: [1, 1.25, 1.5, 1, 1, 1.25, 2, 1], filterQ: 7 },
        ambient:   { bpm: 100, rootFreq: 42,  pattern: [1, 1, 1.33, 1.5, 1, 1.2, 1.5, 1],filterQ: 4 },
        glitch:    { bpm: 140, rootFreq: 75,  pattern: [1, 2, 1.5, 2.5, 1, 1.8, 3, 1.2], filterQ: 12 },
        vapor:     { bpm: 115, rootFreq: 46,  pattern: [1, 1.2, 1, 1.5, 1.33, 1, 1.2, 1],filterQ: 5 },
        acid:      { bpm: 138, rootFreq: 65,  pattern: [1, 2, 1, 1.5, 1.75, 2, 1.25, 1], filterQ: 14 },
        default:   { bpm: 128, rootFreq: 55,  pattern: [1, 1, 1.5, 1, 1.2, 1, 1.8, 1.5], filterQ: 8 }
    };

    const state = {
        audioCtx: null,
        mediaSource: null,
        musicGain: null,
        eqLow: null,
        eqMid: null,
        eqHigh: null,
        analyser: null,
        masterGain: null,
        freqData: null,
        timeData: null,
        rafId: null,
        isPlaying: false,
        usingSynthFallback: false,
        synthTimer: null,
        synthStep: 0,
        synthStartTime: 0,
        activeRow: null,
        activePage: '100',
        volume: CONFIG.defaultVolume,
        isMuted: false,
        dialBuffer: '',
        dialTimeout: null
    };

    // DOM Elements
    const audioEl        = document.getElementById('core-player');
    const crtScreenEl    = document.getElementById('crt-screen');
    const alertBannerEl  = document.getElementById('tx-alert-banner');
    const alertTextEl    = document.getElementById('tx-alert-text');
    const statusEl       = document.getElementById('tx-status');
    const trackTimeEl    = document.getElementById('track-time');
    const clockEl        = document.getElementById('tx-clock');
    const marqueeEl      = document.getElementById('tx-marquee');
    const vcrVuEl        = document.getElementById('vcr-vu');
    const dbReadoutEl    = document.getElementById('db-readout');
    const oscPathEl      = document.getElementById('osc-path');
    const diagValEl      = document.getElementById('diag-val');
    const signalModeEl   = document.getElementById('signal-mode');
    const footerStateEl  = document.getElementById('footer-state');
    const activePageEl   = document.getElementById('active-page-num');
    const logoMixEl      = document.getElementById('logo-mix');
    const volDisplayEl   = document.getElementById('vol-display');

    const ledEls    = Array.from(document.querySelectorAll('#led-strip .led'));
    const indexRows = Array.from(document.querySelectorAll('.index-row'));

    const btnPlay    = document.getElementById('btn-play');
    const btnStop    = document.getElementById('btn-stop');
    const btnNext    = document.getElementById('btn-next');
    const btnSynth   = document.getElementById('btn-synth');
    const btnVolDown = document.getElementById('btn-vol-down');
    const btnVolUp   = document.getElementById('btn-vol-up');
    const btnMute    = document.getElementById('btn-mute');

    /**
     * 1. INITIALIZE WEB AUDIO API WITH 3-BAND BROADCAST EQ & ANALYSER
     */
    function initAudioEngine() {
        if (!state.audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            state.audioCtx = new AudioContextClass();

            state.musicGain = state.audioCtx.createGain();
            state.musicGain.gain.value = 0.90;

            state.eqLow = state.audioCtx.createBiquadFilter();
            state.eqLow.type = 'lowshelf';
            state.eqLow.frequency.value = 80;

            state.eqMid = state.audioCtx.createBiquadFilter();
            state.eqMid.type = 'peaking';
            state.eqMid.frequency.value = 1000;
            state.eqMid.Q.value = 1.0;

            state.eqHigh = state.audioCtx.createBiquadFilter();
            state.eqHigh.type = 'highshelf';
            state.eqHigh.frequency.value = 10000;

            state.analyser = state.audioCtx.createAnalyser();
            state.analyser.fftSize = CONFIG.fftSize;
            state.analyser.smoothingTimeConstant = CONFIG.smoothingTimeConstant;

            state.masterGain = state.audioCtx.createGain();
            state.masterGain.gain.value = state.volume;

            state.freqData = new Uint8Array(state.analyser.frequencyBinCount);
            state.timeData = new Uint8Array(state.analyser.fftSize);

            try {
                if (audioEl) {
                    state.mediaSource = state.audioCtx.createMediaElementSource(audioEl);
                    state.mediaSource.connect(state.musicGain);
                }
            } catch (e) {
                console.warn('[QDG RADIO] MediaElementSource fallback.');
            }

            state.musicGain.connect(state.eqLow);
            state.eqLow.connect(state.eqMid);
            state.eqMid.connect(state.eqHigh);
            state.eqHigh.connect(state.analyser);
            state.analyser.connect(state.masterGain);
            state.masterGain.connect(state.audioCtx.destination);
        }

        if (state.audioCtx.state === 'suspended') {
            state.audioCtx.resume();
        }
    }

    /**
     * 2. GENERATIVE SYNTH ENGINE
     */
    function startPirateSynth(presetName = 'pirate', bpm = 128, rootFreq = 55) {
        stopPirateSynth();
        initAudioEngine();

        state.usingSynthFallback = true;
        state.synthStartTime = state.audioCtx.currentTime;
        state.synthStep = 0;

        const preset = PRESETS[presetName] || PRESETS.default;
        const actualBpm = bpm || preset.bpm;
        const actualRoot = rootFreq || preset.rootFreq;
        const pattern = preset.pattern;
        const stepDurationMs = ((60 / actualBpm) / 4) * 1000;

        state.synthTimer = setInterval(() => {
            if (!state.isPlaying || !state.audioCtx) return;
            const now = state.audioCtx.currentTime;
            const step = state.synthStep % 16;

            if (step % 4 === 0) {
                const kickOsc = state.audioCtx.createOscillator();
                const kickGain = state.audioCtx.createGain();
                kickOsc.type = 'sine';
                kickOsc.frequency.setValueAtTime(155, now);
                kickOsc.frequency.exponentialRampToValueAtTime(36, now + 0.14);

                kickGain.gain.setValueAtTime(0.9, now);
                kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

                kickOsc.connect(kickGain);
                kickGain.connect(state.musicGain);
                kickOsc.start(now);
                kickOsc.stop(now + 0.23);
            }

            if (step % 2 === 1 || step === 2 || step === 14) {
                const bassOsc = state.audioCtx.createOscillator();
                const filter = state.audioCtx.createBiquadFilter();
                const bassGain = state.audioCtx.createGain();

                bassOsc.type = 'sawtooth';
                const mult = pattern[step % pattern.length];
                bassOsc.frequency.setValueAtTime(actualRoot * mult, now);

                filter.type = 'lowpass';
                filter.Q.value = preset.filterQ || 8;
                filter.frequency.setValueAtTime(260 + ((step % 6) * 280), now);
                filter.frequency.exponentialRampToValueAtTime(110, now + 0.12);

                bassGain.gain.setValueAtTime(0.32, now);
                bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

                bassOsc.connect(filter);
                filter.connect(bassGain);
                bassGain.connect(state.musicGain);
                bassOsc.start(now);
                bassOsc.stop(now + 0.14);
            }

            if (step % 4 === 2) {
                const hatNode = state.audioCtx.createBufferSource();
                const bufferSize = state.audioCtx.sampleRate * 0.04;
                const buffer = state.audioCtx.createBuffer(1, bufferSize, state.audioCtx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
                hatNode.buffer = buffer;

                const hatFilter = state.audioCtx.createBiquadFilter();
                hatFilter.type = 'highpass';
                hatFilter.frequency.value = 7500;

                const hatGain = state.audioCtx.createGain();
                hatGain.gain.setValueAtTime(0.18, now);
                hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

                hatNode.connect(hatFilter);
                hatFilter.connect(hatGain);
                hatGain.connect(state.musicGain);
                hatNode.start(now);
                hatNode.stop(now + 0.04);
            }

            state.synthStep++;
            syncTrackTimer();
        }, stepDurationMs);
    }

    function stopPirateSynth() {
        if (state.synthTimer) {
            clearInterval(state.synthTimer);
            state.synthTimer = null;
        }
        state.usingSynthFallback = false;
    }

    /**
     * 3. PLAY JINGLE / STATION FX RECEIVED FROM P999 ADMIN REGIA
     */
    function playReceivedJingle(jingleType) {
        initAudioEngine();
        if (!state.audioCtx) return;
        const now = state.audioCtx.currentTime;

        if (jingleType === 'crt_glitch' && crtScreenEl) {
            crtScreenEl.classList.remove('crt-glitch-pulse');
            void crtScreenEl.offsetWidth;
            crtScreenEl.classList.add('crt-glitch-pulse');
        }

        const osc = state.audioCtx.createOscillator();
        const gain = state.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(state.analyser);

        if (jingleType === 'station_id') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.14);
            osc.frequency.setValueAtTime(783.99, now + 0.28);
            osc.frequency.setValueAtTime(1046.5, now + 0.42);
            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
            osc.start(now);
            osc.stop(now + 0.86);
        } else if (jingleType === 'siren') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.linearRampToValueAtTime(880, now + 0.35);
            osc.frequency.linearRampToValueAtTime(320, now + 0.70);
            osc.frequency.linearRampToValueAtTime(920, now + 1.05);
            gain.gain.setValueAtTime(0.26, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
            osc.start(now);
            osc.stop(now + 1.22);
        } else if (jingleType === 'laser') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(1800, now);
            osc.frequency.exponentialRampToValueAtTime(42, now + 0.45);
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
            osc.start(now);
            osc.stop(now + 0.5);
        } else if (jingleType === 'rewind') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(2200, now + 0.55);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
            osc.start(now);
            osc.stop(now + 0.6);
        } else {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1000, now);
            osc.frequency.setValueAtTime(1000, now + 0.18);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.42);
        }
    }

    /**
     * 4. VISUALIZER 60FPS LOOP
     */
    function renderVisuals() {
        if (!state.isPlaying || !state.analyser) return;

        state.analyser.getByteFrequencyData(state.freqData);
        state.analyser.getByteTimeDomainData(state.timeData);

        let sum = 0;
        const binCount = state.freqData.length;
        for (let i = 0; i < binCount; i++) {
            sum += state.freqData[i];
        }
        const avgVolume = sum / binCount;
        const bassEnergy = (state.freqData[0] + state.freqData[1] + state.freqData[2] + state.freqData[3]) / 4;
        const peakNorm = Math.min(1, Math.max(avgVolume / 130, (bassEnergy / 255) * 0.94));

        const litLeds = Math.round(peakNorm * ledEls.length);
        for (let i = 0; i < ledEls.length; i++) {
            const led = ledEls[i];
            const ratio = (i + 1) / ledEls.length;
            const isActive = i < litLeds;

            led.classList.toggle('active', isActive);
            led.classList.toggle('lvl-green',  isActive && ratio <= 0.625);
            led.classList.toggle('lvl-yellow', isActive && ratio > 0.625 && ratio <= 0.85);
            led.classList.toggle('lvl-red',    isActive && ratio > 0.85);
        }

        if (vcrVuEl) {
            const fullChars  = Math.round(peakNorm * CONFIG.vuTotalChars);
            const emptyChars = Math.max(0, CONFIG.vuTotalChars - fullChars);
            vcrVuEl.textContent =
                CONFIG.charFull.repeat(fullChars) +
                CONFIG.charEmpty.repeat(emptyChars);

            vcrVuEl.className = peakNorm > 0.85 ? 't-red' : (peakNorm > 0.65 ? 't-yel' : 't-grn');
        }

        if (dbReadoutEl) {
            const db = peakNorm > 0.01 ? (20 * Math.log10(peakNorm)).toFixed(1) : '-INF';
            dbReadoutEl.textContent = `${db} dB`;
        }

        if (oscPathEl) {
            const width = 260;
            const height = 54;
            const samples = state.timeData.length;
            const slice = width / (samples - 1);

            let pathString = '';
            for (let i = 0; i < samples; i++) {
                const v = (state.timeData[i] - 128) / 128.0;
                const y = (height / 2) + (v * (height * 0.44));
                const x = i * slice;
                pathString += (i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`);
            }
            oscPathEl.setAttribute('d', pathString);
            oscPathEl.style.stroke = peakNorm > 0.85 ? 'var(--tt-red)' : (peakNorm > 0.65 ? 'var(--tt-yellow)' : 'var(--tt-cyan)');
        }

        if (diagValEl) {
            diagValEl.textContent = String(Math.round((bassEnergy / 255) * 99)).padStart(2, '0');
        }
        if (logoMixEl) {
            const kickHit = bassEnergy > 200;
            logoMixEl.classList.toggle('bg-yel', kickHit);
            logoMixEl.classList.toggle('bg-wht', !kickHit);
        }

        state.rafId = requestAnimationFrame(renderVisuals);
    }

    function resetVisuals() {
        if (state.rafId) {
            cancelAnimationFrame(state.rafId);
            state.rafId = null;
        }
        ledEls.forEach((led) => led.classList.remove('active', 'lvl-green', 'lvl-yellow', 'lvl-red'));
        if (vcrVuEl) {
            vcrVuEl.textContent = CONFIG.charEmpty.repeat(CONFIG.vuTotalChars);
            vcrVuEl.className = 't-grn';
        }
        if (dbReadoutEl) dbReadoutEl.textContent = '-INF dB';
        if (oscPathEl) {
            oscPathEl.setAttribute('d', 'M 0 27 L 260 27');
            oscPathEl.style.stroke = 'var(--tt-cyan)';
        }
        if (diagValEl) diagValEl.textContent = '40';
        if (logoMixEl) {
            logoMixEl.classList.remove('bg-yel');
            logoMixEl.classList.add('bg-wht');
        }
    }

    function formatTime(sec) {
        if (!Number.isFinite(sec) || sec < 0) return '00:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function syncTrackTimer() {
        if (!trackTimeEl) return;
        if (state.usingSynthFallback && state.audioCtx) {
            const elapsed = state.audioCtx.currentTime - state.synthStartTime;
            trackTimeEl.textContent = `${formatTime(elapsed)} / LIVE`;
        } else if (audioEl) {
            const durText = Number.isFinite(audioEl.duration) ? formatTime(audioEl.duration) : 'STREAM';
            trackTimeEl.textContent = `${formatTime(audioEl.currentTime)} / ${durText}`;
        }
    }

    function setUIState(mode, trackTitle = 'TECHNO SET', pageCode = '100', customMarquee = null) {
        const isLive = mode === 'ON AIR';

        if (statusEl) {
            statusEl.textContent = `P${pageCode} RADIOFAX 1 ${mode}`;
            statusEl.classList.toggle('bg-red', isLive);
            statusEl.classList.toggle('t-wht', isLive);
            statusEl.classList.toggle('blink', isLive);
        }

        if (activePageEl) activePageEl.textContent = pageCode;
        if (signalModeEl) {
            signalModeEl.textContent = isLive
                ? (state.usingSynthFallback ? '[SYNTH LIVE]' : '[STREAM ON AIR]')
                : `[${mode}]`;
        }
        if (footerStateEl) footerStateEl.textContent = isLive ? `ON AIR // ${trackTitle}` : `AUDIO: ${mode}`;

        if (btnPlay) {
            btnPlay.innerHTML = isLive ? `<span class="t-wht">❚❚ PAUSE</span> 100` : `<span class="t-wht">► PLAY</span> 100`;
        }

        if (marqueeEl) {
            if (customMarquee) {
                marqueeEl.textContent = customMarquee;
            } else if (isLive) {
                marqueeEl.textContent = `*** QDG RADIO ON AIR [P${pageCode}]: ${trackTitle} *** CRT AUDIO ENGINE ACTIVE *** STREAMING WEB AUDIO API ***`;
            } else if (mode === 'PAUSED') {
                marqueeEl.textContent = `*** TRASMISSIONE IN PAUSA [P${pageCode}]: ${trackTitle} *** PREMI PLAY [100] PER RIPRENDERE ***`;
            }
        }
    }

    /**
     * 5. PLAY CHANNEL / STREAM / UPLOADED TRACK
     */
    async function playTrack(rowEl = null, forceSynth = false, customSourceUrl = null, customTitle = null) {
        initAudioEngine();

        const targetRow = rowEl || state.activeRow || indexRows[0];
        if (state.activeRow && state.activeRow !== targetRow) {
            state.activeRow.classList.remove('active');
        }
        state.activeRow = targetRow;
        if (state.activeRow) state.activeRow.classList.add('active');

        const title  = customTitle || targetRow?.querySelector('.cat')?.textContent.trim() || 'PIRATE MIX';
        const page   = targetRow?.dataset.page || targetRow?.querySelector('.page')?.textContent.trim() || '100';
        const bpm    = Number(targetRow?.dataset.bpm) || 128;
        const freq   = Number(targetRow?.dataset.freq) || 55;
        const preset = targetRow?.dataset.preset || 'pirate';
        let streamUrl= customSourceUrl || targetRow?.dataset.stream || 'test-track.mp3';

        if (syncBus && streamUrl && streamUrl.startsWith('idb://')) {
            const resolved = await syncBus.resolveAudioUrl(streamUrl);
            if (resolved) streamUrl = resolved;
        }

        state.activePage = page;

        if (!forceSynth && audioEl) {
            try {
                stopPirateSynth();
                if (audioEl.getAttribute('src') !== streamUrl) {
                    audioEl.src = streamUrl;
                }
                await audioEl.play();
                state.isPlaying = true;
                setUIState('ON AIR', title, page, syncBus?.getState().marqueeText);
                if (!state.rafId) state.rafId = requestAnimationFrame(renderVisuals);
                return;
            } catch (err) {
                console.info('[QDG RADIO] Stream/Autoplay fallback: avvio synth Web Audio.');
            }
        }

        if (audioEl) audioEl.pause();
        state.isPlaying = true;
        startPirateSynth(preset, bpm, freq);
        setUIState('ON AIR', `${title} (${bpm} BPM)`, page, syncBus?.getState().marqueeText);
        if (!state.rafId) state.rafId = requestAnimationFrame(renderVisuals);
    }

    function pauseTrack() {
        if (audioEl) audioEl.pause();
        stopPirateSynth();
        state.isPlaying = false;
        resetVisuals();
        const title = state.activeRow?.querySelector('.cat')?.textContent.trim() || 'ARCHIVIO';
        const page  = state.activePage || '100';
        setUIState('PAUSED', title, page);
    }

    function stopTrack() {
        if (audioEl) {
            audioEl.pause();
            audioEl.currentTime = 0;
        }
        stopPirateSynth();
        state.isPlaying = false;
        resetVisuals();

        if (state.activeRow) {
            state.activeRow.classList.remove('active');
            state.activeRow = null;
        }
        if (state.audioCtx && state.audioCtx.state === 'running') {
            state.audioCtx.suspend();
        }
        syncTrackTimer();
        setUIState('STANDBY');
    }

    function setVolume(val) {
        state.volume = Math.max(0, Math.min(1, val));
        state.isMuted = state.volume === 0;
        if (state.masterGain && state.audioCtx) {
            state.masterGain.gain.setValueAtTime(state.isMuted ? 0 : state.volume, state.audioCtx.currentTime);
        }
        if (volDisplayEl) {
            volDisplayEl.textContent = state.isMuted ? 'MUTE' : `${Math.round(state.volume * 100)}%`;
        }
    }

    /**
     * 6. APPLY REAL-TIME STATE & LIVE EVENTS FROM P999 ADMIN REGIA
     */
    function applyBroadcastStateToUI(bState) {
        if (!bState) return;

        // 1. Marquee Text
        if (bState.marqueeText && marqueeEl) {
            marqueeEl.textContent = bState.marqueeText;
        }

        // 2. Emergency Alert Banner
        if (alertBannerEl && bState.alertBanner) {
            alertBannerEl.style.display = bState.alertBanner.active ? 'flex' : 'none';
            if (alertTextEl && bState.alertBanner.text) {
                alertTextEl.textContent = bState.alertBanner.text;
            }
        }

        // 3. Custom Channel Names / BPM overrides
        if (bState.customPages) {
            Object.entries(bState.customPages).forEach(([pageNum, cfg]) => {
                const row = indexRows.find((r) => r.dataset.page === pageNum);
                if (row) {
                    const catEl = row.querySelector('.cat');
                    if (catEl && cfg.cat) catEl.textContent = cfg.cat;
                    if (cfg.bpm) row.dataset.bpm = String(cfg.bpm);
                }
            });
        }

        // 4. Audio Config (EQ & Talkover Ducking)
        if (bState.audioConfig && state.audioCtx) {
            const ac = bState.audioConfig;
            if (typeof ac.eqLow === 'number' && state.eqLow) state.eqLow.gain.value = ac.eqLow;
            if (typeof ac.eqMid === 'number' && state.eqMid) state.eqMid.gain.value = ac.eqMid;
            if (typeof ac.eqHigh === 'number' && state.eqHigh) state.eqHigh.gain.value = ac.eqHigh;
            if (typeof ac.musicGain === 'number' && state.musicGain) {
                state.musicGain.gain.setTargetAtTime(ac.musicGain, state.audioCtx.currentTime, 0.08);
            }
        }

        // 5. Highlight Active Page & Header
        if (bState.activePage) {
            state.activePage = bState.activePage;
            if (activePageEl) activePageEl.textContent = bState.activePage;
            const matchRow = indexRows.find((r) => r.dataset.page === bState.activePage);
            if (matchRow) {
                indexRows.forEach((r) => r.classList.remove('active'));
                matchRow.classList.add('active');
                state.activeRow = matchRow;
            }
        }

        if (bState.isBroadcasting && bState.nowPlaying) {
            if (footerStateEl) {
                footerStateEl.textContent = `ON AIR // ${bState.nowPlaying.title}`;
            }
            if (statusEl) {
                statusEl.textContent = `P${bState.activePage || '100'} RADIOFAX 1 ON AIR`;
                statusEl.classList.add('bg-red', 't-wht', 'blink');
            }
        }
    }

    if (syncBus) {
        // Apply initial state from Regia
        applyBroadcastStateToUI(syncBus.getState());

        // Subscribe to state updates
        syncBus.onStateChange((newState) => {
            applyBroadcastStateToUI(newState);
        });

        // Subscribe to real-time Regia broadcast events
        syncBus.onEvent(async (eventName, payload) => {
            if (eventName === 'PLAY_TRACK' && payload.track) {
                const trk = payload.track;
                const matchRow = indexRows.find((r) => r.dataset.page === payload.page) || state.activeRow;
                await playTrack(matchRow, trk.sourceType === 'synth', trk.url, trk.title);
            } else if (eventName === 'PLAY_STREAM' && payload.url) {
                const matchRow = indexRows.find((r) => r.dataset.page === payload.page) || state.activeRow;
                await playTrack(matchRow, false, payload.url, payload.title);
            } else if (eventName === 'PLAY_SYNTH') {
                const matchRow = indexRows.find((r) => r.dataset.page === payload.page) || state.activeRow;
                if (matchRow) {
                    matchRow.dataset.preset = payload.preset;
                    matchRow.dataset.bpm = String(payload.bpm);
                    matchRow.dataset.freq = String(payload.freq);
                }
                await playTrack(matchRow, true, null, payload.title);
            } else if (eventName === 'PAUSE_BROADCAST') {
                pauseTrack();
            } else if (eventName === 'STOP_BROADCAST' || eventName === 'BROADCAST_STOPPED') {
                stopTrack();
            } else if (eventName === 'SEEK_TRACK' && audioEl && typeof payload.currentTime === 'number') {
                audioEl.currentTime = payload.currentTime;
            } else if (eventName === 'TRIGGER_JINGLE' && payload.jingleType) {
                playReceivedJingle(payload.jingleType);
            } else if (eventName === 'CRT_GLITCH' && crtScreenEl) {
                crtScreenEl.classList.remove('crt-glitch-pulse');
                void crtScreenEl.offsetWidth;
                crtScreenEl.classList.add('crt-glitch-pulse');
            } else if (eventName === 'MIC_AUDIO_CHUNK' && payload.dataUrl) {
                // Play live DJ microphone voice packet
                try {
                    const micAudio = new Audio(payload.dataUrl);
                    micAudio.volume = state.isMuted ? 0 : state.volume;
                    micAudio.play().catch(() => {});
                } catch (_) {}
            }
        });
    }

    /**
     * 7. TELETEXT REMOTE KEYPAD (Dial 999 for Admin Studio!)
     */
    function dialDigit(digit) {
        state.dialBuffer += digit;
        if (state.dialTimeout) clearTimeout(state.dialTimeout);

        if (activePageEl) activePageEl.textContent = state.dialBuffer.padEnd(3, '-');
        if (statusEl) statusEl.textContent = `P${state.dialBuffer.padEnd(3, '-')} RICERCA...`;

        if (state.dialBuffer.length >= 3) {
            const targetPage = state.dialBuffer;
            state.dialBuffer = '';
            jumpToPage(targetPage);
        } else {
            state.dialTimeout = setTimeout(() => {
                if (state.dialBuffer.length > 0) {
                    jumpToPage(state.dialBuffer);
                    state.dialBuffer = '';
                }
            }, 1600);
        }
    }

    function jumpToPage(pageStr) {
        // Page 999 opens the Admin Broadcast Studio!
        if (pageStr === '999') {
            window.location.href = 'admin.html';
            return;
        }

        const foundRow = indexRows.find((r) => (r.dataset.page || '').startsWith(pageStr) || r.querySelector('.page')?.textContent.includes(pageStr));
        if (foundRow) {
            playTrack(foundRow, state.usingSynthFallback);
        } else {
            if (statusEl) statusEl.textContent = `P${pageStr} NON TROVATA`;
            setTimeout(() => {
                setUIState(state.isPlaying ? 'ON AIR' : 'STANDBY', 'ARCHIVIO', state.activePage);
            }, 1000);
        }
    }

    // Event Listeners
    indexRows.forEach((row) => {
        row.addEventListener('click', () => {
            if (state.activeRow === row && state.isPlaying) {
                pauseTrack();
            } else {
                playTrack(row, false);
            }
        });
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                row.click();
            }
        });
    });

    btnPlay?.addEventListener('click', () => {
        if (state.isPlaying) {
            pauseTrack();
        } else {
            const st = syncBus?.getState();
            if (st && st.isBroadcasting && st.nowPlaying) {
                playTrack(state.activeRow || indexRows[0], st.nowPlaying.sourceType === 'synth', st.nowPlaying.url, st.nowPlaying.title);
            } else {
                playTrack(state.activeRow || indexRows[0], false);
            }
        }
    });

    btnStop?.addEventListener('click', stopTrack);

    btnNext?.addEventListener('click', () => {
        const currentIdx = state.activeRow ? indexRows.indexOf(state.activeRow) : -1;
        const nextRow = indexRows[(currentIdx + 1) % indexRows.length];
        playTrack(nextRow, state.usingSynthFallback);
    });

    btnSynth?.addEventListener('click', () => {
        const row = state.activeRow || indexRows[4];
        playTrack(row, true);
    });

    btnVolDown?.addEventListener('click', () => setVolume(state.volume - 0.1));
    btnVolUp?.addEventListener('click',   () => setVolume(state.volume + 0.1));
    btnMute?.addEventListener('click', () => {
        if (state.isMuted) {
            setVolume(0.85);
        } else {
            setVolume(0);
        }
    });

    document.querySelectorAll('.num-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            dialDigit(btn.dataset.key);
        });
    });

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key >= '0' && e.key <= '9') {
            dialDigit(e.key);
        } else if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            btnPlay?.click();
        } else if (e.key === 's' || e.key === 'S') {
            btnStop?.click();
        } else if (e.key === 'n' || e.key === 'N') {
            btnNext?.click();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setVolume(state.volume + 0.05);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setVolume(state.volume - 0.05);
        } else if (e.key === 'm' || e.key === 'M') {
            btnMute?.click();
        }
    });

    if (audioEl) {
        audioEl.addEventListener('timeupdate', syncTrackTimer);
        audioEl.addEventListener('loadedmetadata', syncTrackTimer);
        audioEl.addEventListener('ended', stopTrack);
    }

    const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    function tickClock() {
        if (!clockEl) return;
        const d = new Date();
        clockEl.textContent =
            `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ` +
            `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}/${String(d.getSeconds()).padStart(2, '0')}`;
    }
    setInterval(tickClock, 1000);
    tickClock();

})();
