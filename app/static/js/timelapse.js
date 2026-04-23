/**
 * Timelapse control module
 */

// --- DOM Elements ---
const timelapseIntervalSeconds = document.getElementById('timelapse-interval-seconds');
const timelapseCount = document.getElementById('timelapse-count');

const btnStartTimelapse = document.getElementById('btn-start-timelapse');
const btnStopTimelapse = document.getElementById('btn-stop-timelapse');
const timelapseStatusMessage = document.getElementById('timelapse-status-message');
const timelapseProgress = document.getElementById('timelapse-progress');

// --- State ---
window.isTimelapseActive = false;
let timelapseStatusIntervalId = null;

// --- Stepper button logic ---
function setupStepperButtons() {
    document.querySelectorAll('.stepper-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input || input.disabled) return;
            const step = parseInt(btn.dataset.step) || 1;
            const min = parseInt(input.min) || 0;
            let val = parseInt(input.value) || 0;
            if (btn.classList.contains('stepper-inc')) {
                val += step;
            } else if (btn.classList.contains('stepper-dec')) {
                val = Math.max(min, val - step);
            }
            input.value = val;
            input.dispatchEvent(new Event('change'));
        });
    });
}

// --- Timelapse Input Functions ---
function getIntervalSeconds() {
    return parseInt(timelapseIntervalSeconds.value) || 0;
}

function updateDurationDisplay() {
    const intervalSeconds = getIntervalSeconds();
    const count = parseInt(timelapseCount.value) || 1;
    const totalSeconds = intervalSeconds * (count - 1);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const display = document.getElementById('duration-display');
    if (display) display.textContent = `${minutes}m ${seconds}s`;
}

// --- Timelapse Control Functions ---
async function startTimelapse() {
    console.log("Starting timelapse...");
    if (window.isTimelapseActive) {
        console.warn("Start timelapse requested but already active.");
        return;
    }

    const intervalSeconds = getIntervalSeconds();
    const count = parseInt(timelapseCount.value, 10);

    if (isNaN(intervalSeconds) || intervalSeconds <= 0 || isNaN(count) || count < 2) {
        alert("Please enter valid values. Interval must be > 0 and count must be >= 2.");
        return;
    }

    disableControls(true);
    if (btnStartTimelapse) btnStartTimelapse.disabled = true;
    if (btnStopTimelapse) btnStopTimelapse.disabled = false;

    const data = await fetchApi('/api/timelapse/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: intervalSeconds, count: count })
    });

    if (data && data.success) {
        window.isTimelapseActive = true;
        console.log("Timelapse started on backend.");
        if (timelapseStatusMessage) timelapseStatusMessage.textContent = "Started...";
        if (timelapseProgress) timelapseProgress.textContent = `0 / ${count}`;
        startTimelapseStatusPolling(count);

        // Auto-switch to timelapse tab
        if (typeof switchTab === 'function') {
            switchTab('#tab-timelapse');
        }
    } else {
        alert(`Failed to start timelapse: ${data?.message || 'Unknown error.'}`);
        if (typeof window.getCameraStatus === 'function') {
            window.getCameraStatus();
        }
    }
}

async function stopTimelapse() {
    console.log("Stopping timelapse...");
    if (!window.isTimelapseActive) {
        console.warn("Stop timelapse called but not active.");
        return;
    }

    if (btnStopTimelapse) btnStopTimelapse.disabled = true;

    const data = await fetchApi('/api/timelapse/stop', { method: 'POST' });

    if (data && data.success) {
        console.log("Timelapse stop signal sent.");
        if (timelapseStatusMessage) timelapseStatusMessage.textContent = "Stopping...";
    } else {
        alert(`Failed to send stop signal: ${data?.message || 'Unknown error.'}`);
        if (btnStopTimelapse) btnStopTimelapse.disabled = false;
    }
}

function startTimelapseStatusPolling(totalCount) {
    if (timelapseStatusIntervalId) clearInterval(timelapseStatusIntervalId);

    timelapseStatusIntervalId = setInterval(async () => {
        if (!window.isTimelapseActive && timelapseStatusIntervalId) {
            console.debug("Timelapse status polling stopped (client state inactive).");
            clearInterval(timelapseStatusIntervalId);
            timelapseStatusIntervalId = null;
            return;
        }

        const statusData = await fetchApi('/api/timelapse/status', {}, false);

        if (statusData) {
            if (timelapseStatusMessage) timelapseStatusMessage.textContent = statusData.message || 'Polling...';
            if (timelapseProgress) timelapseProgress.textContent = `${statusData.count || 0} / ${statusData.total || totalCount}`;

            const backendIsActive = statusData.active === true;
            if (!backendIsActive && window.isTimelapseActive) {
                console.log("Timelapse finished or stopped according to status poll.");

                clearInterval(timelapseStatusIntervalId);
                timelapseStatusIntervalId = null;
                window.isTimelapseActive = false;

                const wasPreviewActive = window.isPreviewActive;

                if (typeof window.getCameraStatus === 'function') {
                    window.getCameraStatus();
                }

                if (wasPreviewActive) {
                    console.log("Handling preview restart after timelapse completion...");
                    if (typeof window.stopPreview === 'function') {
                        window.stopPreview().then(() => {
                            console.log("Preview stopped, restarting in 2 seconds...");
                            setTimeout(() => {
                                if (typeof window.startPreview === 'function') {
                                    console.log("Restarting preview after timelapse completion...");
                                    window.startPreview();
                                }
                            }, 2000);
                        }).catch(e => {
                            console.error("Error stopping preview during timelapse completion:", e);
                            setTimeout(() => {
                                if (typeof window.startPreview === 'function') {
                                    window.startPreview();
                                }
                            }, 2000);
                        });
                    }
                }

                if (typeof window.listTimelapses === 'function') {
                    window.listTimelapses();
                }
            }
            else if (backendIsActive && !window.isTimelapseActive) {
                console.log("Detected active timelapse on backend during polling.");
                window.isTimelapseActive = true;
                if (typeof window.getCameraStatus === 'function') {
                    window.getCameraStatus();
                }
            }
        } else {
            console.error("Failed to get timelapse status during polling.");
        }
    }, 2000);
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Timelapse.js: DOM loaded");

    setupStepperButtons();

    if (btnStartTimelapse) {
        btnStartTimelapse.addEventListener('click', startTimelapse);
    }

    if (btnStopTimelapse) {
        btnStopTimelapse.addEventListener('click', stopTimelapse);
    }

    if (timelapseIntervalSeconds && timelapseCount) {
        timelapseIntervalSeconds.addEventListener('change', updateDurationDisplay);
        timelapseCount.addEventListener('change', updateDurationDisplay);
        updateDurationDisplay();
    } else {
        console.error("Some timelapse input elements not found in the DOM");
    }

    startTimelapseStatusPolling(0);
});

// --- Exports ---
window.startTimelapse = startTimelapse;
window.stopTimelapse = stopTimelapse;