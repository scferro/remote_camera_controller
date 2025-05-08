/**
 * Image Editor JavaScript Module
 * Handles UI interactions for image editing functionality
 */

// --- DOM Elements ---
// Image browser elements
const imageBrowser = document.getElementById('image-browser');
const btnRefreshImages = document.getElementById('btn-refresh-images');
const btnParentDir = document.getElementById('btn-parent-dir');
const currentPath = document.getElementById('current-path');
const directoryList = document.getElementById('directory-list');
const imageList = document.getElementById('image-list');

// Image preview elements
const previewContainer = document.getElementById('preview-container');
const imagePreview = document.getElementById('image-preview');
const previewPlaceholder = document.getElementById('preview-placeholder');
const previewLoading = document.getElementById('preview-loading');
const imageName = document.getElementById('image-name');

// Control elements
const btnUndo = document.getElementById('btn-undo');
const btnReset = document.getElementById('btn-reset');
const btnToggleCrop = document.getElementById('btn-toggle-crop');
const btnRotate = document.getElementById('btn-rotate');
const btnSave = document.getElementById('btn-save');

// Crop controls
const cropControls = document.getElementById('crop-controls');
const cropLeft = document.getElementById('crop-left');
const cropTop = document.getElementById('crop-top');
const cropRight = document.getElementById('crop-right');
const cropBottom = document.getElementById('crop-bottom');
const btnCropPreview = document.getElementById('btn-crop-preview');
const btnApplyCrop = document.getElementById('btn-apply-crop');

// Adjustment controls
const brightnessSlider = document.getElementById('brightness-slider');
const brightnessValue = document.getElementById('brightness-value');
const contrastSlider = document.getElementById('contrast-slider');
const contrastValue = document.getElementById('contrast-value');
const saturationSlider = document.getElementById('saturation-slider');
const saturationValue = document.getElementById('saturation-value');
const filterSelect = document.getElementById('filter-select');
const formatSelect = document.getElementById('format-select');
const qualitySlider = document.getElementById('quality-slider');
const qualityValue = document.getElementById('quality-value');
const outputFilename = document.getElementById('output-filename');
const btnShowMetadata = document.getElementById('btn-show-metadata');

// Modal elements
const metadataModal = document.getElementById('metadata-modal');
const closeMetadataModal = document.getElementById('close-metadata-modal');
const metadataContent = document.getElementById('metadata-content');
const rotateModal = document.getElementById('rotate-modal');
const closeRotateModal = document.getElementById('close-rotate-modal');
const rotationSlider = document.getElementById('rotation-slider');
const rotationValue = document.getElementById('rotation-value');
const btnApplyRotation = document.getElementById('btn-apply-rotation');

// --- State ---
let currentDirectory = '';
let selectedImage = null;
let imageMetadata = null;
let sessionId = 'image-editor-' + Date.now(); // Generate a unique session ID
let originalImageSize = null; // Store original image dimensions
let isCropMode = false;
let cropPreviewMode = false;

// --- API Functions ---

/**
 * List files and directories at the given path
 */
