// --- DOM Elements (Keep previous selectors) ---
const statusConnection = document.getElementById('status-connection');
const statusModel = document.getElementById('status-model');
const statusMessage = document.getElementById('status-message');
const statusSpinner = document.getElementById('status-spinner');
const btnRefreshStatus = document.getElementById('btn-refresh-status');

const livePreviewImage = document.getElementById('live-preview-image');
const previewError = document.getElementById('preview-error');
const btnStartPreview = document.getElementById('btn-start-preview');
const btnStopPreview = document.getElementById('btn-stop-preview');
const previewRateInput = document.getElementById('preview-rate');

const cameraSettingsContainer = document.getElementById('camera-settings-container');
const captureFormatSelect = document.getElementById('capture-format');
const btnCaptureSingle = document.getElementById('btn-capture-single');
const captureStatus = document.getElementById('capture-status');

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

// --- State (Keep previous state variables) ---
let previewIntervalId = null;
let previewRefreshRate = 1000; // Milliseconds (matches 1 FPS default)
let isPreviewActive = false;
let isTimelapseActive = false;
let timelapseStatusIntervalId = null;
let selectedTimelapseFolder = null; // Keep track of selected timelapse

// --- Utility Functions (Keep previous) ---
function showSpinner(show = true) {
    statusSpinner.classList.toggle('hidden', !show);
}

function disableControls(disable = true) {
    // Disable buttons during critical operations
    btnCaptureSingle.disabled = disable;
    btnStartTimelapse.disabled = disable;
    // Add others as needed
}

// --- API Functions (Keep previous) ---

async function fetchApi(url, options = {}, showLoading = true) {
    if (showLoading) showSpinner(true);
    let responseData = null;
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            console.error(`API Error ${response.status}: ${response.statusText}`);
            try {
                const errData = await response.json();
                console.error("Error details:", errData);
                alert(`API Error: ${errData.message || response.statusText}`);
            } catch (e) {
                 alert(`API Error ${response.status}: ${response.statusText}`);
            }
        } else {
            responseData = await response.json();
        }
    } catch (error) {
        console.error("Network or fetch error:", error);
        alert(`Network or Fetch Error: ${error.message}. Is the server running?`);
    } finally {
        if (showLoading) showSpinner(false);
    }
    return responseData;
}

// --- Camera Status (Keep previous) ---
async function getCameraStatus() {
    console.log("Getting camera status...");
    statusConnection.textContent = 'Checking...';
    statusModel.textContent = 'N/A';
    statusMessage.textContent = '';
    const data = await fetchApi('/api/camera/status');
    if (data) {
        statusConnection.textContent = data.connected ? 'Connected' : 'Disconnected';
        statusConnection.style.color = data.connected ? 'green' : 'red';
        statusModel.textContent = data.model || 'N/A';
        statusMessage.textContent = data.message || '';
        // Enable/disable controls based on connection
        const controlsShouldBeEnabled = data.connected;
        btnStartPreview.disabled = !controlsShouldBeEnabled;
        btnStopPreview.disabled = !isPreviewActive; // Stop only enabled if active
        btnCaptureSingle.disabled = !controlsShouldBeEnabled || isTimelapseActive;
        btnStartTimelapse.disabled = !controlsShouldBeEnabled || isTimelapseActive;
        btnStopTimelapse.disabled = !isTimelapseActive; // Stop only enabled if active
        // TODO: Enable/disable settings controls based on connection
    } else {
        statusConnection.textContent = 'Error';
        statusConnection.style.color = 'red';
        statusModel.textContent = 'N/A';
        statusMessage.textContent = 'Failed to get status from server.';
        // Disable all controls on error
        btnStartPreview.disabled = true;
        btnStopPreview.disabled = true;
        btnCaptureSingle.disabled = true;
        btnStartTimelapse.disabled = true;
        btnStopTimelapse.disabled = true;
    }
}

