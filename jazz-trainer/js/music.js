/**
 * music.js — Jazz Music Theory Engine
 * 
 * Core responsibilities:
 * - Parse jazz chord symbols (Cmaj7, Dm9, G7alt, Bb13#11, etc.)
 * - Represent notes as MIDI numbers and pitch classes
 * - Generate voicings for any chord (shell, rootless A/B, spread, upper-structure)
 * - Grade played notes against chord function (not exact pitch set)
 * - Score voice leading between successive voicings
 */

// ═══════════════════════════════════════════════════════════════
// NOTE NAMES & PITCH CLASSES
// ═══════════════════════════════════════════════════════════════

const NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_NAMES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

// Map note name → pitch class (0-11)
const NOTE_TO_PC = {};
['C','B#'].forEach(n => NOTE_TO_PC[n] = 0);
['C#','Db'].forEach(n => NOTE_TO_PC[n] = 1);
['D'].forEach(n => NOTE_TO_PC[n] = 2);
['D#','Eb'].forEach(n => NOTE_TO_PC[n] = 3);
['E','Fb'].forEach(n => NOTE_TO_PC[n] = 4);
['F','E#'].forEach(n => NOTE_TO_PC[n] = 5);
['F#','Gb'].forEach(n => NOTE_TO_PC[n] = 6);
['G'].forEach(n => NOTE_TO_PC[n] = 7);
['G#','Ab'].forEach(n => NOTE_TO_PC[n] = 8);
['A'].forEach(n => NOTE_TO_PC[n] = 9);
['A#','Bb'].forEach(n => NOTE_TO_PC[n] = 10);
['B','Cb'].forEach(n => NOTE_TO_PC[n] = 11);

/** Convert MIDI note number to note name */
function midiToNoteName(midi, preferFlats = false) {
    const pc = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    const name = preferFlats ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
    return name + octave;
}

/** Convert MIDI note to pitch class (0-11) */
function midiToPC(midi) {
    return ((midi % 12) + 12) % 12;
}

/** Get pitch class from note name string */
function noteNameToPC(name) {
    // Strip octave number if present
    const clean = name.replace(/[0-9-]/g, '');
    if (NOTE_TO_PC[clean] !== undefined) return NOTE_TO_PC[clean];
    throw new Error(`Unknown note: ${name}`);
}

/** Human-readable pitch class name (prefer flats for jazz) */
function pcName(pc, preferFlats = true) {
    return preferFlats ? NOTE_NAMES_FLAT[pc % 12] : NOTE_NAMES_SHARP[pc % 12];
}


// ═══════════════════════════════════════════════════════════════
// INTERVALS (semitones from root)
// ═══════════════════════════════════════════════════════════════

const INTERVALS = {
    '1':  0,  'R': 0,
    'b2': 1,  'b9': 1,
    '2':  2,  '9': 2,
    '#2': 3,  '#9': 3, 'b3': 3,
    '3':  4,
    '#3': 5,  '4': 5, '11': 5,
    '#4': 6,  'b5': 6, '#11': 6,
    '5':  7,
    '#5': 8,  'b6': 8, 'b13': 8,
    '6':  9,  '13': 9, 'bb7': 9,
    'b7': 10, '7': 10, // dominant 7th
    'maj7': 11, 'M7': 11, // major 7th
};

/** Get interval in semitones. Handles compound intervals. */
function intervalSemitones(interval) {
    if (INTERVALS[interval] !== undefined) return INTERVALS[interval];
    // Try stripping to basic form
    return null;
}


// ═══════════════════════════════════════════════════════════════
// CHORD QUALITY DEFINITIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Each chord quality defines:
 * - essential: pitch class intervals that MUST be present (relative to root)
 * - optional: intervals that are acceptable/encouraged
 * - avoid: intervals that clash
 * - extensions: common extensions
 * - name: human-readable name
 */
