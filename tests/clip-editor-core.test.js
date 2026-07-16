const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../clip-editor-core.js');

test('parses both Tesla timestamp filename styles', () => {
    const underscored = Core.parseTeslaTimestamp('2026-07-16_20-18-30-front.mp4');
    const hyphenated = Core.parseTeslaTimestamp('2026-07-16-20-18-30-back.mp4');

    assert.equal(underscored.recordingKey, '2026-07-16_20-18-30');
    assert.equal(hyphenated.recordingKey, '2026-07-16_20-18-30');
    assert.equal(underscored.startMs, hyphenated.startMs);
    assert.equal(Core.parseTeslaTimestamp('2026-02-30_20-18-30-front.mp4'), null);
});

test('recognizes Tesla camera names and creates a readable fallback', () => {
    assert.deepEqual(Core.inferCamera('2026-07-16_20-18-30-left_repeater.mp4'), {
        key: 'left-repeater',
        label: 'Left Repeater',
        detected: true
    });
    assert.deepEqual(Core.inferCamera('event-back.mp4'), {
        key: 'rear',
        label: 'Rear',
        detected: true
    });
    assert.deepEqual(Core.inferCamera('2026-07-16_20-18-30-custom_view.mp4', 2), {
        key: 'camera-3',
        label: 'Custom View',
        detected: false
    });
});

test('aligns timestamped videos to their shared time range', () => {
    const alignment = Core.computeAlignment([
        { duration: 60, startMs: 1_000_000 },
        { duration: 45, startMs: 1_005_000 },
        { duration: 60, startMs: 1_002_000 }
    ]);

    assert.equal(alignment.aligned, true);
    assert.equal(alignment.commonStartMs, 1_005_000);
    assert.equal(alignment.overlapDuration, 45);
    assert.deepEqual(alignment.offsets, [5, 0, 3]);
    assert.equal(alignment.warning, null);
});

test('assumes matching starts when a filename timestamp is unavailable', () => {
    const alignment = Core.computeAlignment([
        { duration: 40, startMs: null },
        { duration: 35, startMs: 1_000_000 }
    ]);

    assert.equal(alignment.aligned, false);
    assert.equal(alignment.overlapDuration, 35);
    assert.deepEqual(alignment.offsets, [0, 0]);
    assert.match(alignment.warning, /assumed to start together/);
});

test('normalizes switch points and removes redundant camera segments', () => {
    const cuts = Core.normalizeCuts([
        { time: 8, cameraId: 'rear' },
        { time: 4, cameraId: 'front' },
        { time: 4, cameraId: 'left' },
        { time: 12, cameraId: 'rear' },
        { time: 99, cameraId: 'front' },
        { time: 2, cameraId: 'missing' }
    ], 30, ['front', 'left', 'rear'], 'front');

    assert.deepEqual(cuts, [
        { time: 0, cameraId: 'front' },
        { time: 4, cameraId: 'left' },
        { time: 8, cameraId: 'rear' }
    ]);
    assert.equal(Core.activeCameraAt(cuts, 7.99), 'left');
    assert.equal(Core.activeCameraAt(cuts, 8), 'rear');
});

test('adds a switch at the playhead and builds contiguous segments', () => {
    let cuts = Core.normalizeCuts([], 30, ['front', 'rear'], 'front');
    cuts = Core.setCut(cuts, 10.1254, 'rear', 30, ['front', 'rear']);
    cuts = Core.setCut(cuts, 20, 'front', 30, ['front', 'rear']);

    assert.deepEqual(cuts, [
        { time: 0, cameraId: 'front' },
        { time: 10.125, cameraId: 'rear' },
        { time: 20, cameraId: 'front' }
    ]);
    assert.deepEqual(Core.buildSegments(cuts, 30), [
        { start: 0, end: 10.125, cameraId: 'front' },
        { start: 10.125, end: 20, cameraId: 'rear' },
        { start: 20, end: 30, cameraId: 'front' }
    ]);
});

test('formats clip times and chooses the first supported recording format', () => {
    assert.equal(Core.formatTime(65.98), '1:05.9');
    assert.equal(Core.formatTime(10.1), '0:10.1');
    assert.equal(Core.formatTime(65.3), '1:05.3');
    assert.equal(Core.formatTime(3661.25, 0), '1:01:01');

    const recorder = {
        isTypeSupported: mimeType => mimeType === 'video/webm;codecs=vp8'
    };
    assert.deepEqual(Core.chooseRecordingFormat(recorder), {
        mimeType: 'video/webm;codecs=vp8',
        extension: 'webm'
    });
    assert.deepEqual(Core.supportedRecordingFormats(recorder), [{
        mimeType: 'video/webm;codecs=vp8',
        extension: 'webm'
    }]);
    assert.equal(Core.chooseRecordingFormat(null), null);
});