// --- Camera Settings (Keep previous) ---
async function getCameraSettings() {
    console.log("Getting camera settings...");
    cameraSettingsContainer.innerHTML = '<p class="text-gray-500">Loading settings...</p>';
    const data = await fetchApi('/api/camera/settings', false); // Don't show global spinner for this

    if (data && !data.error) {
        buildSettingControls(data);
    } else {
        cameraSettingsContainer.innerHTML = `<p class="text-red-500">${data?.error || 'Error loading settings.'}</p>`;
    }
}

function buildSettingControls(settingsData) {
    cameraSettingsContainer.innerHTML = ''; // Clear loading message or old settings

    if (Object.keys(settingsData).length === 0) {
         cameraSettingsContainer.innerHTML = '<p class="text-gray-500">No configurable settings found or camera not connected properly.</p>';
         return;
    }

    // Recursively build controls (simplified example)
    function createControlsRecursive(parentKey, configNode, parentElement) {
        for (const key in configNode) {
            const item = configNode[key];
            // Use a unique separator unlikely to be in gphoto2 names
            const currentPath = parentKey ? `${parentKey}///${key}` : key;

            if (item.type === 'SECTION') {
                const sectionDiv = document.createElement('div');
                sectionDiv.className = 'mb-4 p-3 border rounded bg-gray-50';
                const sectionTitle = document.createElement('h4');
                sectionTitle.className = 'font-semibold text-sm mb-2 text-gray-700';
                sectionTitle.textContent = item.label || key;
                sectionDiv.appendChild(sectionTitle);
                createControlsRecursive(currentPath, item.children, sectionDiv);
                // Only add section if it contains controls
                if (sectionDiv.childElementCount > 1) {
                     parentElement.appendChild(sectionDiv);
                }

            } else if (item.type === 'CHOICE' || item.type === 'RADIO' || item.type === 'MENU') { // Added MENU
                const settingDiv = document.createElement('div');
                settingDiv.className = 'setting-group';
                const label = document.createElement('label');
                label.className = 'setting-label';
                label.setAttribute('for', `setting-${currentPath}`);
                label.textContent = item.label || key;
                settingDiv.appendChild(label);

                const select = document.createElement('select');
                select.id = `setting-${currentPath}`;
                select.dataset.settingName = currentPath; // Store the API path
                select.className = 'w-full'; // Make select full width
                select.disabled = item.readonly; // Disable if readonly

                if (item.choices && Array.isArray(item.choices)) {
                    item.choices.forEach(choice => {
                        const option = document.createElement('option');
                        option.value = choice;
                        option.textContent = choice;
                        // Handle potential type differences (e.g., number vs string)
                        if (String(choice) === String(item.value)) {
                            option.selected = true;
                        }
                        select.appendChild(option);
                    });
                } else {
                     console.warn(`No choices found for CHOICE/RADIO/MENU widget: ${currentPath}`);
                     const option = document.createElement('option');
                     option.textContent = "No choices available";
                     option.disabled = true;
                     select.appendChild(option);
                }
                settingDiv.appendChild(select);
                parentElement.appendChild(settingDiv);

            } else if (item.type === 'RANGE') {
                 const settingDiv = document.createElement('div');
                 settingDiv.className = 'setting-group';
                 const label = document.createElement('label');
                 label.className = 'setting-label';
                 label.setAttribute('for', `setting-${currentPath}`);
                 // Find current value label span if it exists
                 let valueSpanId = `value-${currentPath}`;
                 label.innerHTML = `${item.label || key} (<span id="${valueSpanId}">${item.value}</span>)`; // Show current value in label
                 settingDiv.appendChild(label);

                 const rangeInput = document.createElement('input');
                 rangeInput.type = 'range';
                 rangeInput.id = `setting-${currentPath}`;
                 rangeInput.dataset.settingName = currentPath;
                 rangeInput.min = item.min;
                 rangeInput.max = item.max;
                 rangeInput.step = item.step;
                 rangeInput.value = item.value;
                 rangeInput.className = 'w-full'; // Make range full width
                 rangeInput.disabled = item.readonly;

                 // Add event listener to update label on change
                 rangeInput.addEventListener('input', (event) => {
                    const valueSpan = document.getElementById(valueSpanId);
                    if(valueSpan) valueSpan.textContent = event.target.value;
                 });
                 // Add event listener to send API request on mouseup/touchend (less frequent updates)
                 rangeInput.addEventListener('change', (event) => { // 'change' fires after release
                     if (!item.readonly) {
                        setCameraSetting(currentPath, event.target.value);
                     }
                 });

                 settingDiv.appendChild(rangeInput);
                 parentElement.appendChild(settingDiv);

            } else if (item.type === 'TEXT' || item.type === 'DATE') { // Simple text input for others
                 const settingDiv = document.createElement('div');
                 settingDiv.className = 'setting-group';
                 const label = document.createElement('label');
                 label.className = 'setting-label';
                 label.setAttribute('for', `setting-${currentPath}`);
                 label.textContent = item.label || key;
                 settingDiv.appendChild(label);

                 const textInput = document.createElement('input');
                 textInput.type = (item.type === 'DATE') ? 'text' : 'text'; // Keep as text for now, date widgets can be complex
                 textInput.id = `setting-${currentPath}`;
                 textInput.dataset.settingName = currentPath;
                 textInput.value = item.value;
                 textInput.readOnly = item.readonly; // Make read-only if applicable
                 textInput.className = 'w-full';
                 textInput.disabled = item.readonly;

                 if (!item.readonly) {
                    textInput.addEventListener('change', (event) => { // Update on blur/enter
                        setCameraSetting(currentPath, event.target.value);
                    });
                 }

                 settingDiv.appendChild(textInput);
                 parentElement.appendChild(settingDiv);
            } else if (item.type === 'TOGGLE') { // Handle Toggle (like a checkbox)
                 const settingDiv = document.createElement('div');
                 settingDiv.className = 'setting-group flex items-center'; // Use flex for alignment
                 const checkbox = document.createElement('input');
                 checkbox.type = 'checkbox';
                 checkbox.id = `setting-${currentPath}`;
                 checkbox.dataset.settingName = currentPath;
                 // Gphoto2 toggle values are often 0 or 1
                 checkbox.checked = (parseInt(item.value, 10) === 1);
                 checkbox.className = 'mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500';
                 checkbox.disabled = item.readonly;

                 const label = document.createElement('label');
                 label.className = 'setting-label mb-0'; // Remove bottom margin for inline label
                 label.setAttribute('for', `setting-${currentPath}`);
                 label.textContent = item.label || key;

                 if (!item.readonly) {
                    checkbox.addEventListener('change', (event) => {
                        const newValue = event.target.checked ? 1 : 0;
                        setCameraSetting(currentPath, newValue);
                    });
                 }

                 settingDiv.appendChild(checkbox);
                 settingDiv.appendChild(label);
                 parentElement.appendChild(settingDiv);
            }
            // Add handlers for other types (BUTTON, etc.) as needed
        }
    }

    createControlsRecursive(null, settingsData, cameraSettingsContainer);
}

