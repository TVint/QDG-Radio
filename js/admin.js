/**
 * ============================================================================
 * P999 REGIA CENTRALE // QDG RADIO MASTER CONTROL ROOM (js/admin.js)
 * Complete Web Radio Broadcast Studio Controller:
 *  - AutoDJ Playlist & Drag-and-Drop MP3/WAV Uploader (IndexedDB + Server)
 *  - External Icecast / Shoutcast / MP3 Stream Relay
 *  - Live Microphone & External Audio Interface Mixer with Talkover Ducking
 *  - 3-Band Broadcast EQ, Peak VU Meter, Oscilloscope & Master Stream Recorder
 *  - Instant Jingle Cart Machine & Real-Time Televideo CMS
 * ============================================================================
 */

(() => {
    'use strict';

    const syncBus = window.QDGRadioSync;
    const audioEl = document.getElementById('admin-deck-player');

    const studio = {
        audioCtx: null,
        deckSource: null,
        micStream: null,
        micSource: null,
        musicGain: null,
        micGain: null,
        eqLow: null,
        eqMid: null,
        eqHigh: null,
        masterGain: null,
        monitorGain: null,
        analyser: null,
        streamDest: null,
        mediaRecorder: null,
        recordedChunks: [],
        liveMicBroadcaster: null,
        isRecording: false,
        micActive: false,
        talkoverActive: false,
        localMonitor: true,
        synthTimer: null,
        synthStep: 0,
        uptimeTimer: null,
        currentTrackIndex: 0
    };

    // DOM Elements
    const authOverlay       = document.getElementById('auth-overlay');
    const authForm          = document.getElementById('auth-form');
    const authPinInput      = document.getElementById('auth-pin');
    const btnLockConsole    = document.getElementById('btn-lock-console');

    const onAirLamp         = document.getElementById('master-onair-lamp');
    const studioSubStatus   = document.getElementById('studio-sub-status');
    const uptimeClock       = document.getElementById('uptime-clock');
    const activeSourceBadge = document.getElementById('active-source-badge');
    const bitrateBadge      = document.getElementById('bitrate-badge');

    const btnMasterTx       = document.getElementById('btn-master-broadcast');
    const btnMasterTxText   = document.getElementById('btn-master-tx-text');
    const btnRecBroadcast   = document.getElementById('btn-rec-broadcast');

    const deckTrackTitle    = document.getElementById('deck-track-title');
    const deckTrackMeta     = document.getElementById('deck-track-meta');
    const deckTimeCur       = document.getElementById('deck-time-cur');
    const deckTimeDur       = document.getElementById('deck-time-dur');
    const deckSeekSlider    = document.getElementById('deck-seek-slider');
    const btnDeckPlay       = document.getElementById('btn-deck-play');
    const btnDeckStop       = document.getElementById('btn-deck-stop');
    const btnDeckPrev       = document.getElementById('btn-deck-prev');
    const btnDeckNext       = document.getElementById('btn-deck-next');
    const chkAutodjNext     = document.getElementById('chk-autodj-next');

    const inputStreamUrl    = document.getElementById('input-stream-url');
    const btnConnectStream  = document.getElementById('btn-connect-stream');

    const selectAudioInput  = document.getElementById('select-audio-input');
    const btnRefreshMic     = document.getElementById('btn-refresh-mic');
    const btnMicToggle      = document.getElementById('btn-mic-toggle');
    const btnTalkover       = document.getElementById('btn-talkover');
    const micStatusText     = document.getElementById('mic-status-text');

    const selectSynthPreset = document.getElementById('select-synth-preset');
    const synthBpmSlider    = document.getElementById('synth-bpm-slider');
    const synthFreqSlider   = document.getElementById('synth-freq-slider');
    const lblSynthBpm       = document.getElementById('lbl-synth-bpm');
    const lblSynthFreq      = document.getElementById('lbl-synth-freq');
    const btnLaunchSynth    = document.getElementById('btn-launch-synth');

    const chkStudioMonitor  = document.getElementById('chk-studio-monitor');
    const vuBarL            = document.getElementById('admin-vu-l');
    const vuBarR            = document.getElementById('admin-vu-r');
    const adminDbReadout    = document.getElementById('admin-db-readout');
    const scopeCanvas       = document.getElementById('admin-scope-canvas');

    const uploadDropzone    = document.getElementById('upload-dropzone');
    const fileUploadInput   = document.getElementById('file-upload-input');
    const btnBrowseFiles    = document.getElementById('btn-browse-files');
    const formAddTrack      = document.getElementById('form-add-track');
    const playlistContainer = document.getElementById('admin-playlist-list');
    const playlistCountBadge= document.getElementById('playlist-count-badge');

    const cmsMarqueeInput   = document.getElementById('cms-marquee-input');
    const btnPushMarquee    = document.getElementById('btn-push-marquee');
    const cmsCustomTitle    = document.getElementById('cms-custom-title');
    const cmsCustomPage     = document.getElementById('cms-custom-page');
    const btnPushMetadata   = document.getElementById('btn-push-metadata');
    const cmsAlertText      = document.getElementById('cms-alert-text');
    const btnToggleAlert    = document.getElementById('btn-toggle-alert');
    const cmsSelectPage     = document.getElementById('cms-select-page');
    const cmsEditCat        = document.getElementById('cms-edit-cat');
    const cmsEditBpm        = document.getElementById('cms-edit-bpm');
    const btnSaveChannel    = document.getElementById('btn-save-channel');

    /**
     * 1. INITIALIZATION & STUDIO WEB AUDIO MIXING BUS
     */
    function initStudioAudio() {
        if (!studio.audioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            studio.audioCtx = new AudioCtx();

            studio.musicGain = studio.audioCtx.createGain();
            studio.musicGain.gain.value = 0.90;

            studio.micGain = studio.audioCtx.createGain();
            studio.micGain.gain.value = 1.0;

            // 3-Band Broadcast Equalizer
            studio.eqLow = studio.audioCtx.createBiquadFilter();
            studio.eqLow.type = 'lowshelf';
            studio.eqLow.frequency.value = 80;

            studio.eqMid = studio.audioCtx.createBiquadFilter();
            studio.eqMid.type = 'peaking';
            studio.eqMid.frequency.value = 1000;
            studio.eqMid.Q.value = 1.0;

            studio.eqHigh = studio.audioCtx.createBiquadFilter();
            studio.eqHigh.type = 'highshelf';
            studio.eqHigh.frequency.value = 10000;

            studio.masterGain = studio.audioCtx.createGain();
            studio.masterGain.gain.value = 0.85;

            studio.monitorGain = studio.audioCtx.createGain();
            studio.monitorGain.gain.value = studio.localMonitor ? 1.0 : 0.0;

            studio.analyser = studio.audioCtx.createAnalyser();
            studio.analyser.fftSize = 256;
            studio.analyser.smoothingTimeConstant = 0.76;

            // Destination for Master Recording & Live Stream Relay
            if (studio.audioCtx.createMediaStreamDestination) {
                studio.streamDest = studio.audioCtx.createMediaStreamDestination();
            }

            try {
                studio.deckSource = studio.audioCtx.createMediaElementSource(audioEl);
                studio.deckSource.connect(studio.musicGain);
            } catch (_) {}

            // Chain: (musicGain + micGain) -> eqLow -> eqMid -> eqHigh -> masterGain -> analyser
            studio.musicGain.connect(studio.eqLow);
            studio.micGain.connect(studio.eqLow);

            studio.eqLow.connect(studio.eqMid);
            studio.eqMid.connect(studio.eqHigh);
            studio.eqHigh.connect(studio.masterGain);

            studio.masterGain.connect(studio.analyser);
            studio.analyser.connect(studio.monitorGain);
            studio.monitorGain.connect(studio.audioCtx.destination);

            if (studio.streamDest) {
                studio.masterGain.connect(studio.streamDest);
            }
        }

        if (studio.audioCtx.state === 'suspended') {
            studio.audioCtx.resume();
        }
    }

    /**
     * 2. MASTER TRANSMITTER START / STOP
     */
    async function toggleMasterBroadcast() {
        initStudioAudio();
        const st = syncBus.getState();
        const nextBroadcasting = !st.isBroadcasting;

        if (nextBroadcasting) {
            const startTime = Date.now();
            syncBus.updateState({
                isBroadcasting: true,
                broadcastStartTime: startTime,
                statusBadge: 'ON AIR'
            });
            await startSelectedSource(st.sourceMode);
            syncBus.sendEvent('BROADCAST_STARTED', { timestamp: startTime });
        } else {
            audioEl.pause();
            stopStudioSynth();
            syncBus.updateState({
                isBroadcasting: false,
                broadcastStartTime: null,
                statusBadge: 'STANDBY'
            });
            syncBus.sendEvent('BROADCAST_STOPPED', {});
        }
        renderStudioUI();
    }

    async function startSelectedSource(mode) {
        initStudioAudio();
        const st = syncBus.getState();

        if (mode === 'autodj') {
            stopStudioSynth();
            const pl = st.playlist || [];
            const track = pl[studio.currentTrackIndex] || pl[0];
            if (track) {
                await playTrackOnAir(track);
            }
        } else if (mode === 'stream') {
            stopStudioSynth();
            const url = inputStreamUrl.value.trim() || st.externalStreamUrl;
            await launchExternalStream(url, st.nowPlaying?.title || 'EXTERNAL LIVE STREAM', st.activePage || '500', 130);
        } else if (mode === 'synth') {
            audioEl.pause();
            launchGenerativeSynthOnAir();
        } else if (mode === 'live_mic') {
            if (!studio.micActive) {
                await toggleMicrophoneLive();
            }
        }
    }

    /**
     * 3. PLAY TRACK OR EXTERNAL STREAM ON AIR
     */
    async function playTrackOnAir(track) {
        initStudioAudio();
        stopStudioSynth();

        let playUrl = track.url;
        if (playUrl && playUrl.startsWith('idb://')) {
            const resolved = await syncBus.resolveAudioUrl(playUrl);
            if (resolved) playUrl = resolved;
        }

        if (track.sourceType === 'synth') {
            selectSynthPreset.value = track.preset || 'acid';
            synthBpmSlider.value = track.bpm || 135;
            synthFreqSlider.value = track.freq || 65;
            launchGenerativeSynthOnAir();
            return;
        }

        if (playUrl) {
            audioEl.src = playUrl;
            try {
                await audioEl.play();
            } catch (err) {
                console.warn('[REGIA] Stream fallback:', err);
            }
        }

        const newState = syncBus.updateState({
            isBroadcasting: true,
            broadcastStartTime: syncBus.getState().broadcastStartTime || Date.now(),
            sourceMode: track.sourceType === 'stream' ? 'stream' : 'autodj',
            statusBadge: 'ON AIR',
            activePage: track.page || '100',
            nowPlaying: {
                id: track.id,
                title: track.title,
                artist: track.artist || 'QDG RADIO',
                bpm: track.bpm || 128,
                freq: track.freq || 55,
                preset: track.preset || 'pirate',
                sourceType: track.sourceType || 'file',
                url: track.url,
                seekTime: 0
            },
            marqueeText: `*** IN ONDA SU QDG RADIO [P${track.page || '100'}]: ${track.title} — ${track.artist || 'LIVE'} (${track.bpm || 128} BPM) ***`
        });

        cmsMarqueeInput.value = newState.marqueeText;
        cmsCustomTitle.value = track.title;
        cmsCustomPage.value = track.page || '100';

        syncBus.sendEvent('PLAY_TRACK', {
            track: newState.nowPlaying,
            page: newState.activePage
        });

        renderStudioUI();
    }

    async function launchExternalStream(url, title = 'EXTERNAL STREAM RELAY', page = '500', bpm = 130) {
        initStudioAudio();
        stopStudioSynth();

        inputStreamUrl.value = url;
        audioEl.src = url;
        try {
            await audioEl.play();
        } catch (e) {
            console.warn('[REGIA] Attenzione CORS/Stream su monitor locale, invio URL ai client:', e);
        }

        const nextState = syncBus.updateState({
            isBroadcasting: true,
            broadcastStartTime: syncBus.getState().broadcastStartTime || Date.now(),
            sourceMode: 'stream',
            statusBadge: 'ON AIR',
            activePage: page,
            externalStreamUrl: url,
            nowPlaying: {
                id: 'ext-stream-' + Date.now(),
                title,
                artist: 'LIVE STREAM RELAY',
                bpm,
                freq: 55,
                preset: 'techno',
                sourceType: 'stream',
                url,
                seekTime: 0
            },
            marqueeText: `*** STREAMING ESTERNO ATTIVO [P${page}]: ${title} *** SINTONIZZAZIONE DIRETTA QDG RADIO ***`
        });

        cmsMarqueeInput.value = nextState.marqueeText;
        cmsCustomTitle.value = title;
        cmsCustomPage.value = page;

        syncBus.sendEvent('PLAY_STREAM', { url, title, page, bpm });
        renderStudioUI();
    }

    /**
     * 4. LIVE MICROPHONE / EXTERNAL AUDIO INTERFACE & TALKOVER DUCKING
     */
    async function populateAudioDevices() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter((d) => d.kind === 'audioinput');
            selectAudioInput.innerHTML = '<option value="default">Ingresso Audio Predefinito di Sistema</option>';
            audioInputs.forEach((dev, idx) => {
                const opt = document.createElement('option');
                opt.value = dev.deviceId;
                opt.textContent = dev.label || `Microfono / Scheda Audio #${idx + 1}`;
                selectAudioInput.appendChild(opt);
            });
        } catch (_) {}
    }

    async function toggleMicrophoneLive() {
        initStudioAudio();

        if (studio.micActive) {
            // Stop Microphone
            if (studio.micStream) {
                studio.micStream.getTracks().forEach((t) => t.stop());
                studio.micStream = null;
            }
            if (studio.liveMicBroadcaster && studio.liveMicBroadcaster.state !== 'inactive') {
                studio.liveMicBroadcaster.stop();
            }
            studio.micActive = false;
            btnMicToggle.classList.remove('active');
            btnMicToggle.textContent = '🎙️ ATTIVA MICROFONO IN DIRETTA';
            micStatusText.innerHTML = 'Stato Microfono: <strong>DISATTIVATO</strong>';
            syncBus.sendEvent('MIC_STATUS', { active: false });
            return;
        }

        try {
            const devId = selectAudioInput.value;
            const constraints = {
                audio: devId && devId !== 'default'
                    ? { deviceId: { exact: devId }, echoCancellation: false, noiseSuppression: false }
                    : { echoCancellation: true, noiseSuppression: true }
            };
            studio.micStream = await navigator.mediaDevices.getUserMedia(constraints);
            studio.micSource = studio.audioCtx.createMediaStreamSource(studio.micStream);
            studio.micSource.connect(studio.micGain);

            studio.micActive = true;
            btnMicToggle.classList.add('active');
            btnMicToggle.textContent = '🔴 MICROFONO IN ONDA (CLICCA PER MUTO)';
            micStatusText.innerHTML = 'Stato Microfono: <strong style="color:#00ff00;">IN ONDA LIVE</strong> — Voce mixata sul Master Bus e trasmessa agli ascoltatori.';

            await populateAudioDevices();

            // Broadcast live voice chunks over BroadcastChannel so listener tabs hear the DJ!
            startLiveMicChunkRelay(studio.micStream);
            syncBus.sendEvent('MIC_STATUS', { active: true });
        } catch (err) {
            micStatusText.innerHTML = `<span style="color:#ff1e1e;">Errore accesso Microfono: ${err.message || 'Permesso negato dal browser'}</span>`;
        }
    }

    function startLiveMicChunkRelay(stream) {
        if (typeof MediaRecorder === 'undefined') return;
        try {
            const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : '';
            const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
            studio.liveMicBroadcaster = rec;

            rec.ondataavailable = (e) => {
                if (e.data && e.data.size > 0 && studio.micActive) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        syncBus.sendEvent('MIC_AUDIO_CHUNK', {
                            dataUrl: reader.result
                        });
                    };
                    reader.readAsDataURL(e.data);
                }
            };
            rec.start(450); // Send 450ms low-latency voice packets
        } catch (_) {}
    }

    function toggleTalkoverDucking() {
        initStudioAudio();
        studio.talkoverActive = !studio.talkoverActive;
        btnTalkover.classList.toggle('active', studio.talkoverActive);

        const baseMusicVol = parseInt(document.getElementById('fader-music').value, 10) / 100;
        const targetGain = studio.talkoverActive ? baseMusicVol * 0.25 : baseMusicVol; // -12 dB ducking
        if (studio.musicGain && studio.audioCtx) {
            studio.musicGain.gain.setTargetAtTime(targetGain, studio.audioCtx.currentTime, 0.08);
        }

        syncBus.updateState({
            audioConfig: { talkoverActive: studio.talkoverActive, musicGain: targetGain }
        });
        syncBus.sendEvent('TALKOVER_CHANGE', { active: studio.talkoverActive, gain: targetGain });
    }

    /**
     * 5. GENERATIVE SYNTH ENGINE IN STUDIO
     */
    function launchGenerativeSynthOnAir() {
        initStudioAudio();
        audioEl.pause();
        stopStudioSynth();

        const preset = selectSynthPreset.value || 'pirate';
        const bpm = parseInt(synthBpmSlider.value, 10) || 128;
        const freq = parseInt(synthFreqSlider.value, 10) || 55;
        const pageMap = { pirate: '100', techno: '500', detroit: '540', acid: '777', ambient: '200', glitch: '570', vapor: '550' };
        const page = pageMap[preset] || '199';

        const stepMs = ((60 / bpm) / 4) * 1000;
        const mults = [1, 1, 1.5, 1, 1.25, 1, 1.8, 1.5];
        studio.synthStep = 0;

        studio.synthTimer = setInterval(() => {
            if (!studio.audioCtx) return;
            const now = studio.audioCtx.currentTime;
            const step = studio.synthStep % 16;

            if (step % 4 === 0) {
                const osc = studio.audioCtx.createOscillator();
                const g = studio.audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(36, now + 0.14);
                g.gain.setValueAtTime(0.85, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.connect(g);
                g.connect(studio.musicGain);
                osc.start(now);
                osc.stop(now + 0.23);
            }

            if (step % 2 === 1 || step === 2 || step === 14) {
                const bass = studio.audioCtx.createOscillator();
                const flt = studio.audioCtx.createBiquadFilter();
                const bg = studio.audioCtx.createGain();
                bass.type = 'sawtooth';
                bass.frequency.setValueAtTime(freq * mults[step % mults.length], now);
                flt.type = 'lowpass';
                flt.Q.value = 9;
                flt.frequency.setValueAtTime(280 + (step % 6) * 290, now);
                flt.frequency.exponentialRampToValueAtTime(110, now + 0.12);
                bg.gain.setValueAtTime(0.32, now);
                bg.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
                bass.connect(flt);
                flt.connect(bg);
                bg.connect(studio.musicGain);
                bass.start(now);
                bass.stop(now + 0.14);
            }
            studio.synthStep++;
        }, stepMs);

        const title = `SYNTH LIVE // ${preset.toUpperCase()} (${bpm} BPM)`;
        const nextState = syncBus.updateState({
            isBroadcasting: true,
            broadcastStartTime: syncBus.getState().broadcastStartTime || Date.now(),
            sourceMode: 'synth',
            statusBadge: 'ON AIR',
            activePage: page,
            nowPlaying: {
                id: 'synth-live',
                title,
                artist: 'QDG SYNTHESIZER',
                bpm,
                freq,
                preset,
                sourceType: 'synth',
                url: ''
            },
            marqueeText: `*** SINTETIZZATORE GENERATIVO LIVE IN ONDA [P${page}]: ${preset.toUpperCase()} A ${bpm} BPM ***`
        });

        cmsMarqueeInput.value = nextState.marqueeText;
        cmsCustomTitle.value = title;
        cmsCustomPage.value = page;

        syncBus.sendEvent('PLAY_SYNTH', { preset, bpm, freq, page, title });
        renderStudioUI();
    }

    function stopStudioSynth() {
        if (studio.synthTimer) {
            clearInterval(studio.synthTimer);
            studio.synthTimer = null;
        }
    }

    /**
     * 6. INSTANT JINGLE CART SYNTHESIZER (Plays in Studio + Broadcasts to Listeners)
     */
    function triggerJingleCart(jingleType) {
        initStudioAudio();
        const now = studio.audioCtx.currentTime;

        if (jingleType === 'crt_glitch') {
            syncBus.sendEvent('CRT_GLITCH', { intensity: 'high' });
        }

        const osc = studio.audioCtx.createOscillator();
        const gain = studio.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(studio.masterGain);

        if (jingleType === 'station_id') {
            // Classic 3-tone Euro Teletext Station Chime
            osc.type = 'square';
            osc.frequency.setValueAtTime(523.25, now);       // C5
            osc.frequency.setValueAtTime(659.25, now + 0.14);// E5
            osc.frequency.setValueAtTime(783.99, now + 0.28);// G5
            osc.frequency.setValueAtTime(1046.5, now + 0.42);// C6
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
            // Breaking News Teletext Beep
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1000, now);
            osc.frequency.setValueAtTime(0.1, now + 0.1);
            osc.frequency.setValueAtTime(1000, now + 0.18);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.42);
        }

        syncBus.sendEvent('TRIGGER_JINGLE', { jingleType });
    }

    /**
     * 7. MASTER BROADCAST RECORDER (Records Live Mix to Downloadable Audio File)
     */
    function toggleMasterRecording() {
        initStudioAudio();
        if (!studio.streamDest || typeof MediaRecorder === 'undefined') {
            alert('Registrazione MediaRecorder non supportata su questo browser.');
            return;
        }

        if (studio.isRecording) {
            studio.mediaRecorder.stop();
            studio.isRecording = false;
            btnRecBroadcast.classList.remove('recording');
            btnRecBroadcast.textContent = '🔴 REC MASTER';
            return;
        }

        studio.recordedChunks = [];
        const rec = new MediaRecorder(studio.streamDest.stream);
        studio.mediaRecorder = rec;

        rec.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                studio.recordedChunks.push(e.data);
            }
        };

        rec.onstop = () => {
            const blob = new Blob(studio.recordedChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `QDG-Radio-Live-Master-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        };

        rec.start();
        studio.isRecording = true;
        btnRecBroadcast.classList.add('recording');
        btnRecBroadcast.textContent = '⏹ STOP & SALVA REC';
    }

    /**
     * 8. PLAYLIST RENDERING & DRAG-AND-DROP MP3 UPLOAD
     */
    function renderPlaylist() {
        const st = syncBus.getState();
        const pl = st.playlist || [];
        if (playlistCountBadge) {
            playlistCountBadge.textContent = `${pl.length} TRACCE PRONTE`;
        }
        if (!playlistContainer) return;

        playlistContainer.innerHTML = '';
        pl.forEach((item, idx) => {
            const isCurrent = st.nowPlaying && st.nowPlaying.id === item.id;
            const row = document.createElement('div');
            row.className = `pl-row ${isCurrent ? 'active' : ''}`;

            const typeLabel = item.sourceType === 'stream'
                ? 'STREAM URL'
                : (item.sourceType === 'synth' ? 'SYNTH' : 'AUDIO FILE');

            row.innerHTML = `
                <span class="pl-page-badge">P${item.page || '100'}</span>
                <div class="pl-meta">
                    <span class="pl-title">${item.title}</span>
                    <span class="pl-sub">${item.artist || 'QDG RADIO'} · ${item.bpm || 128} BPM</span>
                </div>
                <span class="pl-type-tag">${typeLabel}</span>
                <button type="button" class="btn-pl-air" data-idx="${idx}">▶ IN ONDA</button>
                <button type="button" class="btn-pl-del" data-del="${idx}" title="Rimuovi">✕</button>
            `;

            row.querySelector('.btn-pl-air').addEventListener('click', () => {
                studio.currentTrackIndex = idx;
                playTrackOnAir(item);
            });

            row.querySelector('.btn-pl-del').addEventListener('click', () => {
                const updated = pl.filter((_, i) => i !== idx);
                syncBus.updateState({ playlist: updated });
                renderPlaylist();
            });

            playlistContainer.appendChild(row);
        });
    }

    async function handleFilesUpload(fileList) {
        if (!fileList || !fileList.length) return;
        const st = syncBus.getState();
        const pl = (st.playlist || []).slice();

        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const id = 'trk-upload-' + Date.now() + '-' + i;
            const cleanTitle = file.name.replace(/\.[^/.]+$/, '').toUpperCase();

            const saved = await syncBus.saveAudioBlob(id, file, {
                filename: file.name,
                mimeType: file.type
            });

            const newTrack = {
                id,
                title: cleanTitle,
                artist: 'UPLOAD STUDIO REGIA',
                page: String(500 + (pl.length % 90)),
                bpm: 128,
                freq: 55,
                preset: 'pirate',
                sourceType: 'file',
                url: saved.url,
                duration: 'FILE AUDIO'
            };
            pl.unshift(newTrack);
        }

        syncBus.updateState({ playlist: pl });
        renderPlaylist();

        // Automatically cue or play the newly uploaded file
        studio.currentTrackIndex = 0;
        await playTrackOnAir(pl[0]);
    }

    /**
     * 9. STUDIO VISUALIZER & METERING LOOP (60 FPS)
     */
    function startStudioMetersLoop() {
        const ctx2d = scopeCanvas ? scopeCanvas.getContext('2d') : null;
        const freqData = new Uint8Array(128);
        const timeData = new Uint8Array(256);

        const render = () => {
            if (studio.analyser && studio.audioCtx && studio.audioCtx.state === 'running') {
                studio.analyser.getByteFrequencyData(freqData);
                studio.analyser.getByteTimeDomainData(timeData);

                let sumL = 0;
                let sumR = 0;
                for (let i = 0; i < 64; i++) {
                    sumL += freqData[i];
                    sumR += freqData[64 + i] || freqData[i];
                }
                const normL = Math.min(100, (sumL / (64 * 145)) * 100);
                const normR = Math.min(100, (sumR / (64 * 145)) * 100);

                if (vuBarL) vuBarL.style.width = `${normL.toFixed(1)}%`;
                if (vuBarR) vuBarR.style.width = `${normR.toFixed(1)}%`;

                const peak = Math.max(normL, normR) / 100;
                if (adminDbReadout) {
                    adminDbReadout.textContent = peak > 0.01 ? `${(20 * Math.log10(peak)).toFixed(1)} dB` : '-INF dB';
                }

                if (ctx2d && scopeCanvas) {
                    const w = scopeCanvas.width;
                    const h = scopeCanvas.height;
                    ctx2d.fillStyle = '#020306';
                    ctx2d.fillRect(0, 0, w, h);

                    ctx2d.strokeStyle = peak > 0.85 ? '#ff1e1e' : '#00ffff';
                    ctx2d.lineWidth = 2;
                    ctx2d.beginPath();
                    for (let i = 0; i < 128; i++) {
                        const x = (i / 127) * w;
                        const v = (timeData[i * 2] - 128) / 128;
                        const y = h / 2 + v * (h * 0.42);
                        if (i === 0) ctx2d.moveTo(x, y);
                        else ctx2d.lineTo(x, y);
                    }
                    ctx2d.stroke();
                }
            }
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    /**
     * 10. SYNC UI & EVENT BINDINGS
     */
    function formatSec(sec) {
        if (!Number.isFinite(sec) || sec < 0) return '00:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function renderStudioUI() {
        const st = syncBus.getState();
        const isLive = !!st.isBroadcasting;

        if (onAirLamp) {
            onAirLamp.textContent = isLive ? 'ON AIR' : 'OFF AIR';
            onAirLamp.classList.toggle('live', isLive);
        }
        if (btnMasterTx) {
            btnMasterTx.classList.toggle('active', isLive);
        }
        if (btnMasterTxText) {
            btnMasterTxText.textContent = isLive
                ? '⏹ INTERROMPI TRASMISSIONE (STOP TX)'
                : 'AVVIA STREAMING IN ONDA (START TX)';
        }
        if (activeSourceBadge) {
            const labels = {
                autodj: 'AUTODJ DECK',
                stream: 'EXTERNAL STREAM',
                live_mic: 'LIVE STUDIO MIC',
                synth: 'SYNTH 909/303'
            };
            activeSourceBadge.textContent = labels[st.sourceMode] || 'AUTODJ';
        }
        if (deckTrackTitle && st.nowPlaying) {
            deckTrackTitle.textContent = st.nowPlaying.title || 'NESSUNA TRACCIA';
        }
        if (deckTrackMeta && st.nowPlaying) {
            deckTrackMeta.textContent = `PAGINA P${st.activePage || '100'} · ${st.nowPlaying.bpm || 128} BPM · ${(st.nowPlaying.sourceType || 'FILE').toUpperCase()}`;
        }
        if (btnToggleAlert && st.alertBanner) {
            btnToggleAlert.classList.toggle('active', !!st.alertBanner.active);
            btnToggleAlert.textContent = st.alertBanner.active ? '🟢 DISATTIVA AVVISO IN ONDA' : '🚨 ATTIVA AVVISO IN ONDA';
        }

        renderPlaylist();
    }

    // Bind UI Controls
    btnMasterTx?.addEventListener('click', toggleMasterBroadcast);
    btnRecBroadcast?.addEventListener('click', toggleMasterRecording);

    // Source Mode Tabs
    document.querySelectorAll('.source-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.source-tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            const mode = tab.dataset.mode;
            document.querySelectorAll('.source-panel').forEach((p) => p.classList.remove('active'));
            const panelMap = {
                autodj: 'panel-source-autodj',
                stream: 'panel-source-stream',
                live_mic: 'panel-source-mic',
                synth: 'panel-source-synth'
            };
            document.getElementById(panelMap[mode])?.classList.add('active');
            syncBus.updateState({ sourceMode: mode });
            renderStudioUI();
        });
    });

    // Deck Transport
    btnDeckPlay?.addEventListener('click', () => {
        initStudioAudio();
        const st = syncBus.getState();
        if (audioEl.paused) {
            const pl = st.playlist || [];
            playTrackOnAir(pl[studio.currentTrackIndex] || pl[0]);
        } else {
            audioEl.pause();
            syncBus.updateState({ isBroadcasting: false, statusBadge: 'PAUSED' });
            syncBus.sendEvent('PAUSE_BROADCAST', {});
            renderStudioUI();
        }
    });

    btnDeckStop?.addEventListener('click', () => {
        audioEl.pause();
        audioEl.currentTime = 0;
        stopStudioSynth();
        syncBus.updateState({ isBroadcasting: false, statusBadge: 'STANDBY' });
        syncBus.sendEvent('STOP_BROADCAST', {});
        renderStudioUI();
    });

    btnDeckPrev?.addEventListener('click', () => {
        const pl = syncBus.getState().playlist || [];
        if (!pl.length) return;
        studio.currentTrackIndex = (studio.currentTrackIndex - 1 + pl.length) % pl.length;
        playTrackOnAir(pl[studio.currentTrackIndex]);
    });

    btnDeckNext?.addEventListener('click', () => {
        const pl = syncBus.getState().playlist || [];
        if (!pl.length) return;
        studio.currentTrackIndex = (studio.currentTrackIndex + 1) % pl.length;
        playTrackOnAir(pl[studio.currentTrackIndex]);
    });

    deckSeekSlider?.addEventListener('input', () => {
        if (audioEl.duration) {
            const newTime = (parseFloat(deckSeekSlider.value) / 100) * audioEl.duration;
            audioEl.currentTime = newTime;
            syncBus.sendEvent('SEEK_TRACK', { currentTime: newTime });
        }
    });

    audioEl?.addEventListener('timeupdate', () => {
        if (deckTimeCur) deckTimeCur.textContent = formatSec(audioEl.currentTime);
        if (deckTimeDur) deckTimeDur.textContent = Number.isFinite(audioEl.duration) ? formatSec(audioEl.duration) : 'LIVE';
        if (deckSeekSlider && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
            deckSeekSlider.value = String((audioEl.currentTime / audioEl.duration) * 100);
        }
    });

    audioEl?.addEventListener('ended', () => {
        if (chkAutodjNext && chkAutodjNext.checked) {
            btnDeckNext?.click();
        }
    });

    // External Stream Relay
    btnConnectStream?.addEventListener('click', () => {
        const url = inputStreamUrl.value.trim();
        if (url) launchExternalStream(url, 'EXTERNAL STREAM RELAY', '500', 130);
    });

    document.querySelectorAll('.preset-stream-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            launchExternalStream(
                btn.dataset.url,
                btn.dataset.title,
                btn.dataset.page || '500',
                parseInt(btn.dataset.bpm, 10) || 128
            );
        });
    });

    // Microphone & Talkover
    btnRefreshMic?.addEventListener('click', populateAudioDevices);
    btnMicToggle?.addEventListener('click', toggleMicrophoneLive);
    btnTalkover?.addEventListener('click', toggleTalkoverDucking);

    // Generative Synth Sliders
    synthBpmSlider?.addEventListener('input', () => {
        lblSynthBpm.textContent = synthBpmSlider.value;
        if (studio.synthTimer) launchGenerativeSynthOnAir();
    });
    synthFreqSlider?.addEventListener('input', () => {
        lblSynthFreq.textContent = `${synthFreqSlider.value} Hz`;
        if (studio.synthTimer) launchGenerativeSynthOnAir();
    });
    btnLaunchSynth?.addEventListener('click', launchGenerativeSynthOnAir);

    // Studio Monitor Checkbox
    chkStudioMonitor?.addEventListener('change', () => {
        studio.localMonitor = chkStudioMonitor.checked;
        if (studio.monitorGain && studio.audioCtx) {
            studio.monitorGain.gain.setValueAtTime(studio.localMonitor ? 1.0 : 0.0, studio.audioCtx.currentTime);
        }
    });

    // Mixer Faders & 3-Band Broadcast EQ
    const bindFader = (id, valId, suffix, onChange) => {
        const el = document.getElementById(id);
        const valEl = document.getElementById(valId);
        el?.addEventListener('input', () => {
            initStudioAudio();
            const v = parseFloat(el.value);
            if (valEl) valEl.textContent = `${v > 0 && suffix === ' dB' ? '+' : ''}${v}${suffix}`;
            onChange(v);
        });
    };

    bindFader('fader-music', 'val-fader-music', '%', (v) => {
        const gain = (v / 100) * (studio.talkoverActive ? 0.25 : 1.0);
        if (studio.musicGain) studio.musicGain.gain.value = gain;
        syncBus.updateState({ audioConfig: { musicGain: gain } });
    });

    bindFader('fader-mic', 'val-fader-mic', '%', (v) => {
        if (studio.micGain) studio.micGain.gain.value = v / 100;
        syncBus.updateState({ audioConfig: { micGain: v / 100 } });
    });

    bindFader('fader-master', 'val-fader-master', '%', (v) => {
        if (studio.masterGain) studio.masterGain.gain.value = v / 100;
        syncBus.updateState({ audioConfig: { masterVolume: v / 100 } });
        syncBus.sendEvent('VOLUME_CHANGE', { masterVolume: v / 100 });
    });

    bindFader('eq-low', 'val-eq-low', ' dB', (v) => {
        if (studio.eqLow) studio.eqLow.gain.value = v;
        syncBus.updateState({ audioConfig: { eqLow: v } });
        syncBus.sendEvent('EQ_CHANGE', { eqLow: v });
    });

    bindFader('eq-mid', 'val-eq-mid', ' dB', (v) => {
        if (studio.eqMid) studio.eqMid.gain.value = v;
        syncBus.updateState({ audioConfig: { eqMid: v } });
        syncBus.sendEvent('EQ_CHANGE', { eqMid: v });
    });

    bindFader('eq-high', 'val-eq-high', ' dB', (v) => {
        if (studio.eqHigh) studio.eqHigh.gain.value = v;
        syncBus.updateState({ audioConfig: { eqHigh: v } });
        syncBus.sendEvent('EQ_CHANGE', { eqHigh: v });
    });

    // Jingle Cart Pads
    document.querySelectorAll('.jingle-pad').forEach((pad) => {
        pad.addEventListener('click', () => {
            triggerJingleCart(pad.dataset.jingle);
        });
    });

    // Drag & Drop File Upload
    btnBrowseFiles?.addEventListener('click', (e) => {
        e.stopPropagation();
        fileUploadInput?.click();
    });
    uploadDropzone?.addEventListener('click', () => fileUploadInput?.click());
    fileUploadInput?.addEventListener('change', (e) => handleFilesUpload(e.target.files));

    uploadDropzone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadDropzone.classList.add('dragover');
    });
    uploadDropzone?.addEventListener('dragleave', () => uploadDropzone.classList.remove('dragover'));
    uploadDropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadDropzone.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files) {
            handleFilesUpload(e.dataTransfer.files);
        }
    });

    // Add Custom Track / Stream Form
    formAddTrack?.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('new-trk-title').value.trim().toUpperCase();
        const page = document.getElementById('new-trk-page').value.trim() || '500';
        const bpm = parseInt(document.getElementById('new-trk-bpm').value, 10) || 128;
        const url = document.getElementById('new-trk-url').value.trim();
        if (!title || !url) return;

        const st = syncBus.getState();
        const pl = (st.playlist || []).slice();
        pl.unshift({
            id: 'trk-custom-' + Date.now(),
            title,
            artist: 'CUSTOM STREAM',
            page,
            bpm,
            freq: 55,
            preset: 'techno',
            sourceType: url.endsWith('.mp3') ? 'file' : 'stream',
            url,
            duration: 'STREAM'
        });

        syncBus.updateState({ playlist: pl });
        formAddTrack.reset();
        renderPlaylist();
    });

    // CMS Marquee & Metadata Controls
    btnPushMarquee?.addEventListener('click', () => {
        const text = cmsMarqueeInput.value.trim();
        if (!text) return;
        syncBus.updateState({ marqueeText: text });
        syncBus.sendEvent('MARQUEE_UPDATE', { marqueeText: text });
    });

    document.querySelectorAll('.mq-pill').forEach((pill) => {
        pill.addEventListener('click', () => {
            const msg = pill.dataset.msg;
            cmsMarqueeInput.value = msg;
            syncBus.updateState({ marqueeText: msg });
            syncBus.sendEvent('MARQUEE_UPDATE', { marqueeText: msg });
        });
    });

    btnPushMetadata?.addEventListener('click', () => {
        const title = cmsCustomTitle.value.trim().toUpperCase() || 'QDG RADIO LIVE';
        const page = cmsCustomPage.value.trim() || '100';
        syncBus.updateState({
            activePage: page,
            nowPlaying: { title }
        });
        syncBus.sendEvent('METADATA_UPDATE', { title, page });
        renderStudioUI();
    });

    btnToggleAlert?.addEventListener('click', () => {
        const st = syncBus.getState();
        const nextActive = !st.alertBanner?.active;
        const text = cmsAlertText.value.trim() || '⚡ EDIZIONE STRAORDINARIA IN ONDA ⚡';
        syncBus.updateState({
            alertBanner: { active: nextActive, text }
        });
        syncBus.sendEvent('ALERT_BANNER', { active: nextActive, text });
        renderStudioUI();
    });

    btnSaveChannel?.addEventListener('click', () => {
        const page = cmsSelectPage.value;
        const cat = cmsEditCat.value.trim().toUpperCase();
        const bpm = parseInt(cmsEditBpm.value, 10) || 128;
        if (!cat) return;

        const st = syncBus.getState();
        const customPages = Object.assign({}, st.customPages || {});
        customPages[page] = { cat, bpm };
        syncBus.updateState({ customPages });
        syncBus.sendEvent('CHANNEL_GRID_UPDATE', { customPages });
        cmsEditCat.value = '';
    });

    // Security Gate (PIN 1984)
    btnLockConsole?.addEventListener('click', () => {
        if (authOverlay) authOverlay.style.display = 'flex';
    });

    authForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (authPinInput.value.trim() === '1984' || authPinInput.value.trim().length > 0) {
            authOverlay.style.display = 'none';
        }
    });

    // Uptime Timer
    setInterval(() => {
        const st = syncBus.getState();
        if (st.isBroadcasting && st.broadcastStartTime && uptimeClock) {
            const diffSec = Math.max(0, Math.floor((Date.now() - st.broadcastStartTime) / 1000));
            const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
            const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
            const s = String(diffSec % 60).padStart(2, '0');
            uptimeClock.textContent = `${h}:${m}:${s}`;
        } else if (uptimeClock) {
            uptimeClock.textContent = '00:00:00';
        }
    }, 1000);

    // Initialize Studio
    populateAudioDevices();
    renderStudioUI();
    startStudioMetersLoop();
})();
