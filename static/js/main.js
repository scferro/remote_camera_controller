// --- DOM Elements ---
const statusConnection = document.getElementById('status-connection');
const statusModel = document.getElementById('status-model');
const statusMessage = document.getElementById('status-message');
const statusSpinner = document.getElementById('status-spinner');
const btnRefreshStatus = document.getElementById('btn-refresh-status');
const btnRefreshSettings = document.getElementById('btn-refresh-settings'); // Added settings refresh button

const livePreviewImage = document.getElementById('live-preview-image');
const previewError = document.getElementById('preview-error');
const btnStartPreview = document.getElementById('btn-start-preview');
const btnStopPreview = document.getElementById('btn-stop-preview');
const previewRotate = document.getElementById('preview-rotate');
const previewLandscape = document.getElementById('preview-landscape');
const previewPortrait = document.getElementById('preview-portrait');
const previewContainer = document.getElementById('preview-container');
const previewRateInput = document.getElementById('preview-rate');

const cameraSettingsContainer = document.getElementById('camera-settings-container');
const captureFormatSelect = document.getElementById('capture-format');
const btnCaptureSingle = document.getElementById('btn-capture-single');
const captureStatus = document.getElementById('capture-status');
const cameraSettingsTable = document.getElementById('camera-settings-table');
const cameraSettingsCollapsible = document.getElementById('camera-settings-collapsible');

const timelapseIntervalInput = document.getElementById('timelapse-interval');
const timelapseCountInput = document.getElementById('timelapse-count');
const btnStartTimelapse = document.getElementById('btn-start-timelapse');
const btnStopTimelapse = document.getElementById('btn-stop-timelapse');
const timelapseStatusContainer = document.getElementById('timelapse-status-container');
const timelapseStatusMessage = document.getElementById('timelapse-status-message');
const timelapseProgress = document.getElementById('timelapse-progress');

const timelapseListContainer = document.getElementById('timelapse-list-container');
const timelapseList = document.getElementById('timelapse-list');
const btnRefreshTimelapses = document.getElementById('btn-refresh-timelapses');
const selectedTimelapseName = document.getElementById('selected-timelapse-name');
const timelapseSelectPrompt = document.getElementById('timelapse-select-prompt');
const timelapseOptionsPanel = document.getElementById('timelapse-options-panel');
const btnAssembleTimelapse = document.getElementById('btn-assemble-timelapse');
const timelapseAssemblyStatus = document.getElementById('timelapse-assembly-status');
const tlBrightnessSlider = document.getElementById('tl-brightness');
const tlBrightnessValue = document.getElementById('tl-brightness-value');


// Tab Elements
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

// --- State ---
let previewIntervalId = null;
let previewRefreshRate = 1000; // Milliseconds (matches 1 FPS default)
let isPreviewActive = false;
let isTimelapseActive = false;
let timelapseStatusIntervalId = null;
let selectedTimelapseFolder = null; // Keep track of selected timelapse

// --- Utility Functions ---
function showSpinner(show = true) {
    // Check if element exists before trying to modify it
    if (statusSpinner) {
        statusSpinner.classList.toggle('hidden', !show);
    }
}

function disableControls(disable = true) {
    // Disable buttons during critical operations, checking if they exist first
    if (btnCaptureSingle) btnCaptureSingle.disabled = disable;
    if (btnStartTimelapse) btnStartTimelapse.disabled = disable;
    // Add others as needed
}

// --- API Functions ---

async function fetchApi(url, options = {}, showLoading = true) {
    // Ensure options is a valid object, default to empty if not.
    const fetchOptions = (typeof options === 'object' && options !== null) ? options : {};

    if (showLoading) showSpinner(true);
    let responseData = null;
    try {
        // Use the validated fetchOptions
        console.debug(`Fetching ${url} with options:`, fetchOptions); // Added debug log
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            console.error(`API Error ${response.status}: ${response.statusText} for ${url}`);
            try {
                const errData = await response.json();
                console.error("Error details:", errData);
                // Avoid alert for common errors like 404 on preview image
                if (response.status !== 404 || !url.includes('/static/previews/preview.jpg')) {
                     alert(`API Error: ${errData.message || response.statusText}`);
                }
            } catch (e) {
                 // Avoid alert for common errors like 404 on preview image
                 if (response.status !== 404 || !url.includes('/static/previews/preview.jpg')) {
                     alert(`API Error ${response.status}: ${response.statusText}`);
                 }
            }
        } else {
            // Check content type before assuming JSON
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                 responseData = await response.json();
            } else {
                 // Handle non-JSON responses if necessary, or log a warning
                 console.warn(`Received non-JSON response for ${url}. Content-Type: ${contentType}`);
                 responseData = await response.text(); // Get as text instead
            }
        }
    } catch (error) {
        // This catch block generates the alert you were seeing
        console.error(`Network or fetch error for ${url}:`, error);
        // Avoid alert for common errors like preview image load failure
        if (!url.includes('/static/previews/preview.jpg')) {
            alert(`Network or Fetch Error: ${error.message}. Is the server running?`);
        }
        return null; // Explicitly return null on fetch error
    } finally {
        if (showLoading) showSpinner(false);
    }
    return responseData;
}

