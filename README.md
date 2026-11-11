# 📺 QDG RADIO // TELEVIDEO CRT EDITION + REGIA DI TRASMISSIONE (P999)

> **Web Radio & Archivio Mixati Underground** con interfaccia **Televideo / Teletext CRT** (`index.html`) e **Regia di Trasmissione Master Control Room** (`admin.html`), sviluppata in **Pure Vanilla HTML5 / CSS3 / ES6 JavaScript** con **Web Audio API**, **Live Stream Relay**, **Mixer Microfono con Talkover** e **Sincronizzazione Real-Time**.

---

## 🎛️ Architettura del Sistema (Ascoltatore P100 + Regia P999)

### 1. 📺 Front-End Ascoltatore (`index.html` — Pagina 100)
- **Design Teletext CRT Autentico:** Tipografia `VT323`, scanlines CRT, logo a blocchi invertiti `[ M I X ] [ R A D I O F A X ]`, orologio Teletext italiano e barra tasti Fastext.
- **Sintonizzazione Automatica con la Regia (`js/radio-sync.js`):**
  - Riceve in tempo reale cambi di traccia, flussi Icecast/Shoutcast esterni, sessioni Live Synth, voce del DJ al microfono, Jingle di stazione, equalizzazione Broadcast a 3 bande, Marquee scorrevole e banner d'emergenza *Edizione Straordinaria*.
- **Accesso Rapido alla Regia:** Cliccando il tasto Fastext magenta **`🎛️ REGIA 999`** (oppure digitando **`999`** sul tastierino numerico o sulla tastiera) si accede alla console di amministrazione.

### 2. 🔴 Regia di Trasmissione Admin (`admin.html` — Pagina 999)
Console di controllo completa suddivisa in **4 Rack da Studio**:
- **RACK 01 — Trasmettitore & 4 Sorgenti di Flusso Streaming:**
  1. **💿 AutoDJ / Playlist Locale:** Riproduzione continua 24/7 con avanzamento automatico, seek bar sincronizzata e gestione coda.
  2. **🌐 Stream URL Esterno (Icecast / Shoutcast / MP3 / AAC / OGG):** Aggancia qualsiasi flusso radio esterno tramite URL o attiva con 1 click i 4 flussi live preconfigurati (*SomaFM Defcon*, *Nightride FM Synthwave*, *Drone Zone Ambient*, *Beat Blender Club*).
  3. **🎙️ Live Studio Mic / Scheda Audio Esterna:** Seleziona il microfono o il mixer USB esterno (`getUserMedia`), trasmette la voce in diretta agli ascoltatori e include la funzione **🗣️ TALKOVER (Auto-Ducking `-12 dB`)** che abbassa automaticamente la musica mentre lo speaker parla.
  4. **🎹 Synth Generativo Live (909/303 Engine):** Controllo live di Preset, Tempo BPM (`90–160`) e Frequenza Root (`36–110 Hz`).
- **RACK 02 — Banco Mixer, EQ Broadcast 3-Bande, VU Meter & Cartucce Jingle:**
  - Fader indipendenti (`MUSICA`, `MIC GAIN`, `MASTER TX`) + Equalizzatore Broadcast (`LOW 80Hz`, `MID 1kHz`, `HI 10kHz`).
  - Dual Peak VU Meter L/R + Oscilloscopio Master in tempo reale.
  - **6 Cartucce Jingle Istantanee:** `🚨 QDG STATION ID`, `📡 PIRATE DUB SIREN`, `⚡ LASER DROP`, `📼 TAPE REWIND`, `🔔 TELETEXT BEEP`, `📺 DEGAUSS CRT GLITCH`.
  - **🔴 REC MASTER:** Registra l'intero flusso audio trasmesso in diretta e scarica automaticamente il file `.webm` a fine sessione.
- **RACK 03 — Archivio Audio & Drag-and-Drop MP3 Uploader:**
  - Trascina qualsiasi file `.mp3`, `.wav`, `.ogg`, `.m4a` dal computer: viene salvato in **IndexedDB** (e in `/uploads/` se `server.py` è attivo) ed è immediatamente riproducibile su tutti i client.
- **RACK 04 — CMS Televideo in Tempo Reale:**
  - Modifica istantanea del **Marquee scorrevole verde**, dei metadati **On-Air**, del **Banner Edizione Straordinaria** e dei nomi/BPM dei 20 canali dell'indice Televideo.

---

## 📂 Struttura del Repository

```text
QDG-Radio/
├── index.html            # Schermo Televideo Ascoltatore (P100)
├── admin.html            # Regia di Trasmissione Admin Studio (P999)
├── server.py             # Server Python opzionale per sync LAN & upload MP3 su disco
├── css/
│   ├── televideo.css     # Stili CRT Teletext Ascoltatore
│   └── admin.css         # Stili Rack Regia di Trasmissione
├── js/
│   ├── radio-sync.js     # Bus Real-Time (BroadcastChannel + localStorage + IndexedDB + API)
│   ├── televideo.js      # Ricevitore Audio/Stream & Visualizer CRT
│   └── admin.js          # Controller Regia, Mixer Microfono, Recorder & CMS
├── test-track.mp3        # Traccia audio master di base
├── .gitignore
└── README.md
```

---

## 🚀 Come Avviare la Web Radio e la Regia

### Modalità A — Server Broadcast Locale (Consigliata per LAN / Multi-Device)
```bash
python3 server.py 8080
```
- **Ascoltatore (Televideo P100):** `http://localhost:8080/index.html`
- **Regia Admin (Studio P999):** `http://localhost:8080/admin.html` *(PIN predefinito: `1984`)*

### Modalità B — Serverless / GitHub Pages / Browser Diretto
Apri `index.html` e `admin.html` in due schede o finestre affiancate del browser: il modulo `js/radio-sync.js` sincronizza istantaneamente audio, file MP3 caricati, microfono, jingle e testi Televideo tramite `BroadcastChannel` e `IndexedDB`.
