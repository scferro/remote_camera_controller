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
    
    // Get state from window (shared with other modules)
    const isPreviewActive = window.isPreviewActive || false;
    const isTimelapseActive = window.isTimelapseActive || false;
    
    if (btnStartPreview) btnStartPreview.disabled = isPreviewActive;
    if (btnStopPreview) btnStopPreview.disabled = !isPreviewActive;
    if (btnCaptureSingle) btnCaptureSingle.disabled = isTimelapseActive;
    if (btnStartTimelapse) btnStartTimelapse.disabled = isTimelapseActive;
    if (btnStopTimelapse) btnStopTimelapse.disabled = !isTimelapseActive;
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
    console.log(`Setting ${settingName} to ${value}`);
    
    const response = await fetchApi(`/api/camera/setting/${settingName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value })
    });
    
    if (response && response.success) {
        console.log(`Successfully set ${settingName} to ${value}`);
    } else {
        console.error(`Failed to set ${settingName} to ${value}`);
        alert(`Failed to update setting: ${response?.message || 'Unknown error'}`);
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
});

// --- Exports ---
// Make functions available to other modules
window.getCameraStatus = getCameraStatus;
window.setCameraSetting = setCameraSetting;