const CHORD_QUALITIES = {
    // ── Major family ──
    'maj7': {
        name: 'Major 7th',
        essential: [4, 11],        // 3, maj7
        optional:  [7, 2, 6, 9],   // 5, 9, #11, 13
        avoid:     [5],             // natural 11 (avoid note on maj7)
        color:     [2, 6, 9],       // 9, #11, 13
    },
    'maj9': {
        name: 'Major 9th',
        essential: [4, 11, 2],     // 3, maj7, 9
        optional:  [7, 6, 9],
        avoid:     [5],
        color:     [6, 9],
    },
    'maj7#11': {
        name: 'Major 7th #11 (Lydian)',
        essential: [4, 11, 6],     // 3, maj7, #11
        optional:  [7, 2, 9],
        avoid:     [],
        color:     [2, 9],
    },
    '6': {
        name: 'Major 6th',
        essential: [4, 9],         // 3, 6
        optional:  [7, 2],
        avoid:     [5],
        color:     [2],
    },
    '69': {
        name: 'Major 6/9',
        essential: [4, 9, 2],     // 3, 6, 9
        optional:  [7],
        avoid:     [5],
        color:     [],
    },

    // ── Minor family ──
    'm7': {
        name: 'Minor 7th',
        essential: [3, 10],        // b3, b7
        optional:  [7, 2, 5, 9],   // 5, 9, 11, 13
        avoid:     [],
        color:     [2, 5, 9],
    },
    'm9': {
        name: 'Minor 9th',
        essential: [3, 10, 2],
        optional:  [7, 5, 9],
        avoid:     [],
        color:     [5, 9],
    },
    'm11': {
        name: 'Minor 11th',
        essential: [3, 10, 5],
        optional:  [7, 2, 9],
        avoid:     [],
        color:     [2, 9],
    },
    'm6': {
        name: 'Minor 6th',
        essential: [3, 9],
        optional:  [7, 2, 5],
        avoid:     [],
        color:     [2],
    },
    'mMaj7': {
        name: 'Minor Major 7th',
        essential: [3, 11],
        optional:  [7, 2, 5],
        avoid:     [],
        color:     [2, 5],
    },

    // ── Dominant family ──
    '7': {
        name: 'Dominant 7th',
        essential: [4, 10],        // 3, b7
        optional:  [7, 2, 9],      // 5, 9, 13
        avoid:     [],
        color:     [2, 9],
    },
    '9': {
        name: 'Dominant 9th',
        essential: [4, 10, 2],
        optional:  [7, 9],
        avoid:     [],
        color:     [9],
    },
    '13': {
        name: 'Dominant 13th',
        essential: [4, 10, 9],     // 3, b7, 13
        optional:  [7, 2],
        avoid:     [],
        color:     [2],
    },
    '7#11': {
        name: 'Dominant 7th #11 (Lydian Dominant)',
        essential: [4, 10, 6],
        optional:  [7, 2, 9],
        avoid:     [],
        color:     [2, 9],
    },
    '7b9': {
        name: 'Dominant 7th flat 9',
        essential: [4, 10, 1],     // 3, b7, b9
        optional:  [7, 9],
        avoid:     [],
        color:     [9],
    },
    '7#9': {
        name: 'Dominant 7th sharp 9',
        essential: [4, 10, 3],     // 3, b7, #9
        optional:  [7],
        avoid:     [],
        color:     [],
    },
    '7b13': {
        name: 'Dominant 7th flat 13',
        essential: [4, 10, 8],     // 3, b7, b13
        optional:  [7, 1],
        avoid:     [],
        color:     [1],
    },
    '13b9': {
        name: 'Dominant 13th flat 9',
        essential: [4, 10, 1, 9],  // 3, b7, b9, 13
        optional:  [7],
        avoid:     [],
        color:     [],
    },
    '7alt': {
        name: 'Altered Dominant',
        essential: [4, 10],        // 3, b7 required
        optional:  [1, 3, 6, 8],   // b9, #9, #11/b5, b13/#5
        avoid:     [7, 2, 5, 9],   // natural 5, 9, 11, 13 are avoided
        color:     [1, 3, 6, 8],
    },
    'sus4': {
        name: 'Suspended 4th',
        essential: [5, 10],        // 4, b7
        optional:  [7, 2, 9],
        avoid:     [4],            // natural 3 avoided
        color:     [2, 9],
    },
    'sus2': {
        name: 'Suspended 2nd',
        essential: [2, 10],
        optional:  [7, 9],
        avoid:     [4],
        color:     [9],
    },
    '7sus4': {
        name: 'Dominant 7th sus4',
        essential: [5, 10],
        optional:  [7, 2, 9],
        avoid:     [4],
        color:     [2, 9],
    },

    // ── Half-diminished ──
    'm7b5': {
        name: 'Half-diminished (m7b5)',
        essential: [3, 6, 10],     // b3, b5, b7
        optional:  [2, 5, 8],      // 9, 11, b13
        avoid:     [],
        color:     [2, 5, 8],
    },

    // ── Diminished ──
    'dim7': {
        name: 'Diminished 7th',
        essential: [3, 6, 9],      // b3, b5, bb7
        optional:  [2, 5, 8],
        avoid:     [],
        color:     [2, 5, 8],
    },

    // ── Augmented ──
    'aug': {
        name: 'Augmented',
        essential: [4, 8],         // 3, #5
        optional:  [11, 2, 9],
        avoid:     [],
        color:     [11, 2, 9],
    },
    'aug7': {
        name: 'Augmented 7th',
        essential: [4, 8, 10],
        optional:  [2, 9],
        avoid:     [],
        color:     [2, 9],
    },
};


