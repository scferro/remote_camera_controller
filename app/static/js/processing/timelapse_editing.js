/**
 * Timelapse Editing Component
 * Handles batch adjustment controls for timelapse images
 */

// --- DOM Elements ---
const noTimelapseSelectedEdit = document.getElementById('no-timelapse-selected-edit');
const timelapseEditingControls = document.getElementById('timelapse-editing-controls');
const tlBrightnessSlider = document.getElementById('tl-brightness-slider');
const tlBrightnessValue = document.getElementById('tl-brightness-value');
const tlContrastSlider = document.getElementById('tl-contrast-slider');
const tlContrastValue = document.getElementById('tl-contrast-value');
const tlSaturationSlider = document.getElementById('tl-saturation-slider');
const tlSaturationValue = document.getElementById('tl-saturation-value');
const tlProcessRaw = document.getElementById('tl-process-raw');
const tlUseCameraWb = document.getElementById('tl-use-camera-wb');
const tlHighlightRecovery = document.getElementById('tl-highlight-recovery');
const tlHighlightRecoveryValue = document.getElementById('tl-highlight-recovery-value');
const tlRawSettings = document.getElementById('tl-raw-settings');
const applyScope = document.getElementsByName('apply-scope');
const btnApplyBatchEdits = document.getElementById('btn-apply-batch-edits');
const btnResetBatchEdits = document.getElementById('btn-reset-batch-edits');
const batchProcessingStatus = document.getElementById('batch-processing-status');
const batchProgressBar = document.getElementById('batch-progress-bar');
const batchProcessedCount = document.getElementById('batch-processed-count');
const batchTotalCount = document.getElementById('batch-total-count');

// --- State ---
let currentTimelapseFolder = null;
let currentTimelapseInfo = null;
let isProcessing = false;
let defaultSettings = {
    brightness: 1.0,
    contrast: 1.0,
    saturation: 1.0,
    processRaw: true,
    useCameraWb: true,
    highlightRecovery: 0
};
let currentSettings = {...defaultSettings};

// --- Event Handlers ---

// Update the UI to show editing controls
function showEditingControls(folder, info) {
    currentTimelapseFolder = folder;
    currentTimelapseInfo = info;
    
    if (!folder) {
        noTimelapseSelectedEdit.classList.remove('hidden');
        timelapseEditingControls.classList.add('hidden');
        return;
    }
    
    noTimelapseSelectedEdit.classList.add('hidden');
    timelapseEditingControls.classList.remove('hidden');
    
    // Determine if this timelapse contains RAW files
    const hasRawFiles = info && info.image_types && 
                        info.image_types.some(type => 
                            ['arw', 'raw', 'nef', 'cr2'].includes(type.toLowerCase())
                        );
    
    // Show/hide RAW specific settings
    if (hasRawFiles) {
        tlRawSettings.classList.remove('hidden');
    } else {
        tlRawSettings.classList.add('hidden');
    }
    
    // Reset settings to defaults
    resetSettings();
}

// Update displayed values when sliders change
function updateSliderDisplays() {
    if (tlBrightnessValue) tlBrightnessValue.textContent = tlBrightnessSlider.value;
    if (tlContrastValue) tlContrastValue.textContent = tlContrastSlider.value;
    if (tlSaturationValue) tlSaturationValue.textContent = tlSaturationSlider.value;
    if (tlHighlightRecoveryValue) tlHighlightRecoveryValue.textContent = tlHighlightRecovery.value;
}

// Collect current settings from UI
function collectSettings() {
    return {
        brightness: parseFloat(tlBrightnessSlider.value),
        contrast: parseFloat(tlContrastSlider.value),
        saturation: parseFloat(tlSaturationSlider.value),
        processRaw: tlProcessRaw.checked,
        useCameraWb: tlUseCameraWb.checked,
        highlightRecovery: parseInt(tlHighlightRecovery.value),
        scope: Array.from(applyScope).find(radio => radio.checked)?.value || 'all'
    };
}

// Reset settings to defaults
function resetSettings() {
    tlBrightnessSlider.value = defaultSettings.brightness;
    tlContrastSlider.value = defaultSettings.contrast;
    tlSaturationSlider.value = defaultSettings.saturation;
    tlProcessRaw.checked = defaultSettings.processRaw;
    tlUseCameraWb.checked = defaultSettings.useCameraWb;
    tlHighlightRecovery.value = defaultSettings.highlightRecovery;
    
    // Set scope to 'all' by default
    Array.from(applyScope).forEach(radio => {
        radio.checked = radio.value === 'all';
    });
    
    updateSliderDisplays();
    currentSettings = {...defaultSettings, scope: 'all'};
}

