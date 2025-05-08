/**
 * Camera preview control module
 */

// --- DOM Elements ---
const livePreviewImage = document.getElementById('live-preview-image');
const previewError = document.getElementById('preview-error');
const btnStartPreview = document.getElementById('btn-start-preview');
const btnStopPreview = document.getElementById('btn-stop-preview');
const previewLandscape = document.getElementById('preview-landscape');
const previewPortrait = document.getElementById('preview-portrait');
const previewContainer = document.getElementById('preview-container');
const previewRateInput = document.getElementById('preview-rate');
const previewFlip = document.getElementById('preview-flip');

// --- State ---
let previewIntervalId = null;
let previewRefreshRate = 1000; // Milliseconds (matches 1 FPS default)
window.isPreviewActive = false;

// --- Live Preview ---
async function startPreview(rotation = null) {
    console.log("Starting preview...");
    if (window.isPreviewActive) {
        console.warn("Preview start requested but already active.");
        return;
    }

    // Determine initial rotation from radio buttons if not specified
    if (rotation === null) {
        rotation = previewPortrait && previewPortrait.checked ? 90 : 0;
    }
    const flip = previewFlip ? previewFlip.checked : false;
    console.log(`Starting preview with ${rotation}° rotation, flip: ${flip}`);

    // Configure container aspect ratio only
    if (previewContainer) {
        previewContainer.style.aspectRatio = rotation === 90 ? '2/3' : '3/2';
    }
    if (livePreviewImage) {
        livePreviewImage.classList.remove('hidden');
        livePreviewImage.src = ''; // Clear any previous image
        // No client-side transform needed - all handled by Python
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
            rotation: rotation,
            flip: flip
        })
    });

    if (data && data.success) {
        console.log(`Preview started backend. Refresh interval: ${previewRefreshRate}ms`);
        window.isPreviewActive = true;
        if (btnStopPreview) btnStopPreview.disabled = false;
        
        previewIntervalId = setInterval(() => {
            const timestamp = new Date().getTime();
            if (livePreviewImage) {
                // Use the correct URL for the preview image (match Flask route)
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
        livePreviewImage.classList.add('hidden');  // Hide the image
        livePreviewImage.src = '';  // Clear the source
    }
    if (!window.isPreviewActive && !previewIntervalId) {
        console.log("Stop preview called but not active.");
        // Ensure buttons are correct even if called when not active
        if (btnStartPreview) btnStartPreview.disabled = false;
        if (btnStopPreview) btnStopPreview.disabled = true;
        return Promise.resolve(); // Return resolved promise
    }

    if (previewIntervalId) {
        clearInterval(previewIntervalId);
        previewIntervalId = null;
        console.log("Frontend preview refresh stopped.");
    }
    window.isPreviewActive = false;
    // Disable stop immediately, Start will be re-enabled by getCameraStatus
    if (btnStopPreview) btnStopPreview.disabled = true;

    // Tell the backend to stop generating previews
    // Use try/finally to ensure getCameraStatus runs even if fetch fails
    try {
        await fetchApi('/api/preview/stop', { method: 'POST' });
    } catch(e) {
        console.error("Error calling stop preview API:", e);
    } finally {
        // Refresh camera status to update button states correctly based on actual camera state
        if (typeof window.getCameraStatus === 'function') {
            await window.getCameraStatus(); // Wait for status update before resolving
        }
    }
}

function restartPreviewWithSettings() {
    if (window.isPreviewActive) {
        const rotation = previewPortrait && previewPortrait.checked ? 90 : 0;
        const flip = previewFlip && previewFlip.checked;
        stopPreview().then(() => startPreview(rotation, flip));
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Preview.js: DOM loaded");
    
    // Start/Stop preview buttons
    if (btnStartPreview) {
        btnStartPreview.addEventListener('click', () => {
            const rotation = previewPortrait && previewPortrait.checked ? 90 : 0;
            startPreview(rotation);
        });
    }
    
    if (btnStopPreview) {
        btnStopPreview.addEventListener('click', stopPreview);
    }
    
    // Preview orientation buttons
    if (previewLandscape && previewPortrait && previewContainer) {
        previewLandscape.addEventListener('change', () => {
            if (previewContainer) {
                previewContainer.style.aspectRatio = '3/2';
            }
            restartPreviewWithSettings();
        });
        
        previewPortrait.addEventListener('change', () => {
            if (previewContainer) {
                previewContainer.style.aspectRatio = '2/3';
            }
            restartPreviewWithSettings();
        });
    }
    
    // Flip checkbox
    if (previewFlip) {
        previewFlip.addEventListener('change', restartPreviewWithSettings);
    }
    
    // Preview rate change
    if (previewRateInput) {
        previewRateInput.addEventListener('change', () => {
            const newRate = parseFloat(previewRateInput.value);
            if (!isNaN(newRate) && newRate > 0) {
                previewRefreshRate = Math.max(100, 1000 / newRate);
                if (window.isPreviewActive) {
                    console.log("Preview rate changed, restarting preview...");
                    // Stop preview, then start it again once stop is complete
                    stopPreview().then(() => {
                        startPreview();
                    });
                }
            } else {
                // Reset to default or show error if invalid
                previewRateInput.value = (1.0 / (previewRefreshRate / 1000)).toFixed(1);
            }
        });
    }
});

// --- Exports ---
// Make functions available to other modules
window.startPreview = startPreview;
window.stopPreview = stopPreview;