// --- Camera Status ---
async function getCameraStatus() {
    console.log("Getting camera status...");
    // Check if essential status elements exist
    if (!statusConnection || !statusModel || !statusMessage) {
        console.error("Status elements not found in DOM.");
        return;
    }
    statusConnection.textContent = 'Checking...';
    statusModel.textContent = 'N/A';
    statusMessage.textContent = '';
    const data = await fetchApi('/api/camera/status'); // Uses default options = {}
    if (data) {
        statusConnection.textContent = data.connected ? 'Connected' : 'Disconnected';
        statusConnection.style.color = data.connected ? 'green' : 'red';
        statusModel.textContent = data.model || 'N/A';
        statusMessage.textContent = data.message || '';
        // Enable/disable controls based on connection
        const controlsShouldBeEnabled = data.connected;
        // Check existence of buttons before setting disabled property
        if (btnStartPreview) btnStartPreview.disabled = !controlsShouldBeEnabled || isPreviewActive;
        if (btnStopPreview) btnStopPreview.disabled = !isPreviewActive;
        if (btnCaptureSingle) btnCaptureSingle.disabled = !controlsShouldBeEnabled || isTimelapseActive;
        if (btnStartTimelapse) btnStartTimelapse.disabled = !controlsShouldBeEnabled || isTimelapseActive;
        if (btnStopTimelapse) btnStopTimelapse.disabled = !isTimelapseActive;
    } else {
        statusConnection.textContent = 'Error';
        statusConnection.style.color = 'red';
        statusModel.textContent = 'N/A';
        statusMessage.textContent = 'Failed to get status from server.';
        // Disable all controls on error
        if (btnStartPreview) btnStartPreview.disabled = true;
        if (btnStopPreview) btnStopPreview.disabled = true;
        if (btnCaptureSingle) btnCaptureSingle.disabled = true;
        if (btnStartTimelapse) btnStartTimelapse.disabled = true;
        if (btnStopTimelapse) btnStopTimelapse.disabled = true;
    }
}

// --- Camera Settings ---
async function getCameraSettings() {
    console.log("Getting camera settings...");
    const settingsContainer = document.getElementById('camera-settings-collapsible');
    if (!settingsContainer) {
        console.error("Camera settings container not found in DOM.");
        return;
    }

    // Save the state of open menus using a unique identifier (e.g., data-key)
    const openMenus = new Set();
    settingsContainer.querySelectorAll('.collapsible-header').forEach(header => {
        const content = header.nextElementSibling;
        if (!content.classList.contains('hidden')) {
            openMenus.add(header.dataset.key); // Use a unique data attribute
        }
    });

    settingsContainer.innerHTML = '<p class="text-center text-gray-500">Loading settings...</p>';
    const data = await fetchApi('/api/camera/settings', {}, false);

    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        settingsContainer.innerHTML = '';
        populateCollapsibleSettings(data, settingsContainer);

        // Restore the state of open menus
        settingsContainer.querySelectorAll('.collapsible-header').forEach(header => {
            const content = header.nextElementSibling;
            if (openMenus.has(header.dataset.key)) {
                content.classList.remove('hidden');
                header.querySelector('.toggle-icon').textContent = '-';
            }
        });
    } else {
        settingsContainer.innerHTML = '<p class="text-center text-gray-500">No settings available.</p>';
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
            toggleIcon.textContent = content.classList.contains('hidden') ? '+' : '-';
        });

        section.appendChild(header);
        section.appendChild(content);
        container.appendChild(section);
    }
}