async function setCameraSetting(settingName, value) {
    // Replace placeholder separator before sending
    const gphotoSettingName = settingName.replace(/\/\/\//g, "/");
    console.log(`Setting ${gphotoSettingName} to ${value}`);
    showSpinner(true); // Show spinner during setting change
    const data = await fetchApi(`/api/camera/setting/${gphotoSettingName}`, { // Send correct path
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value })
    }, false);
    showSpinner(false);

    if (data && data.success) {
        console.log(`Setting ${gphotoSettingName} successful.`);
        // Update UI immediately for responsiveness if possible (e.g., range slider label)
        // Or optionally refresh just the affected part of the settings tree
    } else {
        console.error(`Failed to set ${gphotoSettingName}. Message: ${data?.message}`);
        alert(`Failed to set setting '${gphotoSettingName}'. ${data?.message || 'Check logs.'}`);
        // Revert UI? Refresh settings to get actual value back
        getCameraSettings(); // Refresh all on failure
    }
}


// --- Live Preview (Keep previous) ---
async function startPreview() {
    console.log("Starting preview...");
    if (isPreviewActive) return;

    stopPreview(); // Ensure any old interval is cleared

    const rate = parseFloat(previewRateInput.value) || 1.0;
    previewRefreshRate = Math.max(100, 1000 / rate); // Calculate interval in ms, min 100ms

    const data = await fetchApi('/api/preview/start', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ rate: rate })
    });

    if (data && data.success) {
        console.log(`Preview started backend. Refresh interval: ${previewRefreshRate}ms`);
        isPreviewActive = true;
        btnStartPreview.disabled = true;
        btnStopPreview.disabled = false;
        // Use setInterval to refresh the image source
        previewIntervalId = setInterval(() => {
            // Add a timestamp to prevent browser caching
            const timestamp = new Date().getTime();
            livePreviewImage.src = `/static/previews/preview.jpg?t=${timestamp}`;
            livePreviewImage.style.display = 'block'; // Ensure visible
            previewError.classList.add('hidden'); // Hide error message
        }, previewRefreshRate);
        // Handle image loading errors during preview
        livePreviewImage.onerror = () => {
             console.error("Preview image failed to load during refresh.");
             livePreviewImage.style.display = 'none';
             previewError.classList.remove('hidden');
             // Consider stopping preview automatically after several errors?
        };

    } else {
         console.error("Failed to start preview on backend.");
         alert(`Failed to start preview. ${data?.message || 'Check camera connection and logs.'}`);
    }
}

