/**
 * midi.js — Web MIDI + Fallback Input Handler
 * 
 * Handles:
 * - Web MIDI API device connection/disconnection
 * - Note on/off tracking
 * - Computer keyboard fallback (Z-row = C3, etc.)
 * - On-screen piano click input
 * - Callback system for note events
 */

const MIDIHandler = (() => {
    let midiAccess = null;
    let activeNotes = new Set();     // Currently held MIDI note numbers
    let connectedDevices = [];
    let onNoteOn = null;             // callback(midiNote, velocity)
    let onNoteOff = null;            // callback(midiNote)
    let onNotesChanged = null;       // callback(activeNotesSet)
    let onConnectionChange = null;   // callback(status, devices)
    let status = 'disconnected';     // 'disconnected' | 'connected' | 'unsupported'

    // ── Computer keyboard mapping ──
    // Bottom row: Z=C3, S=C#3, X=D3, D=D#3, C=E3, V=F3, G=F#3, B=G3, H=G#3, N=A3, J=A#3, M=B3
    // Top row: Q=C4, 2=C#4, W=D4, 3=D#4, E=E4, R=F4, 5=F#4, T=G4, 6=G#4, Y=A4, 7=A#4, U=B4
    const KEY_MAP = {
        // Lower octave (C3 = MIDI 48)
        'z': 48, 's': 49, 'x': 50, 'd': 51, 'c': 52, 'v': 53,
        'g': 54, 'b': 55, 'h': 56, 'n': 57, 'j': 58, 'm': 59,
        // Upper octave (C4 = MIDI 60)
        'q': 60, '2': 61, 'w': 62, '3': 63, 'e': 64, 'r': 65,
        '5': 66, 't': 67, '6': 68, 'y': 69, '7': 70, 'u': 71,
        // Extended (C5 = MIDI 72)
        'i': 72, '9': 73, 'o': 74, '0': 75, 'p': 76,
    };
    const keyboardHeld = new Set();

    // ── Web MIDI Setup ──
    async function init() {
        if (!navigator.requestMIDIAccess) {
            status = 'unsupported';
            _fireConnectionChange();
            console.warn('Web MIDI not supported in this browser');
            return false;
        }

        try {
            midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            midiAccess.onstatechange = _handleStateChange;
            _connectInputs();
            return true;
        } catch (err) {
            status = 'unsupported';
            _fireConnectionChange();
            console.error('MIDI access denied:', err);
            return false;
        }
    }

    function _connectInputs() {
        connectedDevices = [];
        if (!midiAccess) return;

        for (const input of midiAccess.inputs.values()) {
            input.onmidimessage = _handleMIDIMessage;
            connectedDevices.push({
                id: input.id,
                name: input.name,
                manufacturer: input.manufacturer
            });
        }

        status = connectedDevices.length > 0 ? 'connected' : 'disconnected';
        _fireConnectionChange();
    }

    function _handleStateChange(e) {
        _connectInputs();
    }

    function _handleMIDIMessage(msg) {
        const [status, note, velocity] = msg.data;
        const command = status & 0xf0;

        if (command === 0x90 && velocity > 0) {
            // Note On
            activeNotes.add(note);
            if (onNoteOn) onNoteOn(note, velocity);
            if (onNotesChanged) onNotesChanged(new Set(activeNotes));
        } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
            // Note Off
            activeNotes.delete(note);
            if (onNoteOff) onNoteOff(note);
            if (onNotesChanged) onNotesChanged(new Set(activeNotes));
        }
    }

    // ── Keyboard Input ──
    function _handleKeyDown(e) {
        if (e.repeat) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        const note = KEY_MAP[e.key.toLowerCase()];
        if (note !== undefined && !keyboardHeld.has(e.key.toLowerCase())) {
            e.preventDefault();
            keyboardHeld.add(e.key.toLowerCase());
            activeNotes.add(note);
            if (onNoteOn) onNoteOn(note, 80);
            if (onNotesChanged) onNotesChanged(new Set(activeNotes));
        }
    }

    function _handleKeyUp(e) {
        const note = KEY_MAP[e.key.toLowerCase()];
        if (note !== undefined) {
            keyboardHeld.delete(e.key.toLowerCase());
            activeNotes.delete(note);
            if (onNoteOff) onNoteOff(note);
            if (onNotesChanged) onNotesChanged(new Set(activeNotes));
        }
    }

    function enableKeyboard() {
        document.addEventListener('keydown', _handleKeyDown);
        document.addEventListener('keyup', _handleKeyUp);
    }

    function disableKeyboard() {
        document.removeEventListener('keydown', _handleKeyDown);
        document.removeEventListener('keyup', _handleKeyUp);
    }

    // ── On-screen piano click ──
    function noteOnFromUI(midiNote) {
        activeNotes.add(midiNote);
        if (onNoteOn) onNoteOn(midiNote, 80);
        if (onNotesChanged) onNotesChanged(new Set(activeNotes));
    }

    function noteOffFromUI(midiNote) {
        activeNotes.delete(midiNote);
        if (onNoteOff) onNoteOff(midiNote);
        if (onNotesChanged) onNotesChanged(new Set(activeNotes));
    }

    // ── Helpers ──
    function clearNotes() {
        activeNotes.clear();
        if (onNotesChanged) onNotesChanged(new Set(activeNotes));
    }

    function getActiveNotes() {
        return new Set(activeNotes);
    }

    function getActiveNotesArray() {
        return [...activeNotes].sort((a, b) => a - b);
    }

    function getStatus() {
        return { status, devices: connectedDevices };
    }

    function _fireConnectionChange() {
        if (onConnectionChange) onConnectionChange(status, connectedDevices);
    }

    // ── Public API ──
    return {
        init,
        enableKeyboard,
        disableKeyboard,
        noteOnFromUI,
        noteOffFromUI,
        clearNotes,
        getActiveNotes,
        getActiveNotesArray,
        getStatus,
        // Event setters
        set onNoteOn(fn) { onNoteOn = fn; },
        set onNoteOff(fn) { onNoteOff = fn; },
        set onNotesChanged(fn) { onNotesChanged = fn; },
        set onConnectionChange(fn) { onConnectionChange = fn; },
    };
})();

window.MIDIHandler = MIDIHandler;
