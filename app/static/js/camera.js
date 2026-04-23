/**
 * Camera status module
 */

// --- DOM Elements ---
const statusConnection = document.getElementById('status-connection');
const statusModel = document.getElementById('status-model');
const statusMessage = document.getElementById('status-message');
const btnRefreshSettings = document.getElementById('btn-refresh-settings');
const btnCaptureSingle = document.getElementById('btn-capture-single');
const captureStatus = document.getElementById('capture-status');
const currentQualityDisplay = document.getElementById('current-quality');

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

    // Handle disconnected state
    if (!data || !data.connected) {
        statusConnection.textContent = 'Disconnected';
        statusConnection.style.color = 'red';
        statusModel.textContent = 'N/A';
        statusMessage.textContent = data?.message || 'Camera not connected';

        disableAllControls();
        if (currentQualityDisplay) currentQualityDisplay.textContent = '--';
        return;
    }

    // Handle connected state
    statusConnection.textContent = 'Connected';
    statusConnection.style.color = '#34d399';
    statusModel.textContent = data.model || 'N/A';
    statusMessage.textContent = data.message || '';

    // Update buttons based on current state
    updateButtonStates();

    // Fetch current quality setting
    updateQualityDisplay();

    // Auto-start preview if on the preview tab
    if (currentTabId === '#tab-preview' && !window.isPreviewActive && !window.isTimelapseActive) {
        console.log("Camera connected and on preview tab — auto-starting preview.");
        if (typeof window.startPreview === 'function') {
            window.startPreview();
        }
    }
}

async function updateQualityDisplay() {
    if (!currentQualityDisplay) return;

    const data = await fetchApi('/api/camera/quality', {}, false);
    if (data && data.current) {
        currentQualityDisplay.textContent = data.current;
    } else {
        currentQualityDisplay.textContent = 'N/A';
    }
}

function disableAllControls() {
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
    const btnStartPreview = document.getElementById('btn-start-preview');
    const btnStopPreview = document.getElementById('btn-stop-preview');
    const btnStartTimelapse = document.getElementById('btn-start-timelapse');
    const btnStopTimelapse = document.getElementById('btn-stop-timelapse');

    const isPreviewActive = window.isPreviewActive || false;
    const isTimelapseActive = window.isTimelapseActive || false;

    if (btnStartPreview) btnStartPreview.disabled = isPreviewActive;
    if (btnStopPreview) btnStopPreview.disabled = !isPreviewActive;
    if (btnCaptureSingle) btnCaptureSingle.disabled = isTimelapseActive;
    if (btnStartTimelapse) btnStartTimelapse.disabled = isTimelapseActive;
    if (btnStopTimelapse) btnStopTimelapse.disabled = !isTimelapseActive;
}

// --- Single Capture ---
async function captureSingle() {
    console.log("Triggering single capture...");
    if (captureStatus) captureStatus.textContent = 'Capturing...';
    disableControls(true);

    const data = await fetchApi('/api/capture/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    if (data && data.success) {
        if (captureStatus) captureStatus.textContent = `Success: ${data.message || 'Image captured.'}`;
        console.log("Capture result:", data.filepath);
    } else {
        if (captureStatus) captureStatus.textContent = `Error: ${data?.message || 'Capture failed.'}`;
        alert(`Capture failed: ${data?.message || 'Unknown error. Check logs.'}`);
    }

    getCameraStatus();
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Camera.js: DOM loaded");

    // Refresh button
    if (btnRefreshSettings) {
        btnRefreshSettings.addEventListener('click', async () => {
            await getCameraStatus();
        });
    }

    // Capture button
    if (btnCaptureSingle) {
        btnCaptureSingle.addEventListener('click', captureSingle);
    }

    // Initial data loading
    getCameraStatus();
});

// --- Exports ---
window.getCameraStatus = getCameraStatus;
window.updateQualityDisplay = updateQualityDisplay;