/**
 * Camera status and settings module
 */

// --- DOM Elements ---
const statusConnection = document.getElementById('status-connection');
const statusModel = document.getElementById('status-model');
const statusMessage = document.getElementById('status-message');
const btnRefreshSettings = document.getElementById('btn-refresh-settings');
const cameraSettingsContainer = document.getElementById('camera-settings-container');
const cameraSettingsCollapsible = document.getElementById('camera-settings-collapsible');
const btnCaptureSingle = document.getElementById('btn-capture-single');
const captureStatus = document.getElementById('capture-status');

// --- State ---
const openMenus = new Set(); // To track which settings menus are open

// --- Camera Status ---
async function getCameraStatus() {
    console.log("Getting camera status...");
    if (!statusConnection || !statusModel || !statusMessage) {
        console.error("Status elements not found in DOM.");
        return;
    }

    // Set initial checking state
    statusConnection.textContent = 'Checking...';
    statusModel.textContent = 'N/A';
    statusMessage.textContent = '';

    const data = await fetchApi('/api/camera/status');
    
    // Handle disconnected state (null data or failed fetch) same as explicit disconnected status
    if (!data || !data.connected) {
        statusConnection.textContent = 'Disconnected';
        statusConnection.style.color = 'red';
        statusModel.textContent = 'N/A';
        statusMessage.textContent = data?.message || 'Camera not connected';
        
        // Disable all controls
        disableAllControls();
        return;
    }

    // Handle connected state
    statusConnection.textContent = 'Connected';
    statusConnection.style.color = 'green';
    statusModel.textContent = data.model || 'N/A';
    statusMessage.textContent = data.message || '';

    // Update buttons based on current state
    updateButtonStates();
}

function disableAllControls() {
    // Get all controls that should be disabled when camera is disconnected
    const btnStartPreview = document.getElementById('btn-start-preview');
    const btnStopPreview = document.getElementById('btn-stop-preview');
    const btnStartTimelapse = document.getElementById('btn-start-timelapse');
    const btnStopTimelapse = document.getElementById('btn-stop-timelapse');
    
    const controls = [btnStartPreview, btnStopPreview, btnCaptureSingle, 
                     btnStartTimelapse, btnStopTimelapse];
    controls.forEach(btn => {
        if (btn) btn.disabled = true;
    });
}

function updateButtonStates() {
    // Update buttons based on current state
    const btnStartPreview = document.getElementById('btn-start-preview');
    const btnStopPreview = document.getElementById('btn-stop-preview');
    const btnStartTimelapse = document.getElementById('btn-start-timelapse');
    const btnStopTimelapse = document.getElementById('btn-stop-timelapse');
    const selectImageType = document.getElementById('select-image-type');
    const imageTypeNote = document.getElementById('image-type-note');

    // Get state from window (shared with other modules)
    const isPreviewActive = window.isPreviewActive || false;
    const isTimelapseActive = window.isTimelapseActive || false;

    if (btnStartPreview) btnStartPreview.disabled = isPreviewActive;
    if (btnStopPreview) btnStopPreview.disabled = !isPreviewActive;
    if (btnCaptureSingle) btnCaptureSingle.disabled = isTimelapseActive;
    if (btnStartTimelapse) btnStartTimelapse.disabled = isTimelapseActive;
    if (btnStopTimelapse) btnStopTimelapse.disabled = !isTimelapseActive;

    if (selectImageType && !selectImageType.dataset.unavailable) {
        selectImageType.disabled = isTimelapseActive;
        selectImageType.title = isTimelapseActive ? 'Timelapse uses JPEG only' : '';
    }
    if (imageTypeNote) {
        imageTypeNote.classList.toggle('hidden', !isTimelapseActive);
    }
}

// --- Camera Settings ---
async function getCameraSettings() {
    console.log("Getting camera settings...");
    if (!cameraSettingsCollapsible) {
        console.error("Camera settings container not found in DOM.");
        return;
    }

    cameraSettingsCollapsible.innerHTML = '<p class="text-center text-gray-500">Loading settings...</p>';
    const data = await fetchApi('/api/camera/settings', {}, false);

    if (!data) {
        cameraSettingsCollapsible.innerHTML = '<p class="text-center text-gray-500">No settings available - camera not connected.</p>';
        return;
    }

    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        cameraSettingsCollapsible.innerHTML = '';
        populateCollapsibleSettings(data, cameraSettingsCollapsible);

        // Restore the state of open menus
        cameraSettingsCollapsible.querySelectorAll('.collapsible-header').forEach(header => {
            const content = header.nextElementSibling;
            if (openMenus.has(header.dataset.key)) {
                content.classList.remove('hidden');
                header.querySelector('.toggle-icon').textContent = '-';
            }
        });
    } else {
        cameraSettingsCollapsible.innerHTML = '<p class="text-center text-gray-500">No settings available.</p>';
    }
}