async function stopPreview() {
    console.log("Stopping preview...");
    if (!isPreviewActive && !previewIntervalId) return; // Already stopped

    if (previewIntervalId) {
        clearInterval(previewIntervalId);
        previewIntervalId = null;
        console.log("Frontend preview refresh stopped.");
    }
    isPreviewActive = false;
    // Button states will be updated by getCameraStatus() called after stop
    // btnStartPreview.disabled = false;
    // btnStopPreview.disabled = true;

    // Tell the backend to stop generating previews
    await fetchApi('/api/preview/stop', { method: 'POST' });
    // Refresh camera status to update button states correctly
    getCameraStatus();
}

// --- Single Capture (Keep previous) ---
async function captureSingle() {
    console.log("Triggering single capture...");
    captureStatus.textContent = 'Capturing...';
    disableControls(true); // Disable buttons during capture

    const format = captureFormatSelect.value; // Get selected format override

    const data = await fetchApi('/api/capture/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: format }) // Send format override if needed
    });

    if (data && data.success) {
        captureStatus.textContent = `Success: ${data.message || 'Image captured.'}`;
        console.log("File saved:", data.filepath);
        // Optionally: Refresh timelapse list if capture was part of one (or handle separately)
        listTimelapses(); // Refresh list in case it was a test shot in a new folder?
    } else {
        captureStatus.textContent = `Error: ${data?.message || 'Capture failed.'}`;
        alert(`Capture failed: ${data?.message || 'Unknown error. Check logs.'}`);
    }
    disableControls(false); // Re-enable controls
    getCameraStatus(); // Refresh status which also updates button states
}


// --- Timelapse (Keep previous start/stop/poll logic) ---
async function startTimelapse() {
    console.log("Starting timelapse...");
    if (isTimelapseActive) return;

    const interval = parseInt(timelapseIntervalInput.value, 10);
    const count = parseInt(timelapseCountInput.value, 10);
    const format = captureFormatSelect.value; // Use the same format override selector

    if (isNaN(interval) || interval <= 0 || isNaN(count) || count <= 0) {
        alert("Please enter valid positive numbers for timelapse interval and count.");
        return;
    }

    disableControls(true); // Disable other actions
    btnStartTimelapse.disabled = true;
    btnStopTimelapse.disabled = false; // Enable stop button

    const data = await fetchApi('/api/timelapse/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: interval, count: count, format: format })
    });

    if (data && data.success) {
        isTimelapseActive = true;
        console.log("Timelapse started on backend.");
        timelapseStatusMessage.textContent = "Started...";
        timelapseProgress.textContent = `0 / ${count}`;
        // Start polling for status updates
        startTimelapseStatusPolling(count);
    } else {
        alert(`Failed to start timelapse: ${data?.message || 'Unknown error.'}`);
        disableControls(false); // Re-enable controls if start failed
        btnStartTimelapse.disabled = false;
        btnStopTimelapse.disabled = true;
    }
}

