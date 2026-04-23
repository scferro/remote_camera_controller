/**
 * Camera preview control module
 */

// --- DOM Elements ---
const livePreviewImage = document.getElementById('live-preview-image');
const previewError = document.getElementById('preview-error');
const btnStartPreview = document.getElementById('btn-start-preview');
const btnStopPreview = document.getElementById('btn-stop-preview');
const previewContainer = document.getElementById('preview-container');
const previewRateInput = document.getElementById('preview-rate');

// --- State ---
let previewIntervalId = null;
let previewRefreshRate = 1000;
window.isPreviewActive = false;

// --- Live Preview ---
async function startPreview(rotation = null) {
    console.log("Starting preview...");
    if (window.isPreviewActive) {
        console.warn("Preview start requested but already active.");
        return;
    }

    if (rotation === null) {
        rotation = 0;
    }

    if (previewContainer) {
        previewContainer.style.aspectRatio = '3/2';
    }
    if (livePreviewImage) {
        livePreviewImage.classList.remove('hidden');
        livePreviewImage.src = '';
        livePreviewImage.style.transform = '';
    }

    if (btnStartPreview) btnStartPreview.disabled = true;
    if (btnStopPreview) btnStopPreview.disabled = true;

    const rate = previewRateInput ? parseFloat(previewRateInput.value) || 1.0 : 1.0;
    previewRefreshRate = Math.max(100, 1000 / rate);

    const data = await fetchApi('/api/preview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            rate: rate,
            rotation: rotation
        })
    });

    if (data && data.success) {
        console.log(`Preview started backend. Refresh interval: ${previewRefreshRate}ms`);
        window.isPreviewActive = true;
        if (btnStopPreview) btnStopPreview.disabled = false;

        previewIntervalId = setInterval(() => {
            const timestamp = new Date().getTime();
            if (livePreviewImage) {
                livePreviewImage.src = `/api/preview/image/preview.jpg?t=${timestamp}`;
                livePreviewImage.style.display = 'block';
            }
            if (previewError) previewError.classList.add('hidden');
        }, previewRefreshRate);

        if (livePreviewImage) {
            livePreviewImage.onerror = () => {
                console.error("Preview image failed to load during refresh.");
                if (livePreviewImage) livePreviewImage.style.display = 'none';
                if (previewError) previewError.classList.remove('hidden');
            };
        }
    } else {
        console.error("Failed to start preview on backend.");
        alert(`Failed to start preview. ${data?.message || 'Check camera connection and logs.'}`);
        if (btnStartPreview) btnStartPreview.disabled = false;
        if (btnStopPreview) btnStopPreview.disabled = true;
    }
}

async function stopPreview() {
    console.log("Stopping preview...");
    if (livePreviewImage) {
        livePreviewImage.classList.add('hidden');
        livePreviewImage.src = '';
    }
    if (!window.isPreviewActive && !previewIntervalId) {
        console.log("Stop preview called but not active.");
        if (btnStartPreview) btnStartPreview.disabled = false;
        if (btnStopPreview) btnStopPreview.disabled = true;
        return Promise.resolve();
    }

    if (previewIntervalId) {
        clearInterval(previewIntervalId);
        previewIntervalId = null;
        console.log("Frontend preview refresh stopped.");
    }
    window.isPreviewActive = false;
    if (btnStopPreview) btnStopPreview.disabled = true;

    try {
        await fetchApi('/api/preview/stop', { method: 'POST' });
    } catch(e) {
        console.error("Error calling stop preview API:", e);
    } finally {
        if (typeof window.getCameraStatus === 'function') {
            await window.getCameraStatus();
        }
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Preview.js: DOM loaded");

    if (btnStartPreview) {
        btnStartPreview.addEventListener('click', () => startPreview(0));
    }

    if (btnStopPreview) {
        btnStopPreview.addEventListener('click', stopPreview);
    }

    if (previewRateInput) {
        previewRateInput.addEventListener('change', () => {
            const newRate = parseFloat(previewRateInput.value);
            if (!isNaN(newRate) && newRate > 0) {
                previewRefreshRate = Math.max(100, 1000 / newRate);
                if (window.isPreviewActive) {
                    console.log("Preview rate changed, restarting preview...");
                    stopPreview().then(() => {
                        startPreview();
                    });
                }
            } else {
                previewRateInput.value = (1.0 / (previewRefreshRate / 1000)).toFixed(1);
            }
        });
    }
});

// --- Exports ---
window.startPreview = startPreview;
window.stopPreview = stopPreview;