function populateCollapsibleSettings(settings, container) {
    for (const [key, value] of Object.entries(settings)) {
        // Create a collapsible section for each top-level setting
        const section = document.createElement('div');
        section.className = 'mb-4';

        const header = document.createElement('div');
        header.className = 'collapsible-header flex justify-between items-center cursor-pointer bg-gray-100 px-4 py-2 border border-gray-300';
        header.dataset.key = key; // Add a unique identifier for tracking
        header.innerHTML = `
            <span class="font-semibold">${value.label || key}</span>
            <span class="toggle-icon">+</span>
        `;

        const content = document.createElement('div');
        content.className = 'collapsible-content hidden border border-t-0 border-gray-300 px-4 py-2';

        // Populate individual settings or child settings
        if (value.children) {
            for (const [childKey, childValue] of Object.entries(value.children)) {
                const settingRow = document.createElement('div');
                settingRow.className = 'flex justify-between items-center py-1';
                settingRow.innerHTML = `
                    <span>${childValue.label || childKey}</span>
                    <span>${childValue.value || 'N/A'}</span>
                `;
                content.appendChild(settingRow);
            }
        } else {
            const settingRow = document.createElement('div');
            settingRow.className = 'flex justify-between items-center py-1';
            settingRow.innerHTML = `
                <span>${value.label || key}</span>
                <span>${value.value || 'N/A'}</span>
            `;
            content.appendChild(settingRow);
        }

        // Attach click event listener to toggle visibility
        header.addEventListener('click', () => {
            content.classList.toggle('hidden');
            const toggleIcon = header.querySelector('.toggle-icon');
            const isHidden = content.classList.contains('hidden');
            toggleIcon.textContent = isHidden ? '+' : '-';
            
            // Track open/closed state
            if (isHidden) {
                openMenus.delete(header.dataset.key);
            } else {
                openMenus.add(header.dataset.key);
            }
        });

        section.appendChild(header);
        section.appendChild(content);
        container.appendChild(section);
    }
}

