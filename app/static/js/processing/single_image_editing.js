/**
 * Single Image Editing Component
 * Handles image adjustment controls and processing requests
 */

// --- DOM Elements ---
const noImageSelectedEdit = document.getElementById('no-image-selected-edit');
const editingControls = document.getElementById('editing-controls');
const brightnessSlider = document.getElementById('brightness-slider');
const brightnessValue = document.getElementById('brightness-value');
const contrastSlider = document.getElementById('contrast-slider');
const contrastValue = document.getElementById('contrast-value');
const saturationSlider = document.getElementById('saturation-slider');
const saturationValue = document.getElementById('saturation-value');
const useCameraWb = document.getElementById('use-camera-wb');
const highlightRecovery = document.getElementById('highlight-recovery');
const highlightRecoveryValue = document.getElementById('highlight-recovery-value');
const colorTempSlider = document.getElementById('color-temp-slider');
const colorTempValue = document.getElementById('color-temp-value');
const tintSlider = document.getElementById('tint-slider');
const tintValue = document.getElementById('tint-value');
const rawSettings = document.getElementById('raw-settings');
const btnApplyEdits = document.getElementById('btn-apply-edits');
const btnResetEdits = document.getElementById('btn-reset-edits');

// --- State ---
let currentImageFile = null;
let isProcessing = false;
let defaultSettings = {
    brightness: 1.0,
    contrast: 1.0,
    saturation: 1.0,
    useCameraWb: true,
    highlightRecovery: 0,
    colorTemp: 5500,
    tint: 0
};
let currentSettings = {...defaultSettings};

// --- Event Handlers ---

// Update the UI to show editing controls
function showEditingControls(file) {
    currentImageFile = file;
    
    if (!file) {
        noImageSelectedEdit.classList.remove('hidden');
        editingControls.classList.add('hidden');
        return;
    }
    
    noImageSelectedEdit.classList.add('hidden');
    editingControls.classList.remove('hidden');
    
    // Determine if this is a RAW file
    const isRaw = file.name.toLowerCase().endsWith('.arw') || 
                 file.name.toLowerCase().endsWith('.raw') || 
                 file.name.toLowerCase().endsWith('.nef') || 
                 file.name.toLowerCase().endsWith('.cr2');
    
    // Show/hide RAW specific settings
    if (isRaw) {
        rawSettings.classList.remove('hidden');
    } else {
        rawSettings.classList.add('hidden');
    }
    
    // Reset settings to defaults
    resetSettings();
}

// Update displayed values when sliders change
function updateSliderDisplays() {
    brightnessValue.textContent = brightnessSlider.value;
    contrastValue.textContent = contrastSlider.value;
    saturationValue.textContent = saturationSlider.value;
    highlightRecoveryValue.textContent = highlightRecovery.value;
    colorTempValue.textContent = `${colorTempSlider.value}K`;
    tintValue.textContent = tintSlider.value;
}

// Collect current settings from UI
function collectSettings() {
    return {
        brightness: parseFloat(brightnessSlider.value),
        contrast: parseFloat(contrastSlider.value),
        saturation: parseFloat(saturationSlider.value),
        useCameraWb: useCameraWb.checked,
        highlightRecovery: parseInt(highlightRecovery.value),
        colorTemp: parseInt(colorTempSlider.value),
        tint: parseInt(tintSlider.value)
    };
}

// Reset settings to defaults
function resetSettings() {
    brightnessSlider.value = defaultSettings.brightness;
    contrastSlider.value = defaultSettings.contrast;
    saturationSlider.value = defaultSettings.saturation;
    useCameraWb.checked = defaultSettings.useCameraWb;
    highlightRecovery.value = defaultSettings.highlightRecovery;
    colorTempSlider.value = defaultSettings.colorTemp;
    tintSlider.value = defaultSettings.tint;
    
    updateSliderDisplays();
    currentSettings = {...defaultSettings};
}

// Apply editing settings to the image
async function applyEdits() {
    if (!currentImageFile || isProcessing) return;
    
    // Collect settings from UI
    currentSettings = collectSettings();
    
    // Set processing state
    isProcessing = true;
    btnApplyEdits.disabled = true;
    btnApplyEdits.textContent = 'Processing...';
    
    try {
        // Check if it's an uploaded file or server file
        let response;
        
        if (currentImageFile.isUploaded && currentImageFile.file) {
            // For uploaded files, send the file and settings to the server
            const formData = new FormData();
            formData.append('file', currentImageFile.file);
            formData.append('settings', JSON.stringify(currentSettings));
            
            response = await fetch('/api/process/upload', {
                method: 'POST',
                body: formData
            });
        } else {
            // For server-side files, send the path and settings
            response = await fetch('/api/process/single', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    input_file: currentImageFile.path,
                    ...currentSettings
                })
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update the preview with the processed image
            const processedUrl = data.output_url || 
                                 `/api/files/image?path=${encodeURIComponent(data.output_path)}&t=${Date.now()}`;
            
            // Dispatch event to notify preview component
            const event = new CustomEvent('imageProcessed', { 
                detail: { 
                    url: processedUrl,
                    settings: currentSettings
                } 
            });
            document.dispatchEvent(event);
            
            // Switch to processed view
            if (window.singleImagePreview) {
                window.singleImagePreview.setPreviewMode('processed');
            }
        } else {
            console.error('Processing failed:', data.message);
            alert(`Processing failed: ${data.message}`);
        }
    } catch (error) {
        console.error('Error applying edits:', error);
        alert('Error applying edits. Check console for details.');
    } finally {
        // Reset state
        isProcessing = false;
        btnApplyEdits.disabled = false;
        btnApplyEdits.textContent = 'Apply';
    }
}

// Initialize
function initSingleImageEditing() {
    if (!editingControls || !noImageSelectedEdit) {
        console.warn('Single image editing: Some required DOM elements not found');
        return;
    }
    
    // Set up event listeners for sliders
    brightnessSlider.addEventListener('input', updateSliderDisplays);
    contrastSlider.addEventListener('input', updateSliderDisplays);
    saturationSlider.addEventListener('input', updateSliderDisplays);
    highlightRecovery.addEventListener('input', updateSliderDisplays);
    colorTempSlider.addEventListener('input', updateSliderDisplays);
    tintSlider.addEventListener('input', updateSliderDisplays);
    
    // Set up button event listeners
    btnApplyEdits.addEventListener('click', applyEdits);
    btnResetEdits.addEventListener('click', resetSettings);
    
    // Listen for image selection events
    document.addEventListener('singleImageSelected', (event) => {
        showEditingControls(event.detail);
    });
    
    // Initialize with no image
    showEditingControls(null);
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', initSingleImageEditing);

// Exports
window.singleImageEditing = {
    applyEdits,
    resetSettings,
    getCurrentSettings: () => currentSettings
};