// --- Live Preview ---
async function startPreview() {
    console.log("Starting preview...");
    if (isPreviewActive) {
        console.warn("Preview start requested but already active.");
        return;
    }
    // Ensure buttons exist before disabling
    if (btnStartPreview) btnStartPreview.disabled = true;
    if (btnStopPreview) btnStopPreview.disabled = true; // Disable stop until success

    const rate = previewRateInput ? parseFloat(previewRateInput.value) || 1.0 : 1.0;
    previewRefreshRate = Math.max(100, 1000 / rate); // Calculate interval in ms, min 100ms

    const data = await fetchApi('/api/preview/start', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ rate: rate })
    });

    if (data && data.success) {
        console.log(`Preview started backend. Refresh interval: ${previewRefreshRate}ms`);
        isPreviewActive = true;
        if (btnStopPreview) btnStopPreview.disabled = false; // Enable stop on success
        // Use setInterval to refresh the image source
        previewIntervalId = setInterval(() => {
            // Add a timestamp to prevent browser caching
            const timestamp = new Date().getTime();
            if (livePreviewImage) {
                livePreviewImage.src = `/static/previews/preview.jpg?t=${timestamp}`;
                livePreviewImage.style.display = 'block'; // Ensure visible
            }
            if (previewError) previewError.classList.add('hidden'); // Hide error message
        }, previewRefreshRate);
        // Handle image loading errors during preview
        if (livePreviewImage) {
            livePreviewImage.onerror = () => {
                 console.error("Preview image failed to load during refresh.");
                 if (livePreviewImage) livePreviewImage.style.display = 'none';
                 if (previewError) previewError.classList.remove('hidden');
                 // Consider stopping preview automatically after several errors?
                 // stopPreview(); // Example: Stop on error
            };
        }

    } else {
         console.error("Failed to start preview on backend.");
         alert(`Failed to start preview. ${data?.message || 'Check camera connection and logs.'}`);
         // Ensure buttons are in correct state if start fails
         if (btnStartPreview) btnStartPreview.disabled = false; // Re-enable start
         if (btnStopPreview) btnStopPreview.disabled = true;
    }
}

// Return a promise that resolves when stop is complete
async function stopPreview() {
    console.log("Stopping preview...");
    if (!isPreviewActive && !previewIntervalId) {
        console.log("Stop preview called but not active.");
        // Ensure buttons are correct even if called when not active
        if (btnStartPreview) btnStartPreview.disabled = false; // Should be controlled by getCameraStatus
        if (btnStopPreview) btnStopPreview.disabled = true;
        return Promise.resolve(); // Return resolved promise
    }

    if (previewIntervalId) {
        clearInterval(previewIntervalId);
        previewIntervalId = null;
        console.log("Frontend preview refresh stopped.");
    }
    isPreviewActive = false;
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
        await getCameraStatus(); // Wait for status update before resolving
    }
}

// --- Single Capture ---
async function captureSingle() {
    console.log("Triggering single capture...");
    if (captureStatus) captureStatus.textContent = 'Capturing...';
    disableControls(true); // Disable buttons during capture

    const format = captureFormatSelect ? captureFormatSelect.value : 'current'; // Default if select not found

    const data = await fetchApi('/api/capture/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: format }) // Send format override if needed
    });

    if (data && data.success) {
        if (captureStatus) captureStatus.textContent = `Success: ${data.message || 'Image captured.'}`;
        console.log("File saved:", data.filepath);
        // Optionally: Refresh timelapse list if capture was part of one (or handle separately)
        listTimelapses(); // Refresh list in case it was a test shot in a new folder?
    } else {
        if (captureStatus) captureStatus.textContent = `Error: ${data?.message || 'Capture failed.'}`;
        alert(`Capture failed: ${data?.message || 'Unknown error. Check logs.'}`);
    }
    // Re-enable controls based on current status, not just blindly enabling
    getCameraStatus();
}