async function browseDirectory(directory = '') {
    try {
        showDirectoryLoading(true);
        
        const url = `/api/editor/preview/browse?dir=${encodeURIComponent(directory)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Error listing directory: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            currentDirectory = data.contents.path;
            updateBrowserUI(data.contents);
        } else {
            throw new Error(data.message || 'Failed to browse directory');
        }
    } catch (error) {
        console.error('Browse error:', error);
        alert(`Error browsing directory: ${error.message}`);
    } finally {
        showDirectoryLoading(false);
    }
}

/**
 * Load an image for editing
 */
async function loadImage(imagePath) {
    try {
        showImageLoading(true);
        
        // Close previous session if exists
        if (selectedImage) {
            try {
                await fetch('/api/editor/image/close', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId })
                });
            } catch (e) {
                console.warn('Error closing previous session:', e);
            }
        }
        
        // Create a new editing session
        const response = await fetch('/api/editor/image/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: imagePath,
                session_id: sessionId
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error loading image: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            selectedImage = imagePath;
            imageMetadata = data.metadata;
            originalImageSize = imageMetadata.size;
            
            // Update UI
            updateImagePreview();
            updateImageInfo();
            enableControls(true);
        } else {
            throw new Error(data.message || 'Failed to load image');
        }
    } catch (error) {
        console.error('Load error:', error);
        alert(`Error loading image: ${error.message}`);
        showImageLoading(false);
    }
}

/**
 * Update the image preview
 */
async function updateImagePreview() {
    if (!selectedImage) {
        return;
    }
    
    try {
        showImageLoading(true);
        
        // Clear any existing preview
        imagePreview.src = '';
        
        // Calculate preview size to fit container
        const containerWidth = previewContainer.clientWidth;
        const maxSize = Math.min(800, containerWidth);
        
        // Set the preview image source with the current timestamp to avoid caching
        const timestamp = Date.now();
        imagePreview.src = `/api/editor/image/preview?session_id=${sessionId}&max_size=${maxSize}&t=${timestamp}`;
        
        // Show the preview when loaded
        imagePreview.onload = function() {
            showImageLoading(false);
            imagePreview.classList.remove('hidden');
            previewPlaceholder.classList.add('hidden');
        };
        
        // Handle load error
        imagePreview.onerror = function() {
            showImageLoading(false);
            imagePreview.classList.add('hidden');
            previewPlaceholder.classList.remove('hidden');
            previewPlaceholder.textContent = 'Error loading preview';
        };
    } catch (error) {
        console.error('Preview error:', error);
        showImageLoading(false);
        imagePreview.classList.add('hidden');
        previewPlaceholder.classList.remove('hidden');
        previewPlaceholder.textContent = 'Error loading preview';
    }
}

/**
 * Apply crop to the image
 */
async function applyCrop() {
    if (!selectedImage || !isCropMode) {
        return;
    }
    
    try {
        showImageLoading(true);
        
        // Get crop coordinates
        const left = parseInt(cropLeft.value) || 0;
        const top = parseInt(cropTop.value) || 0;
        const right = parseInt(cropRight.value) || 0;
        const bottom = parseInt(cropBottom.value) || 0;
        
        // Validate crop coordinates
        if (left >= right || top >= bottom) {
            throw new Error('Invalid crop coordinates. Right/Bottom must be greater than Left/Top.');
        }
        
        const response = await fetch('/api/editor/image/crop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                crop: [left, top, right, bottom]
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error applying crop: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update preview and exit crop mode
            updateImagePreview();
            toggleCropMode(false);
        } else {
            throw new Error(data.message || 'Failed to apply crop');
        }
    } catch (error) {
        console.error('Crop error:', error);
        alert(`Error applying crop: ${error.message}`);
        showImageLoading(false);
    }
}

/**
 * Apply rotation to the image
 */
async function applyRotation(angle) {
    if (!selectedImage) {
        return;
    }
    
    try {
        showImageLoading(true);
        
        const response = await fetch('/api/editor/image/rotate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                angle: angle,
                expand: true
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error applying rotation: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update preview
            updateImagePreview();
        } else {
            throw new Error(data.message || 'Failed to apply rotation');
        }
    } catch (error) {
        console.error('Rotation error:', error);
        alert(`Error applying rotation: ${error.message}`);
        showImageLoading(false);
    }
}

/**
 * Apply image adjustments
 */
async function applyAdjustments() {
    if (!selectedImage) {
        return;
    }
    
    try {
        showImageLoading(true);
        
        const adjustments = {
            brightness: parseFloat(brightnessSlider.value),
            contrast: parseFloat(contrastSlider.value),
            saturation: parseFloat(saturationSlider.value)
        };
        
        const response = await fetch('/api/editor/image/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                adjustments: adjustments
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error applying adjustments: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update preview
            updateImagePreview();
        } else {
            throw new Error(data.message || 'Failed to apply adjustments');
        }
    } catch (error) {
        console.error('Adjustment error:', error);
        alert(`Error applying adjustments: ${error.message}`);
        showImageLoading(false);
    }
}

/**
 * Apply a filter to the image
 */
async function applyFilter(filterType) {
    if (!selectedImage || !filterType) {
        return;
    }
    
    try {
        showImageLoading(true);
        
        const response = await fetch('/api/editor/image/filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                filter: filterType
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error applying filter: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update preview
            updateImagePreview();
        } else {
            throw new Error(data.message || 'Failed to apply filter');
        }
    } catch (error) {
        console.error('Filter error:', error);
        alert(`Error applying filter: ${error.message}`);
        showImageLoading(false);
    }
}

/**
 * Reset all edits to original state
 */
async function resetImage() {
    if (!selectedImage) {
        return;
    }
    
    try {
        showImageLoading(true);
        
        const response = await fetch('/api/editor/image/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error resetting image: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update preview and reset controls
            updateImagePreview();
            resetControls();
        } else {
            throw new Error(data.message || 'Failed to reset image');
        }
    } catch (error) {
        console.error('Reset error:', error);
        alert(`Error resetting image: ${error.message}`);
        showImageLoading(false);
    }
}

/**
 * Undo the last edit
 */
async function undoLastEdit() {
    if (!selectedImage) {
        return;
    }
    
    try {
        showImageLoading(true);
        
        const response = await fetch('/api/editor/image/undo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error undoing edit: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update preview
            updateImagePreview();
        } else {
            throw new Error(data.message || 'Nothing to undo');
        }
    } catch (error) {
        console.error('Undo error:', error);
        alert(`Error undoing last edit: ${error.message}`);
        showImageLoading(false);
    }
}

/**
 * Save the edited image
 */
async function saveImage() {
    if (!selectedImage) {
        return;
    }
    
    try {
        showImageLoading(true);
        
        // Get save parameters
        const format = formatSelect.value;
        const quality = parseInt(qualitySlider.value);
        const customFilename = outputFilename.value.trim();
        
        const response = await fetch('/api/editor/image/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                output_path: customFilename || null,
                format: format,
                quality: quality
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error saving image: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Image saved successfully to ${data.path}`);
        } else {
            throw new Error(data.message || 'Failed to save image');
        }
    } catch (error) {
        console.error('Save error:', error);
        alert(`Error saving image: ${error.message}`);
    } finally {
        showImageLoading(false);
    }
}

