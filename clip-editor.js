(function () {
    'use strict';

    const Core = window.ClipEditorCore;
    if (!Core) throw new Error('ClipEditorCore is required');

    const CAMERA_ORDER = [
        'front',
        'left-pillar',
        'left-repeater',
        'right-pillar',
        'right-repeater',
        'rear',
        'cabin'
    ];
    const CAMERA_COLORS = {
        front: '#ed5964',
        rear: '#52b77b',
        'left-pillar': '#68a4f4',
        'left-repeater': '#68a4f4',
        'right-pillar': '#e8b348',
        'right-repeater': '#e8b348',
        cabin: '#b58af0'
    };
    const FALLBACK_COLORS = ['#ed5964', '#68a4f4', '#e8b348', '#52b77b', '#b58af0', '#ee8bc0', '#55bfc7'];
    const VIDEO_FILE_RE = /\.(?:mp4|m4v|mov|webm)$/i;
    const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8L7 4Z"/></svg>';
    const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6V4Zm8 0h4v16h-4V4Z"/></svg>';

    const $ = id => document.getElementById(id);
    const dropZone = $('dropZone');
    const dropStatus = $('dropStatus');
    const editor = $('editor');
    const fileInput = $('fileInput');
    const folderInput = $('folderInput');
    const chooseFilesBtn = $('chooseFilesBtn');
    const chooseFolderBtn = $('chooseFolderBtn');
    const replaceBtn = $('replaceBtn');
    const sourceVideos = $('sourceVideos');
    const sourceList = $('sourceList');
    const syncNote = $('syncNote');
    const recordingSetting = $('recordingSetting');
    const recordingSelect = $('recordingSelect');
    const canvas = $('previewCanvas');
    const context = canvas.getContext('2d', { alpha: false });
    const previewCamera = $('previewCamera');
    const previewTime = $('previewTime');
    const playBtn = $('playBtn');
    const playhead = $('playhead');
    const timeReadout = $('timeReadout');
    const angleButtons = $('angleButtons');
    const cameraTimeline = $('cameraTimeline');
    const timelinePlayhead = $('timelinePlayhead');
    const switchList = $('switchList');
    const resetCutsBtn = $('resetCutsBtn');
    const clipStart = $('clipStart');
    const clipStartNumber = $('clipStartNumber');
    const clipDurationInput = $('clipDuration');
    const clipDurationNumber = $('clipDurationNumber');
    const formatNote = $('formatNote');
    const exportBtn = $('exportBtn');
    const cancelExportBtn = $('cancelExportBtn');
    const exportProgress = $('exportProgress');
    const exportStatus = $('exportStatus');

    let allFiles = [];
    let recordingGroups = [];
    let selectedGroupKey = null;
    let sources = [];
    let alignment = null;
    let cuts = [];
    let sourceClipStart = 0;
    let clipLength = 30;
    let currentTime = 0;
    let playing = false;
    let startingPlayback = false;
    let previewAnimationFrame = 0;
    let playbackStartedAt = 0;
    let playbackStartedFrom = 0;
    let lastPlaybackSync = 0;
    let loadGeneration = 0;
    let seekGeneration = 0;
    let exporting = false;
    let cancelRequested = false;
    let exportAnimationFrame = 0;
    let activeRecorder = null;

    initialize();

    function initialize() {
        chooseFilesBtn.addEventListener('click', () => fileInput.click());
        chooseFolderBtn.addEventListener('click', () => folderInput.click());
        replaceBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', event => {
            void receiveFiles(Array.from(event.target.files || []));
            event.target.value = '';
        });
        folderInput.addEventListener('change', event => {
            void receiveFiles(Array.from(event.target.files || []));
            event.target.value = '';
        });

        window.addEventListener('dragover', event => {
            if (!hasFileDrag(event)) return;
            event.preventDefault();
            dropZone.classList.add('dragover');
        });
        window.addEventListener('dragleave', event => {
            if (!event.relatedTarget) dropZone.classList.remove('dragover');
        });
        window.addEventListener('drop', event => {
            if (!hasFileDrag(event)) return;
            event.preventDefault();
            dropZone.classList.remove('dragover');
            void filesFromDataTransfer(event.dataTransfer).then(receiveFiles);
        });

        recordingSelect.addEventListener('change', () => {
            void loadRecordingGroup(recordingSelect.value);
        });
        playBtn.addEventListener('click', () => {
            if (playing) pausePreview();
            else void startPreview();
        });
        playhead.addEventListener('input', () => {
            pausePreview();
            setPlayhead(Number(playhead.value), true);
        });
        resetCutsBtn.addEventListener('click', resetCuts);
        cameraTimeline.addEventListener('pointerdown', event => {
            if (event.button !== 0 || exporting) return;
            const rect = cameraTimeline.getBoundingClientRect();
            pausePreview();
            setPlayhead(Core.clamp((event.clientX - rect.left) / rect.width, 0, 1) * clipLength, true);
        });
        cameraTimeline.addEventListener('keydown', event => {
            if (exporting || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            pausePreview();
            const step = event.shiftKey ? 1 : 0.1;
            if (event.key === 'Home') setPlayhead(0, true);
            else if (event.key === 'End') setPlayhead(clipLength, true);
            else setPlayhead(currentTime + (event.key === 'ArrowRight' ? step : -step), true);
        });

        clipStart.addEventListener('input', () => updateClipStart(Number(clipStart.value)));
        clipStartNumber.addEventListener('change', () => updateClipStart(Number(clipStartNumber.value)));
        clipDurationInput.addEventListener('input', () => updateClipLength(Number(clipDurationInput.value)));
        clipDurationNumber.addEventListener('change', () => updateClipLength(Number(clipDurationNumber.value)));
        exportBtn.addEventListener('click', () => void exportClip());
        cancelExportBtn.addEventListener('click', () => {
            cancelRequested = true;
            exportStatus.textContent = 'Cancelling export…';
        });
        window.addEventListener('beforeunload', cleanupSources);

        const format = Core.chooseRecordingFormat(window.MediaRecorder);
        if (!format || typeof canvas.captureStream !== 'function') {
            formatNote.textContent = 'This browser cannot record a canvas video. Use a current version of Chrome, Edge, or Firefox.';
            formatNote.classList.add('warning');
            exportBtn.disabled = true;
        } else {
            const label = format.extension.toUpperCase();
            formatNote.textContent = `Exports ${label} in real time. Keep this tab active until the download starts.`;
        }
    }

    function hasFileDrag(event) {
        return Array.from(event.dataTransfer?.types || []).includes('Files');
    }

    async function filesFromDataTransfer(dataTransfer) {
        const items = Array.from(dataTransfer?.items || []);
        const entries = items.map(item => item.webkitGetAsEntry?.()).filter(Boolean);
        if (!entries.length) return Array.from(dataTransfer?.files || []);

        const files = [];
        await Promise.all(entries.map(entry => collectEntryFiles(entry, files)));
        return files;
    }

    async function collectEntryFiles(entry, files) {
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
            files.push(file);
            return;
        }
        if (!entry.isDirectory) return;

        const reader = entry.createReader();
        const children = [];
        while (true) {
            const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
            if (!batch.length) break;
            children.push(...batch);
        }
        await Promise.all(children.map(child => collectEntryFiles(child, files)));
    }

    async function receiveFiles(fileList) {
        if (exporting) return;
        const videoFiles = Array.from(fileList || []).filter(file => (
            file.type.startsWith('video/') || VIDEO_FILE_RE.test(file.name)
        ));
        if (videoFiles.length < 2) {
            showDropMessage('Choose at least two camera video files from the same recording.', true);
            return;
        }

        pausePreview();
        showDropMessage(`Found ${videoFiles.length} videos. Reading camera details…`);
        dropZone.hidden = false;
        editor.hidden = true;
        allFiles = videoFiles;
        recordingGroups = buildRecordingGroups(videoFiles);
        populateRecordingSelector();

        const preferred = recordingGroups
            .filter(group => group.key !== '__all__')
            .filter(group => group.files.length >= 2)
            .sort((a, b) => b.files.length - a.files.length || a.label.localeCompare(b.label))[0]
            || recordingGroups.find(group => group.key === '__all__')
            || recordingGroups[0];
        await loadRecordingGroup(preferred.key);
    }

    function buildRecordingGroups(files) {
        const byTimestamp = new Map();
        const unknown = [];

        files.forEach((file, index) => {
            const details = Core.inspectFilename(file.name, index);
            if (!details.recordingKey) {
                unknown.push(file);
                return;
            }
            if (!byTimestamp.has(details.recordingKey)) byTimestamp.set(details.recordingKey, []);
            byTimestamp.get(details.recordingKey).push(file);
        });

        if (unknown.length && byTimestamp.size === 1) {
            byTimestamp.values().next().value.push(...unknown);
        } else if (unknown.length) {
            byTimestamp.set('__untimestamped__', unknown);
        }

        const groups = [...byTimestamp.entries()]
            .map(([key, groupFiles]) => ({
                key,
                label: key === '__untimestamped__' ? 'Files without timestamps' : formatRecordingLabel(key),
                files: groupFiles,
                forceTogether: key === '__untimestamped__'
            }))
            .sort((a, b) => a.key.localeCompare(b.key));

        if (groups.length > 1) {
            groups.push({
                key: '__all__',
                label: `All selected files (${files.length})`,
                files,
                forceTogether: true
            });
        }
        return groups;
    }

    function formatRecordingLabel(key) {
        const [date, time] = key.split('_');
        return time ? `${date} at ${time.replaceAll('-', ':')}` : key;
    }

    function populateRecordingSelector() {
        recordingSelect.replaceChildren();
        recordingGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.key;
            option.textContent = `${group.label} — ${group.files.length} video${group.files.length === 1 ? '' : 's'}`;
            option.disabled = group.files.length < 2;
            recordingSelect.appendChild(option);
        });
        recordingSetting.hidden = recordingGroups.length <= 1;
    }

    async function loadRecordingGroup(groupKey) {
        const group = recordingGroups.find(candidate => candidate.key === groupKey);
        if (!group) return;
        const generation = ++loadGeneration;
        selectedGroupKey = group.key;
        recordingSelect.value = group.key;
        pausePreview();
        cleanupSources();
        showDropMessage(`Loading ${group.files.length} camera videos…`);
        syncNote.textContent = 'Loading camera videos…';
        syncNote.classList.remove('warning');

        const results = await Promise.allSettled(group.files.map((file, index) => loadVideoSource(file, index, group.forceTogether)));
        if (generation !== loadGeneration) {
            results.forEach(result => {
                if (result.status === 'fulfilled') disposeSource(result.value);
            });
            return;
        }

        const loaded = results.filter(result => result.status === 'fulfilled').map(result => result.value);
        const failed = results.filter(result => result.status === 'rejected');
        if (loaded.length < 2) {
            loaded.forEach(disposeSource);
            const detail = failed[0]?.reason?.message;
            showDropMessage(detail || 'At least two of these files could not be played by this browser.', true);
            return;
        }

        loaded.sort(compareSources);
        makeSourcesUnique(loaded);
        alignment = Core.computeAlignment(loaded);
        if (alignment.overlapDuration < 1) {
            loaded.forEach(disposeSource);
            showDropMessage(alignment.warning || 'The selected videos do not share enough time to make a clip.', true);
            return;
        }

        sources = loaded;
        sources.forEach((source, index) => {
            source.alignedOffset = alignment.offsets[index];
            source.color = CAMERA_COLORS[source.cameraKey] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
            source.id = `camera-${index + 1}`;
        });

        const canvasSource = sources.reduce((largest, source) => (
            source.width * source.height > largest.width * largest.height ? source : largest
        ), sources[0]);
        canvas.width = canvasSource.width;
        canvas.height = canvasSource.height;

        sourceClipStart = 0;
        clipLength = Math.min(30, Math.floor(alignment.overlapDuration * 1000) / 1000);
        currentTime = 0;
        cuts = Core.normalizeCuts([], clipLength, sourceIds(), sources[0].id);
        renderEditor(failed.length);
        dropZone.hidden = true;
        editor.hidden = false;
        await seekAll(0);
    }

    function loadVideoSource(file, index, forceTogether) {
        return new Promise((resolve, reject) => {
            const details = Core.inspectFilename(file.name, index);
            const objectUrl = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.preload = 'auto';
            video.muted = true;
            video.playsInline = true;
            video.disablePictureInPicture = true;
            video.src = objectUrl;
            sourceVideos.appendChild(video);

            const cleanupListeners = () => {
                video.removeEventListener('loadedmetadata', onLoaded);
                video.removeEventListener('error', onError);
            };
            const onLoaded = () => {
                cleanupListeners();
                if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
                    disposeSource({ video, objectUrl });
                    reject(new Error(`${file.name} has no playable video track.`));
                    return;
                }
                resolve({
                    file,
                    video,
                    objectUrl,
                    duration: video.duration,
                    width: video.videoWidth,
                    height: video.videoHeight,
                    startMs: forceTogether ? null : details.startMs,
                    cameraKey: details.key,
                    label: details.label,
                    detected: details.detected,
                    recordingKey: details.recordingKey
                });
            };
            const onError = () => {
                cleanupListeners();
                disposeSource({ video, objectUrl });
                reject(new Error(`${file.name} is not playable in this browser.`));
            };

            video.addEventListener('loadedmetadata', onLoaded);
            video.addEventListener('error', onError);
            video.load();
        });
    }

    function compareSources(a, b) {
        const rankA = CAMERA_ORDER.indexOf(a.cameraKey);
        const rankB = CAMERA_ORDER.indexOf(b.cameraKey);
        const normalizedA = rankA < 0 ? CAMERA_ORDER.length : rankA;
        const normalizedB = rankB < 0 ? CAMERA_ORDER.length : rankB;
        return normalizedA - normalizedB || a.label.localeCompare(b.label) || a.file.name.localeCompare(b.file.name);
    }

    function makeSourcesUnique(loaded) {
        const labels = new Map();
        loaded.forEach(source => {
            const count = (labels.get(source.label) || 0) + 1;
            labels.set(source.label, count);
            if (count > 1) source.label = `${source.label} ${count}`;
        });
    }

    function cleanupSources() {
        seekGeneration++;
        sources.forEach(disposeSource);
        sources = [];
        sourceVideos.replaceChildren();
    }

    function disposeSource(source) {
        if (!source) return;
        try {
            source.video?.pause();
            source.video?.removeAttribute('src');
            source.video?.load();
            source.video?.remove();
        } catch {
            // Cleanup is best-effort when a browser has already released media.
        }
        if (source.objectUrl) URL.revokeObjectURL(source.objectUrl);
    }

    function renderEditor(failedCount) {
        renderSources();
        renderAngleButtons();
        renderTimeline();
        renderSwitchList();
        configureClipControls();
        updatePlayheadUi();

        const shared = Core.formatTime(alignment.overlapDuration, 1);
        if (alignment.aligned) {
            syncNote.textContent = `Aligned by Tesla timestamps • ${shared} shared`;
            syncNote.classList.remove('warning');
        } else {
            syncNote.textContent = `${alignment.warning} ${shared} available`;
            syncNote.classList.add('warning');
        }
        if (failedCount) {
            syncNote.textContent += ` • ${failedCount} unsupported file${failedCount === 1 ? '' : 's'} skipped`;
            syncNote.classList.add('warning');
        }

        exportProgress.hidden = true;
        exportProgress.value = 0;
        setExportMessage('');
        updateExportButton();
    }

    function renderSources() {
        sourceList.replaceChildren();
        sources.forEach(source => {
            const item = document.createElement('div');
            item.className = 'source-item';
            item.title = source.file.name;

            const dot = document.createElement('span');
            dot.className = 'angle-dot';
            dot.style.setProperty('--camera-color', source.color);

            const name = document.createElement('div');
            name.className = 'source-name';
            const strong = document.createElement('strong');
            strong.textContent = source.label;
            const filename = document.createElement('span');
            filename.textContent = source.file.name;
            name.append(strong, filename);

            const duration = document.createElement('span');
            duration.className = 'source-duration';
            duration.textContent = Core.formatTime(source.duration, 0);
            item.append(dot, name, duration);
            sourceList.appendChild(item);
        });
    }

    function renderAngleButtons() {
        angleButtons.replaceChildren();
        sources.forEach(source => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'angle-button';
            button.dataset.cameraId = source.id;
            button.style.setProperty('--camera-color', source.color);
            button.title = `Switch to ${source.label} at the playhead`;

            const dot = document.createElement('span');
            dot.className = 'angle-dot';
            const label = document.createElement('span');
            label.className = 'angle-label';
            label.textContent = source.label;
            button.append(dot, label);
            button.addEventListener('click', () => selectCameraAtPlayhead(source.id));
            angleButtons.appendChild(button);
        });
    }

    function renderTimeline() {
        const segments = Core.buildSegments(cuts, clipLength);
        cameraTimeline.replaceChildren();
        segments.forEach(segment => {
            const source = sourceById(segment.cameraId);
            if (!source) return;
            const element = document.createElement('div');
            element.className = 'timeline-segment';
            element.style.width = `${((segment.end - segment.start) / clipLength) * 100}%`;
            element.style.setProperty('--camera-color', source.color);
            element.title = `${source.label}: ${Core.formatTime(segment.start)}–${Core.formatTime(segment.end)}`;
            if (segment.end - segment.start >= Math.max(1.5, clipLength * 0.09)) element.textContent = source.label;
            cameraTimeline.appendChild(element);
        });
        cameraTimeline.appendChild(timelinePlayhead);
    }

    function renderSwitchList() {
        switchList.replaceChildren();
        cuts.forEach((cut, index) => {
            const row = document.createElement('div');
            row.className = 'switch-row';

            const time = document.createElement('input');
            time.type = 'number';
            time.min = '0';
            time.max = String(Math.max(0, clipLength - 0.01));
            time.step = '0.1';
            time.value = cut.time.toFixed(1);
            time.disabled = index === 0 || exporting;
            time.setAttribute('aria-label', index === 0 ? 'Initial camera time' : `Switch ${index + 1} time in seconds`);
            time.addEventListener('change', () => {
                const updated = cuts.map(entry => ({ ...entry }));
                updated[index].time = Core.clamp(Number(time.value), 0, Math.max(0, clipLength - 0.01));
                cuts = Core.normalizeCuts(updated, clipLength, sourceIds(), cuts[0].cameraId);
                renderTimeline();
                renderSwitchList();
                updatePlayheadUi();
            });

            const camera = document.createElement('select');
            camera.disabled = exporting;
            camera.setAttribute('aria-label', index === 0 ? 'Initial camera' : `Camera after switch ${index + 1}`);
            sources.forEach(source => {
                const option = document.createElement('option');
                option.value = source.id;
                option.textContent = source.label;
                option.selected = source.id === cut.cameraId;
                camera.appendChild(option);
            });
            camera.addEventListener('change', () => {
                const updated = cuts.map(entry => ({ ...entry }));
                updated[index].cameraId = camera.value;
                cuts = Core.normalizeCuts(updated, clipLength, sourceIds(), updated[0].cameraId);
                renderTimeline();
                renderSwitchList();
                updatePlayheadUi();
                if (!playing) void seekAll(currentTime);
            });

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'remove-switch';
            remove.textContent = '×';
            remove.title = index === 0 ? 'The initial camera cannot be removed' : 'Remove switch';
            remove.setAttribute('aria-label', remove.title);
            remove.disabled = index === 0 || exporting;
            remove.addEventListener('click', () => {
                cuts.splice(index, 1);
                cuts = Core.normalizeCuts(cuts, clipLength, sourceIds(), cuts[0]?.cameraId || sources[0].id);
                renderTimeline();
                renderSwitchList();
                updatePlayheadUi();
            });

            row.append(time, camera, remove);
            switchList.appendChild(row);
        });
    }

    function configureClipControls() {
        const maximumLength = Math.min(30, alignment.overlapDuration);
        const minimumLength = Math.min(1, maximumLength);
        const maximumStart = Math.max(0, alignment.overlapDuration - clipLength);

        clipDurationInput.min = String(minimumLength);
        clipDurationInput.max = String(maximumLength);
        clipDurationInput.value = String(clipLength);
        clipDurationInput.disabled = exporting;
        clipDurationNumber.min = String(minimumLength);
        clipDurationNumber.max = String(maximumLength);
        clipDurationNumber.value = clipLength.toFixed(1);
        clipDurationNumber.disabled = exporting;

        clipStart.min = '0';
        clipStart.max = String(maximumStart);
        clipStart.value = String(sourceClipStart);
        clipStart.disabled = exporting || maximumStart === 0;
        clipStartNumber.min = '0';
        clipStartNumber.max = String(maximumStart);
        clipStartNumber.value = sourceClipStart.toFixed(1);
        clipStartNumber.disabled = exporting || maximumStart === 0;

        playhead.max = String(clipLength);
        cameraTimeline.setAttribute('aria-valuemax', String(clipLength));
    }

    function updateClipStart(value) {
        if (!alignment || exporting || !Number.isFinite(value)) return;
        pausePreview();
        sourceClipStart = Core.clamp(value, 0, Math.max(0, alignment.overlapDuration - clipLength));
        currentTime = 0;
        configureClipControls();
        updatePlayheadUi();
        void seekAll(0);
    }

    function updateClipLength(value) {
        if (!alignment || exporting || !Number.isFinite(value)) return;
        pausePreview();
        const maximum = Math.min(30, alignment.overlapDuration);
        clipLength = Core.clamp(value, Math.min(1, maximum), maximum);
        sourceClipStart = Core.clamp(sourceClipStart, 0, Math.max(0, alignment.overlapDuration - clipLength));
        currentTime = Core.clamp(currentTime, 0, clipLength);
        cuts = Core.normalizeCuts(cuts, clipLength, sourceIds(), cuts[0]?.cameraId || sources[0].id);
        configureClipControls();
        renderTimeline();
        renderSwitchList();
        updateExportButton();
        updatePlayheadUi();
        void seekAll(currentTime);
    }

    function resetCuts() {
        if (!sources.length || exporting) return;
        const active = Core.activeCameraAt(cuts, 0) || sources[0].id;
        cuts = Core.normalizeCuts([], clipLength, sourceIds(), active);
        renderTimeline();
        renderSwitchList();
        updatePlayheadUi();
        if (!playing) void seekAll(currentTime);
    }

    function selectCameraAtPlayhead(cameraId) {
        if (exporting) return;
        if (currentTime >= clipLength) {
            pausePreview();
            currentTime = Math.max(0, clipLength - 0.1);
        }
        cuts = Core.setCut(cuts, currentTime, cameraId, clipLength, sourceIds());
        renderTimeline();
        renderSwitchList();
        updatePlayheadUi();
        if (!playing) void seekSourceAndDraw(sourceById(cameraId), currentTime);
    }

    function setPlayhead(value, seek) {
        currentTime = Core.clamp(Number(value) || 0, 0, clipLength);
        updatePlayheadUi();
        if (seek) void seekAll(currentTime);
    }

    function updatePlayheadUi() {
        const formatted = `${Core.formatTime(currentTime)} / ${Core.formatTime(clipLength)}`;
        playhead.value = String(currentTime);
        timeReadout.textContent = formatted;
        previewTime.textContent = formatted;
        const percentage = clipLength ? (currentTime / clipLength) * 100 : 0;
        timelinePlayhead.style.left = `${percentage}%`;
        cameraTimeline.setAttribute('aria-valuenow', currentTime.toFixed(2));
        cameraTimeline.setAttribute('aria-valuetext', Core.formatTime(currentTime));

        const activeId = Core.activeCameraAt(cuts, Math.min(currentTime, Math.max(0, clipLength - 0.001)));
        const activeSource = sourceById(activeId);
        if (activeSource) {
            previewCamera.textContent = activeSource.label;
            previewCamera.style.setProperty('--camera-color', activeSource.color);
        }
        angleButtons.querySelectorAll('.angle-button').forEach(button => {
            const isActive = button.dataset.cameraId === activeId;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
    }

    async function startPreview() {
        if (!sources.length || playing || startingPlayback || exporting) return;
        startingPlayback = true;
        if (currentTime >= clipLength - 0.01) currentTime = 0;
        await seekAll(currentTime);
        if (exporting || !startingPlayback) {
            startingPlayback = false;
            return;
        }

        try {
            await Promise.all(sources.map(source => source.video.play()));
        } catch (error) {
            pauseAllVideos();
            setExportMessage(`Preview could not start: ${error.message}`, 'error');
            startingPlayback = false;
            return;
        }

        startingPlayback = false;
        playing = true;
        playbackStartedFrom = currentTime;
        playbackStartedAt = performance.now();
        lastPlaybackSync = playbackStartedAt;
        playBtn.innerHTML = PAUSE_ICON;
        playBtn.setAttribute('aria-label', 'Pause preview');
        previewAnimationFrame = requestAnimationFrame(previewTick);
    }

    function previewTick(now) {
        if (!playing) return;
        currentTime = Math.min(clipLength, playbackStartedFrom + (now - playbackStartedAt) / 1000);
        drawAt(currentTime);
        updatePlayheadUi();

        if (now - lastPlaybackSync > 500) {
            syncPlayingVideos(currentTime);
            lastPlaybackSync = now;
        }
        if (currentTime >= clipLength) {
            pausePreview();
            return;
        }
        previewAnimationFrame = requestAnimationFrame(previewTick);
    }

    function pausePreview() {
        startingPlayback = false;
        if (previewAnimationFrame) cancelAnimationFrame(previewAnimationFrame);
        previewAnimationFrame = 0;
        playing = false;
        pauseAllVideos();
        playBtn.innerHTML = PLAY_ICON;
        playBtn.setAttribute('aria-label', 'Play preview');
    }

    function pauseAllVideos() {
        sources.forEach(source => source.video.pause());
    }

    function syncPlayingVideos(projectTime) {
        sources.forEach(source => {
            const target = videoTimeFor(source, projectTime);
            if (Math.abs(source.video.currentTime - target) > 0.18) source.video.currentTime = target;
        });
    }

    async function seekAll(projectTime) {
        const generation = ++seekGeneration;
        await Promise.all(sources.map(source => seekVideo(source.video, videoTimeFor(source, projectTime))));
        if (generation !== seekGeneration) return;
        drawAt(projectTime);
        updatePlayheadUi();
    }

    async function seekSourceAndDraw(source, projectTime) {
        if (!source) return;
        const generation = ++seekGeneration;
        await seekVideo(source.video, videoTimeFor(source, projectTime));
        if (generation !== seekGeneration) return;
        drawAt(projectTime);
    }

    function seekVideo(video, requestedTime) {
        const maximum = Math.max(0, video.duration - 0.01);
        const target = Core.clamp(requestedTime, 0, maximum);
        if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.025) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            let timeout;
            const finish = () => {
                clearTimeout(timeout);
                video.removeEventListener('seeked', finish);
                video.removeEventListener('error', finish);
                resolve();
            };
            video.addEventListener('seeked', finish, { once: true });
            video.addEventListener('error', finish, { once: true });
            timeout = setTimeout(finish, 2500);
            try {
                video.currentTime = target;
            } catch {
                finish();
            }
        });
    }

    function videoTimeFor(source, projectTime) {
        return source.alignedOffset + sourceClipStart + Core.clamp(projectTime, 0, clipLength);
    }

    function drawAt(projectTime) {
        const lookupTime = Math.min(projectTime, Math.max(0, clipLength - 0.001));
        const source = sourceById(Core.activeCameraAt(cuts, lookupTime));
        context.fillStyle = '#000';
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (!source || source.video.readyState < 2) return;

        const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
        const width = source.width * scale;
        const height = source.height * scale;
        const x = (canvas.width - width) / 2;
        const y = (canvas.height - height) / 2;
        try {
            context.drawImage(source.video, x, y, width, height);
        } catch {
            // A seek can briefly make a frame unavailable; the next draw retries.
        }
    }

    async function exportClip() {
        if (!sources.length || exporting) return;
        const format = Core.chooseRecordingFormat(window.MediaRecorder);
        if (!format || typeof canvas.captureStream !== 'function') {
            setExportMessage('Video export is not supported by this browser.', 'error');
            return;
        }

        const savedTime = currentTime;
        pausePreview();
        exporting = true;
        cancelRequested = false;
        setExportControls(true);
        exportProgress.hidden = false;
        exportProgress.value = 0;
        setExportMessage(`Preparing ${format.extension.toUpperCase()} export…`);

        let stream;
        try {
            await seekAll(0);
            drawAt(0);
            stream = canvas.captureStream(30);
            const bitsPerSecond = Math.max(4_000_000, Math.min(12_000_000, canvas.width * canvas.height * 5));
            const recorder = new MediaRecorder(stream, {
                mimeType: format.mimeType,
                videoBitsPerSecond: bitsPerSecond
            });
            activeRecorder = recorder;
            const chunks = [];
            recorder.addEventListener('dataavailable', event => {
                if (event.data.size) chunks.push(event.data);
            });
            const stopped = new Promise((resolve, reject) => {
                recorder.addEventListener('stop', resolve, { once: true });
                recorder.addEventListener('error', event => reject(event.error || new Error('Video recorder failed.')), { once: true });
            });

            await Promise.all(sources.map(source => source.video.play()));
            recorder.start(250);
            const startedAt = performance.now();
            let lastSync = startedAt;
            setExportMessage(`Recording ${Core.formatTime(clipLength)} in real time…`);

            await new Promise(resolve => {
                const tick = now => {
                    const elapsed = Math.min(clipLength, (now - startedAt) / 1000);
                    currentTime = elapsed;
                    drawAt(elapsed);
                    updatePlayheadUi();
                    exportProgress.value = clipLength ? elapsed / clipLength : 1;

                    if (now - lastSync > 500) {
                        syncPlayingVideos(elapsed);
                        lastSync = now;
                    }
                    if (cancelRequested || elapsed >= clipLength) {
                        resolve();
                        return;
                    }
                    exportAnimationFrame = requestAnimationFrame(tick);
                };
                exportAnimationFrame = requestAnimationFrame(tick);
            });

            if (exportAnimationFrame) cancelAnimationFrame(exportAnimationFrame);
            exportAnimationFrame = 0;
            pauseAllVideos();
            if (recorder.state !== 'inactive') recorder.stop();
            await stopped;

            if (cancelRequested) {
                setExportMessage('Export cancelled.');
            } else {
                const mimeType = recorder.mimeType || format.mimeType;
                const blob = new Blob(chunks, { type: mimeType });
                if (!blob.size) throw new Error('The browser produced an empty video.');
                const filename = outputFilename(format.extension);
                downloadBlob(blob, filename);
                exportProgress.value = 1;
                setExportMessage(`Downloaded ${filename}`, 'success');
            }
        } catch (error) {
            if (activeRecorder?.state !== 'inactive') {
                try {
                    activeRecorder.stop();
                } catch {
                    // The recorder may already be stopping after an error.
                }
            }
            setExportMessage(`Export failed: ${error.message}`, 'error');
        } finally {
            if (exportAnimationFrame) cancelAnimationFrame(exportAnimationFrame);
            exportAnimationFrame = 0;
            stream?.getTracks().forEach(track => track.stop());
            activeRecorder = null;
            exporting = false;
            cancelRequested = false;
            currentTime = Core.clamp(savedTime, 0, clipLength);
            setExportControls(false);
            updatePlayheadUi();
            await seekAll(currentTime);
        }
    }

    function setExportControls(isExporting) {
        exportBtn.hidden = isExporting;
        cancelExportBtn.hidden = !isExporting;
        playBtn.disabled = isExporting;
        playhead.disabled = isExporting;
        resetCutsBtn.disabled = isExporting;
        replaceBtn.disabled = isExporting;
        recordingSelect.disabled = isExporting;
        angleButtons.querySelectorAll('button').forEach(button => {
            button.disabled = isExporting;
        });
        configureClipControls();
        renderSwitchList();
    }

    function updateExportButton() {
        const rounded = Math.round(clipLength * 10) / 10;
        exportBtn.textContent = `Export ${rounded}-second clip`;
    }

    function outputFilename(extension) {
        const group = recordingGroups.find(candidate => candidate.key === selectedGroupKey);
        const recording = group && !group.key.startsWith('__') ? group.key : sources[0]?.recordingKey;
        const prefix = recording || 'tesla-dashcam';
        const seconds = (Math.round(clipLength * 10) / 10).toString().replace('.', '_');
        return `${prefix}_multicam_${seconds}s.${extension}`;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function setExportMessage(message, type = '') {
        exportStatus.textContent = message;
        exportStatus.className = `export-status${type ? ` ${type}` : ''}`;
    }

    function showDropMessage(message, isError = false) {
        dropStatus.textContent = message;
        dropStatus.style.color = isError ? 'var(--accent)' : '';
    }

    function sourceIds() {
        return sources.map(source => source.id);
    }

    function sourceById(id) {
        return sources.find(source => source.id === id);
    }
})();
