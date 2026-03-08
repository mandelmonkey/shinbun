/**
 * ui.js — Piano keyboard renderer + UI components
 */

const PianoUI = (() => {
    const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
    const BLACK_KEYS = [1, 3, 6, 8, 10];        // C# D# F# G# A#
    const BLACK_KEY_OFFSETS = { 1: 0.6, 3: 1.6, 6: 3.6, 8: 4.6, 10: 5.6 }; // position relative to octave start
    
    let container = null;
    let startNote = 48;  // C3
    let endNote = 84;    // C6
    let highlightedNotes = new Set();
    let activeNotes = new Set();
    let suggestedNotes = new Set();
    let lhNotes = new Set();   // left hand notes (blue)
    let rhNotes = new Set();   // right hand notes (gold)
    let keyElements = {};

    function init(containerId, low = 48, high = 84) {
        container = document.getElementById(containerId);
        if (!container) return;
        startNote = low;
        endNote = high;
        render();
    }

    function render() {
        if (!container) return;
        container.innerHTML = '';
        container.className = 'piano-keyboard';
        keyElements = {};

        const whiteKeyWidth = 100 / countWhiteKeys();
        let whiteIndex = 0;

        // Create white keys first, then black keys on top
        const whiteContainer = document.createElement('div');
        whiteContainer.className = 'piano-whites';
        const blackContainer = document.createElement('div');
        blackContainer.className = 'piano-blacks';

        for (let midi = startNote; midi <= endNote; midi++) {
            const pc = midi % 12;
            const isBlack = BLACK_KEYS.includes(pc);

            const key = document.createElement('div');
            key.dataset.midi = midi;
            key.dataset.note = Music.midiToNoteName(midi, true);

            if (isBlack) {
                key.className = 'piano-key black';
                // Position relative to the white keys
                const octaveStart = Math.floor(midi / 12) * 12;
                const whitesBefore = countWhiteKeysInRange(startNote, octaveStart - 1);
                const offset = BLACK_KEY_OFFSETS[pc];
                const left = (whitesBefore + offset) * whiteKeyWidth;
                key.style.left = `${left}%`;
                key.style.width = `${whiteKeyWidth * 0.65}%`;
                blackContainer.appendChild(key);
            } else {
                key.className = 'piano-key white';
                key.style.left = `${whiteIndex * whiteKeyWidth}%`;
                key.style.width = `${whiteKeyWidth}%`;
                whiteContainer.appendChild(key);
                whiteIndex++;
            }

            // Mouse/touch interaction
            key.addEventListener('mousedown', (e) => {
                e.preventDefault();
                MIDIHandler.noteOnFromUI(midi);
            });
            key.addEventListener('mouseup', () => MIDIHandler.noteOffFromUI(midi));
            key.addEventListener('mouseleave', () => MIDIHandler.noteOffFromUI(midi));
            key.addEventListener('touchstart', (e) => {
                e.preventDefault();
                MIDIHandler.noteOnFromUI(midi);
            }, { passive: false });
            key.addEventListener('touchend', () => MIDIHandler.noteOffFromUI(midi));

            keyElements[midi] = key;
        }

        container.appendChild(whiteContainer);
        container.appendChild(blackContainer);
        
        updateDisplay();
    }

    function countWhiteKeys() {
        let count = 0;
        for (let m = startNote; m <= endNote; m++) {
            if (WHITE_KEYS.includes(m % 12)) count++;
        }
        return count;
    }

    function countWhiteKeysInRange(low, high) {
        let count = 0;
        for (let m = low; m <= high; m++) {
            if (WHITE_KEYS.includes(m % 12)) count++;
        }
        return count;
    }

    function updateDisplay() {
        for (const [midi, el] of Object.entries(keyElements)) {
            const m = parseInt(midi);
            const isBlack = BLACK_KEYS.includes(m % 12);
            let classes = `piano-key ${isBlack ? 'black' : 'white'}`;
            
            if (activeNotes.has(m)) classes += ' active';
            if (highlightedNotes.has(m)) classes += ' highlighted';
            if (lhNotes.has(m)) classes += ' lh-note';
            if (rhNotes.has(m)) classes += ' rh-note';
            if (suggestedNotes.has(m) && !lhNotes.has(m) && !rhNotes.has(m)) classes += ' suggested';
            
            el.className = classes;
            
            // Note label
            const existingLabel = el.querySelector('.key-label');
            if (existingLabel) existingLabel.remove();
            
            const showLabel = activeNotes.has(m) || highlightedNotes.has(m) || suggestedNotes.has(m) || lhNotes.has(m) || rhNotes.has(m);
            if (showLabel) {
                const label = document.createElement('span');
                label.className = 'key-label';
                // Show hand indicator for two-hand voicings
                if (lhNotes.has(m)) {
                    label.textContent = 'L';
                    label.className = 'key-label lh-label';
                } else if (rhNotes.has(m)) {
                    label.textContent = 'R';
                    label.className = 'key-label rh-label';
                } else {
                    label.textContent = Music.pcName(m % 12);
                }
                el.appendChild(label);
            }
        }
    }

    function setActiveNotes(notes) {
        activeNotes = new Set(notes);
        updateDisplay();
    }

    function setHighlightedNotes(notes) {
        highlightedNotes = new Set(notes);
        updateDisplay();
    }

    function setSuggestedNotes(notes) {
        suggestedNotes = new Set(notes);
        updateDisplay();
    }

    /** Show two-hand voicing with LH (blue) and RH (gold) colours */
    function setTwoHandNotes(lh, rh) {
        lhNotes = new Set(lh || []);
        rhNotes = new Set(rh || []);
        // Also set as suggested so they show on black keys too
        suggestedNotes = new Set([...(lh || []), ...(rh || [])]);
        updateDisplay();
    }

    function clearAll() {
        activeNotes.clear();
        highlightedNotes.clear();
        suggestedNotes.clear();
        lhNotes.clear();
        rhNotes.clear();
        updateDisplay();
    }

    return {
        init, render, setActiveNotes, setHighlightedNotes, setSuggestedNotes,
        setTwoHandNotes, clearAll, updateDisplay,
    };
})();

window.PianoUI = PianoUI;