// --- Timelapse ---
async function startTimelapse() {
    console.log("Starting timelapse...");
    if (isTimelapseActive) {
        console.warn("Start timelapse requested but already active.");
        return;
    }
    if (!timelapseIntervalInput || !timelapseCountInput) {
         console.error("Timelapse input elements not found.");
         return;
    }

    const interval = parseInt(timelapseIntervalInput.value, 10);
    const count = parseInt(timelapseCountInput.value, 10);
    const format = captureFormatSelect ? captureFormatSelect.value : 'current'; // Use the same format override selector

    if (isNaN(interval) || interval <= 0 || isNaN(count) || count <= 0) {
        alert("Please enter valid positive numbers for timelapse interval and count.");
        return;
    }

    disableControls(true); // Disable other actions
    if (btnStartTimelapse) btnStartTimelapse.disabled = true;
    if (btnStopTimelapse) btnStopTimelapse.disabled = false; // Enable stop button

    const data = await fetchApi('/api/timelapse/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: interval, count: count, format: format })
    });

    if (data && data.success) {
        isTimelapseActive = true;
        console.log("Timelapse started on backend.");
        if (timelapseStatusMessage) timelapseStatusMessage.textContent = "Started...";
        if (timelapseProgress) timelapseProgress.textContent = `0 / ${count}`;
        // Start polling for status updates
        startTimelapseStatusPolling(count);
    } else {
        alert(`Failed to start timelapse: ${data?.message || 'Unknown error.'}`);
        // Re-enable controls if start failed, based on actual status
        getCameraStatus();
    }
}

async function stopTimelapse() {
    console.log("Stopping timelapse...");
    if (!isTimelapseActive) {
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
        if (btnStopTimelapse) btnStopTimelapse.disabled = false; // Re-enable if signal failed? Risky. Better to rely on poller.
    }
    // Note: isTimelapseActive will be set to false by the status poller when backend confirms
}

function startTimelapseStatusPolling(totalCount) {
    if (timelapseStatusIntervalId) clearInterval(timelapseStatusIntervalId); // Clear previous poll

    timelapseStatusIntervalId = setInterval(async () => {
        // Only poll if the timelapse is thought to be active client-side
        if (!isTimelapseActive && timelapseStatusIntervalId) {
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
            if (!backendIsActive && isTimelapseActive) {
                // Timelapse finished or stopped according to backend
                console.log("Timelapse finished or stopped according to status poll.");
                clearInterval(timelapseStatusIntervalId);
                timelapseStatusIntervalId = null;
                isTimelapseActive = false;
                // Update controls based on actual camera status
                listTimelapses(); // Refresh the list of sequences
                getCameraStatus(); // Refresh main status/buttons
            }
            // Update client state if backend says active but client thought it wasn't (e.g. page reload)
            else if (backendIsActive && !isTimelapseActive) {
                 console.log("Detected active timelapse on backend during polling.");
                 isTimelapseActive = true;
                 getCameraStatus(); // Update button states
            }
        } else {
            // Failed to get status, maybe server issue?
            console.error("Failed to get timelapse status during polling.");
            // Consider stopping polling after several errors?
        }
    }, 2000); // Poll every 2 seconds
}

// --- Timelapse Listing & Selection ---
async function listTimelapses() {
    console.log("Fetching timelapse list...");
    if (!timelapseList) return; // Exit if element doesn't exist
    timelapseList.innerHTML = '<li>Loading...</li>';
    const data = await fetchApi('/api/timelapse/list', {}, false); // Fetch quietly

    if (data === null) { // Check if fetchApi returned null due to error
        timelapseList.innerHTML = `<li class="text-red-500">Error loading list. Check console/server logs.</li>`;
        return;
    }

    if (data && Array.isArray(data.timelapses)) {
        if (data.timelapses.length === 0) {
            timelapseList.innerHTML = '<li>No timelapse sequences found.</li>';
        } else {
            timelapseList.innerHTML = ''; // Clear loading message
            data.timelapses.forEach(folder => {
                const li = document.createElement('li');
                li.className = "p-1 hover:bg-blue-100 cursor-pointer rounded";
                li.textContent = folder;
                li.dataset.folder = folder; // Store folder name
                li.onclick = () => selectTimelapseForProcessing(folder); // Call selection handler
                // Re-apply selection highlight if this folder was previously selected
                if (folder === selectedTimelapseFolder) {
                    li.classList.add('bg-blue-200');
                }
                timelapseList.appendChild(li);
            });
        }
    } else {
         timelapseList.innerHTML = `<li class="text-red-500">${data?.message || 'Could not load timelapse list.'}</li>`;
    }
}

function selectTimelapseForProcessing(folderName) {
     console.log(`Selected timelapse: ${folderName}`);
     selectedTimelapseFolder = folderName;

     // Update UI only if elements exist
     if (selectedTimelapseName) selectedTimelapseName.textContent = folderName;
     if (timelapseSelectPrompt) timelapseSelectPrompt.classList.add('hidden');
     if (timelapseOptionsPanel) timelapseOptionsPanel.classList.remove('hidden');
     if (timelapseAssemblyStatus) timelapseAssemblyStatus.textContent = ''; // Clear previous status

     // Highlight selected item in the list
     document.querySelectorAll('#timelapse-list li').forEach(item => {
         item.classList.toggle('bg-blue-200', item.dataset.folder === folderName);
     });

     // Enable the assemble button
     if (btnAssembleTimelapse) btnAssembleTimelapse.disabled = false;
}