// Apply batch edits to the timelapse
async function applyBatchEdits() {
    if (!currentTimelapseFolder || isProcessing) return;
    
    // Collect settings from UI
    currentSettings = collectSettings();
    
    // Confirm large batch operations
    if (currentTimelapseInfo && currentTimelapseInfo.image_count > 50) {
        if (!confirm(`You're about to process ${currentTimelapseInfo.image_count} images. This might take a while. Continue?`)) {
            return;
        }
    }
    
    // Set processing state
    isProcessing = true;
    btnApplyBatchEdits.disabled = true;
    btnResetBatchEdits.disabled = true;
    batchProcessingStatus.classList.remove('hidden');
    batchProgressBar.style.width = '0%';
    batchProcessedCount.textContent = '0';
    batchTotalCount.textContent = currentTimelapseInfo?.image_count || '?';
    
    try {
        const response = await fetch('/api/process/timelapse/batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                folder: currentTimelapseFolder,
                settings: currentSettings
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Request was accepted, now we need to poll for progress
            pollBatchProgress(data.task_id);
        } else {
            batchProcessingStatus.innerHTML = `<div class="text-red-500">Error: ${data.message || 'Batch processing failed'}</div>`;
            resetProcessingState();
        }
    } catch (error) {
        console.error('Error applying batch edits:', error);
        batchProcessingStatus.innerHTML = `<div class="text-red-500">Error: ${error.message || 'Check console for details'}</div>`;
        resetProcessingState();
    }
}

// Poll for batch processing progress
async function pollBatchProgress(taskId, interval = 2000) {
    if (!taskId) return;
    
    try {
        const response = await fetch(`/api/process/timelapse/batch/status?task_id=${taskId}`);
        const data = await response.json();
        
        if (data.success) {
            // Update progress
            const progress = data.progress || 0;
            const processed = data.processed_count || 0;
            const total = data.total_count || parseInt(batchTotalCount.textContent) || 0;
            
            batchProgressBar.style.width = `${progress}%`;
            batchProcessedCount.textContent = processed;
            batchTotalCount.textContent = total;
            
            if (data.status === 'completed') {
                // Processing completed
                batchProcessingStatus.innerHTML = `<div class="text-green-500">Processing completed! ${processed} images processed.</div>`;
                resetProcessingState();
                
                // Notify other components
                const event = new CustomEvent('timelapseProcessed', { 
                    detail: { 
                        folder: currentTimelapseFolder,
                        settings: currentSettings
                    } 
                });
                document.dispatchEvent(event);
            } else if (data.status === 'failed') {
                // Processing failed
                batchProcessingStatus.innerHTML = `<div class="text-red-500">Processing failed: ${data.message || 'Unknown error'}</div>`;
                resetProcessingState();
            } else {
                // Still processing, poll again
                setTimeout(() => pollBatchProgress(taskId, interval), interval);
            }
        } else {
            batchProcessingStatus.innerHTML = `<div class="text-red-500">Error checking progress: ${data.message}</div>`;
            resetProcessingState();
        }
    } catch (error) {
        console.error('Error polling batch progress:', error);
        batchProcessingStatus.innerHTML = `<div class="text-red-500">Error checking progress: ${error.message || 'Check console for details'}</div>`;
        resetProcessingState();
    }
}

// Reset processing state
function resetProcessingState() {
    isProcessing = false;
    btnApplyBatchEdits.disabled = false;
    btnResetBatchEdits.disabled = false;
}

// Initialize
function initTimelapseEditing() {
    if (!timelapseEditingControls || !noTimelapseSelectedEdit) {
        console.warn('Timelapse editing: Some required DOM elements not found');
        return;
    }
    
    // Set up event listeners for sliders
    if (tlBrightnessSlider) tlBrightnessSlider.addEventListener('input', updateSliderDisplays);
    if (tlContrastSlider) tlContrastSlider.addEventListener('input', updateSliderDisplays);
    if (tlSaturationSlider) tlSaturationSlider.addEventListener('input', updateSliderDisplays);
    if (tlHighlightRecovery) tlHighlightRecovery.addEventListener('input', updateSliderDisplays);
    
    // Set up button event listeners
    btnApplyBatchEdits.addEventListener('click', applyBatchEdits);
    btnResetBatchEdits.addEventListener('click', resetSettings);
    
    // Listen for timelapse selection events
    document.addEventListener('timelapseSelected', (event) => {
        showEditingControls(event.detail.folder, event.detail.info);
    });
    
    // Initialize with no timelapse
    showEditingControls(null, null);
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', initTimelapseEditing);

// Exports
window.timelapseEditing = {
    applyBatchEdits,
    resetSettings,
    getCurrentSettings: () => currentSettings
};