// ═══════════════════════════════════════════════════════════════
// CHORD SYMBOL PARSER
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a jazz chord symbol into { root: pitchClass, quality: string, bass: pitchClass|null }
 * 
 * Examples:
 *   "Cmaj7"     → { root: 0, quality: 'maj7', bass: null, display: 'Cmaj7' }
 *   "Dm9"       → { root: 2, quality: 'm9', bass: null }
 *   "G7alt"     → { root: 7, quality: '7alt', bass: null }
 *   "Bb13#11"   → { root: 10, quality: '13#11', bass: null }  (mapped to 7#11 + 13)
 *   "F#m7b5"    → { root: 6, quality: 'm7b5', bass: null }
 *   "C/E"       → { root: 0, quality: 'maj7', bass: 4 }
 */
function parseChord(symbol) {
    if (!symbol || typeof symbol !== 'string') return null;
    
    let s = symbol.trim();
    
    // Handle slash bass note
    let bass = null;
    const slashIdx = s.lastIndexOf('/');
    if (slashIdx > 0) {
        const bassNote = s.substring(slashIdx + 1);
        if (NOTE_TO_PC[bassNote] !== undefined) {
            bass = NOTE_TO_PC[bassNote];
            s = s.substring(0, slashIdx);
        }
    }
    
    // Parse root note
    let root = null;
    let rootLen = 0;
    if (s.length >= 2 && (s[1] === '#' || s[1] === 'b') && NOTE_TO_PC[s.substring(0, 2)] !== undefined) {
        root = NOTE_TO_PC[s.substring(0, 2)];
        rootLen = 2;
    } else if (s.length >= 1 && NOTE_TO_PC[s[0]] !== undefined) {
        root = NOTE_TO_PC[s[0]];
        rootLen = 1;
    }
    if (root === null) return null;
    
    let qualStr = s.substring(rootLen);
    
    // Normalize quality string
    qualStr = qualStr
        .replace(/\u266D/g, 'b')   // ♭ → b
        .replace(/\u266F/g, '#')   // ♯ → #
        .replace(/\u0394/g, 'maj') // Δ → maj
        .replace(/^-/, 'm')        // - → m (minus = minor)
        .replace(/^min/, 'm')
        .replace(/^ma(?=j)/, 'maj')
        .replace(/^M(?=[79])/, 'maj')  // M9 → maj9
        .replace(/^M7/, 'maj7')
        .replace(/^M$/, 'maj7');       // CM → Cmaj7
    
    // Direct quality lookup
    if (CHORD_QUALITIES[qualStr]) {
        return { root, quality: qualStr, bass, display: symbol };
    }
    
    // Common aliases and compound forms
    const ALIASES = {
        '': 'maj7',          // bare letter = major (context-dependent, default to maj7)
        'maj': 'maj7',
        'M': 'maj7',
        'major7': 'maj7',
        'major9': 'maj9',
        'min7': 'm7',
        'min9': 'm9',
        'min11': 'm11',
        'minor7': 'm7',
        '-7': 'm7',
        '-9': 'm9',
        '-11': 'm11',
        'dom7': '7',
        'dom9': '9',
        'dom13': '13',
        'ø': 'm7b5',
        'ø7': 'm7b5',
        'o': 'dim7',
        'o7': 'dim7',
        'dim': 'dim7',
        '+': 'aug',
        '+7': 'aug7',
        'aug7': 'aug7',
        '7+': 'aug7',
        '7#5': 'aug7',
        '7b5': '7#11',       // enharmonic approximation
        '9sus4': '7sus4',
        '9sus': '7sus4',
        'sus': 'sus4',
        '7sus': '7sus4',
        '11': '7sus4',       // 11th chords often function as sus
        'add9': 'maj9',
        'maj13': 'maj7',     // approximate — add 13 to essential later
        '13#11': '7#11',     // map to closest, 13 added as color
        'maj7#11': 'maj7#11',
        '7b9b13': '7alt',
        '7#9#5': '7alt',
        '7#9b13': '7alt',
        '7b9#9': '7alt',
    };
    
    if (ALIASES[qualStr] !== undefined) {
        return { root, quality: ALIASES[qualStr], bass, display: symbol };
    }
    
    // Fallback: try to find closest match
    // Strip trailing extensions and try again
    for (const [alias, qual] of Object.entries(ALIASES)) {
        if (qualStr.startsWith(alias) && alias.length > 0) {
            return { root, quality: qual, bass, display: symbol };
        }
    }
    
    // Last resort: default to dominant 7 if has "7" in it, maj7 otherwise
    if (qualStr.includes('7')) {
        return { root, quality: '7', bass, display: symbol };
    }
    
    return { root, quality: 'maj7', bass, display: symbol };
}


// ═══════════════════════════════════════════════════════════════
// VOICING GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Generate voicings for a chord.
 * Returns array of { notes: [midiNumbers], label: string, description: string }
 * 
 * Voicings are generated in a practical range:
 * - Left hand: C3 (48) to C5 (72)  
 * - Two hand: C3 (48) to C6 (84)
 */

const LH_LOW = 48;   // C3
const LH_HIGH = 72;  // C5
const RH_HIGH = 84;  // C6

/** 
 * Build a voicing from intervals relative to root, placed in a specific octave range.
 * @param {number} rootPC - pitch class of root (0-11)
 * @param {number[]} intervals - semitones above root for each voice
 * @param {number} bassMidi - lowest note MIDI number
 */
function buildVoicing(rootPC, intervals, bassMidi) {
    const notes = intervals.map(interval => {
        let midi = bassMidi + ((rootPC + interval - bassMidi % 12 + 12) % 12);
        // Ensure note is at or above bassMidi
        while (midi < bassMidi) midi += 12;
        // Keep in reasonable range
        while (midi > bassMidi + 18) midi -= 12;  // roughly an octave and a half spread
        return midi;
    });
    // Sort low to high
    notes.sort((a, b) => a - b);
    // Ensure no duplicate pitches
    return [...new Set(notes)];
}

/**
 * Generate standard voicings for a parsed chord.
 */
function generateVoicings(chord) {
    if (!chord || !CHORD_QUALITIES[chord.quality]) return [];
    
    const q = CHORD_QUALITIES[chord.quality];
    const root = chord.root;
    const voicings = [];
    
    // ── Shell voicing (3-7) ──
    // Just 3rd and 7th (or 6th), optionally with root
    {
        const third = q.essential.find(i => i === 3 || i === 4);
        const seventh = q.essential.find(i => i === 10 || i === 11 || i === 9); // b7, maj7, or 6
        if (third !== undefined && seventh !== undefined) {
            // 3-7 form (3rd on bottom)
            const notes37 = buildVoicing(root, [third, seventh], LH_LOW + 4);
            voicings.push({
                notes: notes37,
                label: 'Shell (3→7)',
                type: 'shell',
                description: `3rd and 7th only — the essential guide tones. Minimal but defines the harmony.`
            });
            // 7-3 form (7th on bottom)
            const notes73 = buildVoicing(root, [seventh, third], LH_LOW);
            voicings.push({
                notes: notes73,
                label: 'Shell (7→3)',
                type: 'shell',
                description: `7th and 3rd — inverted shell. Smooth voice leading partner to 3→7.`
            });
        }
    }
    
    // ── Rootless A voicing ──
    // Typically: 3-5-7-9 or 3-7-9 arrangement
    {
        const intervals = [];
        const third = q.essential.find(i => i === 3 || i === 4 || i === 5); // b3, 3, or 4(sus)
        const seventh = q.essential.find(i => i === 10 || i === 11 || i === 9);
        const fifth = 7; // natural 5, unless b5 or #5
        const hasFlatFive = q.essential.includes(6);
        const hasSharpFive = q.essential.includes(8);
        const actualFifth = hasFlatFive ? 6 : hasSharpFive ? 8 : 7;
        const ninth = q.essential.includes(2) ? 2 : q.essential.includes(1) ? 1 : q.essential.includes(3) && q.essential.includes(4) ? 3 : 2;
        
        if (third !== undefined && seventh !== undefined) {
            // A form: 3-5-7-9 (3rd is lowest voice)
            intervals.push(third, actualFifth, seventh, ninth);
            const notes = buildVoicing(root, intervals, LH_LOW + 3);
            voicings.push({
                notes: notes,
                label: 'Rootless A',
                type: 'rootlessA',
                description: `3rd on bottom, with 5th, 7th, and 9th. Classic jazz piano left-hand voicing.`
            });
        }
    }
    
    // ── Rootless B voicing ──
    // Typically: 7-9-3-5 arrangement (7th on bottom)
    {
        const third = q.essential.find(i => i === 3 || i === 4 || i === 5);
        const seventh = q.essential.find(i => i === 10 || i === 11 || i === 9);
        const hasFlatFive = q.essential.includes(6);
        const hasSharpFive = q.essential.includes(8);
        const actualFifth = hasFlatFive ? 6 : hasSharpFive ? 8 : 7;
        const ninth = q.essential.includes(2) ? 2 : q.essential.includes(1) ? 1 : 2;
        
        if (third !== undefined && seventh !== undefined) {
            // B form: 7-9-3-5 (7th is lowest voice)
            const intervals = [seventh, ninth, third, actualFifth];
            const notes = buildVoicing(root, intervals, LH_LOW);
            voicings.push({
                notes: notes,
                label: 'Rootless B',
                type: 'rootlessB',
                description: `7th on bottom, with 9th, 3rd, and 5th. Pairs with A form for smooth voice leading.`
            });
        }
    }
    
    // ── Spread voicing (two-hand) ──
    {
        const third = q.essential.find(i => i === 3 || i === 4 || i === 5);
        const seventh = q.essential.find(i => i === 10 || i === 11 || i === 9);
        const hasFlatFive = q.essential.includes(6);
        const hasSharpFive = q.essential.includes(8);
        const actualFifth = hasFlatFive ? 6 : hasSharpFive ? 8 : 7;
        const ninth = 2;
        const colorTone = q.color.length > 0 ? q.color[0] : actualFifth;
        
        if (third !== undefined && seventh !== undefined) {
            // LH: root + 7th, RH: 3rd + 5th/color + 9th
            const lhNotes = buildVoicing(root, [0, seventh], LH_LOW);
            const rhIntervals = [third, colorTone, ninth];
            const rhNotes = buildVoicing(root, rhIntervals, 60); // middle C area
            voicings.push({
                notes: [...lhNotes, ...rhNotes].sort((a, b) => a - b),
                label: 'Spread (Two-Hand)',
                type: 'spread',
                description: `Root + 7th in left hand; 3rd, colour tone, and 9th in right hand. Rich, open sound.`
            });
        }
    }
    
    // ── Upper Structure / Colorful ──
    if (q.color.length > 0) {
        const third = q.essential.find(i => i === 3 || i === 4 || i === 5);
        const seventh = q.essential.find(i => i === 10 || i === 11 || i === 9);
        if (third !== undefined && seventh !== undefined) {
            const intervals = [third, seventh, ...q.color.slice(0, 2)];
            const notes = buildVoicing(root, intervals, LH_LOW + 5);
            voicings.push({
                notes: notes,
                label: 'Colourful',
                type: 'colorful',
                description: `Guide tones plus upper extensions for a rich, modern colour.`
            });
        }
    }
    
    return voicings;
}


// ═══════════════════════════════════════════════════════════════
// CHORD GRADING ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * Grade played notes against a chord.
 * 
 * @param {number[]} playedMidi - array of MIDI note numbers played
 * @param {object} chord - parsed chord { root, quality, bass }
 * @param {object} options - grading options
 * @returns {object} { score, feedback[], details }
 * 
 * Grading philosophy:
 * - Essential tones (3rd, 7th) are required
 * - Root may be omitted in rootless voicings
 * - 5th may be omitted generally
 * - Colour tones (9, 11, 13) are welcome if not avoid notes
 * - Avoid notes are flagged
 * - Grade by FUNCTION (pitch class), not exact octave placement
 */
function gradeVoicing(playedMidi, chord, options = {}) {
    const {
        require3rd = true,
        require7th = true,
        allowOmittedRoot = true,
        allowOmitted5th = true,
        allowTensions = true,
        strictMode = false,
    } = options;
    
    if (!chord || !CHORD_QUALITIES[chord.quality]) {
        return { score: 0, grade: '?', feedback: ['Unknown chord quality'], details: {} };
    }
    
    const q = CHORD_QUALITIES[chord.quality];
    const rootPC = chord.root;
    
    // Get pitch classes of played notes (relative to root)
    const playedPCs = [...new Set(playedMidi.map(m => ((m % 12) - rootPC + 12) % 12))];
    
    const feedback = [];
    let score = 100;
    const details = {
        hasRoot: playedPCs.includes(0),
        has3rd: false,
        has7th: false,
        essentialPresent: [],
        essentialMissing: [],
        colorPresent: [],
        avoidPresent: [],
        unknownNotes: [],
    };
    
    // Check essential tones
    for (const interval of q.essential) {
        if (playedPCs.includes(interval)) {
            details.essentialPresent.push(interval);
            // Identify 3rd and 7th
            if (interval === 3 || interval === 4 || interval === 5) details.has3rd = true;
            if (interval === 10 || interval === 11 || interval === 9) details.has7th = true;
        } else {
            details.essentialMissing.push(interval);
        }
    }
    
    // Score essential tones
    if (!details.has3rd && require3rd) {
        const isMinor = q.essential.includes(3);
        const isSus = q.essential.includes(5);
        if (isSus) {
            feedback.push('⚠️ Missing 4th (sus)');
        } else {
            feedback.push('⚠️ Missing 3rd — defines major/minor quality');
        }
        score -= 30;
    }
    
    if (!details.has7th && require7th) {
        feedback.push('⚠️ Missing 7th — defines chord colour');
        score -= 25;
    }
    
    // Other missing essentials (b5 in m7b5, specific extensions)
    for (const missing of details.essentialMissing) {
        if ((missing === 3 || missing === 4 || missing === 5) && !require3rd) continue;
        if ((missing === 10 || missing === 11 || missing === 9) && !require7th) continue;
        // Named extensions like b9 in 7b9
        if (missing === 1) feedback.push('ℹ️ Missing ♭9');
        else if (missing === 6 && q === CHORD_QUALITIES['m7b5']) feedback.push('ℹ️ Missing ♭5');
        else if (missing === 8 && q === CHORD_QUALITIES['aug']) feedback.push('ℹ️ Missing #5');
    }
    
    // Check for avoid notes
    for (const pc of playedPCs) {
        if (q.avoid.includes(pc)) {
            details.avoidPresent.push(pc);
            feedback.push(`❌ Contains avoid note (${describeInterval(pc)})`);
            score -= 20;
        }
    }
    
    // Check for colour tones
    for (const pc of playedPCs) {
        if (q.color.includes(pc)) {
            details.colorPresent.push(pc);
        }
    }
    
    // Check for unknown notes (not root, not essential, not optional, not color)
    const allAcceptable = new Set([0, ...q.essential, ...q.optional, ...q.color]);
    for (const pc of playedPCs) {
        if (!allAcceptable.has(pc) && !q.avoid.includes(pc)) {
            details.unknownNotes.push(pc);
            // Only penalize if strict
            if (strictMode) {
                feedback.push(`⚠️ Unexpected note: ${pcName((pc + rootPC) % 12)}`);
                score -= 10;
            }
        }
    }
    
    // Root handling
    if (details.hasRoot && allowOmittedRoot) {
        // Having root is fine but not required
    } else if (!details.hasRoot && !allowOmittedRoot) {
        feedback.push('ℹ️ Root is missing');
        score -= 10;
    }
    
    // Bonus for colour tones
    if (details.colorPresent.length > 0 && allowTensions) {
        feedback.push(`✨ Nice colour: ${details.colorPresent.map(i => describeInterval(i)).join(', ')}`);
        score = Math.min(100, score + 5 * details.colorPresent.length);
    }
    
    // Check voicing spread (clustering)
    if (playedMidi.length >= 3) {
        const sorted = [...playedMidi].sort((a, b) => a - b);
        const span = sorted[sorted.length - 1] - sorted[0];
        if (span < 4 && playedMidi.length >= 3) {
            feedback.push('⚠️ Very clustered — try spreading the voicing');
            score -= 10;
        }
        // Check for muddy low voicing
        if (sorted[0] < 48 && sorted.filter(n => n < 55).length >= 3) {
            feedback.push('⚠️ Muddy — too many notes in the low register');
            score -= 10;
        }
    }
    
    // Determine grade
    score = Math.max(0, Math.min(100, score));
    let grade;
    if (score >= 90) grade = 'Excellent';
    else if (score >= 75) grade = 'Good';
    else if (score >= 60) grade = 'Acceptable';
    else if (score >= 40) grade = 'Needs Work';
    else grade = 'Try Again';
    
    if (score >= 90 && feedback.length === 0) {
        feedback.push('✅ Great voicing!');
    } else if (score >= 75 && feedback.filter(f => !f.startsWith('✨')).length === 0) {
        feedback.push('✅ Solid voicing');
    }
    
    return { score, grade, feedback, details };
}

/** Describe an interval (pitch class relative to root) in human terms */
function describeInterval(pc) {
    const names = {
        0: 'Root', 1: '♭9', 2: '9', 3: '♭3/#9', 4: '3',
        5: '4/11', 6: '♭5/#11', 7: '5', 8: '♭13/#5',
        9: '6/13', 10: '♭7', 11: 'maj7'
    };
    return names[pc] || `?${pc}`;
}


// ═══════════════════════════════════════════════════════════════
// VOICE LEADING SCORING
// ═══════════════════════════════════════════════════════════════

/**
 * Score voice leading between two voicings.
 * Lower total semitone movement = smoother voice leading.
 * 
 * @param {number[]} prev - MIDI notes of previous voicing
 * @param {number[]} curr - MIDI notes of current voicing
 * @returns {object} { totalMovement, maxMovement, smooth, feedback }
 */
function scoreVoiceLeading(prev, curr) {
    if (!prev || !curr || prev.length === 0 || curr.length === 0) {
        return { totalMovement: 0, maxMovement: 0, smooth: true, feedback: 'First chord — no voice leading to score' };
    }
    
    // Match voices by proximity (greedy nearest-neighbor)
    const prevSorted = [...prev].sort((a, b) => a - b);
    const currSorted = [...curr].sort((a, b) => a - b);
    
    let totalMovement = 0;
    let maxMovement = 0;
    
    // Simple: pair by position (bass-to-bass, top-to-top)
    const minLen = Math.min(prevSorted.length, currSorted.length);
    for (let i = 0; i < minLen; i++) {
        const movement = Math.abs(prevSorted[i] - currSorted[i]);
        totalMovement += movement;
        maxMovement = Math.max(maxMovement, movement);
    }
    
    const smooth = totalMovement <= 6 && maxMovement <= 4;
    let feedback;
    if (totalMovement === 0) feedback = '🎯 Perfect — common tones held';
    else if (totalMovement <= 4) feedback = '✨ Excellent voice leading — minimal movement';
    else if (totalMovement <= 8) feedback = '✅ Smooth voice leading';
    else if (totalMovement <= 14) feedback = '⚠️ Some leaps — could be smoother';
    else feedback = '❌ Large jumps — try to minimise hand movement';
    
    return { totalMovement, maxMovement, smooth, feedback };
}


// ═══════════════════════════════════════════════════════════════
// PROGRESSION GENERATOR
// ═══════════════════════════════════════════════════════════════

/** Generate a ii-V-I progression in a given key */
function iiVI(keyPC, minor = false) {
    if (minor) {
        return [
            { root: (keyPC + 2) % 12, quality: 'm7b5', display: `${pcName((keyPC+2)%12)}m7♭5` },
            { root: (keyPC + 7) % 12, quality: '7b9',  display: `${pcName((keyPC+7)%12)}7♭9` },
            { root: keyPC,            quality: 'm7',    display: `${pcName(keyPC)}m7` },
        ];
    }
    return [
        { root: (keyPC + 2) % 12, quality: 'm7',   display: `${pcName((keyPC+2)%12)}m7` },
        { root: (keyPC + 7) % 12, quality: '7',    display: `${pcName((keyPC+7)%12)}7` },
        { root: keyPC,            quality: 'maj7',  display: `${pcName(keyPC)}maj7` },
    ];
}

/** Generate a I-vi-ii-V turnaround */
function turnaround(keyPC) {
    return [
        { root: keyPC,            quality: 'maj7', display: `${pcName(keyPC)}maj7` },
        { root: (keyPC + 9) % 12, quality: 'm7',   display: `${pcName((keyPC+9)%12)}m7` },
        { root: (keyPC + 2) % 12, quality: 'm7',   display: `${pcName((keyPC+2)%12)}m7` },
        { root: (keyPC + 7) % 12, quality: '7',    display: `${pcName((keyPC+7)%12)}7` },
    ];
}

/** Generate a 12-bar blues in a key */
function blues(keyPC) {
    const I = { root: keyPC, quality: '7', display: `${pcName(keyPC)}7` };
    const IV = { root: (keyPC + 5) % 12, quality: '7', display: `${pcName((keyPC+5)%12)}7` };
    const V = { root: (keyPC + 7) % 12, quality: '7', display: `${pcName((keyPC+7)%12)}7` };
    return [I, I, I, I, IV, IV, I, I, V, IV, I, V];
}

/** Get all 12 keys */
function allKeys() {
    return [0,1,2,3,4,5,6,7,8,9,10,11];
}

/** Random key pitch class */
function randomKey() {
    return Math.floor(Math.random() * 12);
}

/** Random chord quality from the defined set */
function randomChordQuality() {
    const qualities = Object.keys(CHORD_QUALITIES);
    return qualities[Math.floor(Math.random() * qualities.length)];
}

/** Generate a random chord */
function randomChord() {
    const root = randomKey();
    const quality = randomChordQuality();
    return { root, quality, bass: null, display: `${pcName(root)}${quality}` };
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS (global for non-module usage)
// ═══════════════════════════════════════════════════════════════

window.Music = {
    // Constants
    NOTE_NAMES_SHARP, NOTE_NAMES_FLAT, NOTE_TO_PC, CHORD_QUALITIES,
    // Note utilities
    midiToNoteName, midiToPC, noteNameToPC, pcName,
    // Chord parsing
    parseChord,
    // Voicing generation
    generateVoicings, buildVoicing,
    // Grading
    gradeVoicing, scoreVoiceLeading, describeInterval,
    // Progressions
    iiVI, turnaround, blues, allKeys, randomKey, randomChord, randomChordQuality,
};
