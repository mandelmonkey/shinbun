/**
 * audio.js — Web Audio API for metronome, chord playback, ear training
 * 
 * Uses oscillators + envelopes for piano-like tones (no samples needed).
 * AudioContext scheduling for accurate metronome timing.
 */

const AudioEngine = (() => {
    let ctx = null;
    let metronomeInterval = null;
    let metronomePlaying = false;
    let bpm = 120;
    let beatCallback = null;
    let currentBeat = 0;
    let beatsPerBar = 4;
    let nextBeatTime = 0;
    let timerID = null;
    const SCHEDULE_AHEAD = 0.1;  // seconds to look ahead
    const TIMER_INTERVAL = 25;   // ms between scheduler calls

    function getContext() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    // ── Piano-like Tone ──
    
    /**
     * Play a piano-like tone at a given MIDI note number.
     * Uses additive synthesis with a fast attack and medium decay.
     */
    function playNote(midiNote, duration = 1.5, velocity = 0.3, startTime = null) {
        const c = getContext();
        const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
        const t = startTime || c.currentTime;
        
        // Fundamental + harmonics for piano-like timbre
        const harmonics = [
            { ratio: 1, gain: 1.0 },
            { ratio: 2, gain: 0.5 },
            { ratio: 3, gain: 0.2 },
            { ratio: 4, gain: 0.1 },
            { ratio: 5, gain: 0.05 },
        ];
        
        const masterGain = c.createGain();
        masterGain.gain.setValueAtTime(0, t);
        masterGain.gain.linearRampToValueAtTime(velocity, t + 0.01);
        masterGain.gain.exponentialRampToValueAtTime(velocity * 0.5, t + 0.15);
        masterGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        masterGain.connect(c.destination);
        
        for (const h of harmonics) {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * h.ratio, t);
            gain.gain.setValueAtTime(h.gain, t);
            // Higher harmonics decay faster
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration * (1 / h.ratio));
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(t);
            osc.stop(t + duration + 0.1);
        }
    }

    /**
     * Play a chord (array of MIDI notes) simultaneously.
     */
    function playChord(midiNotes, duration = 2.0, velocity = 0.2) {
        const c = getContext();
        const t = c.currentTime;
        // Slight stagger for more natural feel
        midiNotes.forEach((note, i) => {
            playNote(note, duration, velocity, t + i * 0.015);
        });
    }

    // ── Metronome ──
    
    function _scheduleBeat() {
        const c = getContext();
        const secondsPerBeat = 60.0 / bpm;
        
        while (nextBeatTime < c.currentTime + SCHEDULE_AHEAD) {
            const isDownbeat = (currentBeat % beatsPerBar) === 0;
            _playClick(nextBeatTime, isDownbeat);
            
            if (beatCallback) {
                // Schedule callback close to beat time
                const delay = Math.max(0, (nextBeatTime - c.currentTime) * 1000);
                const beat = currentBeat;
                setTimeout(() => beatCallback(beat, isDownbeat), delay);
            }
            
            nextBeatTime += secondsPerBeat;
            currentBeat++;
        }
    }

    function _playClick(time, isDownbeat) {
        const c = getContext();
        const osc = c.createOscillator();
        const gain = c.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, time);
        
        gain.gain.setValueAtTime(isDownbeat ? 0.3 : 0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(time);
        osc.stop(time + 0.06);
    }

    function startMetronome(tempo = 120, beats = 4) {
        stopMetronome();
        bpm = tempo;
        beatsPerBar = beats;
        currentBeat = 0;
        const c = getContext();
        nextBeatTime = c.currentTime + 0.05;
        metronomePlaying = true;
        timerID = setInterval(_scheduleBeat, TIMER_INTERVAL);
    }

    function stopMetronome() {
        metronomePlaying = false;
        if (timerID) {
            clearInterval(timerID);
            timerID = null;
        }
        currentBeat = 0;
    }

    function setTempo(newBpm) {
        bpm = Math.max(40, Math.min(300, newBpm));
    }

    function isMetronomePlaying() {
        return metronomePlaying;
    }

    // ── Bass Root Pulse ──
    function playBassNote(midiNote, duration = 0.8) {
        const c = getContext();
        const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
        const t = c.currentTime;
        
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(t);
        osc.stop(t + duration + 0.1);
    }

    return {
        getContext,
        playNote,
        playChord,
        playBassNote,
        startMetronome,
        stopMetronome,
        setTempo,
        isMetronomePlaying,
        get bpm() { return bpm; },
        set onBeat(fn) { beatCallback = fn; },
    };
})();

window.AudioEngine = AudioEngine;