/**
 * Fetch and display image metadata
 */
async function showMetadata() {
    if (!selectedImage) {
        return;
    }
    
    try {
        metadataContent.innerHTML = '<p class="text-center text-gray-500">Loading metadata...</p>';
        metadataModal.classList.remove('hidden');
        
        // Fetch detailed metadata
        const response = await fetch(`/api/editor/preview/metadata?path=${encodeURIComponent(selectedImage)}`);
        
        if (!response.ok) {
            throw new Error(`Error fetching metadata: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Format metadata as HTML
            const meta = data.metadata;
            let html = '<div class="grid grid-cols-2 gap-2">';
            
            // Basic info
            html += `
                <div class="font-medium">Filename:</div><div>${meta.filename}</div>
                <div class="font-medium">Format:</div><div>${meta.format || 'Unknown'}</div>
                <div class="font-medium">Dimensions:</div><div>${meta.size.width} × ${meta.size.height} pixels</div>
                <div class="font-medium">File Size:</div><div>${formatFileSize(meta.file_size)}</div>
                <div class="font-medium">Last Modified:</div><div>${formatDate(meta.modified)}</div>
            `;
            
            // EXIF data if available
            if (meta.exif && Object.keys(meta.exif).length > 0) {
                html += '<div class="col-span-2 mt-4 pt-4 border-t border-gray-200 font-bold">EXIF Metadata</div>';
                
                for (const [key, value] of Object.entries(meta.exif)) {
                    html += `<div class="font-medium">${key}:</div><div>${value}</div>`;
                }
            }
            
            html += '</div>';
            metadataContent.innerHTML = html;
        } else {
            throw new Error(data.message || 'Failed to fetch metadata');
        }
    } catch (error) {
        console.error('Metadata error:', error);
        metadataContent.innerHTML = `<p class="text-red-500">Error fetching metadata: ${error.message}</p>`;
    }
}

// --- UI Functions ---

/**
 * Update the browser UI with directory contents
 */
function updateBrowserUI(contents) {
    // Update current path display
    currentPath.textContent = contents.path;
    
    // Enable/disable parent directory button
    btnParentDir.disabled = !contents.parent;
    
    // Update directory list
    const dirList = document.createElement('ul');
    dirList.className = 'list-none text-sm';
    
    if (contents.directories.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-gray-500';
        li.textContent = 'No subdirectories';
        dirList.appendChild(li);
    } else {
        contents.directories.forEach(dir => {
            const li = document.createElement('li');
            li.className = 'hover:bg-blue-100 cursor-pointer p-1 rounded flex items-center';
            li.innerHTML = `<span class="text-yellow-500 mr-1">📁</span> ${dir.name}`;
            li.addEventListener('click', () => browseDirectory(dir.path));
            dirList.appendChild(li);
        });
    }
    
    directoryList.innerHTML = '';
    directoryList.appendChild(dirList);
    
    // Update image list with thumbnails
    updateImageList(contents.files);
}

/**
 * Update the image list with thumbnails
 */
function updateImageList(files) {
    const container = document.createElement('div');
    container.className = 'grid grid-cols-3 gap-2 image-thumbnails';
    
    if (files.length === 0) {
        const noFiles = document.createElement('div');
        noFiles.className = 'text-gray-500 col-span-3 text-center py-4';
        noFiles.textContent = 'No images found';
        container.appendChild(noFiles);
    } else {
        files.forEach(file => {
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'thumbnail-container border rounded p-1 cursor-pointer hover:border-blue-500';
            thumbDiv.dataset.path = file.path;
            
            // Add selected class if this is the currently selected image
            if (file.path === selectedImage) {
                thumbDiv.classList.add('border-blue-500', 'bg-blue-50');
            }
            
            // Create thumbnail image
            const img = document.createElement('img');
            img.src = file.thumbnail_url;
            img.alt = file.name;
            img.className = 'w-full h-auto aspect-square object-contain bg-gray-100';
            
            // Add filename below the thumbnail
            const fileName = document.createElement('div');
            fileName.className = 'text-xs truncate mt-1 text-center';
            fileName.title = file.name;
            fileName.textContent = file.name;
            
            // Add click event to load the image
            thumbDiv.addEventListener('click', () => loadImage(file.path));
            
            thumbDiv.appendChild(img);
            thumbDiv.appendChild(fileName);
            container.appendChild(thumbDiv);
        });
    }
    
    imageList.innerHTML = '';
    imageList.appendChild(container);
}

/**
 * Update image information display
 */
function updateImageInfo() {
    if (!selectedImage || !imageMetadata) {
        imageName.textContent = 'No Image Selected';
        return;
    }
    
    // Update image name display
    imageName.textContent = imageMetadata.filename;
    
    // If editing a RAW file, set default output format to JPEG
    if (imageMetadata.is_raw && formatSelect) {
        formatSelect.value = 'JPEG';
    }
    
    // Set default output filename
    const baseName = imageMetadata.filename.substring(0, imageMetadata.filename.lastIndexOf('.'));
    outputFilename.value = `${baseName}_edited`;
}

/**
 * Toggle crop mode
 */
function toggleCropMode(enable) {
    isCropMode = enable;
    
    if (enable) {
        // Show crop controls
        cropControls.classList.remove('hidden');
        
        // Set initial crop values to full image size
        if (originalImageSize) {
            cropLeft.value = 0;
            cropTop.value = 0;
            cropRight.value = originalImageSize[0];
            cropBottom.value = originalImageSize[1];
        }
        
        // Change button state
        btnToggleCrop.textContent = 'Cancel Crop';
    } else {
        // Hide crop controls
        cropControls.classList.add('hidden');
        
        // Change button state
        btnToggleCrop.textContent = 'Crop';
        
        // Update preview to remove any crop preview
        if (cropPreviewMode) {
            cropPreviewMode = false;
            updateImagePreview();
        }
    }
}

/**
 * Enable or disable all controls
 */
function enableControls(enable) {
    // Action buttons
    btnUndo.disabled = !enable;
    btnReset.disabled = !enable;
    btnToggleCrop.disabled = !enable;
    btnRotate.disabled = !enable;
    btnSave.disabled = !enable;
    
    // Adjustment controls
    brightnessSlider.disabled = !enable;
    contrastSlider.disabled = !enable;
    saturationSlider.disabled = !enable;
    filterSelect.disabled = !enable;
    formatSelect.disabled = !enable;
    qualitySlider.disabled = !enable;
    outputFilename.disabled = !enable;
    btnShowMetadata.disabled = !enable;
    
    // Reset crop mode
    if (!enable && isCropMode) {
        toggleCropMode(false);
    }
}

/**
 * Reset all control values to defaults
 */
function resetControls() {
    // Reset adjustment sliders
    brightnessSlider.value = 1.0;
    brightnessValue.textContent = '1.0';
    contrastSlider.value = 1.0;
    contrastValue.textContent = '1.0';
    saturationSlider.value = 1.0;
    saturationValue.textContent = '1.0';
    
    // Reset filter selection
    filterSelect.value = '';
    
    // Exit crop mode if active
    if (isCropMode) {
        toggleCropMode(false);
    }
}

/**
 * Show or hide directory loading state
 */
function showDirectoryLoading(show) {
    // Add loading state to UI elements
    directoryList.classList.toggle('opacity-50', show);
    imageList.classList.toggle('opacity-50', show);
}

/**
 * Show or hide image loading state
 */
function showImageLoading(show) {
    if (show) {
        previewLoading.classList.remove('hidden');
        imagePreview.classList.add('opacity-50');
    } else {
        previewLoading.classList.add('hidden');
        imagePreview.classList.remove('opacity-50');
    }
}

/**
 * Format a file size in bytes to human-readable format
 */
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' bytes';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    } else {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
}

/**
 * Format a timestamp to a readable date
 */
function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial page load
    browseDirectory();
    
    // Directory navigation
    btnRefreshImages.addEventListener('click', () => browseDirectory(currentDirectory));
    btnParentDir.addEventListener('click', () => {
        if (btnParentDir.disabled) return;
        browseDirectory(document.getElementById('current-path').dataset.parent);
    });
    
    // Control events
    btnUndo.addEventListener('click', undoLastEdit);
    btnReset.addEventListener('click', resetImage);
    btnToggleCrop.addEventListener('click', () => toggleCropMode(!isCropMode));
    btnSave.addEventListener('click', saveImage);
    
    // Crop controls
    btnCropPreview.addEventListener('click', () => {
        // Implement crop preview logic
        cropPreviewMode = true;
        // This would typically update the preview to show crop outline
        alert('Crop preview not implemented yet');
    });
    btnApplyCrop.addEventListener('click', applyCrop);
    
    // Rotate controls
    btnRotate.addEventListener('click', () => {
        rotationSlider.value = 0;
        rotationValue.textContent = '0°';
        rotateModal.classList.remove('hidden');
    });
    closeRotateModal.addEventListener('click', () => {
        rotateModal.classList.add('hidden');
    });
    btnApplyRotation.addEventListener('click', () => {
        applyRotation(parseInt(rotationSlider.value));
        rotateModal.classList.add('hidden');
    });
    rotationSlider.addEventListener('input', () => {
        rotationValue.textContent = `${rotationSlider.value}°`;
    });
    
    // Adjustment sliders
    brightnessSlider.addEventListener('input', () => {
        brightnessValue.textContent = brightnessSlider.value;
    });
    brightnessSlider.addEventListener('change', applyAdjustments);
    
    contrastSlider.addEventListener('input', () => {
        contrastValue.textContent = contrastSlider.value;
    });
    contrastSlider.addEventListener('change', applyAdjustments);
    
    saturationSlider.addEventListener('input', () => {
        saturationValue.textContent = saturationSlider.value;
    });
    saturationSlider.addEventListener('change', applyAdjustments);
    
    // Filter selection
    filterSelect.addEventListener('change', () => {
        if (filterSelect.value) {
            applyFilter(filterSelect.value);
        }
    });
    
    // Format change
    formatSelect.addEventListener('change', () => {
        // Show/hide quality slider based on format
        const formatValue = formatSelect.value;
        const qualityControl = document.getElementById('quality-control');
        if (formatValue === 'JPEG') {
            qualityControl.classList.remove('hidden');
        } else {
            qualityControl.classList.add('hidden');
        }
    });
    
    // Quality slider
    qualitySlider.addEventListener('input', () => {
        qualityValue.textContent = qualitySlider.value;
    });
    
    // Metadata modal
    btnShowMetadata.addEventListener('click', showMetadata);
    closeMetadataModal.addEventListener('click', () => {
        metadataModal.classList.add('hidden');
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === metadataModal) {
            metadataModal.classList.add('hidden');
        }
        if (event.target === rotateModal) {
            rotateModal.classList.add('hidden');
        }
    });
});