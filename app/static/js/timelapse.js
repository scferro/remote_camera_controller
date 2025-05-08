/**
 * Timelapse control module
 */

// --- DOM Elements ---
const timelapseIntervalHours = document.getElementById('timelapse-interval-hours');
const timelapseIntervalMinutes = document.getElementById('timelapse-interval-minutes');
const timelapseIntervalSeconds = document.getElementById('timelapse-interval-seconds');
const timelapseCount = document.getElementById('timelapse-count');
const timelapseDurationHours = document.getElementById('timelapse-duration-hours');
const timelapseDurationMinutes = document.getElementById('timelapse-duration-minutes');
const timelapseDurationSeconds = document.getElementById('timelapse-duration-seconds');
const calculateIntervalRadio = document.getElementById('calculate-interval');
const calculateCountRadio = document.getElementById('calculate-count');
const calculateDurationRadio = document.getElementById('calculate-duration');

const btnStartTimelapse = document.getElementById('btn-start-timelapse');
const btnStopTimelapse = document.getElementById('btn-stop-timelapse');
const timelapseStatusContainer = document.getElementById('timelapse-status-container');
const timelapseStatusMessage = document.getElementById('timelapse-status-message');
const timelapseProgress = document.getElementById('timelapse-progress');

// --- State ---
window.isTimelapseActive = false;
let timelapseStatusIntervalId = null;
let calculatedField = 'duration'; // Default to calculating duration

// --- Timelapse Input Functions ---
// Calculate total interval in seconds
function getTotalIntervalSeconds() {
    const hours = parseInt(timelapseIntervalHours.value) || 0;
    const minutes = parseInt(timelapseIntervalMinutes.value) || 0;
    const seconds = parseInt(timelapseIntervalSeconds.value) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}

// Get total duration in seconds
function getTotalDurationSeconds() {
    const hours = parseInt(timelapseDurationHours.value) || 0;
    const minutes = parseInt(timelapseDurationMinutes.value) || 0;
    const seconds = parseInt(timelapseDurationSeconds.value) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}

// Convert total seconds to hours, minutes, seconds and update the respective inputs
function updateTimeInputs(totalSeconds, hoursInput, minutesInput, secondsInput) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    hoursInput.value = hours;
    minutesInput.value = minutes;
    secondsInput.value = seconds;
}

// Update the disabled state of inputs based on which field is being calculated
function updateDisabledState() {
    // First, enable all inputs
    timelapseIntervalHours.disabled = false;
    timelapseIntervalMinutes.disabled = false;
    timelapseIntervalSeconds.disabled = false;
    timelapseCount.disabled = false;
    timelapseDurationHours.disabled = false;
    timelapseDurationMinutes.disabled = false;
    timelapseDurationSeconds.disabled = false;
    
    // Remove gray background from all
    timelapseIntervalHours.style.backgroundColor = '';
    timelapseIntervalMinutes.style.backgroundColor = '';
    timelapseIntervalSeconds.style.backgroundColor = '';
    timelapseCount.style.backgroundColor = '';
    timelapseDurationHours.style.backgroundColor = '';
    timelapseDurationMinutes.style.backgroundColor = '';
    timelapseDurationSeconds.style.backgroundColor = '';
    
    // Then disable the calculated field inputs
    if (calculatedField === 'interval') {
        timelapseIntervalHours.disabled = true;
        timelapseIntervalMinutes.disabled = true;
        timelapseIntervalSeconds.disabled = true;
        timelapseIntervalHours.style.backgroundColor = '#f3f4f6';
        timelapseIntervalMinutes.style.backgroundColor = '#f3f4f6';
        timelapseIntervalSeconds.style.backgroundColor = '#f3f4f6';
    } else if (calculatedField === 'count') {
        timelapseCount.disabled = true;
        timelapseCount.style.backgroundColor = '#f3f4f6';
    } else if (calculatedField === 'duration') {
        timelapseDurationHours.disabled = true;
        timelapseDurationMinutes.disabled = true;
        timelapseDurationSeconds.disabled = true;
        timelapseDurationHours.style.backgroundColor = '#f3f4f6';
        timelapseDurationMinutes.style.backgroundColor = '#f3f4f6';
        timelapseDurationSeconds.style.backgroundColor = '#f3f4f6';
    }
}

// Calculate the value for the calculated field
function updateCalculatedValue() {
    if (calculatedField === 'interval') {
        // Calculate interval based on count and duration
        const count = parseInt(timelapseCount.value) || 1;
        const durationSeconds = getTotalDurationSeconds();
        
        if (count > 1) {
            // Divide total duration by (count-1) to get interval
            const intervalSeconds = durationSeconds / (count - 1);
            updateTimeInputs(intervalSeconds, timelapseIntervalHours, timelapseIntervalMinutes, timelapseIntervalSeconds);
        }
    } else if (calculatedField === 'count') {
        // Calculate count based on interval and duration
        const intervalSeconds = getTotalIntervalSeconds();
        const durationSeconds = getTotalDurationSeconds();
        
        if (intervalSeconds > 0) {
            // Add 1 because the first image is at time 0
            const newCount = Math.floor(durationSeconds / intervalSeconds) + 1;
            timelapseCount.value = Math.max(2, newCount); // Ensure at least 2 images
        }
    } else if (calculatedField === 'duration') {
        // Calculate duration based on interval and count
        const intervalSeconds = getTotalIntervalSeconds();
        const count = parseInt(timelapseCount.value) || 1;
        
        // Total duration is interval * (count-1)
        const durationSeconds = intervalSeconds * (count - 1);
        updateTimeInputs(durationSeconds, timelapseDurationHours, timelapseDurationMinutes, timelapseDurationSeconds);
    }
}