// --- Setting a Camera Setting ---
async function setCameraSetting(settingName, value) {
    if (!settingName) {
        console.error('setCameraSetting called with no settingName');
        return;
    }
    console.log(`Setting ${settingName} to ${value}`);
    
    try {
        const response = await fetchApi(`/api/camera/setting/${settingName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: value })
        }, false); // Don't show loading spinner
        
        if (response && response.success) {
            console.log(`Successfully set ${settingName} to ${value}`);
        } else {
            console.error(`Failed to set ${settingName} to ${value}:`, response?.message || 'Unknown error');
            // Don't alert - too disruptive during initialization
        }
    } catch (err) {
        console.error(`Exception setting ${settingName} to ${value}:`, err);
    }
}

// --- Single Capture ---
async function captureSingle() {
    console.log("Triggering single capture...");
    if (captureStatus) captureStatus.textContent = 'Capturing...';
    disableControls(true); // Disable buttons during capture

    const data = await fetchApi('/api/capture/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    if (data && data.success) {
        if (captureStatus) captureStatus.textContent = `Success: ${data.message || 'Image captured.'}`;
        console.log("File saved:", data.filepath);
        
        // If timelapse list exists, refresh it
        if (typeof window.listTimelapses === 'function') {
            window.listTimelapses();
        }
    } else {
        if (captureStatus) captureStatus.textContent = `Error: ${data?.message || 'Capture failed.'}`;
        alert(`Capture failed: ${data?.message || 'Unknown error. Check logs.'}`);
    }
    
    // Re-enable controls based on current status, not just blindly enabling
    getCameraStatus();
}

// --- Capture Settings Dropdowns (Resolution, Image Type) ---
const RESOLUTION_PREF_KEY = 'capture_pref_resolution';
const IMAGE_TYPE_PREF_KEY = 'capture_pref_image_type';

function readPref(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function writePref(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn(`Could not persist ${key}:`, e);
    }
}

function markDropdownUnavailable(selectEl, label) {
    selectEl.innerHTML = `<option>${label}</option>`;
    selectEl.disabled = true;
    selectEl.dataset.unavailable = 'true';
}

function pickLargestResolution(choices) {
    let best = null;
    let bestPixels = -1;
    for (const c of choices) {
        const m = c.match(/(\d+)\s*[xX×]\s*(\d+)/);
        if (m) {
            const p = parseInt(m[1], 10) * parseInt(m[2], 10);
            if (p > bestPixels) { bestPixels = p; best = c; }
        }
    }
    if (best) return best;
    for (const pref of ['Large', 'L']) {
        const found = choices.find(c => c === pref || c.startsWith(pref + ':') || c.startsWith(pref + ' '));
        if (found) return found;
    }
    return choices[0] || null;
}

function formatResolutionChoice(choice) {
    // If choice already contains dimensions (e.g., "6000x4000"), return as-is
    if (/\d+[xX×]\d+/.test(choice)) {
        return choice;
    }
    // Otherwise, it's a label like "Large" or "L:3:2" - keep it but note it's a label
    return choice;
}

function populateSelect(selectEl, choices, selected) {
    selectEl.innerHTML = '';
    choices.forEach(choice => {
        const opt = document.createElement('option');
        opt.value = choice;
        opt.textContent = choice;
        selectEl.appendChild(opt);
    });
    if (selected != null && choices.includes(selected)) {
        selectEl.value = selected;
    }
}

async function initResolutionDropdown() {
    const selectEl = document.getElementById('select-resolution');
    if (!selectEl) return;

    try {
        const data = await fetchApi('/api/camera/sizes', {}, false);
        if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
            markDropdownUnavailable(selectEl, 'Unavailable');
            console.warn('No resolution options available from camera');
            return;
        }

        const saved = readPref(RESOLUTION_PREF_KEY);
        let initial;
        if (saved && data.choices.includes(saved)) {
            initial = saved;
        } else if (data.current && data.choices.includes(String(data.current))) {
            initial = String(data.current);
        } else {
            initial = pickLargestResolution(data.choices);
        }

        populateSelect(selectEl, data.choices, initial);
        selectEl.dataset.settingName = data.setting;
        selectEl.disabled = !!data.readonly;

        if (initial && String(data.current) !== initial && !data.readonly) {
            console.log(`Setting initial resolution to ${initial}`);
            await setCameraSetting(data.setting, initial);
        }

        selectEl.addEventListener('change', async () => {
            const val = selectEl.value;
            if (!val) return;
            writePref(RESOLUTION_PREF_KEY, val);
            console.log(`Resolution changed to ${val}`);
            await setCameraSetting(selectEl.dataset.settingName, val);
        });
    } catch (err) {
        console.error('Failed to initialize resolution dropdown:', err);
        markDropdownUnavailable(selectEl, 'Error');
    }
}

async function initImageTypeDropdown() {
    const selectEl = document.getElementById('select-image-type');
    if (!selectEl) return;

    try {
        const data = await fetchApi('/api/camera/image-types', {}, false);
        if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
            markDropdownUnavailable(selectEl, 'Unavailable');
            console.warn('No image type options available from camera');
            return;
        }

        const saved = readPref(IMAGE_TYPE_PREF_KEY);
        let initial;
        if (saved && data.choices.includes(saved)) {
            initial = saved;
        } else if (data.current && data.choices.includes(String(data.current))) {
            initial = String(data.current);
        } else {
            initial = data.choices[0];
        }

        populateSelect(selectEl, data.choices, initial);
        selectEl.dataset.settingName = data.setting;

        if (initial && String(data.current) !== initial && !data.readonly) {
            console.log(`Setting initial image type to ${initial}`);
            await setCameraSetting(data.setting, initial);
        }

        selectEl.addEventListener('change', async () => {
            const val = selectEl.value;
            if (!val) return;
            writePref(IMAGE_TYPE_PREF_KEY, val);
            console.log(`Image type changed to ${val}`);
            await setCameraSetting(selectEl.dataset.settingName, val);
        });

        // Ensure correct initial disabled/tooltip state if a timelapse is already running.
        updateButtonStates();
    } catch (err) {
        console.error('Failed to initialize image type dropdown:', err);
        markDropdownUnavailable(selectEl, 'Error');
    }
}

// --- Event Listeners ---
// Set up event listeners when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log("Camera.js: DOM loaded");

    // Refresh button
    if (btnRefreshSettings) {
        btnRefreshSettings.addEventListener('click', async () => {
            await getCameraStatus();  // Get status first
            await getCameraSettings(); // Then refresh settings
        });
    }

    // Capture button
    if (btnCaptureSingle) {
        btnCaptureSingle.addEventListener('click', captureSingle);
    }

    // Settings changes using event delegation
    if (cameraSettingsContainer) {
        cameraSettingsContainer.addEventListener('change', (event) => {
            const target = event.target;
            // Check if the changed element is one of our setting controls AND not disabled
            if (target.dataset.settingName && !target.disabled &&
                (target.tagName === 'SELECT' || target.type === 'checkbox' ||
                 target.type === 'text' || target.type === 'range')) {
                // Range input 'change' event is handled directly to avoid duplicate calls
                if (target.type !== 'range') {
                    const value = target.type === 'checkbox' ? (target.checked ? 1 : 0) : target.value;
                    setCameraSetting(target.dataset.settingName, value);
                }
            }
        });
    }

    // Initial data loading
    getCameraStatus();
    getCameraSettings();
    initResolutionDropdown();
    initImageTypeDropdown();
});

// --- Exports ---
// Make functions available to other modules
window.getCameraStatus = getCameraStatus;
window.setCameraSetting = setCameraSetting;
window.updateButtonStates = updateButtonStates;