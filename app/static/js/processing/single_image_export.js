/**
 * Single Image Export Component
 * Handles export options and processing for single images
 */

// --- DOM Elements ---
const noImageSelectedExport = document.getElementById('no-image-selected-export');
const exportControls = document.getElementById('export-controls');
const formatRadios = document.querySelectorAll('input[name="export-format"]');
const jpegOptions = document.getElementById('jpeg-options');
const jpegQuality = document.getElementById('jpeg-quality');
const jpegQualityValue = document.getElementById('jpeg-quality-value');
const maintainAspectRatio = document.getElementById('maintain-aspect-ratio');
const resizePreset = document.getElementById('resize-preset');
const customSize = document.getElementById('custom-size');
const customWidth = document.getElementById('custom-width');
const customHeight = document.getElementById('custom-height');
const exportFilename = document.getElementById('export-filename');
const btnExportImage = document.getElementById('btn-export-image');
const btnDownloadImage = document.getElementById('btn-download-image');
const exportStatus = document.getElementById('export-status');

// --- State ---
let currentImageFile = null;
let lastProcessedImageUrl = null;
let isExporting = false;

// --- Event Handlers ---

// Show/hide export controls
function showExportControls(file) {
    currentImageFile = file;
    
    if (!file) {
        noImageSelectedExport.classList.remove('hidden');
        exportControls.classList.add('hidden');
        return;
    }
    
    noImageSelectedExport.classList.add('hidden');
    exportControls.classList.remove('hidden');
    
    // Generate default filename based on original filename
    if (file.name) {
        const nameParts = file.name.split('.');
        nameParts.pop(); // Remove extension
        const baseName = nameParts.join('.');
        exportFilename.placeholder = `${baseName}_processed`;
    }
}

// Toggle format-specific options
function toggleFormatOptions() {
    const selectedFormat = Array.from(formatRadios).find(radio => radio.checked)?.value;
    
    if (selectedFormat === 'JPEG') {
        jpegOptions.classList.remove('hidden');
    } else {
        jpegOptions.classList.add('hidden');
    }
}

// Toggle custom size inputs
function toggleCustomSize() {
    if (resizePreset.value === 'custom') {
        customSize.classList.remove('hidden');
    } else {
        customSize.classList.add('hidden');
    }
}

// Update quality display when slider changes
function updateQualityDisplay() {
    jpegQualityValue.textContent = `${jpegQuality.value}%`;
}

// Get current export settings from UI
function getExportSettings() {
    // Get selected format
    const format = Array.from(formatRadios).find(radio => radio.checked)?.value || 'JPEG';
    
    // Get size settings
    let width = null;
    let height = null;
    
    if (resizePreset.value !== 'original') {
        if (resizePreset.value === 'custom') {
            width = customWidth.value ? parseInt(customWidth.value) : null;
            height = customHeight.value ? parseInt(customHeight.value) : null;
        } else {
            // Parse dimensions from preset (e.g., "1920x1080")
            const dimensions = resizePreset.value.split('x');
            width = parseInt(dimensions[0]);
            height = parseInt(dimensions[1]);
        }
    }
    
    return {
        format,
        quality: format === 'JPEG' ? parseInt(jpegQuality.value) : null,
        maintain_aspect_ratio: maintainAspectRatio.checked,
        width,
        height,
        output_filename: exportFilename.value || null
    };
}

// Export the image with current settings
async function exportImage() {
    if (!currentImageFile || isExporting) return;
    
    isExporting = true;
    btnExportImage.disabled = true;
    btnExportImage.textContent = 'Processing...';
    exportStatus.textContent = 'Exporting image...';
    exportStatus.classList.remove('hidden');
    
    try {
        // Get settings from UI
        const settings = getExportSettings();
        
        // Add current editing settings if available
        if (window.singleImageEditing) {
            settings.edit_settings = window.singleImageEditing.getCurrentSettings();
        }
        
        let response;
        
        if (currentImageFile.isUploaded && currentImageFile.file) {
            // For uploaded files
            const formData = new FormData();
            formData.append('file', currentImageFile.file);
            formData.append('settings', JSON.stringify(settings));
            
            response = await fetch('/api/export/upload', {
                method: 'POST',
                body: formData
            });
        } else {
            // For server-side files
            response = await fetch('/api/export/single', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    input_file: currentImageFile.path,
                    ...settings
                })
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            lastProcessedImageUrl = data.output_url || `/api/files/image?path=${encodeURIComponent(data.output_path)}`;
            exportStatus.textContent = `Success! Exported to: ${data.output_path}`;
            btnDownloadImage.disabled = false;
        } else {
            exportStatus.textContent = `Error: ${data.message}`;
            console.error('Export failed:', data.message);
        }
    } catch (error) {
        exportStatus.textContent = 'Error exporting image. Check console for details.';
        console.error('Error exporting image:', error);
    } finally {
        isExporting = false;
        btnExportImage.disabled = false;
        btnExportImage.textContent = 'Export Image';
    }
}

// Trigger download of the exported image
function downloadImage() {
    if (!lastProcessedImageUrl) {
        alert('Please export an image first.');
        return;
    }
    
    // Create a temporary link and trigger download
    const a = document.createElement('a');
    a.href = lastProcessedImageUrl;
    a.download = exportFilename.value || 'processed_image';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Initialize
function initSingleImageExport() {
    if (!exportControls || !noImageSelectedExport) {
        console.warn('Single image export: Some required DOM elements not found');
        return;
    }
    
    // Set up event listeners
    formatRadios.forEach(radio => {
        radio.addEventListener('change', toggleFormatOptions);
    });
    
    resizePreset.addEventListener('change', toggleCustomSize);
    jpegQuality.addEventListener('input', updateQualityDisplay);
    btnExportImage.addEventListener('click', exportImage);
    btnDownloadImage.addEventListener('click', downloadImage);
    
    // Listen for image selection events
    document.addEventListener('singleImageSelected', (event) => {
        showExportControls(event.detail);
    });
    
    // Initialize state
    toggleFormatOptions();
    toggleCustomSize();
    showExportControls(null);
    btnDownloadImage.disabled = true;
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', initSingleImageExport);

// Exports
window.singleImageExport = {
    exportImage,
    downloadImage
};