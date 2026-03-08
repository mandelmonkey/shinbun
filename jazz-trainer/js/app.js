/**
 * app.js — Main application logic
 * 
 * Modes:
 * 1. Chord Trainer — random chords, grade voicings
 * 2. Rootless ii-V-I — practice smooth rootless voicings through cycle
 * 3. Progression Trainer — common jazz progressions with voice leading scoring
 * 4. Standards Practice — user chord charts with metronome
 * 5. Ear Training — identify chords by ear
 * 6. Stats Dashboard — practice statistics
 */

const App = (() => {
    let currentMode = 'chord-trainer';
    let currentChord = null;
    let previousVoicing = null;
    let chordStartTime = null;
    let submitTimer = null;
    let progressionIndex = 0;
    let currentProgression = [];
    let earTrainingAnswer = null;
    
    // Voicing Drill state
    let drillVoicingType = 'rootlessA';  // rootlessA, rootlessB, shell37, shell73
    let drillQuality = 'm7';            // chord quality to drill
    let drillSelectedRoots = new Set([0,2,4,5,7,9,11]); // all naturals by default
    let drillQueue = [];
    let drillIndex = 0;
    let drillShowHint = false;
    const HINT_TOGGLE_NOTE = 108; // C8 (top of 88-key), also accept 96 (C7, top of 61-key)
    
    // Modes with settings
    const SUBMIT_DELAY = 800; // ms after last note to auto-submit

    // ── Initialization ──
    
    async function init() {
        // Load settings
        const settings = Stats.getSettings();
        
        // Init MIDI
        await MIDIHandler.init();
        MIDIHandler.enableKeyboard();
        MIDIHandler.onNotesChanged = handleNotesChanged;
        MIDIHandler.onConnectionChange = updateMIDIStatus;
        
        // Init piano display
        PianoUI.init('piano-container', 48, 84);
        
        // Update MIDI status display
        updateMIDIStatus(...Object.values(MIDIHandler.getStatus()));
        
        // Set up navigation
        document.querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => switchMode(btn.dataset.mode));
        });
        
        // Set up settings panel
        initSettings();
        
        // Set up chord trainer
        initChordTrainer();
        
        // Set up progression trainer
        initProgressionTrainer();
        
        // Set up standards mode
        initStandardsMode();
        
        // Set up ear training
        initEarTraining();
        
        // Set up voicing drill
        initVoicingDrill();
        
        // Load initial mode
        switchMode('chord-trainer');
        
        // Update stats display
        updateStatsDisplay();
    }

    // ── Mode Switching ──

    function switchMode(mode) {
        currentMode = mode;
        // Update nav
        document.querySelectorAll('[data-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        // Show/hide sections
        document.querySelectorAll('.mode-panel').forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== `mode-${mode}`);
        });
        // Reset state
        PianoUI.clearAll();
        MIDIHandler.clearNotes();
        previousVoicing = null;
        
        if (mode === 'chord-trainer') newChord();
        if (mode === 'ii-v-i') startIIVI();
        if (mode === 'voicing-drill') startDrill();
        if (mode === 'progression') startProgression();
        if (mode === 'ear-training') newEarChallenge();
        if (mode === 'stats') updateStatsDisplay();
    }

    // ── MIDI Status ──

    function updateMIDIStatus(status, devices) {
        const el = document.getElementById('midi-status');
        if (!el) return;
        if (status === 'connected') {
            el.innerHTML = `<span class="status-dot connected"></span> MIDI: ${devices.map(d => d.name).join(', ')}`;
            el.className = 'midi-status connected';
        } else if (status === 'unsupported') {
            el.innerHTML = '<span class="status-dot unsupported"></span> MIDI not supported — use keyboard/mouse';
            el.className = 'midi-status unsupported';
        } else {
            el.innerHTML = '<span class="status-dot disconnected"></span> No MIDI device — connect one or use keyboard';
            el.className = 'midi-status disconnected';
        }
    }

    // ── Note Handling ──

    function handleNotesChanged(notes) {
        // Check for hint toggle (top key on 88-key or 61-key keyboard)
        if (currentMode === 'voicing-drill') {
            if (notes.has(HINT_TOGGLE_NOTE) || notes.has(96)) {
                // Remove the toggle note from active set so it doesn't count as played
                notes.delete(HINT_TOGGLE_NOTE);
                notes.delete(96);
                toggleDrillHint();
                PianoUI.setActiveNotes(notes);
                return;
            }
        }
        
        PianoUI.setActiveNotes(notes);
        
        // Auto-submit after a pause
        if (submitTimer) clearTimeout(submitTimer);
        if (notes.size > 0) {
            if (!chordStartTime) chordStartTime = Date.now();
            submitTimer = setTimeout(() => submitVoicing(), SUBMIT_DELAY);
        }
    }

    function submitVoicing() {
        const notes = MIDIHandler.getActiveNotesArray();
        if (notes.length === 0) return;
        
        const responseTime = chordStartTime ? Date.now() - chordStartTime : 0;
        
        switch (currentMode) {
            case 'chord-trainer':
                gradeChordTrainer(notes, responseTime);
                break;
            case 'ii-v-i':
                gradeIIVI(notes, responseTime);
                break;
            case 'voicing-drill':
                gradeDrill(notes, responseTime);
                break;
            case 'progression':
                gradeProgression(notes, responseTime);
                break;
            case 'ear-training':
                gradeEarTraining(notes);
                break;
        }
    }

    // ══════════════════════════════════════════════
    // CHORD TRAINER MODE
    // ══════════════════════════════════════════════

    function initChordTrainer() {
        document.getElementById('btn-new-chord')?.addEventListener('click', newChord);
        document.getElementById('btn-show-voicings')?.addEventListener('click', showVoicings);
        document.getElementById('btn-play-chord')?.addEventListener('click', () => {
            if (currentChord) {
                const voicings = Music.generateVoicings(currentChord);
                if (voicings.length > 0) AudioEngine.playChord(voicings[0].notes);
            }
        });
    }

    function newChord() {
        currentChord = Music.randomChord();
        chordStartTime = null;
        previousVoicing = null;
        
        const display = document.getElementById('chord-display');
        if (display) display.textContent = currentChord.display;
        
        const qualityInfo = document.getElementById('chord-quality-info');
        const q = Music.CHORD_QUALITIES[currentChord.quality];
        if (qualityInfo && q) {
            qualityInfo.textContent = q.name;
        }
        
        clearFeedback();
        PianoUI.clearAll();
        MIDIHandler.clearNotes();
        hideVoicings();
    }

    function gradeChordTrainer(notes, responseTime) {
        if (!currentChord) return;
        const settings = Stats.getSettings();
        const result = Music.gradeVoicing(notes, currentChord, settings);
        
        // Voice leading from previous
        let vlFeedback = '';
        if (previousVoicing) {
            const vl = Music.scoreVoiceLeading(previousVoicing, notes);
            vlFeedback = vl.feedback;
        }
        previousVoicing = [...notes];
        
        // Record stats
        Stats.recordAttempt(currentChord, result.score, responseTime);
        
        // Display feedback
        showFeedback(result, vlFeedback);
        
        // Highlight played notes
        PianoUI.setHighlightedNotes(notes);
    }

    function showVoicings() {
        if (!currentChord) return;
        const voicings = Music.generateVoicings(currentChord);
        const container = document.getElementById('voicings-panel');
        if (!container) return;
        
        container.innerHTML = '<h3>Voicing Suggestions</h3>';
        container.classList.remove('hidden');
        
        for (const v of voicings) {
            const div = document.createElement('div');
            div.className = `voicing-card type-${v.type}`;
            
            const noteNames = v.notes.map(n => Music.midiToNoteName(n, true)).join(' — ');
            let notesDisplay;
            if (v.twoHand && v.lh && v.rh) {
                const lhPc = v.lh.map(n => Music.pcName(n % 12)).join(' ');
                const rhPc = v.rh.map(n => Music.pcName(n % 12)).join(' ');
                notesDisplay = `<span class="hint-lh">LH: ${lhPc}</span> <span class="hint-divider">|</span> <span class="hint-rh">RH: ${rhPc}</span>`;
            } else {
                notesDisplay = v.notes.map(n => Music.pcName(n % 12)).join(' ');
            }
            
            div.innerHTML = `
                <div class="voicing-label">${v.label}</div>
                <div class="voicing-notes">${notesDisplay}</div>
                <div class="voicing-midi">${noteNames}</div>
                <div class="voicing-desc">${v.description}</div>
                <button class="btn-play-voicing" data-notes="${v.notes.join(',')}">♪ Play</button>
                <button class="btn-show-voicing" data-notes="${v.notes.join(',')}" ${v.twoHand ? `data-lh="${v.lh.join(',')}" data-rh="${v.rh.join(',')}"` : ''}>Show on keyboard</button>
            `;
            container.appendChild(div);
        }
        
        // Wire up play/show buttons
        container.querySelectorAll('.btn-play-voicing').forEach(btn => {
            btn.addEventListener('click', () => {
                const notes = btn.dataset.notes.split(',').map(Number);
                AudioEngine.playChord(notes);
            });
        });
        container.querySelectorAll('.btn-show-voicing').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.lh && btn.dataset.rh) {
                    const lh = btn.dataset.lh.split(',').map(Number);
                    const rh = btn.dataset.rh.split(',').map(Number);
                    PianoUI.setTwoHandNotes(lh, rh);
                } else {
                    const notes = btn.dataset.notes.split(',').map(Number);
                    PianoUI.setSuggestedNotes(notes);
                }
            });
        });
    }

    function hideVoicings() {
        const container = document.getElementById('voicings-panel');
        if (container) {
            container.classList.add('hidden');
            container.innerHTML = '';
        }
    }

    // ══════════════════════════════════════════════
    // ii-V-I TRAINER MODE
    // ══════════════════════════════════════════════

    let iiviKey = 0;
    let iiviIndex = 0;
    let iiviChords = [];
    let iiviMinor = false;

    function initIIVIControls() {
        document.getElementById('btn-iivi-next-key')?.addEventListener('click', () => {
            iiviKey = (iiviKey + 1) % 12;
            startIIVI();
        });
        document.getElementById('btn-iivi-random-key')?.addEventListener('click', () => {
            iiviKey = Music.randomKey();
            startIIVI();
        });
        document.getElementById('btn-iivi-minor')?.addEventListener('click', () => {
            iiviMinor = !iiviMinor;
            const btn = document.getElementById('btn-iivi-minor');
            if (btn) btn.textContent = iiviMinor ? 'Switch to Major' : 'Switch to Minor';
            startIIVI();
        });
    }

    function startIIVI() {
        iiviChords = Music.iiVI(iiviKey, iiviMinor);
        iiviIndex = 0;
        previousVoicing = null;
        updateIIVIDisplay();
    }

    function updateIIVIDisplay() {
        const keyDisplay = document.getElementById('iivi-key');
        if (keyDisplay) keyDisplay.textContent = `Key: ${Music.pcName(iiviKey)} ${iiviMinor ? 'minor' : 'major'}`;
        
        const progDisplay = document.getElementById('iivi-progression');
        if (progDisplay) {
            progDisplay.innerHTML = iiviChords.map((c, i) => 
                `<span class="prog-chord ${i === iiviIndex ? 'current' : ''}">${c.display}</span>`
            ).join(' → ');
        }
        
        currentChord = iiviChords[iiviIndex];
        const display = document.getElementById('iivi-current');
        if (display) display.textContent = currentChord.display;
        
        chordStartTime = null;
        clearFeedback();
        PianoUI.clearAll();
    }

    function gradeIIVI(notes, responseTime) {
        if (!currentChord) return;
        const settings = Stats.getSettings();
        const result = Music.gradeVoicing(notes, currentChord, settings);
        
        let vlFeedback = '';
        if (previousVoicing) {
            const vl = Music.scoreVoiceLeading(previousVoicing, notes);
            vlFeedback = vl.feedback;
        }
        previousVoicing = [...notes];
        
        Stats.recordAttempt(currentChord, result.score, responseTime);
        showFeedback(result, vlFeedback);
        
        // Auto-advance on good voicing
        if (result.score >= 60) {
            setTimeout(() => {
                iiviIndex++;
                if (iiviIndex >= iiviChords.length) {
                    // Cycle to next key
                    iiviKey = (iiviKey + 7) % 12; // move by 5ths
                    startIIVI();
                } else {
                    updateIIVIDisplay();
                }
                MIDIHandler.clearNotes();
                PianoUI.setActiveNotes(new Set());
            }, 1200);
        }
    }

    // ══════════════════════════════════════════════
    // VOICING DRILL MODE
    // ══════════════════════════════════════════════
    // Learn all chords for a specific voicing type.
    // Select which roots to include, pick a voicing type + quality,
    // then drill through them. Hit top key to toggle answer overlay.

    const DRILL_VOICING_TYPES = {
        'rootlessA':        'Rootless A (LH)',
        'rootlessB':        'Rootless B (LH)',
        'shell':            'Shell 3→7 (LH)',
        'shell73':          'Shell 7→3 (LH)',
        'spread':           '🤲 Spread: Root+7 | 3+colour+9',
        'twoHandShell':     '🤲 Shell | Extensions',
        'twoHandOpen':      '🤲 Root+5 | 3+7+9',
        'twoHandRootlessA': '🤲 Rootless A | Colour',
    };

    const DRILL_QUALITIES = {
        'm7':     'Minor 7th (ii)',
        '7':      'Dominant 7th (V)',
        'maj7':   'Major 7th (I)',
        'm7b5':   'Half-dim (iiø)',
        '7b9':    'Dom 7♭9 (V of minor)',
        '7alt':   'Altered Dom',
        'dim7':   'Diminished 7th',
        'm9':     'Minor 9th',
        '9':      'Dominant 9th',
        'maj9':   'Major 9th',
    };

    let drillSource = 'roots'; // 'roots' or 'standard'

    // Built-in standard chord progressions (public-domain harmonic patterns)
    const DRILL_STANDARDS = {
        'Autumn Leaves': 'Cm7 F7 Bbmaj7 Ebmaj7 Am7b5 D7b9 Gm7 Gm7 Cm7 F7 Bbmaj7 Ebmaj7 Am7b5 D7b9 Gm7 Gm7',
        'All The Things (A)': 'Fm7 Bbm7 Eb7 Abmaj7 Dbmaj7 Dm7 G7 Cmaj7 Cmaj7 Cm7 Fm7 Bb7 Ebmaj7 Abmaj7 Am7b5 D7b9 Gmaj7 Gmaj7',
        'Blue Bossa': 'Cm7 Cm7 Fm7 Fm7 Dm7b5 G7b9 Cm7 Cm7 Ebm7 Ab7 Dbmaj7 Dbmaj7 Dm7b5 G7b9 Cm7 Cm7',
        'Fly Me To The Moon': 'Am7 Dm7 G7 Cmaj7 Fmaj7 Bm7b5 E7b9 Am7 Am7 Dm7 G7 Cmaj7 Cmaj7 Fmaj7 Bm7b5 E7b9 Am7 Am7',
        'Misty': 'Ebmaj7 Bbm7 Eb7 Abmaj7 Abm7 Db7 Ebmaj7 Cm7 Fm7 Bb7 Ebmaj7 Ebmaj7',
        'Satin Doll': 'Dm7 G7 Em7 A7 Am7 D7 Abm7 Db7 Cmaj7 Cmaj7',
        'So What': 'Dm7 Dm7 Dm7 Dm7 Dm7 Dm7 Dm7 Dm7 Ebm7 Ebm7 Ebm7 Ebm7 Ebm7 Ebm7 Ebm7 Ebm7 Dm7 Dm7 Dm7 Dm7 Dm7 Dm7 Dm7 Dm7',
        'Take The A Train': 'Cmaj7 Cmaj7 D7 D7 Dm7 G7 Cmaj7 Cmaj7',
        'Blues in Bb': 'Bb7 Bb7 Bb7 Bb7 Eb7 Eb7 Bb7 Bb7 F7 Eb7 Bb7 F7',
        'Blues in F': 'F7 F7 F7 F7 Bb7 Bb7 F7 F7 Gm7 C7 F7 C7',
        'ii-V-I All Keys': 'Dm7 G7 Cmaj7 Gm7 C7 Fmaj7 Cm7 F7 Bbmaj7 Fm7 Bb7 Ebmaj7 Bbm7 Eb7 Abmaj7 Ebm7 Ab7 Dbmaj7 Abm7 Db7 Gbmaj7 C#m7 F#7 Bmaj7 F#m7 B7 Emaj7 Bm7 E7 Amaj7 Em7 A7 Dmaj7 Am7 D7 Gmaj7',
        'Rhythm Changes (A)': 'Bbmaj7 Gm7 Cm7 F7 Bbmaj7 Gm7 Cm7 F7 Fm7 Bb7 Ebmaj7 Ab7 Bbmaj7 Gm7 Cm7 F7',
        'Giant Steps': 'Bmaj7 D7 Gmaj7 Bb7 Ebmaj7 Am7 D7 Gmaj7 Bb7 Ebmaj7 F#7 Bmaj7 Fm7 Bb7 Ebmaj7 Am7 D7 Gmaj7 C#m7 F#7 Bmaj7 Fm7 Bb7 Ebmaj7 C#m7 F#7',
    };

    function initVoicingDrill() {
        // Build voicing type selector
        const typeSelect = document.getElementById('drill-voicing-type');
        if (typeSelect) {
            for (const [val, label] of Object.entries(DRILL_VOICING_TYPES)) {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = label;
                typeSelect.appendChild(opt);
            }
            typeSelect.addEventListener('change', () => {
                drillVoicingType = typeSelect.value;
            });
        }

        // Source selector (roots vs standard)
        const sourceSelect = document.getElementById('drill-source');
        if (sourceSelect) {
            sourceSelect.addEventListener('change', () => {
                drillSource = sourceSelect.value;
                const rootsPanel = document.getElementById('drill-roots-panel');
                const standardPanel = document.getElementById('drill-standard-panel');
                if (rootsPanel) rootsPanel.classList.toggle('hidden', drillSource !== 'roots');
                if (standardPanel) standardPanel.classList.toggle('hidden', drillSource !== 'standard');
            });
        }

        // Build quality selector
        const qualSelect = document.getElementById('drill-quality');
        if (qualSelect) {
            for (const [val, label] of Object.entries(DRILL_QUALITIES)) {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = label;
                qualSelect.appendChild(opt);
            }
            qualSelect.addEventListener('change', () => {
                drillQuality = qualSelect.value;
            });
        }

        // Build standard selector (built-in + user custom charts)
        refreshDrillStandards();

        // Build root toggle buttons (all 12 notes)
        const rootGrid = document.getElementById('drill-root-grid');
        if (rootGrid) {
            for (let pc = 0; pc < 12; pc++) {
                const btn = document.createElement('button');
                btn.className = 'drill-root-btn active';
                btn.dataset.pc = pc;
                btn.textContent = Music.pcName(pc);
                btn.addEventListener('click', () => {
                    if (drillSelectedRoots.has(pc)) {
                        drillSelectedRoots.delete(pc);
                        btn.classList.remove('active');
                    } else {
                        drillSelectedRoots.add(pc);
                        btn.classList.add('active');
                    }
                });
                if (![1,3,6,8,10].includes(pc)) {
                    drillSelectedRoots.add(pc);
                    btn.classList.add('active');
                } else {
                    drillSelectedRoots.delete(pc);
                    btn.classList.remove('active');
                }
                rootGrid.appendChild(btn);
            }
        }

        // Quick-select buttons
        document.getElementById('drill-select-all')?.addEventListener('click', () => {
            drillSelectedRoots = new Set([0,1,2,3,4,5,6,7,8,9,10,11]);
            document.querySelectorAll('.drill-root-btn').forEach(b => b.classList.add('active'));
        });
        document.getElementById('drill-select-none')?.addEventListener('click', () => {
            drillSelectedRoots.clear();
            document.querySelectorAll('.drill-root-btn').forEach(b => b.classList.remove('active'));
        });
        document.getElementById('drill-select-naturals')?.addEventListener('click', () => {
            drillSelectedRoots = new Set([0,2,4,5,7,9,11]);
            document.querySelectorAll('.drill-root-btn').forEach(b => {
                b.classList.toggle('active', drillSelectedRoots.has(parseInt(b.dataset.pc)));
            });
        });

        // Start button
        document.getElementById('btn-drill-start')?.addEventListener('click', startDrill);
        document.getElementById('btn-drill-hear')?.addEventListener('click', hearDrillChord);
        document.getElementById('btn-drill-next')?.addEventListener('click', advanceDrill);
        document.getElementById('btn-drill-hint')?.addEventListener('click', toggleDrillHint);
    }

    function refreshDrillStandards() {
        const select = document.getElementById('drill-standard-select');
        if (!select) return;
        select.innerHTML = '';
        
        // Built-in standards
        const builtInGroup = document.createElement('optgroup');
        builtInGroup.label = 'Standards';
        for (const name of Object.keys(DRILL_STANDARDS)) {
            const opt = document.createElement('option');
            opt.value = `builtin:${name}`;
            opt.textContent = name;
            builtInGroup.appendChild(opt);
        }
        select.appendChild(builtInGroup);
        
        // User custom charts from Standards mode
        const custom = Stats.getCustomCharts();
        if (custom.length > 0) {
            const customGroup = document.createElement('optgroup');
            customGroup.label = 'Your Charts';
            for (const chart of custom) {
                const opt = document.createElement('option');
                opt.value = `custom:${chart.name}`;
                opt.textContent = chart.name;
                customGroup.appendChild(opt);
            }
            select.appendChild(customGroup);
        }
        
        // Preview on change
        select.addEventListener('change', updateDrillStandardPreview);
        updateDrillStandardPreview();
    }
    
    function updateDrillStandardPreview() {
        const select = document.getElementById('drill-standard-select');
        const preview = document.getElementById('drill-standard-preview');
        if (!select || !preview) return;
        
        const val = select.value;
        let chordSymbols = [];
        if (val.startsWith('builtin:')) {
            const str = DRILL_STANDARDS[val.substring(8)];
            if (str) chordSymbols = str.split(/\s+/).filter(c => c);
        } else if (val.startsWith('custom:')) {
            const chart = Stats.getCustomCharts().find(c => c.name === val.substring(7));
            if (chart) chordSymbols = chart.chords;
        }
        
        // Show unique chords in song order
        const seen = new Set();
        const unique = [];
        for (const sym of chordSymbols) {
            const parsed = Music.parseChord(sym);
            if (!parsed) continue;
            const key = `${parsed.root}-${parsed.quality}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(parsed.display);
            }
        }
        
        preview.innerHTML = unique.length > 0
            ? `<span class="preview-label">Unique chords (${unique.length}):</span> ` + unique.map(c => `<span class="prog-chord" style="font-size:0.9rem;padding:3px 8px;">${c}</span>`).join(' ')
            : '';
    }

    function startDrill() {
        if (drillSource === 'standard') {
            // Load from selected standard
            const select = document.getElementById('drill-standard-select');
            const val = select?.value;
            if (!val) return;
            
            let chordSymbols = [];
            if (val.startsWith('builtin:')) {
                const name = val.substring(8);
                const str = DRILL_STANDARDS[name];
                if (str) chordSymbols = str.split(/\s+/).filter(c => c);
            } else if (val.startsWith('custom:')) {
                const name = val.substring(7);
                const chart = Stats.getCustomCharts().find(c => c.name === name);
                if (chart) chordSymbols = chart.chords;
            }
            
            if (chordSymbols.length === 0) return;
            
            // Parse chord symbols — deduplicate for drill (unique chords only, in order of appearance)
            const seen = new Set();
            drillQueue = [];
            for (const sym of chordSymbols) {
                const parsed = Music.parseChord(sym);
                if (!parsed) continue;
                const key = `${parsed.root}-${parsed.quality}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    drillQueue.push(parsed);
                }
            }
            
            if (drillQueue.length === 0) return;
            
            // Don't shuffle standards — keep them in song order
        } else {
            // Root + quality mode
            if (drillSelectedRoots.size === 0) {
                const display = document.getElementById('drill-chord-display');
                if (display) display.textContent = 'Select at least one root!';
                return;
            }

            drillQueue = [...drillSelectedRoots].sort((a, b) => a - b).map(pc => ({
                root: pc,
                quality: drillQuality,
                bass: null,
                display: `${Music.pcName(pc)}${drillQuality}`
            }));

            // Shuffle root drills
            for (let i = drillQueue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [drillQueue[i], drillQueue[j]] = [drillQueue[j], drillQueue[i]];
            }
        }

        drillIndex = 0;
        drillShowHint = false;
        previousVoicing = null;
        updateDrillDisplay();
    }

    function updateDrillDisplay() {
        if (drillQueue.length === 0) return;

        const chord = drillQueue[drillIndex];
        currentChord = chord;
        chordStartTime = null;

        // Chord display
        const display = document.getElementById('drill-chord-display');
        if (display) display.textContent = chord.display;

        // Voicing type label
        const typeLabel = document.getElementById('drill-voicing-label');
        if (typeLabel) typeLabel.textContent = DRILL_VOICING_TYPES[drillVoicingType] || drillVoicingType;

        // Progress indicator
        const progress = document.getElementById('drill-progress');
        if (progress) progress.textContent = `${drillIndex + 1} / ${drillQueue.length}`;

        // Progress dots
        const dots = document.getElementById('drill-dots');
        if (dots) {
            dots.innerHTML = drillQueue.map((c, i) => {
                let cls = 'drill-dot';
                if (i < drillIndex) cls += ' done';
                else if (i === drillIndex) cls += ' current';
                return `<span class="${cls}" title="${c.display}">${Music.pcName(c.root)}</span>`;
            }).join('');
        }

        clearFeedback();
        PianoUI.clearAll();
        MIDIHandler.clearNotes();
        drillShowHint = false;
        updateDrillHintDisplay();
    }

    function hearDrillChord() {
        if (!currentChord) return;
        const target = findDrillTarget();
        if (target) {
            AudioEngine.playChord(target.notes, 2.5);
        } else {
            // Fallback: play first available voicing
            const voicings = Music.generateVoicings(currentChord);
            if (voicings.length > 0) AudioEngine.playChord(voicings[0].notes, 2.5);
        }
    }

    function toggleDrillHint() {
        drillShowHint = !drillShowHint;
        updateDrillHintDisplay();
    }

    /** Find the target voicing for current drill settings */
    function findDrillTarget() {
        if (!currentChord) return null;
        const voicings = Music.generateVoicings(currentChord);
        return voicings.find(v => {
            if (drillVoicingType === 'rootlessA') return v.type === 'rootlessA';
            if (drillVoicingType === 'rootlessB') return v.type === 'rootlessB';
            if (drillVoicingType === 'shell') return v.type === 'shell' && v.label.includes('3→7');
            if (drillVoicingType === 'shell73') return v.type === 'shell' && v.label.includes('7→3');
            if (drillVoicingType === 'spread') return v.type === 'spread';
            if (drillVoicingType === 'twoHandShell') return v.type === 'twoHandShell';
            if (drillVoicingType === 'twoHandOpen') return v.type === 'twoHandOpen';
            if (drillVoicingType === 'twoHandRootlessA') return v.type === 'twoHandRootlessA';
            return false;
        });
    }

    function updateDrillHintDisplay() {
        if (!currentChord) return;

        const hintBtn = document.getElementById('btn-drill-hint');
        if (hintBtn) hintBtn.textContent = drillShowHint ? '🙈 Hide Notes' : '👁 Show Notes';

        if (drillShowHint) {
            const target = findDrillTarget();

            if (target) {
                // Two-hand voicing: show LH and RH in different colours
                if (target.twoHand && target.lh && target.rh) {
                    PianoUI.setTwoHandNotes(target.lh, target.rh);
                    const hintNotes = document.getElementById('drill-hint-notes');
                    if (hintNotes) {
                        const lhNames = target.lh.map(n => Music.pcName(n % 12)).join(' ');
                        const rhNames = target.rh.map(n => Music.pcName(n % 12)).join(' ');
                        const lhMidi = target.lh.map(n => Music.midiToNoteName(n, true)).join(', ');
                        const rhMidi = target.rh.map(n => Music.midiToNoteName(n, true)).join(', ');
                        hintNotes.innerHTML = `<span class="hint-lh">LH: ${lhNames}</span> <span class="hint-divider">|</span> <span class="hint-rh">RH: ${rhNames}</span><br><small style="color:var(--text-muted)">${lhMidi} | ${rhMidi}</small>`;
                        hintNotes.classList.remove('hidden');
                    }
                } else {
                    // Single hand voicing
                    PianoUI.setSuggestedNotes(target.notes);
                    const hintNotes = document.getElementById('drill-hint-notes');
                    if (hintNotes) {
                        const pcs = target.notes.map(n => Music.pcName(n % 12)).join(' — ');
                        const names = target.notes.map(n => Music.midiToNoteName(n, true)).join(', ');
                        hintNotes.innerHTML = `${pcs} <small style="color:var(--text-muted)">(${names})</small>`;
                        hintNotes.classList.remove('hidden');
                    }
                }
            }
        } else {
            PianoUI.clearAll();
            const hintNotes = document.getElementById('drill-hint-notes');
            if (hintNotes) hintNotes.classList.add('hidden');
        }
    }

    function gradeDrill(notes, responseTime) {
        if (!currentChord || drillQueue.length === 0) return;

        const settings = Stats.getSettings();
        const result = Music.gradeVoicing(notes, currentChord, settings);

        // Check if they played the specific voicing type requested
        const target = findDrillTarget();

        // Check if played notes match the target voicing (by pitch class)
        let voicingMatch = false;
        if (target) {
            const targetPCs = new Set(target.notes.map(n => n % 12));
            const playedPCs = new Set(notes.map(n => n % 12));
            voicingMatch = targetPCs.size === playedPCs.size && 
                           [...targetPCs].every(pc => playedPCs.has(pc));
        }

        let vlFeedback = '';
        if (previousVoicing) {
            const vl = Music.scoreVoiceLeading(previousVoicing, notes);
            vlFeedback = vl.feedback;
        }
        previousVoicing = [...notes];

        // Enhanced feedback for drill mode
        const drillFeedback = { ...result };
        if (voicingMatch) {
            drillFeedback.score = Math.max(result.score, 95);
            drillFeedback.grade = 'Excellent';
            drillFeedback.feedback = [`✅ Correct ${DRILL_VOICING_TYPES[drillVoicingType]} voicing!`, ...result.feedback.filter(f => f.startsWith('✨'))];
        } else if (result.score >= 75) {
            drillFeedback.feedback = [`⚠️ Good chord tones, but not the ${DRILL_VOICING_TYPES[drillVoicingType]} voicing`, ...result.feedback];
        }

        Stats.recordAttempt(currentChord, drillFeedback.score, responseTime);
        showFeedback(drillFeedback, vlFeedback);
        PianoUI.setHighlightedNotes(notes);

        // Auto-advance on correct voicing match
        if (voicingMatch) {
            setTimeout(() => {
                advanceDrill();
                MIDIHandler.clearNotes();
                PianoUI.setActiveNotes(new Set());
            }, 1200);
        }
    }

    function advanceDrill() {
        drillIndex++;
        if (drillIndex >= drillQueue.length) {
            // Completed the run
            showFeedback({
                score: 100, grade: 'Run Complete!',
                feedback: ['🎉 All roots completed! Starting a new round.']
            }, '');
            setTimeout(startDrill, 1500);
        } else {
            updateDrillDisplay();
        }
    }

    // ══════════════════════════════════════════════
    // PROGRESSION TRAINER
    // ══════════════════════════════════════════════

    const PROGRESSIONS = {
        'ii-V-I (Major)': (key) => Music.iiVI(key, false),
        'ii-V-i (Minor)': (key) => Music.iiVI(key, true),
        'Turnaround (I-vi-ii-V)': (key) => Music.turnaround(key),
        '12-Bar Blues': (key) => Music.blues(key),
        'Rhythm Changes A': (key) => {
            const I = { root: key, quality: 'maj7', display: `${Music.pcName(key)}maj7` };
            const vi = { root: (key+9)%12, quality: 'm7', display: `${Music.pcName((key+9)%12)}m7` };
            const ii = { root: (key+2)%12, quality: 'm7', display: `${Music.pcName((key+2)%12)}m7` };
            const V = { root: (key+7)%12, quality: '7', display: `${Music.pcName((key+7)%12)}7` };
            return [I, vi, ii, V, I, vi, ii, V];
        },
        'Modal Vamp (Dorian)': (key) => {
            const i = { root: key, quality: 'm7', display: `${Music.pcName(key)}m7` };
            const IV = { root: (key+5)%12, quality: '7', display: `${Music.pcName((key+5)%12)}7` };
            return [i, i, IV, i];
        },
    };

    function initProgressionTrainer() {
        const select = document.getElementById('progression-select');
        if (select) {
            for (const name of Object.keys(PROGRESSIONS)) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            }
            select.addEventListener('change', startProgression);
        }
        document.getElementById('btn-prog-start')?.addEventListener('click', startProgression);
    }

    function startProgression() {
        const select = document.getElementById('progression-select');
        const name = select?.value || 'ii-V-I (Major)';
        const key = Music.randomKey();
        const gen = PROGRESSIONS[name];
        if (!gen) return;
        
        currentProgression = gen(key);
        progressionIndex = 0;
        previousVoicing = null;
        updateProgressionDisplay();
    }

    function updateProgressionDisplay() {
        const container = document.getElementById('progression-display');
        if (!container) return;
        
        container.innerHTML = currentProgression.map((c, i) =>
            `<span class="prog-chord ${i === progressionIndex ? 'current' : i < progressionIndex ? 'done' : ''}">${c.display}</span>`
        ).join(' ');
        
        currentChord = currentProgression[progressionIndex];
        chordStartTime = null;
        clearFeedback();
    }

    function gradeProgression(notes, responseTime) {
        if (!currentChord) return;
        const settings = Stats.getSettings();
        const result = Music.gradeVoicing(notes, currentChord, settings);
        
        let vlFeedback = '';
        if (previousVoicing) {
            const vl = Music.scoreVoiceLeading(previousVoicing, notes);
            vlFeedback = vl.feedback;
        }
        previousVoicing = [...notes];
        
        Stats.recordAttempt(currentChord, result.score, responseTime);
        showFeedback(result, vlFeedback);
        
        if (result.score >= 50) {
            setTimeout(() => {
                progressionIndex++;
                if (progressionIndex >= currentProgression.length) {
                    showFeedback({ score: 100, grade: 'Complete!', feedback: ['🎉 Progression complete! Starting a new one.'] }, '');
                    setTimeout(startProgression, 1500);
                } else {
                    updateProgressionDisplay();
                }
                MIDIHandler.clearNotes();
                PianoUI.setActiveNotes(new Set());
            }, 1000);
        }
    }

    // ══════════════════════════════════════════════
    // STANDARDS PRACTICE MODE
    // ══════════════════════════════════════════════

    let standardsChords = [];
    let standardsIndex = 0;
    let standardsPlaying = false;

    function initStandardsMode() {
        document.getElementById('btn-standards-save')?.addEventListener('click', saveStandard);
        document.getElementById('btn-standards-play')?.addEventListener('click', toggleStandardsPlay);
        document.getElementById('btn-standards-stop')?.addEventListener('click', stopStandards);
        
        // Load saved charts into select
        refreshStandardsList();
        
        document.getElementById('standards-select')?.addEventListener('change', loadSelectedStandard);
        
        // Tempo control
        document.getElementById('standards-tempo')?.addEventListener('input', (e) => {
            const bpm = parseInt(e.target.value);
            document.getElementById('standards-tempo-display').textContent = `${bpm} BPM`;
            AudioEngine.setTempo(bpm);
        });

        // Seed some example charts
        const charts = Stats.getCustomCharts();
        if (charts.length === 0) {
            Stats.saveCustomChart({
                name: 'Basic Blues in Bb',
                chords: ['Bb7','Bb7','Bb7','Bb7','Eb7','Eb7','Bb7','Bb7','F7','Eb7','Bb7','F7'],
                beatsPerChord: 4,
            });
            Stats.saveCustomChart({
                name: 'Autumn Leaves Changes',
                chords: ['Cm7','F7','Bbmaj7','Ebmaj7','Am7b5','D7b9','Gm7','Gm7'],
                beatsPerChord: 4,
            });
            Stats.saveCustomChart({
                name: 'All The Things Changes (A)',
                chords: ['Fm7','Bbm7','Eb7','Abmaj7','Dbmaj7','Dm7','G7','Cmaj7','Cmaj7',
                         'Cm7','Fm7','Bb7','Ebmaj7','Abmaj7','Am7b5','D7b9','Gmaj7','Gmaj7'],
                beatsPerChord: 4,
            });
            refreshStandardsList();
        }
    }

    function saveStandard() {
        const name = document.getElementById('standard-name')?.value?.trim();
        const chordsStr = document.getElementById('standard-chords')?.value?.trim();
        if (!name || !chordsStr) return;
        
        const chords = chordsStr.split(/[\s,|]+/).filter(c => c);
        const beatsPerChord = parseInt(document.getElementById('standard-beats')?.value) || 4;
        
        Stats.saveCustomChart({ name, chords, beatsPerChord });
        refreshStandardsList();
        
        // Clear inputs
        document.getElementById('standard-name').value = '';
        document.getElementById('standard-chords').value = '';
    }

    function refreshStandardsList() {
        const select = document.getElementById('standards-select');
        if (!select) return;
        select.innerHTML = '<option value="">Select a chart...</option>';
        for (const chart of Stats.getCustomCharts()) {
            const opt = document.createElement('option');
            opt.value = chart.name;
            opt.textContent = chart.name;
            select.appendChild(opt);
        }
    }

    function loadSelectedStandard() {
        const name = document.getElementById('standards-select')?.value;
        if (!name) return;
        const chart = Stats.getCustomCharts().find(c => c.name === name);
        if (!chart) return;
        
        standardsChords = chart.chords.map(s => Music.parseChord(s)).filter(c => c);
        standardsIndex = 0;
        previousVoicing = null;
        updateStandardsDisplay();
    }

    function updateStandardsDisplay() {
        const container = document.getElementById('standards-display');
        if (!container || standardsChords.length === 0) return;
        
        container.innerHTML = standardsChords.map((c, i) =>
            `<span class="prog-chord ${i === standardsIndex ? 'current' : ''}">${c.display}</span>`
        ).join(' | ');
        
        currentChord = standardsChords[standardsIndex];
        
        const currentDisplay = document.getElementById('standards-current');
        if (currentDisplay) currentDisplay.textContent = currentChord?.display || '';
    }

    function toggleStandardsPlay() {
        if (standardsPlaying) {
            stopStandards();
        } else {
            startStandardsPlay();
        }
    }

    function startStandardsPlay() {
        if (standardsChords.length === 0) return;
        standardsPlaying = true;
        standardsIndex = 0;
        previousVoicing = null;
        
        const tempo = parseInt(document.getElementById('standards-tempo')?.value) || 120;
        const beats = standardsChords[0]?.beatsPerChord || 4;
        
        let beatCount = 0;
        const beatsPerChord = parseInt(document.getElementById('standard-beats')?.value) || 4;
        
        AudioEngine.onBeat = (beat, isDownbeat) => {
            beatCount++;
            if (beatCount % beatsPerChord === 0 && beatCount > 0) {
                standardsIndex = (standardsIndex + 1) % standardsChords.length;
                updateStandardsDisplay();
                // Play bass root
                if (currentChord) {
                    AudioEngine.playBassNote(36 + currentChord.root); // C2 range
                }
            }
        };
        
        AudioEngine.startMetronome(tempo, 4);
        updateStandardsDisplay();
        
        const btn = document.getElementById('btn-standards-play');
        if (btn) btn.textContent = '⏸ Pause';
    }

    function stopStandards() {
        standardsPlaying = false;
        AudioEngine.stopMetronome();
        AudioEngine.onBeat = null;
        const btn = document.getElementById('btn-standards-play');
        if (btn) btn.textContent = '▶ Play';
    }

    // ══════════════════════════════════════════════
    // EAR TRAINING MODE
    // ══════════════════════════════════════════════

    function initEarTraining() {
        document.getElementById('btn-ear-play')?.addEventListener('click', playEarChallenge);
        document.getElementById('btn-ear-new')?.addEventListener('click', newEarChallenge);
        document.getElementById('btn-ear-reveal')?.addEventListener('click', revealEarAnswer);
    }

    function newEarChallenge() {
        earTrainingAnswer = Music.randomChord();
        // Limit to common qualities for ear training
        const earQualities = ['maj7','m7','7','m7b5','dim7','m9','9','7b9','7alt','sus4'];
        earTrainingAnswer.quality = earQualities[Math.floor(Math.random() * earQualities.length)];
        earTrainingAnswer.display = `${Music.pcName(earTrainingAnswer.root)}${earTrainingAnswer.quality}`;
        
        const display = document.getElementById('ear-prompt');
        if (display) display.textContent = 'Listen and identify the chord quality...';
        
        const answer = document.getElementById('ear-answer');
        if (answer) answer.classList.add('hidden');
        
        clearFeedback();
        playEarChallenge();
    }

    function playEarChallenge() {
        if (!earTrainingAnswer) return;
        const voicings = Music.generateVoicings(earTrainingAnswer);
        if (voicings.length > 0) {
            AudioEngine.playChord(voicings[0].notes, 2.5);
        }
    }

    function revealEarAnswer() {
        if (!earTrainingAnswer) return;
        const answer = document.getElementById('ear-answer');
        if (answer) {
            answer.textContent = `Answer: ${earTrainingAnswer.display} (${Music.CHORD_QUALITIES[earTrainingAnswer.quality]?.name || ''})`;
            answer.classList.remove('hidden');
        }
        
        // Show voicing on keyboard
        const voicings = Music.generateVoicings(earTrainingAnswer);
        if (voicings.length > 0) {
            PianoUI.setSuggestedNotes(voicings[0].notes);
        }
    }

    function gradeEarTraining(notes) {
        if (!earTrainingAnswer) return;
        const settings = Stats.getSettings();
        const result = Music.gradeVoicing(notes, earTrainingAnswer, settings);
        showFeedback(result, '');
        Stats.recordAttempt(earTrainingAnswer, result.score, 0);
    }

    // ══════════════════════════════════════════════
    // STATS DASHBOARD
    // ══════════════════════════════════════════════

    function updateStatsDisplay() {
        const summary = Stats.getSummary();
        const container = document.getElementById('stats-content');
        if (!container) return;
        
        const trend = summary.trend;
        const trendIcon = trend.trend === 'improving' ? '📈' : trend.trend === 'declining' ? '📉' : '➡️';
        
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${summary.totalAttempts}</div>
                    <div class="stat-label">Total Attempts</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${summary.accuracy}%</div>
                    <div class="stat-label">Accuracy (≥75)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${summary.totalExcellent}</div>
                    <div class="stat-label">Excellent (≥90)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${summary.avgResponseMs ? (summary.avgResponseMs/1000).toFixed(1)+'s' : '—'}</div>
                    <div class="stat-label">Avg Response</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${trendIcon} ${trend.avg}%</div>
                    <div class="stat-label">Recent Trend (${trend.trend})</div>
                </div>
            </div>

            ${summary.weakQualities.length > 0 ? `
            <h3>Weakest Chord Types</h3>
            <div class="weak-list">
                ${summary.weakQualities.map(w => `
                    <div class="weak-item">
                        <span class="weak-name">${w.quality}</span>
                        <span class="weak-accuracy">${w.accuracy}%</span>
                        <span class="weak-attempts">(${w.attempts} attempts)</span>
                    </div>
                `).join('')}
            </div>` : ''}

            ${summary.weakKeys.length > 0 ? `
            <h3>Weakest Keys</h3>
            <div class="weak-list">
                ${summary.weakKeys.map(w => `
                    <div class="weak-item">
                        <span class="weak-name">${Music.pcName(w.key)}</span>
                        <span class="weak-accuracy">${w.accuracy}%</span>
                        <span class="weak-attempts">(${w.attempts} attempts)</span>
                    </div>
                `).join('')}
            </div>` : ''}

            ${trend.scores.length > 0 ? `
            <h3>Recent Scores</h3>
            <div class="score-bar-chart">
                ${trend.scores.map(s => `<div class="score-bar" style="height:${s}%" title="${s}%"></div>`).join('')}
            </div>` : ''}

            <div class="stats-actions">
                <button id="btn-reset-stats" class="btn btn-danger">Reset All Stats</button>
            </div>
        `;
        
        document.getElementById('btn-reset-stats')?.addEventListener('click', () => {
            if (confirm('Reset all practice statistics? Custom charts will be preserved.')) {
                Stats.resetAll();
                updateStatsDisplay();
            }
        });
    }

    // ══════════════════════════════════════════════
    // SETTINGS
    // ══════════════════════════════════════════════

    function initSettings() {
        const settings = Stats.getSettings();
        
        const fields = ['require3rd','require7th','allowOmittedRoot','allowOmitted5th','allowTensions','strictMode','leftHandOnly'];
        for (const field of fields) {
            const el = document.getElementById(`setting-${field}`);
            if (el) {
                el.checked = settings[field];
                el.addEventListener('change', () => {
                    Stats.updateSettings({ [field]: el.checked });
                });
            }
        }
    }

    // ══════════════════════════════════════════════
    // FEEDBACK DISPLAY
    // ══════════════════════════════════════════════

    // Map mode → feedback element id
    const FEEDBACK_IDS = {
        'chord-trainer': 'feedback-chord',
        'ii-v-i': 'feedback-iivi',
        'voicing-drill': 'feedback-drill',
        'progression': 'feedback-prog',
        'standards': 'feedback-standards',
        'ear-training': 'feedback-ear',
    };

    function showFeedback(result, vlFeedback) {
        const container = document.getElementById(FEEDBACK_IDS[currentMode] || 'feedback-chord');
        if (!container) return;
        
        const scoreClass = result.score >= 90 ? 'excellent' : result.score >= 75 ? 'good' : result.score >= 50 ? 'ok' : 'poor';
        
        container.innerHTML = `
            <div class="feedback-score ${scoreClass}">
                <span class="score-number">${result.score}</span>
                <span class="score-grade">${result.grade}</span>
            </div>
            <div class="feedback-messages">
                ${result.feedback.map(f => `<div class="feedback-msg">${f}</div>`).join('')}
                ${vlFeedback ? `<div class="feedback-msg vl">${vlFeedback}</div>` : ''}
            </div>
        `;
        container.classList.remove('hidden');
    }

    function clearFeedback() {
        const container = document.getElementById(FEEDBACK_IDS[currentMode] || 'feedback-chord');
        if (container) {
            container.classList.add('hidden');
            container.innerHTML = '';
        }
    }

    // ── Init on DOM ready ──
    document.addEventListener('DOMContentLoaded', () => {
        init();
        initIIVIControls();
    });

    return { init, switchMode };
})();

window.App = App;
