/**
 * stats.js — Practice Statistics with localStorage persistence
 */

const Stats = (() => {
    const STORAGE_KEY = 'jazz-voicing-stats';
    
    let data = {
        totalAttempts: 0,
        totalCorrect: 0,      // score >= 75
        totalExcellent: 0,    // score >= 90
        byQuality: {},        // { 'maj7': { attempts, correct, totalScore } }
        byKey: {},             // { 0: { attempts, correct }, ... }  (pitch class)
        sessions: [],          // [{ date, attempts, avgScore, duration }]
        recentScores: [],      // last 50 scores for trend
        settings: {
            require3rd: true,
            require7th: true,
            allowOmittedRoot: true,
            allowOmitted5th: true,
            allowTensions: true,
            strictMode: false,
            leftHandOnly: true,
            bpm: 120,
        },
        customCharts: [],      // user-defined chord charts
    };

    function load() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                data = { ...data, ...parsed };
            }
        } catch (e) {
            console.warn('Failed to load stats:', e);
        }
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save stats:', e);
        }
    }

    function recordAttempt(chord, score, responseTimeMs) {
        data.totalAttempts++;
        if (score >= 75) data.totalCorrect++;
        if (score >= 90) data.totalExcellent++;

        // By quality
        const q = chord.quality;
        if (!data.byQuality[q]) data.byQuality[q] = { attempts: 0, correct: 0, totalScore: 0 };
        data.byQuality[q].attempts++;
        if (score >= 75) data.byQuality[q].correct++;
        data.byQuality[q].totalScore += score;

        // By key
        const k = chord.root;
        if (!data.byKey[k]) data.byKey[k] = { attempts: 0, correct: 0, totalScore: 0 };
        data.byKey[k].attempts++;
        if (score >= 75) data.byKey[k].correct++;
        data.byKey[k].totalScore += score;

        // Recent scores
        data.recentScores.push({ score, quality: q, key: k, time: Date.now(), responseMs: responseTimeMs });
        if (data.recentScores.length > 100) data.recentScores = data.recentScores.slice(-100);

        save();
    }

    function getAccuracy() {
        if (data.totalAttempts === 0) return 0;
        return Math.round((data.totalCorrect / data.totalAttempts) * 100);
    }

    function getWeakestQualities(n = 5) {
        const entries = Object.entries(data.byQuality)
            .filter(([, v]) => v.attempts >= 3)
            .map(([q, v]) => ({ quality: q, accuracy: Math.round((v.correct / v.attempts) * 100), attempts: v.attempts }))
            .sort((a, b) => a.accuracy - b.accuracy);
        return entries.slice(0, n);
    }

    function getWeakestKeys(n = 5) {
        const entries = Object.entries(data.byKey)
            .filter(([, v]) => v.attempts >= 3)
            .map(([k, v]) => ({ key: parseInt(k), accuracy: Math.round((v.correct / v.attempts) * 100), attempts: v.attempts }))
            .sort((a, b) => a.accuracy - b.accuracy);
        return entries.slice(0, n);
    }

    function getRecentTrend(n = 20) {
        const recent = data.recentScores.slice(-n);
        if (recent.length === 0) return { avg: 0, trend: 'none', scores: [] };
        const avg = Math.round(recent.reduce((s, r) => s + r.score, 0) / recent.length);
        const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
        const secondHalf = recent.slice(Math.floor(recent.length / 2));
        const avgFirst = firstHalf.length > 0 ? firstHalf.reduce((s, r) => s + r.score, 0) / firstHalf.length : 0;
        const avgSecond = secondHalf.length > 0 ? secondHalf.reduce((s, r) => s + r.score, 0) / secondHalf.length : 0;
        const trend = avgSecond > avgFirst + 3 ? 'improving' : avgSecond < avgFirst - 3 ? 'declining' : 'stable';
        return { avg, trend, scores: recent.map(r => r.score) };
    }

    function getAverageResponseTime() {
        const withTime = data.recentScores.filter(r => r.responseMs);
        if (withTime.length === 0) return 0;
        return Math.round(withTime.reduce((s, r) => s + r.responseMs, 0) / withTime.length);
    }

    function getSettings() { return { ...data.settings }; }
    
    function updateSettings(newSettings) {
        data.settings = { ...data.settings, ...newSettings };
        save();
    }

    function getCustomCharts() { return [...data.customCharts]; }
    
    function saveCustomChart(chart) {
        // chart = { name, chords: ['Dm7', 'G7', 'Cmaj7', ...], beatsPerChord }
        const existing = data.customCharts.findIndex(c => c.name === chart.name);
        if (existing >= 0) data.customCharts[existing] = chart;
        else data.customCharts.push(chart);
        save();
    }

    function deleteCustomChart(name) {
        data.customCharts = data.customCharts.filter(c => c.name !== name);
        save();
    }

    function resetAll() {
        const settings = data.settings;
        const charts = data.customCharts;
        data = {
            totalAttempts: 0, totalCorrect: 0, totalExcellent: 0,
            byQuality: {}, byKey: {}, sessions: [], recentScores: [],
            settings, customCharts: charts,
        };
        save();
    }

    function getSummary() {
        return {
            totalAttempts: data.totalAttempts,
            totalCorrect: data.totalCorrect,
            totalExcellent: data.totalExcellent,
            accuracy: getAccuracy(),
            weakQualities: getWeakestQualities(),
            weakKeys: getWeakestKeys(),
            trend: getRecentTrend(),
            avgResponseMs: getAverageResponseTime(),
        };
    }

    // Init
    load();

    return {
        recordAttempt, getAccuracy, getWeakestQualities, getWeakestKeys,
        getRecentTrend, getAverageResponseTime, getSettings, updateSettings,
        getCustomCharts, saveCustomChart, deleteCustomChart,
        resetAll, getSummary, save, load,
    };
})();

window.Stats = Stats;
