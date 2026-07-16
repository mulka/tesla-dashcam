/**
 * Shared, side-effect-free helpers for the multi-camera clip editor.
 * The CommonJS export keeps these helpers testable without a browser.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ClipEditorCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const CAMERA_PATTERNS = [
        { key: 'left-pillar', label: 'Left Pillar', pattern: /(?:^|[-_\s])left[-_\s]?pillar(?:[-_\s.]|$)/i },
        { key: 'right-pillar', label: 'Right Pillar', pattern: /(?:^|[-_\s])right[-_\s]?pillar(?:[-_\s.]|$)/i },
        { key: 'left-repeater', label: 'Left Repeater', pattern: /(?:^|[-_\s])left[-_\s]?repeater(?:[-_\s.]|$)/i },
        { key: 'right-repeater', label: 'Right Repeater', pattern: /(?:^|[-_\s])right[-_\s]?repeater(?:[-_\s.]|$)/i },
        { key: 'rear', label: 'Rear', pattern: /(?:^|[-_\s])(?:rear|back)(?:[-_\s.]|$)/i },
        { key: 'front', label: 'Front', pattern: /(?:^|[-_\s])front(?:[-_\s.]|$)/i },
        { key: 'cabin', label: 'Cabin', pattern: /(?:^|[-_\s])(?:cabin|interior)(?:[-_\s.]|$)/i }
    ];

    const TESLA_TIMESTAMP_RE = /(\d{4})-(\d{2})-(\d{2})[-_](\d{2})-(\d{2})-(\d{2})/;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function parseTeslaTimestamp(filename) {
        const match = String(filename).match(TESLA_TIMESTAMP_RE);
        if (!match) return null;

        const parts = match.slice(1).map(Number);
        const [year, month, day, hour, minute, second] = parts;
        const date = new Date(year, month - 1, day, hour, minute, second);
        if (Number.isNaN(date.getTime())
            || date.getFullYear() !== year
            || date.getMonth() !== month - 1
            || date.getDate() !== day
            || date.getHours() !== hour
            || date.getMinutes() !== minute
            || date.getSeconds() !== second) {
            return null;
        }

        return {
            startMs: date.getTime(),
            recordingKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                + `_${String(hour).padStart(2, '0')}-${String(minute).padStart(2, '0')}-${String(second).padStart(2, '0')}`
        };
    }

    function inferCamera(filename, fallbackIndex = 0) {
        const name = String(filename);
        const known = CAMERA_PATTERNS.find(camera => camera.pattern.test(name));
        if (known) return { key: known.key, label: known.label, detected: true };

        const stem = name
            .replace(/\.[^.]+$/, '')
            .replace(TESLA_TIMESTAMP_RE, '')
            .replace(/^[-_\s]+|[-_\s]+$/g, '')
            .replace(/[-_]+/g, ' ')
            .trim();
        const readable = stem
            ? stem.replace(/\b\w/g, letter => letter.toUpperCase())
            : `Camera ${fallbackIndex + 1}`;
        return {
            key: `camera-${fallbackIndex + 1}`,
            label: readable,
            detected: false
        };
    }

    function inspectFilename(filename, fallbackIndex = 0) {
        return {
            ...parseTeslaTimestamp(filename),
            ...inferCamera(filename, fallbackIndex)
        };
    }

    /**
     * Find the time range shared by every source.
     * Timestamped Tesla files are aligned from their filename; otherwise they
     * are assumed to begin together.
     */
    function computeAlignment(sources) {
        if (!Array.isArray(sources) || !sources.length) {
            return { aligned: false, overlapDuration: 0, offsets: [], commonStartMs: null, warning: null };
        }

        const durations = sources.map(source => Number(source.duration));
        if (durations.some(duration => !Number.isFinite(duration) || duration <= 0)) {
            return {
                aligned: false,
                overlapDuration: 0,
                offsets: sources.map(() => 0),
                commonStartMs: null,
                warning: 'One or more videos has no usable duration.'
            };
        }

        const hasAllTimestamps = sources.every(source => Number.isFinite(source.startMs));
        if (!hasAllTimestamps) {
            return {
                aligned: false,
                overlapDuration: Math.min(...durations),
                offsets: sources.map(() => 0),
                commonStartMs: null,
                warning: 'Some filenames have no Tesla timestamp, so the videos are assumed to start together.'
            };
        }

        const commonStartMs = Math.max(...sources.map(source => source.startMs));
        const commonEndMs = Math.min(...sources.map((source, index) => source.startMs + durations[index] * 1000));
        const overlapDuration = Math.max(0, (commonEndMs - commonStartMs) / 1000);
        return {
            aligned: true,
            overlapDuration,
            offsets: sources.map(source => (commonStartMs - source.startMs) / 1000),
            commonStartMs,
            warning: overlapDuration > 0 ? null : 'The timestamped videos do not overlap.'
        };
    }

    function normalizeCuts(cuts, duration, cameraIds, defaultCameraId) {
        const length = Math.max(0, Number(duration) || 0);
        const validIds = new Set(cameraIds || []);
        const fallback = validIds.has(defaultCameraId) ? defaultCameraId : [...validIds][0];
        if (!fallback || length <= 0) return [];

        const sorted = (Array.isArray(cuts) ? cuts : [])
            .filter(cut => cut && validIds.has(cut.cameraId) && Number.isFinite(Number(cut.time)))
            .map(cut => ({
                time: Math.round(clamp(Number(cut.time), 0, length) * 1000) / 1000,
                cameraId: cut.cameraId
            }))
            .filter(cut => cut.time < length)
            .sort((a, b) => a.time - b.time);

        const atUniqueTimes = [];
        for (const cut of sorted) {
            const previous = atUniqueTimes[atUniqueTimes.length - 1];
            if (previous && Math.abs(previous.time - cut.time) < 0.001) {
                previous.cameraId = cut.cameraId;
            } else {
                atUniqueTimes.push(cut);
            }
        }

        if (!atUniqueTimes.length || atUniqueTimes[0].time > 0) {
            atUniqueTimes.unshift({ time: 0, cameraId: fallback });
        } else {
            atUniqueTimes[0].time = 0;
        }

        return atUniqueTimes.filter((cut, index) => (
            index === 0 || cut.cameraId !== atUniqueTimes[index - 1].cameraId
        ));
    }

    function setCut(cuts, time, cameraId, duration, cameraIds) {
        const existing = Array.isArray(cuts) ? cuts.map(cut => ({ ...cut })) : [];
        const safeTime = clamp(Number(time) || 0, 0, Math.max(0, Number(duration) || 0));
        const nearby = existing.find(cut => Math.abs(Number(cut.time) - safeTime) < 0.05);
        if (nearby) {
            nearby.time = safeTime;
            nearby.cameraId = cameraId;
        } else {
            existing.push({ time: safeTime, cameraId });
        }
        const fallback = existing.find(cut => Number(cut.time) === 0)?.cameraId || cameraId;
        return normalizeCuts(existing, duration, cameraIds, fallback);
    }

    function activeCameraAt(cuts, time) {
        if (!Array.isArray(cuts) || !cuts.length) return null;
        const playhead = Number(time) || 0;
        let active = cuts[0].cameraId;
        for (const cut of cuts) {
            if (cut.time > playhead + 0.0001) break;
            active = cut.cameraId;
        }
        return active;
    }

    function buildSegments(cuts, duration) {
        const length = Math.max(0, Number(duration) || 0);
        if (!Array.isArray(cuts) || !cuts.length || length <= 0) return [];
        return cuts.map((cut, index) => ({
            start: cut.time,
            end: index + 1 < cuts.length ? cuts[index + 1].time : length,
            cameraId: cut.cameraId
        })).filter(segment => segment.end > segment.start);
    }

    function formatTime(seconds, precision = 1) {
        const safe = Math.max(0, Number(seconds) || 0);
        const factor = 10 ** Math.max(0, precision);
        const totalUnits = Math.floor(safe * factor + 1e-7);
        const whole = Math.floor(totalUnits / factor);
        const hours = Math.floor(whole / 3600);
        const minutes = Math.floor((whole % 3600) / 60);
        const wholeSeconds = whole % 60;
        const fractionUnits = totalUnits % factor;
        const fraction = precision > 0
            ? `.${String(fractionUnits).padStart(precision, '0')}`
            : '';
        const secondsText = `${String(wholeSeconds).padStart(2, '0')}${fraction}`;
        return hours > 0
            ? `${hours}:${String(minutes).padStart(2, '0')}:${secondsText}`
            : `${minutes}:${secondsText}`;
    }

    function supportedRecordingFormats(MediaRecorderType) {
        if (!MediaRecorderType) return null;
        const candidates = [
            { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
            { mimeType: 'video/mp4', extension: 'mp4' },
            { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
            { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
            { mimeType: 'video/webm', extension: 'webm' }
        ];
        const supports = typeof MediaRecorderType.isTypeSupported === 'function'
            ? candidate => MediaRecorderType.isTypeSupported(candidate)
            : () => true;
        return candidates.filter(candidate => supports(candidate.mimeType));
    }

    function chooseRecordingFormat(MediaRecorderType) {
        return supportedRecordingFormats(MediaRecorderType)?.[0] || null;
    }

    return {
        TESLA_TIMESTAMP_RE,
        clamp,
        parseTeslaTimestamp,
        inferCamera,
        inspectFilename,
        computeAlignment,
        normalizeCuts,
        setCut,
        activeCameraAt,
        buildSegments,
        formatTime,
        supportedRecordingFormats,
        chooseRecordingFormat
    };
});