async function stopTimelapse() {
    console.log("Stopping timelapse...");
    if (!isTimelapseActive) return;

    btnStopTimelapse.disabled = true; // Disable stop button immediately

    const data = await fetchApi('/api/timelapse/stop', { method: 'POST' });

    if (data && data.success) {
        console.log("Timelapse stop signal sent.");
        timelapseStatusMessage.textContent = "Stopping...";
        // Polling will update the final status
    } else {
        alert(`Failed to send stop signal: ${data?.message || 'Unknown error.'}`);
        // Might need manual intervention or refresh
        btnStopTimelapse.disabled = false; // Re-enable if signal failed
    }
    // Note: isTimelapseActive will be set to false by the status poller when backend confirms
}

function startTimelapseStatusPolling(totalCount) {
    if (timelapseStatusIntervalId) clearInterval(timelapseStatusIntervalId); // Clear previous poll

    timelapseStatusIntervalId = setInterval(async () => {
        // Only poll if the tab is potentially visible or timelapse is active
        // (Could optimize further by checking if tab is actually visible)
        if (!isTimelapseActive && timelapseStatusIntervalId) {
             clearInterval(timelapseStatusIntervalId);
             timelapseStatusIntervalId = null;
             return;
        }

        const statusData = await fetchApi('/api/timelapse/status', {}, false); // Poll quietly

        if (statusData) {
            timelapseStatusMessage.textContent = statusData.message || 'Polling...';
            timelapseProgress.textContent = `${statusData.count || 0} / ${statusData.total || totalCount}`;

            if (!statusData.active) {
                // Timelapse finished or stopped
                console.log("Timelapse finished or stopped according to status poll.");
                clearInterval(timelapseStatusIntervalId);
                timelapseStatusIntervalId = null;
                isTimelapseActive = false;
                disableControls(false); // Re-enable controls
                // Update button states via getCameraStatus
                listTimelapses(); // Refresh the list of sequences
                getCameraStatus(); // Refresh main status/buttons
            }
        } else {
            // Failed to get status, maybe server issue?
            console.error("Failed to get timelapse status during polling.");
        }
    }, 2000); // Poll every 2 seconds
}

// --- Timelapse Listing & Selection ---
async function listTimelapses() {
    console.log("Fetching timelapse list...");
    timelapseList.innerHTML = '<li>Loading...</li>';
    const data = await fetchApi('/api/timelapse/list', {}, false); // Fetch quietly

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

     // Update UI
     selectedTimelapseName.textContent = folderName;
     timelapseSelectPrompt.classList.add('hidden');
     timelapseOptionsPanel.classList.remove('hidden');
     timelapseAssemblyStatus.textContent = ''; // Clear previous status

     // Highlight selected item in the list
     document.querySelectorAll('#timelapse-list li').forEach(item => {
         item.classList.toggle('bg-blue-200', item.dataset.folder === folderName);
     });

     // Enable the assemble button
     btnAssembleTimelapse.disabled = false;
}