// --- Timelapse Control Functions ---
async function startTimelapse() {
    console.log("Starting timelapse...");
    if (window.isTimelapseActive) {
        console.warn("Start timelapse requested but already active.");
        return;
    }
    
    // Get values from UI
    const intervalSeconds = getTotalIntervalSeconds();
    const count = parseInt(timelapseCount.value, 10);
    
    if (isNaN(intervalSeconds) || intervalSeconds <= 0 || isNaN(count) || count < 2) {
        alert("Please enter valid values for timelapse interval and count. Interval must be greater than 0 and count must be at least 2.");
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

    if (btnStopTimelapse) btnStopTimelapse.disabled = true; // Disable stop button immediately

    const data = await fetchApi('/api/timelapse/stop', { method: 'POST' });

    if (data && data.success) {
        console.log("Timelapse stop signal sent.");
        if (timelapseStatusMessage) timelapseStatusMessage.textContent = "Stopping...";
        // Polling will update the final status and button states
    } else {
        alert(`Failed to send stop signal: ${data?.message || 'Unknown error.'}`);
        // Might need manual intervention or refresh
        if (btnStopTimelapse) btnStopTimelapse.disabled = false; // Re-enable if signal failed
    }
    // Note: isTimelapseActive will be set to false by the status poller when backend confirms
}

function startTimelapseStatusPolling(totalCount) {
    if (timelapseStatusIntervalId) clearInterval(timelapseStatusIntervalId); // Clear previous poll

    timelapseStatusIntervalId = setInterval(async () => {
        // Only poll if the timelapse is thought to be active client-side
        if (!window.isTimelapseActive && timelapseStatusIntervalId) {
            console.debug("Timelapse status polling stopped (client state inactive).");
            clearInterval(timelapseStatusIntervalId);
            timelapseStatusIntervalId = null;
            return;
        }

        const statusData = await fetchApi('/api/timelapse/status', {}, false); // Poll quietly

        if (statusData) {
            // Check elements exist before updating
            if (timelapseStatusMessage) timelapseStatusMessage.textContent = statusData.message || 'Polling...';
            if (timelapseProgress) timelapseProgress.textContent = `${statusData.count || 0} / ${statusData.total || totalCount}`;

            // Update client state based *only* on polled status
            const backendIsActive = statusData.active === true;
            if (!backendIsActive && window.isTimelapseActive) {
                // Timelapse finished or stopped according to backend
                console.log("Timelapse finished or stopped according to status poll.");
                clearInterval(timelapseStatusIntervalId);
                timelapseStatusIntervalId = null;
                window.isTimelapseActive = false;
                // Update controls based on actual camera status
                listTimelapses(); // Refresh the list of sequences
                if (typeof window.getCameraStatus === 'function') {
                    window.getCameraStatus(); // Refresh main status/buttons
                }
            }
            // Update client state if backend says active but client thought it wasn't (e.g. page reload)
            else if (backendIsActive && !window.isTimelapseActive) {
                console.log("Detected active timelapse on backend during polling.");
                window.isTimelapseActive = true;
                if (typeof window.getCameraStatus === 'function') {
                    window.getCameraStatus(); // Update button states
                }
            }
        } else {
            // Failed to get status, maybe server issue?
            console.error("Failed to get timelapse status during polling.");
            // Consider stopping polling after several errors?
        }
    }, 2000); // Poll every 2 seconds
}

// --- Event Listeners ---
// Set up event listeners for the radio buttons
function setupTimelapseInputListeners() {
    // Radio button listeners
    calculateIntervalRadio.addEventListener('change', function() {
        if (this.checked) {
            calculatedField = 'interval';
            updateDisabledState();
            updateCalculatedValue();
        }
    });
    
    calculateCountRadio.addEventListener('change', function() {
        if (this.checked) {
            calculatedField = 'count';
            updateDisabledState();
            updateCalculatedValue();
        }
    });
    
    calculateDurationRadio.addEventListener('change', function() {
        if (this.checked) {
            calculatedField = 'duration';
            updateDisabledState();
            updateCalculatedValue();
        }
    });
    
    // Input change listeners for interval
    timelapseIntervalHours.addEventListener('change', updateCalculatedValue);
    timelapseIntervalMinutes.addEventListener('change', updateCalculatedValue);
    timelapseIntervalSeconds.addEventListener('change', updateCalculatedValue);
    
    // Input change listener for count
    timelapseCount.addEventListener('change', updateCalculatedValue);
    
    // Input change listeners for duration
    timelapseDurationHours.addEventListener('change', updateCalculatedValue);
    timelapseDurationMinutes.addEventListener('change', updateCalculatedValue);
    timelapseDurationSeconds.addEventListener('change', updateCalculatedValue);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("Timelapse.js: DOM loaded");
    
    // Timelapse control buttons
    if (btnStartTimelapse) {
        btnStartTimelapse.addEventListener('click', startTimelapse);
    }
    
    if (btnStopTimelapse) {
        btnStopTimelapse.addEventListener('click', stopTimelapse);
    }
    
    // Set default radio button state and set up listeners
    if (calculateDurationRadio) {
        calculateDurationRadio.checked = true;
        calculatedField = 'duration';
    }
    
    // Set up timelapse input listeners
    if (timelapseIntervalHours && timelapseCount && timelapseDurationHours) {
        setupTimelapseInputListeners();
        updateDisabledState();
        updateCalculatedValue();
    } else {
        console.error("Some timelapse input elements not found in the DOM");
    }
    
    // Check for ongoing timelapse on load (in case of page refresh)
    startTimelapseStatusPolling(0); // Start polling, it will update state if active
});

// --- Exports ---
// Make functions available to other modules
window.startTimelapse = startTimelapse;
window.stopTimelapse = stopTimelapse;