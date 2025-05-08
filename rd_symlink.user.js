// ==UserScript==
// @name         RD Symlink Manager
// @namespace    http://tampermonkey.net/
// @version      1.0.6
// @description  Integrated solution with direct RD downloads and symlinking
// @author       You
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      api.real-debrid.com
// @connect      192.168.1.100
// @connect      localhost
// @noframes
// ==/UserScript==

(function () {
    'use strict';
    const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const config = {
        instanceName: "Main",    // Unique identifier for multiple instances
        rdApiKey: 'YOUR_API_KEY_HERE', // Get from Real-Debrid APItoken
        backendUrl: 'http://localhost:5002', // Local server address
        videoExtensions: new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v']),
        minFileSize: 50 * 1024 * 1024,
        retryDelay: 30000,
        maxRetries: 15,
        maxHistoryItems: 200
    };

    const instanceKey = config.instanceName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const storageKeys = {
        tasks: `rd_tasks_${instanceKey}`,
        activeTasks: `active_tasks_${instanceKey}`,
        clickedHashes: `clickedHashes_${instanceKey}`,
        currentFilter: `current_filter_${instanceKey}`
    };

    let tasks = JSON.parse(GM_getValue(storageKeys.tasks, '[]')).filter(t => t && t.magnet);
    let activeTasks = JSON.parse(GM_getValue(storageKeys.activeTasks, '{}'));
    let currentFilter = GM_getValue(storageKeys.currentFilter, 'all');
    let clickedHashes = JSON.parse(GM_getValue(storageKeys.clickedHashes, '{}'));
    let updateButtonStatesTimeout;

    function saveActiveTasks() {
        tasks = tasks.filter(t => t && t.magnet && getMagnetHash(t.magnet));
        Object.keys(activeTasks).forEach(k => {
            if (!activeTasks[k].magnet) delete activeTasks[k];
        });

        GM_setValue(storageKeys.activeTasks, JSON.stringify(activeTasks));
        GM_setValue(storageKeys.tasks, JSON.stringify(tasks));
        GM_setValue(storageKeys.clickedHashes, JSON.stringify(clickedHashes));
    }

    function handleStorageUpdate(e) {
        if ([storageKeys.tasks, storageKeys.activeTasks, storageKeys.clickedHashes].includes(e.key)) {
            tasks = JSON.parse(GM_getValue(storageKeys.tasks, '[]'));
            activeTasks = JSON.parse(GM_getValue(storageKeys.activeTasks, '{}'));
            clickedHashes = JSON.parse(GM_getValue(storageKeys.clickedHashes, '{}'));
            updateTaskManager();
            updateButtonStates();
        }
    }

    setInterval(saveActiveTasks, 30000);
    uw.addEventListener('beforeunload', saveActiveTasks);
    uw.addEventListener('storage', handleStorageUpdate);

    function getMagnetHash(magnetUrl) {
        const hashMatch = magnetUrl.match(/xt=urn:btih:([^&]+)/i);
        return hashMatch ? hashMatch[1].toUpperCase() : null;
    }

    function getMagnetName(magnetUrl) {
        try {
            const nameMatch = magnetUrl.match(/dn=([^&]+)/i);
            return nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' '))
                 : `Torrent-${getMagnetHash(magnetUrl)?.substring(0, 8) || 'Unknown'}`;
        } catch {
            return 'Unknown Magnet';
        }
    }

    GM_addStyle(`
        .rd-magnet-button {
            display: inline-block;
            margin-left: 8px;
            padding: 4px 10px;
            background: #2ecc71;
            color: white;
            border-radius: 4px;
            font: bold 12px sans-serif;
            cursor: pointer;
            border: none;
            transition: all 0.3s ease;
        }
        .rd-magnet-button:disabled {
            cursor: not-allowed;
            opacity: 0.7;
        }
        .rd-magnet-button:hover:not(:disabled) { opacity: 0.85; }
        #rd-task-manager {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            background: white;
            border-radius: 8px;
            box-shadow: 0 5px 30px rgba(0,0,0,0.3);
            z-index: 999999;
            display: none;
            font-family: sans-serif;
        }
        #rd-task-manager.active { display: block; }
        .rd-task-manager-header {
            padding: 15px;
            background: #3498db;
            color: white;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .rd-task-manager-close {
            background: none;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            position: absolute;
            top: 10px;
            right: 10px;
        }
        .rd-task-list {
            padding: 15px;
            max-height: 60vh;
            overflow-y: auto;
        }
        .rd-task-item {
            padding: 10px;
            margin: 5px 0;
            background: #f8f9fa;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .rd-task-info {
            flex: 1;
            overflow: hidden;
            margin-right: 10px;
        }
        .rd-task-name {
            font-weight: bold;
            margin-bottom: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .rd-task-progress {
            height: 4px;
            background: #ddd;
            border-radius: 2px;
            margin: 5px 0;
            overflow: hidden;
        }
        .rd-task-progress-bar {
            height: 100%;
            background: #2ecc71;
            transition: width 0.3s ease;
        }
        .rd-task-status {
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 12px;
            min-width: 70px;
            text-align: center;
        }
        .rd-task-pending { background: #f39c12; }
        .rd-task-processing { background: #3498db; }
        .rd-task-downloading { background: #2980b9; }
        .rd-task-symlinking { background: #9b59b6; }
        .rd-task-completed { background: #2ecc71; }
        .rd-task-failed { background: #e74c3c; }
        .rd-task-done { background: #95a5a6; }
        .rd-task-actions {
            display: flex;
            gap: 5px;
        }
        .rd-task-button {
            padding: 3px 8px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        .rd-task-retry {
            background: #3498db !important;
            color: white !important;
        }
        .rd-task-delete-rd {
            background: #95a5a6 !important;
            color: white !important;
        }
        #rd-task-manager-toggle {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 40px;
            height: 40px;
            background: #3498db;
            color: white;
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 99999;
        }
        .rd-filter-controls {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-top: 10px;
        }
        .rd-filter-btn {
            padding: 4px 8px;
            border: 1px solid #3498db;
            border-radius: 4px;
            background: white;
            color: #3498db;
            cursor: pointer;
            font-size: 12px;
        }
        .rd-filter-btn.active {
            background: #3498db;
            color: white;
        }
        .rd-clear-buttons {
            display: flex;
            gap: 8px;
            margin-left: auto;
        }
        .rd-clear-history {
            background: #f1c40f !important;
            border-color: #f39c12 !important;
        }
        .rd-clear-tracking {
            background: #e74c3c !important;
            border-color: #c0392b !important;
        }
        .rd-export-import {
            background: #2ecc71 !important;
            border-color: #27ae60 !important;
            color: white !important;
        }
        .rd-clear-history:hover { background: #f39c12 !important; }
        .rd-clear-tracking:hover { background: #c0392b !important; }
        .rd-export-import:hover { background: #27ae60 !important; }
        #rd-status-message {
            position: fixed;
            bottom: 20px;
            left: 20px;
            padding: 10px 15px;
            background: #3498db;
            color: white;
            border-radius: 5px;
            z-index: 99999;
            font-family: sans-serif;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            max-width: 80vw;
        }
    `);

    function createTaskManager() {
        if (!uw.document.getElementById('rd-task-manager')) {
            const manager = uw.document.createElement('div');
            manager.id = 'rd-task-manager';
            manager.innerHTML = `
                <div class="rd-task-manager-header">
                    <h3>Real-Debrid Tasks (${config.instanceName})</h3>
                    <div class="rd-filter-controls">
                        <button class="rd-filter-btn active" data-filter="all">All</button>
                        <button class="rd-filter-btn" data-filter="active">Active</button>
                        <button class="rd-filter-btn" data-filter="symlinking">Symlinking</button>
                        <button class="rd-filter-btn" data-filter="completed">Completed</button>
                        <div class="rd-clear-buttons">
                            <button class="rd-clear-history">Clear History</button>
                            <button class="rd-clear-tracking">Clear Tracking</button>
                            <button class="rd-export-import">Export/Import</button>
                        </div>
                    </div>
                    <button class="rd-task-manager-close">&times;</button>
                </div>
                <div class="rd-task-list"></div>
            `;
            uw.document.body.appendChild(manager);

            manager.querySelector('.rd-task-manager-close').addEventListener('click', () => {
                manager.classList.remove('active');
            });

            manager.querySelectorAll('.rd-filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    manager.querySelectorAll('.rd-filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentFilter = btn.dataset.filter;
                    GM_setValue(storageKeys.currentFilter, currentFilter);
                    updateTaskManager();
                });
            });

            manager.querySelector('.rd-clear-history').addEventListener('click', () => {
                if (confirm('Clear history but keep tracking?')) {
                    tasks = tasks.filter(t => !['completed', 'failed', 'done'].includes(t.status));
                    saveActiveTasks();
                    updateTaskManager();
                    showStatus("History cleared", '#2ecc71', 3000);
                }
            });

            manager.querySelector('.rd-clear-tracking').addEventListener('click', () => {
                if (confirm('Clear ALL history and tracking?')) {
                    tasks = [];
                    clickedHashes = {};
                    activeTasks = {};
                    GM_setValue(storageKeys.tasks, '[]');
                    GM_setValue(storageKeys.clickedHashes, '{}');
                    GM_setValue(storageKeys.activeTasks, '{}');
                    uw.document.querySelectorAll('.rd-magnet-button').forEach(btn => {
                        btn.textContent = 'RD';
                        btn.style.background = '#2ecc71';
                        btn.disabled = false;
                    });
                    updateTaskManager();
                    showStatus("Full reset complete", '#e74c3c', 3000);
                }
            });

            manager.querySelector('.rd-export-import').addEventListener('click', handleExportImport);
        }
    }

    function handleExportImport(e) {
        if (e.shiftKey) {
            const input = uw.document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const data = JSON.parse(reader.result);
                        tasks = data.tasks || [];
                        clickedHashes = data.clickedHashes || {};
                        activeTasks = data.activeTasks || {};
                        GM_setValue(storageKeys.tasks, JSON.stringify(tasks));
                        GM_setValue(storageKeys.clickedHashes, JSON.stringify(clickedHashes));
                        GM_setValue(storageKeys.activeTasks, JSON.stringify(activeTasks));
                        updateTaskManager();
                        showStatus('Data imported!', '#2ecc71', 3000);
                    } catch {
                        showStatus('Invalid backup file', '#e74c3c', 5000);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        } else {
            const data = {
                tasks: JSON.parse(GM_getValue(storageKeys.tasks)),
                clickedHashes: JSON.parse(GM_getValue(storageKeys.clickedHashes)),
                activeTasks: JSON.parse(GM_getValue(storageKeys.activeTasks))
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = uw.document.createElement('a');
            a.href = url;
            a.download = `rd-${instanceKey}-backup-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    function createTaskManagerToggle() {
        if (!uw.document.getElementById('rd-task-manager-toggle')) {
            const toggle = uw.document.createElement('div');
            toggle.id = 'rd-task-manager-toggle';
            toggle.textContent = 'RD';
            toggle.addEventListener('click', () => {
                const manager = uw.document.getElementById('rd-task-manager');
                manager.classList.toggle('active');
                updateTaskManager();
            });
            uw.document.body.appendChild(toggle);
        }
    }

    function updateTaskManager() {
        const manager = uw.document.getElementById('rd-task-manager');
        if (!manager) return;

        const list = manager.querySelector('.rd-task-list');
        list.innerHTML = '';

        let filteredTasks = [...Object.values(activeTasks), ...tasks];

        switch(currentFilter) {
            case 'active':
                filteredTasks = filteredTasks.filter(t =>
                    ['pending', 'processing', 'downloading', 'symlinking'].includes(t.status)
                );
                break;
            case 'symlinking':
                filteredTasks = filteredTasks.filter(t => t.status === 'symlinking');
                break;
            case 'completed':
                filteredTasks = filteredTasks.filter(t => ['completed', 'done'].includes(t.status));
                break;
        }

        filteredTasks = filteredTasks
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, currentFilter === 'all' ? config.maxHistoryItems : 100);

        filteredTasks.forEach(task => {
            const taskEl = uw.document.createElement('div');
            taskEl.className = 'rd-task-item';
            const statusClass = `rd-task-${task.status === 'symlinking' ? 'symlinking' : task.status}`;
            const displayName = task.name || getMagnetName(task.magnet);
            taskEl.innerHTML = `
                <div class="rd-task-info">
                    <div class="rd-task-name" title="${displayName}">${displayName.substring(0, 50)}</div>
                    <div class="rd-task-progress">
                        <div class="rd-task-progress-bar" style="width: ${task.progress}%"></div>
                    </div>
                    <div class="rd-task-status-text">${task.statusText || ''}</div>
                </div>
                <div class="rd-task-status ${statusClass}">${task.status.charAt(0).toUpperCase() + task.status.slice(1)}</div>
                <div class="rd-task-actions">
                    ${['failed', 'cancelled'].includes(task.status) ? `<button class="rd-task-button rd-task-retry" data-id="${task.id}">⟳</button>` : ''}
                    <button class="rd-task-button rd-task-remove" data-id="${task.id}">×</button>
                    ${task.rdTorrentId ? `<button class="rd-task-button rd-task-delete-rd" data-id="${task.id}" title="Delete from Real-Debrid">🗑️</button>` : ''}
                </div>
            `;
            list.appendChild(taskEl);
        });

        list.querySelectorAll('.rd-task-retry').forEach(btn => {
            btn.addEventListener('click', () => retryTask(btn.dataset.id));
        });

        list.querySelectorAll('.rd-task-remove, .rd-task-delete-rd').forEach(btn => {
            btn.addEventListener('click', () => removeTask(btn.dataset.id));
        });

        if (filteredTasks.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No tasks found</div>';
        }
    }

    function retryTask(taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            tasks = tasks.filter(t => t.id !== taskId);
            const newTask = {
                ...task,
                id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                status: 'pending',
                statusText: 'Retrying...',
                progress: 0,
                retries: task.retries + 1,
                timestamp: Date.now()
            };
            activeTasks[newTask.id] = newTask;
            clickedHashes[newTask.hash] = true;
            GM_setValue(storageKeys.clickedHashes, JSON.stringify(clickedHashes));
            startProcessing(newTask.magnet, null, newTask.mode, newTask.id);
            updateTaskManager();
        }
    }

    function removeTask(taskId) {
        if (activeTasks[taskId]) {
            const task = activeTasks[taskId];
            if (task.rdTorrentId && event.target.classList.contains('rd-task-delete-rd')) {
                rdAPI(`/torrents/delete/${task.rdTorrentId}`, 'DELETE')
                    .catch(error => showStatus(`RD Delete Failed: ${error}`, '#e74c3c', 5000));
            }

            task.status = 'cancelled';
            task.statusText = 'Cancelled by user';
            tasks.push(task);
            delete activeTasks[taskId];
            delete clickedHashes[task.hash];
            GM_setValue(storageKeys.clickedHashes, JSON.stringify(clickedHashes));
        }
        tasks = tasks.filter(t => t.id !== taskId);
        saveActiveTasks();
        updateTaskManager();
    }

    async function startProcessing(magnetUrl, button, mode, taskId = null) {
        const hash = getMagnetHash(magnetUrl);
        if (!taskId) taskId = addTask(magnetUrl, mode, button?.closest('tr')?.querySelector('td')?.textContent?.trim() || '');

        try {
            let task = activeTasks[taskId];
            let rdTorrentId = task?.rdTorrentId;
            let torrentInfo = task?.torrentInfo;
            let videoFiles = task?.videoFiles;

            const existingCompleted = [...tasks, ...Object.values(activeTasks)].find(t =>
                t.hash === hash &&
                ['completed', 'done'].includes(t.status) &&
                t.mode === mode
            );

            if (existingCompleted) {
                if (mode === 'symlink' && existingCompleted.result?.path) {
                    GM_setClipboard(existingCompleted.result.path);
                    completeTask(taskId, true, existingCompleted.result);
                    showStatus('Existing symlink copied!', '#2ecc71', 3000);
                    return;
                }
                throw new Error('This magnet has already been processed');
            }

            if (!rdTorrentId) {
                updateTask(taskId, {
                    status: 'processing',
                    statusText: 'Adding magnet...',
                    progress: 0
                });

                const { id } = await rdAPI('/torrents/addMagnet', 'POST', `magnet=${encodeURIComponent(magnetUrl)}`);
                rdTorrentId = id;
                updateTask(taskId, {
                    rdTorrentId,
                    status: 'processing',
                    statusText: 'Analyzing files...',
                    progress: 10
                });
            }

            if (!torrentInfo || !videoFiles) {
                while (activeTasks[taskId]) {
                    torrentInfo = await rdAPI(`/torrents/info/${rdTorrentId}`);
                    updateTask(taskId, { torrentInfo });

                    updateTask(taskId, {
                        status: 'processing',
                        statusText: `Processing files (${torrentInfo.status})`,
                        progress: Math.min(30, task.progress + 2)
                    });

                    if (torrentInfo.status === 'waiting_files_selection') break;
                    await new Promise(r => setTimeout(r, 3000));
                }

                videoFiles = torrentInfo.files.filter(f => {
                    const path = f.path || '';
                    const fileName = path.split(/[\\/]/).pop() || '';
                    const ext = fileName.split('.').pop()?.toLowerCase() || '';
                    return config.videoExtensions.has(ext) &&
                           f.bytes >= config.minFileSize &&
                           !fileName.toLowerCase().includes('sample');
                }).sort((a, b) => b.bytes - a.bytes);

                if (videoFiles.length === 0) throw new Error("No supported video files found");
                updateTask(taskId, { videoFiles });

                if (!torrentInfo.files_selected) {
                    await rdAPI(`/torrents/selectFiles/${rdTorrentId}`, 'POST', `files=${videoFiles.map(f => f.id).join(',')}`);
                    updateTask(taskId, {
                        status: 'downloading',
                        statusText: 'Starting download...',
                        progress: 35
                    });
                }
            }

            let lastProgress = task?.progress || 0;
            while (activeTasks[taskId]) {
                const downloadStatus = await rdAPI(`/torrents/info/${rdTorrentId}`);
                updateTask(taskId, { downloadStatus });

                const currentProgress = Math.round(downloadStatus.progress);
                if (currentProgress !== lastProgress) {
                    updateTask(taskId, {
                        status: 'downloading',
                        progress: 35 + (currentProgress * 0.65),
                        statusText: `Downloading: ${currentProgress}% (${formatSpeed(downloadStatus.speed)})`
                    });
                    lastProgress = currentProgress;
                }

                if (['downloaded', 'seeding'].includes(downloadStatus.status)) break;
                if (['error', 'virus'].includes(downloadStatus.status)) throw new Error(downloadStatus.status);

                await new Promise(r => setTimeout(r, 3000));
            }

            if (mode === 'symlink') {
                if (task.result?.path) {
                    GM_setClipboard(task.result.path);
                    completeTask(taskId, true, task.result);
                    return;
                }

                updateTask(taskId, {
                    status: 'symlinking',
                    progress: 95,
                    statusText: 'Finalizing symlink...'
                });

                const fullPath = videoFiles[0].path || '';
                const fileName = fullPath.split(/[\\/]/).pop();
                const [baseName] = fileName.match(/(.*?)(\.[^.]*)?$/) || [fileName];
                const cleanDirName = baseName
                    .replace(/[<>:"/\\|?*]/g, '_')
                    .substring(0, 200);

                try {
                    const symlinkResult = await backendAPI('/symlink', {
                        hash,
                        filename: cleanDirName,
                        torrent_id: rdTorrentId
                    });

                    const symlinkPath = symlinkResult.path ||
                                      `${symlinkResult.directory}/${fileName}`;

                    if (!symlinkPath) throw new Error('Symlink path not received');

                    GM_setClipboard(symlinkPath);
                    completeTask(taskId, true, { path: symlinkPath });
                    showStatus('Symlink ready! Copied to clipboard.', '#2ecc71', 3000);
                } catch (error) {
                    if (error.path) {
                        GM_setClipboard(error.path);
                        completeTask(taskId, true, { path: error.path });
                        showStatus('Symlink already exists! Copied to clipboard.', '#2ecc71', 3000);
                    } else {
                        throw error;
                    }
                }
            } else {
                completeTask(taskId, true);
            }
        } catch (error) {
            completeTask(taskId, false, { error: error.message });
            if (button) {
                button.textContent = '✗ Failed';
                button.style.background = '#e74c3c';
            }
            showStatus(`Failed: ${error.message}`, '#e74c3c', 5000);
        }
    }

    function formatSpeed(bytesPerSecond) {
        if (!bytesPerSecond) return '0 B/s';
        const speeds = ['B/s', 'KB/s', 'MB/s'];
        let speed = bytesPerSecond;
        let unitIndex = 0;
        while (speed >= 1024 && unitIndex < speeds.length - 1) {
            speed /= 1024;
            unitIndex++;
        }
        return `${speed.toFixed(unitIndex === 0 ? 0 : 1)} ${speeds[unitIndex]}`;
    }

    function addTask(magnet, mode, filename = '') {
        const hash = getMagnetHash(magnet);
        const existing = Object.values(activeTasks).find(t => t.hash === hash && t.mode === mode);
        if (existing) return existing.id;

        const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        activeTasks[taskId] = {
            id: taskId,
            hash,
            magnet,
            name: getMagnetName(magnet),
            mode,
            filename,
            status: 'pending',
            progress: 0,
            timestamp: Date.now(),
            retries: 0
        };

        clickedHashes[hash] = true;
        GM_setValue(storageKeys.clickedHashes, JSON.stringify(clickedHashes));
        saveActiveTasks();
        return taskId;
    }

    function updateTask(taskId, updates) {
        if (activeTasks[taskId]) {
            activeTasks[taskId] = { ...activeTasks[taskId], ...updates };
            saveActiveTasks();
            updateTaskManager();
            debouncedUpdateButtonStates();
        }
    }

    function completeTask(taskId, success, result = null) {
        if (activeTasks[taskId]) {
            const task = activeTasks[taskId];
            task.status = success ? 'completed' : 'failed';
            task.progress = success ? 100 : 0;
            task.timestamp = Date.now();
            task.statusText = success ? 'Completed successfully' : 'Failed';
            if (result) task.result = result;

            tasks.push(task);
            delete activeTasks[taskId];
            saveActiveTasks();
            updateTaskManager();
            debouncedUpdateButtonStates();
        }
    }

    function debouncedUpdateButtonStates() {
        clearTimeout(updateButtonStatesTimeout);
        updateButtonStatesTimeout = setTimeout(updateButtonStates, 100);
    }

    function updateButtonStates() {
        uw.document.querySelectorAll('.rd-magnet-button').forEach(btn => {
            const magnet = btn.getAttribute('data-magnet');
            if (!magnet) return;

            const hash = getMagnetHash(magnet);
            const task = [...Object.values(activeTasks), ...tasks].find(t => t.hash === hash);

            if (task) {
                btn.textContent = {
                    pending: '⏳ Pending',
                    processing: '⏳ Processing',
                    downloading: '⏳ Downloading',
                    symlinking: '⏳ Symlinking',
                    completed: '✓ Completed',
                    done: '✓ Done',
                    failed: '✗ Failed',
                    cancelled: '✗ Cancelled'
                }[task.status] || 'RD';

                btn.style.background = {
                    pending: '#f39c12',
                    processing: '#3498db',
                    downloading: '#2980b9',
                    symlinking: '#9b59b6',
                    completed: '#2ecc71',
                    done: '#95a5a6',
                    failed: '#e74c3c',
                    cancelled: '#e74c3c'
                }[task.status] || '#2ecc71';

                btn.disabled = ['completed', 'done', 'failed', 'cancelled'].includes(task.status);
            } else {
                btn.textContent = clickedHashes[hash] ? '✓ Processed' : 'RD';
                btn.style.background = clickedHashes[hash] ? '#95a5a6' : '#2ecc71';
                btn.disabled = !!clickedHashes[hash];
            }
        });
    }

    function markAsDone(magnetUrl) {
        const hash = getMagnetHash(magnetUrl);
        if (!hash) return;

        const existingTask = tasks.find(t => t.hash === hash) || Object.values(activeTasks).find(t => t.hash === hash);

        if (existingTask) {
            existingTask.status = 'done';
            existingTask.progress = 100;
        } else {
            tasks.push({
                id: `done_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                hash,
                magnet: magnetUrl,
                name: getMagnetName(magnetUrl),
                status: 'done',
                progress: 100,
                timestamp: Date.now(),
                retries: 0
            });
        }

        clickedHashes[hash] = true;
        GM_setValue(storageKeys.clickedHashes, JSON.stringify(clickedHashes));
        saveActiveTasks();
        updateButtonStates();
        showStatus("Marked as done!", '#2ecc71', 2000);
    }

    async function initUI() {
        try {
            const isBackendAlive = await new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${config.backendUrl}/health`,
                    timeout: 5000,
                    onload: (res) => resolve(res.status === 200),
                    onerror: () => resolve(false)
                });
            });

            if (!isBackendAlive) {
                showStatus("Backend server unreachable!", '#e74c3c', 5000);
                return;
            }

            createTaskManager();
            createTaskManagerToggle();
            updateTaskManager();

            const observer = new uw.MutationObserver(() => {
                uw.document.querySelectorAll('a[href^="magnet:"]').forEach(link => {
                    if (!link.nextElementSibling?.classList?.contains('rd-magnet-button')) {
                        const btn = uw.document.createElement('button');
                        btn.className = 'rd-magnet-button';
                        btn.setAttribute('data-magnet', link.href);
                        btn.addEventListener('click', handleButtonClick);
                        link.parentNode.insertBefore(btn, link.nextSibling);
                    }
                });
                debouncedUpdateButtonStates();
            });

            observer.observe(uw.document.body, { childList: true, subtree: true });
            debouncedUpdateButtonStates();

            Object.values(activeTasks).forEach(task => {
                if (['pending', 'processing', 'downloading', 'symlinking'].includes(task.status)) {
                    startProcessing(task.magnet, null, task.mode, task.id)
                        .catch(() => updateTask(task.id, { status: 'failed' }));
                }
            });
        } catch (error) {
            showStatus("Extension initialization failed!", '#e74c3c', 5000);
        }
    }

    function handleButtonClick(e) {
        const button = e.currentTarget;
        const magnetLink = button.getAttribute('data-magnet');
        if (!magnetLink) return;

        const hash = getMagnetHash(magnetLink);
        const existingTask = tasks.find(t => t.hash === hash && ['completed', 'done'].includes(t.status));
        if (existingTask) {
            showStatus('Already available!', '#2ecc71', 3000);
            return;
        }

        const menu = uw.document.createElement('div');
        menu.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 99999;
        `;

        ['Cache Only', 'Cache + Symlink', 'Mark as Done'].forEach((text, index) => {
            const item = uw.document.createElement('div');
            item.textContent = text;
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                background: ${index === 2 ? '#f8f9fa' : 'white'};
                border-bottom: ${index < 2 ? '1px solid #eee' : 'none'};
                white-space: nowrap;
            `;
            item.onmouseenter = () => item.style.background = '#f0f0f0';
            item.onmouseleave = () => item.style.background = index === 2 ? '#f8f9fa' : 'white';
            item.onclick = () => {
                menu.remove();
                handleMenuChoice(index, magnetLink, button);
            };
            menu.appendChild(item);
        });

        const rect = button.getBoundingClientRect();
        menu.style.top = `${rect.bottom + uw.scrollY}px`;
        menu.style.left = `${rect.left + uw.scrollX}px`;
        uw.document.body.appendChild(menu);

        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.remove();
                uw.document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => uw.document.addEventListener('click', closeMenu), 0);
    }

    function handleMenuChoice(index, magnetLink, button) {
        switch(index) {
            case 0:
                addTask(magnetLink, 'cache');
                startProcessing(magnetLink, button, 'cache');
                break;
            case 1:
                addTask(magnetLink, 'symlink');
                startProcessing(magnetLink, button, 'symlink');
                break;
            case 2:
                markAsDone(magnetLink);
                break;
        }
        debouncedUpdateButtonStates();
    }

    function showStatus(message, color = '#3498db', timeout = 0) {
        const existing = uw.document.getElementById('rd-status-message');
        if (existing) existing.remove();

        const msg = uw.document.createElement('div');
        msg.id = 'rd-status-message';
        msg.textContent = message;
        msg.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            padding: 10px 15px;
            background: ${color};
            color: white;
            border-radius: 5px;
            z-index: 99999;
            font-family: sans-serif;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            max-width: 80vw;
        `;

        uw.document.body.appendChild(msg);
        if (timeout > 0) setTimeout(() => msg.remove(), timeout);
    }

    async function rdAPI(endpoint, method = 'GET', data = null, retries = config.maxRetries) {
        try {
            return await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: method,
                    url: `https://api.real-debrid.com/rest/1.0${endpoint}`,
                    headers: {
                        'Authorization': `Bearer ${config.rdApiKey}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    data: data,
                    timeout: 15000,
                    onload: (res) => {
                        try {
                            const response = res.responseText ? JSON.parse(res.responseText) : {};
                            res.status >= 200 && res.status < 300 ? resolve(response) : reject(response.error || `HTTP ${res.status}`);
                        } catch (e) { reject(`Parse error: ${e.message}`); }
                    },
                    onerror: (err) => reject(err.statusText || 'Connection failed')
                });
            });
        } catch (error) {
            if (retries > 0) {
                await new Promise(r => setTimeout(r, config.retryDelay));
                return rdAPI(endpoint, method, data, retries - 1);
            }
            throw error;
        }
    }

    async function backendAPI(endpoint, data = {}, retries = config.maxRetries) {
        try {
            return await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${config.backendUrl}${endpoint}`,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify(data),
                    timeout: 20000,
                    onload: (res) => {
                        try {
                            const response = JSON.parse(res.responseText);
                            if (res.status === 200) {
                                if (response.error) {
                                    if (response.error.includes('Symlink already exists')) {
                                        resolve({ path: response.path || response.directory });
                                    } else {
                                        reject(response.error);
                                    }
                                } else {
                                    resolve(response);
                                }
                            } else {
                                reject(response.error || res.statusText);
                            }
                        } catch { reject(`Invalid JSON: ${res.responseText.slice(0, 100)}`); }
                    },
                    onerror: (err) => reject(err.statusText || 'Backend connection failed')
                });
            });
        } catch (error) {
            if (retries > 0) {
                await new Promise(r => setTimeout(r, config.retryDelay));
                return backendAPI(endpoint, data, retries - 1);
            }

            if (typeof error === 'string') {
                if (error.includes('Symlink already exists')) {
                    const pathMatch = error.match(/at (.+)/);
                    if (pathMatch) return { path: pathMatch[1] };
                }
            }
            throw error;
        }
    }

    if (uw.document.readyState === 'loading') {
        uw.document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
