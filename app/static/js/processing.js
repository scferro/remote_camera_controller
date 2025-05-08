/**
 * Image processing functionality module
 */

// --- DOM Elements: Timelapse Processing ---
const timelapseList = document.getElementById('timelapse-list');
const btnRefreshTimelapses = document.getElementById('btn-refresh-timelapses');
const selectedTimelapseName = document.getElementById('selected-timelapse-name');
const timelapseSelectPrompt = document.getElementById('timelapse-select-prompt');
const timelapseOptionsPanel = document.getElementById('timelapse-options-panel');
const btnAssembleTimelapse = document.getElementById('btn-assemble-timelapse');
const timelapseAssemblyStatus = document.getElementById('timelapse-assembly-status');
const tlBrightnessSlider = document.getElementById('tl-brightness');
const tlBrightnessValue = document.getElementById('tl-brightness-value');

// --- DOM Elements: Single Image Processing ---
// To be implemented when single image processing UI is created

// --- State ---
let selectedTimelapseFolder = null; // Keep track of selected timelapse

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

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Processing.js: DOM loaded");
    
    // Refresh timelapse list button
    if (btnRefreshTimelapses) {
        btnRefreshTimelapses.addEventListener('click', listTimelapses);
    }
    
    // Assemble timelapse button
    if (btnAssembleTimelapse) {
        btnAssembleTimelapse.addEventListener('click', assembleTimelapse);
    }
    
    // Brightness slider value display
    if (tlBrightnessSlider && tlBrightnessValue) {
        tlBrightnessSlider.addEventListener('input', (event) => {
            tlBrightnessValue.textContent = parseFloat(event.target.value).toFixed(2);
        });
    }
    
    // Initialize timelapse options
    if (timelapseOptionsPanel) {
        timelapseOptionsPanel.classList.add('hidden');
    }
    
    if (btnAssembleTimelapse) {
        btnAssembleTimelapse.disabled = true;
    }
    
    // Load initial timelapse list
    listTimelapses();
});

// --- Single Image Processing ---
// To be implemented in the future

// --- Exports ---
// Make functions available to other modules
window.listTimelapses = listTimelapses;