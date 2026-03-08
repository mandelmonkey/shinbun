# Jazz Voicing Trainer

A browser-based practice tool for learning jazz piano voicings in a Bill Evans–inspired style. Works with Web MIDI keyboards, on-screen piano, or computer keyboard input.

**Live:** https://mandelmonkey.github.io/shinbun/jazz-trainer/

---

## Features

| Mode | Description |
|------|-------------|
| **Chord Trainer** | Random chord symbols — play a voicing, get graded |
| **ii-V-I Trainer** | Rootless voicing drills through all keys by 5ths |
| **Progression Trainer** | Blues, turnarounds, rhythm changes, modal vamps |
| **Standards Practice** | Enter your own chord charts with metronome |
| **Ear Training** | Identify chords by sound, play them back |
| **Stats Dashboard** | Track accuracy, weak keys/chords, trends |

---

## GitHub Pages Deployment

```bash
# 1. Fork or clone the repo
git clone https://github.com/yourname/jazz-voicing-trainer.git
cd jazz-voicing-trainer

# 2. Push to GitHub
git remote add origin https://github.com/yourname/jazz-voicing-trainer.git
git push -u origin main

# 3. Enable GitHub Pages
# Go to repo Settings → Pages → Source: main branch / root
# Your site is live at: https://yourname.github.io/jazz-voicing-trainer/
```

No build step. No npm. No server. Just static files.

---

## Input Methods

### Web MIDI Keyboard (recommended)
- Connect any USB or Bluetooth MIDI keyboard
- Use Chrome or Edge (Firefox has limited MIDI support)
- Click **Allow** when the browser asks for MIDI permissions
- Status shown in the top-right corner

**Permissions note:** Web MIDI requires `https://` or `localhost`. It will not work on plain `http://`. GitHub Pages serves over HTTPS so it works there.

### Computer Keyboard
```
Lower octave (C3–B3):   Z S X D C  V G B H N J M
Upper octave (C4–B4):   Q 2 W 3 E  R 5 T 6 Y 7 U
Extended (C5+):         I 9 O 0 P
```
Hold multiple keys simultaneously for chords.

### On-screen Piano
Click or tap the keys in the piano at the bottom of the screen.

---

## Music Logic

### Chord Parser
Parses standard jazz chord symbols:
- `Cmaj7` `Dm9` `G7` `Bb13` `F#m7b5` `Ebmaj7#11`
- `G7alt` `G7b9` `G7#9` `G13b9` `Gsus4` `Gdim7`
- Handles `Δ` (delta), `-` (minus = minor), `ø` (half-dim), `o` (dim)
- Enharmonic equivalence: `C#` = `Db`, etc.

### Chord Quality Definitions
Each chord type defines three tiers:

```
essential  → must be present for a valid voicing
optional   → acceptable, encouraged
avoid      → penalised if played
color      → upper extensions (9, 11, 13) — bonus points
```

Examples:
- `maj7` essential: **3, maj7** | avoid: natural 11 | color: 9, #11, 13
- `m7` essential: **b3, b7** | optional: 5, 9, 11 | no avoid notes
- `7alt` essential: **3, b7** | optional: b9, #9, b5, b13 | avoid: natural 5, 9, 11, 13

### Grading Engine
Voicings are graded by **pitch class function**, not exact pitch set:
1. Extract pitch classes from played notes
2. Normalise relative to root (so C Dm7 voicing = F Gm7 voicing structurally)
3. Check essential tones present
4. Check for avoid notes
5. Credit colour tones
6. Flag register problems (mud below C3, clusters)

**Score → Grade:**
- 90–100: Excellent
- 75–89: Good
- 60–74: Acceptable
- 40–59: Needs Work
- <40: Try Again

### Voice Leading Score
Measures total semitone movement between successive voicings by pairing notes by register (low to low, high to high). Lower movement = smoother.

- 0: Perfect — common tones held
- 1–4: Excellent
- 5–8: Smooth
- 9–14: Some leaps
- 15+: Large jumps

### Rootless Voicings (A and B forms)
For any chord, two standard rootless forms are generated:

**A form** — 3rd on the bottom:
```
Dm7 A form:  F–A–C–E  (b3–5–b7–9)
G7  A form:  B–D–F–A  (3–5–b7–9) 
Cmaj7 A:     E–G–B–D  (3–5–maj7–9)
```

**B form** — 7th on the bottom:
```
Dm7 B form:  C–E–F–A  (b7–9–b3–5)
G7  B form:  F–A–B–D  (b7–9–3–5)
Cmaj7 B:     B–D–E–G  (maj7–9–3–5)
```

A→B→A voice leading is extremely smooth — typically 1–4 semitones total movement.

---

## Adding Chord Types
Edit `js/music.js`, add an entry to `CHORD_QUALITIES`:

```js
'maj7#11': {
    name: 'Major 7th #11 (Lydian)',
    essential: [4, 11, 6],   // 3, maj7, #11 (semitones from root)
    optional:  [7, 2, 9],    // 5, 9, 13
    avoid:     [],
    color:     [2, 9],       // 9, 13 are bonuses
},
```

Then add any aliases to the `ALIASES` map in `parseChord()`.

---

## File Structure

```
index.html          Main app
css/style.css       Dark jazz theme
js/music.js         Chord parsing, voicing generation, grading, voice leading
js/midi.js          Web MIDI + keyboard + on-screen piano input
js/audio.js         Web Audio API (piano tones, metronome)
js/stats.js         localStorage statistics tracking
js/ui.js            Piano keyboard renderer
js/app.js           Application logic, mode controllers
README.md           This file
```

---

## Browser Compatibility

| Browser | MIDI | Audio | Keyboard |
|---------|------|-------|----------|
| Chrome  | ✅   | ✅    | ✅       |
| Edge    | ✅   | ✅    | ✅       |
| Firefox | ⚠️ (needs flag) | ✅ | ✅ |
| Safari  | ❌   | ✅    | ✅       |

Chrome is recommended for full MIDI support. The app works without MIDI (keyboard/mouse only) in all browsers.

---

## Settings / Practice Rules

Configurable via the Settings tab:

| Rule | Default | Description |
|------|---------|-------------|
| Require 3rd | ✅ | Penalise voicings missing the 3rd |
| Require 7th | ✅ | Penalise voicings missing the 7th |
| Allow omitted root | ✅ | Rootless voicings not penalised |
| Allow omitted 5th | ✅ | Standard jazz practice |
| Allow tensions | ✅ | 9, 11, 13 welcome |
| Strict mode | ❌ | Penalise unexpected notes |
| Left hand only | ✅ | Focus on LH voicing range |

---

## Style Note
This app teaches **jazz piano voicing principles** — rootless forms, guide tones, smooth voice leading, upper extensions. It does not contain transcriptions of any copyrighted material.
