# 📺 QDG RADIO // TELEVIDEO CRT EDITION

> **Web Radio & Archivio Mixati Underground** con interfaccia fedele al **Televideo / Teletext CRT**, sviluppata in **Pure Vanilla HTML5 / CSS3 / ES6 JavaScript** e arricchita da un motore audio duale (Stream Audio + Generative Synth Web Audio API).

---

## 🎛️ Caratteristiche Principali

- **📺 Design Teletext CRT Autentico:**
  - Tipografia originale in stile teletext (`VT323`) con palette di 8 colori teletext primari (Giallo, Ciano, Verde, Rosso, Blu, Magenta, Bianco, Nero).
  - Scanlines CRT e vignettatura realistica accelerate via hardware.
  - Logo a blocchi invertiti `[ M I X ] [ R A D I O F A X ]` con reazione al beat della cassa.
  - Marquee news ticker orizzontale continuo.
  - Orologio Teletext italiano in tempo reale (`Ven 06 Nov 17:15/00`).

- **🔊 Dual Audio Engine (Web Audio API):**
  - **Modalità Stream:** Riproduce audio lossless / stream (`test-track.mp3`).
  - **Modalità Generative Synth Live:** Se il file audio è assente o si preme `SYNTH LIVE 199`, un sintetizzatore interno genera in tempo reale loop ritmici con cassa 909, basso risonante 303 e charleston, accordati alla pagina/frequenza selezionata.
  - Analizzatore di spettro FFT con buffer a 60fps.

- **📊 Visualizer Audio CRT in Tempo Reale:**
  - **Discrete Peak Meter:** Barra a 16 segmenti LED (Verde -> Giallo -> Rosso).
  - **VCR-VU ASCII Meter:** VU meter con blocchi ASCII dinamici e decibel meter (`-INF` a `+0 dB`).
  - **Oscilloscopio Vettoriale SVG:** Visualizzazione continua della forma d'onda audio.
  - **Diagnostica Frequenza:** Indicatore digitale lampeggiante sincronizzato con le frequenze sub-basse.

- **🔢 Telecomando & Ricerca Pagine:**
  - Tastierino numerico a video (0-9) per digitare direttamente il numero di pagina (es. `500` per Techno, `200` per Ambient, `540` per Detroit).
  - Tasti rapidi Fastext:
    - **Rosso:** `► PLAY / ❚❚ PAUSE [100]`
    - **Verde:** `■ STOP [102]`
    - **Giallo:** `⏭ NEXT [101]`
    - **Ciano:** `SYNTH LIVE [199]`
  - Controllo volume con pulsanti `[ - VOL + ]` e `[ MUTE ]`.

- **⌨️ Scorciatoie da Tastiera:**
  - `Spazio`: Play / Pausa
  - `0 - 9`: Digitazione diretta pagina Televideo
  - `N`: Traccia / Pagina successiva
  - `S`: Stop riproduzione
  - `Freccia Su / Giù`: Volume
  - `M`: Muto

- **📱 Ottimizzazione Mobile-First:**
  - Layout 100% responsive: le 2 colonne dell'indice e il deck audio si adattano automaticamente a smartphone e tablet senza barre di scorrimento orizzontali.

---

## 📂 Struttura del Repository

```
QDG-Radio/
├── index.html            # Interfaccia Televideo completa standalone
├── css/
│   └── televideo.css     # Stili CRT Teletext, scanlines e responsive layout
├── js/
│   └── televideo.js      # Web Audio API Engine, Synth generativo e controller CRT
├── test-track.mp3        # Traccia audio di test
├── .gitignore
└── README.md
```

---

## 🚀 Avvio Locale

Puoi aprire direttamente il file `index.html` con qualsiasi browser moderno, oppure avviare un server locale leggero:

```bash
# Con Python 3
python3 -m http.server 8080

# Oppure con Node / npx
npx serve .
```

Apri `http://localhost:8080` nel tuo browser.