// --- Timelapse Processing ---
async function assembleTimelapse() {
    if (!selectedTimelapseFolder) {
        alert("Please select a timelapse sequence first.");
        return;
    }

    console.log(`Assembling timelapse for: ${selectedTimelapseFolder}`);
    timelapseAssemblyStatus.textContent = 'Starting assembly... This may take a while.';
    btnAssembleTimelapse.disabled = true;

    // Gather parameters from the UI
    const processRaw = document.getElementById('tl-process-raw').checked;
    const useCameraWb = document.getElementById('tl-use-camera-wb').checked;
    const brightness = parseFloat(tlBrightnessSlider.value);
    const frameRate = parseInt(document.getElementById('tl-fps').value, 10);
    const resolution = document.getElementById('tl-resolution').value.trim() || null; // Null if empty
    const cropX = parseInt(document.getElementById('tl-crop-x').value, 10);
    const cropY = parseInt(document.getElementById('tl-crop-y').value, 10);
    const cropW = parseInt(document.getElementById('tl-crop-w').value, 10);
    const cropH = parseInt(document.getElementById('tl-crop-h').value, 10);

    let cropRect = null;
    if (!isNaN(cropX) && !isNaN(cropY) && !isNaN(cropW) && !isNaN(cropH) && cropW > 0 && cropH > 0) {
        cropRect = [cropX, cropY, cropW, cropH];
    }

    const params = {
        folder: selectedTimelapseFolder,
        process_raw: processRaw,
        raw_settings: { // Pass RAW settings if processing is enabled
            use_camera_wb: useCameraWb,
            brightness: brightness,
            // Add contrast/saturation here if implemented
        },
        assembly_settings: {
            frame_rate: frameRate,
            resolution: resolution,
            crop_rect: cropRect
        }
    };

    // TODO: Implement this API endpoint in Flask
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
    // Hide all content panels
    tabContents.forEach(content => {
        content.classList.add('hidden');
    });

    // Deactivate all tab buttons
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });

    // Show the target content panel
    const targetContent = document.querySelector(targetTabId);
    if (targetContent) {
        targetContent.classList.remove('hidden');
    }

    // Activate the target tab button
    const targetButton = document.querySelector(`[data-tab-target="${targetTabId}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }

    // Stop preview if switching away from the live control tab
    if (targetTabId !== '#tab-live-control' && isPreviewActive) {
        console.log("Switching tab away from Live Control, stopping preview.");
        stopPreview();
    }
}

// --- Event Listeners ---
btnRefreshStatus.addEventListener('click', () => {
    getCameraStatus();
    getCameraSettings(); // Also refresh settings on manual status refresh
});
btnStartPreview.addEventListener('click', startPreview);
btnStopPreview.addEventListener('click', stopPreview);
btnCaptureSingle.addEventListener('click', captureSingle);

btnStartTimelapse.addEventListener('click', startTimelapse);
btnStopTimelapse.addEventListener('click', stopTimelapse);
btnRefreshTimelapses.addEventListener('click', listTimelapses);
btnAssembleTimelapse.addEventListener('click', assembleTimelapse);

// Settings changes using event delegation
cameraSettingsContainer.addEventListener('change', (event) => {
    const target = event.target;
    // Check if the changed element is one of our setting controls
    if (target.dataset.settingName && (target.tagName === 'SELECT' || target.type === 'checkbox' || target.type === 'text' || target.type === 'range')) {
         // Range input 'change' event is handled directly in buildSettingControls to avoid duplicate calls
         if (target.type !== 'range') {
             const value = target.type === 'checkbox' ? (target.checked ? 1 : 0) : target.value;
             setCameraSetting(target.dataset.settingName, value);
         }
    }
});

// Preview rate change
previewRateInput.addEventListener('change', () => {
    const newRate = parseFloat(previewRateInput.value);
    if (!isNaN(newRate) && newRate > 0) {
        previewRefreshRate = Math.max(100, 1000 / newRate);
        if (isPreviewActive) {
            console.log("Preview rate changed, restarting preview...");
            stopPreview().then(startPreview); // Chain stop and start
        }
    } else {
        previewRateInput.value = 1.0 / (previewRefreshRate / 1000);
    }
});

// Tab button clicks
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetTabId = button.getAttribute('data-tab-target');
        switchTab(targetTabId);
    });
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
    switchTab('#tab-live-control'); // Activate the first tab by default
    getCameraStatus(); // Get status first
    getCameraSettings(); // Attempt to load settings
    listTimelapses(); // Attempt to load timelapses

    // Set initial button states
    btnStopPreview.disabled = true;
    btnStopTimelapse.disabled = true;
    btnAssembleTimelapse.disabled = true; // Disabled until a timelapse is selected
    timelapseOptionsPanel.classList.add('hidden'); // Hide options initially
});