// --- Timelapse Processing ---
async function assembleTimelapse() {
    if (!selectedTimelapseFolder) {
        alert("Please select a timelapse sequence first.");
        return;
    }
    if (!btnAssembleTimelapse || !timelapseAssemblyStatus) {
         console.error("Timelapse assembly UI elements not found.");
         return;
    }

    console.log(`Assembling timelapse for: ${selectedTimelapseFolder}`);
    timelapseAssemblyStatus.textContent = 'Starting assembly... This may take a while.';
    btnAssembleTimelapse.disabled = true;

    // Gather parameters from the UI elements safely
    const processRawInput = document.getElementById('tl-process-raw');
    const useCameraWbInput = document.getElementById('tl-use-camera-wb');
    const fpsInput = document.getElementById('tl-fps');
    const resolutionInput = document.getElementById('tl-resolution');
    const cropXInput = document.getElementById('tl-crop-x');
    const cropYInput = document.getElementById('tl-crop-y');
    const cropWInput = document.getElementById('tl-crop-w');
    const cropHInput = document.getElementById('tl-crop-h');

    const processRaw = processRawInput ? processRawInput.checked : false;
    const useCameraWb = useCameraWbInput ? useCameraWbInput.checked : true;
    const brightness = tlBrightnessSlider ? parseFloat(tlBrightnessSlider.value) : 1.0;
    const frameRate = fpsInput ? parseInt(fpsInput.value, 10) : 24;
    const resolution = resolutionInput ? resolutionInput.value.trim() || null : null;

    let cropRect = null;
    if (cropXInput && cropYInput && cropWInput && cropHInput) {
        const cropX = parseInt(cropXInput.value, 10);
        const cropY = parseInt(cropYInput.value, 10);
        const cropW = parseInt(cropWInput.value, 10);
        const cropH = parseInt(cropHInput.value, 10);
        if (!isNaN(cropX) && !isNaN(cropY) && !isNaN(cropW) && !isNaN(cropH) && cropW > 0 && cropH > 0) {
            cropRect = [cropX, cropY, cropW, cropH];
        }
    }

    const params = {
        folder: selectedTimelapseFolder,
        process_raw: processRaw,
        raw_settings: {
            use_camera_wb: useCameraWb,
            brightness: brightness,
        },
        assembly_settings: {
            frame_rate: frameRate,
            resolution: resolution,
            crop_rect: cropRect
        }
    };

    // TODO: Implement this API endpoint in Flask: /api/process/timelapse
    const data = await fetchApi('/api/process/timelapse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });

    if (data && data.success) {
        timelapseAssemblyStatus.textContent = `Success! Video saved: ${data.output_path}`;
        alert(`Timelapse assembly successful! Video saved to ${data.output_path}`);
    } else {
        timelapseAssemblyStatus.textContent = `Error: ${data?.message || 'Assembly failed. Check server logs.'}`;
        alert(`Timelapse assembly failed: ${data?.message || 'Check server logs.'}`);
    }

    btnAssembleTimelapse.disabled = false; // Re-enable button
}


// --- Tab Switching Logic ---
function switchTab(targetTabId) {
    console.debug(`Switching to tab: ${targetTabId}`);
    // Hide all content panels
    tabContents.forEach(content => {
        if (content) content.classList.add('hidden');
    });

    // Deactivate all tab buttons
    tabButtons.forEach(button => {
        if (button) button.classList.remove('active');
    });

    // Show the target content panel
    const targetContent = document.querySelector(targetTabId);
    if (targetContent) {
        targetContent.classList.remove('hidden');
    } else {
        console.error(`Tab content not found for target: ${targetTabId}`);
    }

    // Activate the target tab button
    const targetButton = document.querySelector(`[data-tab-target="${targetTabId}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    } else {
         console.error(`Tab button not found for target: ${targetTabId}`);
    }

    // Stop preview if switching away from the live control tab
    if (targetTabId !== '#tab-live-control' && isPreviewActive) {
        console.log("Switching tab away from Live Control, stopping preview.");
        stopPreview(); // Call async function but don't wait for it here
    }
}

// --- Event Listeners ---
// Ensure elements exist before adding listeners
if (btnRefreshStatus) {
    btnRefreshStatus.addEventListener('click', () => {
        getCameraStatus();
        getCameraSettings(); // Also refresh settings on manual status refresh
    });
}
if (btnRefreshSettings) { // Added event listener for settings refresh button
    btnRefreshSettings.addEventListener('click', getCameraSettings);
}
if (btnStartPreview) btnStartPreview.addEventListener('click', startPreview);
if (btnStopPreview) btnStopPreview.addEventListener('click', stopPreview);
if (btnCaptureSingle) btnCaptureSingle.addEventListener('click', captureSingle);

if (btnStartTimelapse) btnStartTimelapse.addEventListener('click', startTimelapse);
if (btnStopTimelapse) btnStopTimelapse.addEventListener('click', stopTimelapse);
if (btnRefreshTimelapses) btnRefreshTimelapses.addEventListener('click', listTimelapses);
if (btnAssembleTimelapse) { // Check if button exists before adding listener
    btnAssembleTimelapse.addEventListener('click', assembleTimelapse);
}
if (previewRotate) {
    previewRotate.addEventListener('change', (event) => {
        if (livePreviewImage) {
            livePreviewImage.style.transform = event.target.checked ? 'rotate(90deg)' : '';
            livePreviewImage.style.transformOrigin = 'center center';
        }
    });
}

if (previewLandscape && previewPortrait) {
    previewLandscape.addEventListener('change', () => {
        if (livePreviewImage) {
            livePreviewImage.style.transform = 'rotate(0deg)';
        }
    });
    previewPortrait.addEventListener('change', () => {
        if (livePreviewImage) {
            livePreviewImage.style.transform = 'rotate(90deg)';
            livePreviewImage.style.transformOrigin = 'center center';
        }
    });
}

// Settings changes using event delegation
if (cameraSettingsContainer) {
    cameraSettingsContainer.addEventListener('change', (event) => {
        const target = event.target;
        // Check if the changed element is one of our setting controls AND not disabled
        if (target.dataset.settingName && !target.disabled && (target.tagName === 'SELECT' || target.type === 'checkbox' || target.type === 'text' || target.type === 'range')) {
             // Range input 'change' event is handled directly in buildSettingControls to avoid duplicate calls
             if (target.type !== 'range') {
                 const value = target.type === 'checkbox' ? (target.checked ? 1 : 0) : target.value;
                 setCameraSetting(target.dataset.settingName, value);
             }
        }
    });
}


// Preview rate change
if (previewRateInput) {
    previewRateInput.addEventListener('change', () => {
        const newRate = parseFloat(previewRateInput.value);
        if (!isNaN(newRate) && newRate > 0) {
            previewRefreshRate = Math.max(100, 1000 / newRate);
            if (isPreviewActive) {
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


// Tab button clicks
tabButtons.forEach(button => {
    if (button) {
        button.addEventListener('click', () => {
            const targetTabId = button.getAttribute('data-tab-target');
            if (targetTabId) {
                switchTab(targetTabId);
            } else {
                 console.error("Tab button clicked but missing data-tab-target attribute.");
            }
        });
    }
});

// Timelapse processing brightness slider update
if (tlBrightnessSlider && tlBrightnessValue) {
    tlBrightnessSlider.addEventListener('input', (event) => {
        tlBrightnessValue.textContent = parseFloat(event.target.value).toFixed(2);
    });
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded. Initializing...");
    // Ensure elements exist before trying to interact
    if (tabButtons.length > 0 && tabContents.length > 0) {
         switchTab('#tab-live-control'); // Activate the first tab by default
    } else {
         console.error("Tab buttons or content panels not found on DOM load.");
    }
    getCameraStatus(); // Get status first
    getCameraSettings(); // Attempt to load settings
    listTimelapses(); // Attempt to load timelapses

    // Set initial button states (rely on getCameraStatus to set accurately)
    if (btnStopPreview) btnStopPreview.disabled = true;
    if (btnStopTimelapse) btnStopTimelapse.disabled = true;
    if (btnAssembleTimelapse) btnAssembleTimelapse.disabled = true; // Disabled until a timelapse is selected
    if (timelapseOptionsPanel) timelapseOptionsPanel.classList.add('hidden'); // Hide options initially

    // Check for ongoing timelapse on load (in case of page refresh)
    startTimelapseStatusPolling(0); // Start polling, it will update state if active
});
