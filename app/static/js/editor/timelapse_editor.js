/**
 * Timelapse Editor JavaScript Module
 * Handles UI interactions for timelapse editing functionality
 */

// --- DOM Elements ---
// Timelapse selector elements
const btnRefreshTimelapses = document.getElementById('btn-refresh-timelapses');
const timelapseList = document.getElementById('timelapse-list');
const timelapseInfo = document.getElementById('timelapse-info');
const timelapseName = document.getElementById('timelapse-name');
const timelapseFrameCount = document.getElementById('timelapse-frame-count');
const timelapseDate = document.getElementById('timelapse-date');
const btnLoadProject = document.getElementById('btn-load-project');
const btnSaveProject = document.getElementById('btn-save-project');

// Frame preview elements
const framePreviewContainer = document.getElementById('frame-preview-container');
const framePreview = document.getElementById('frame-preview');
const framePlaceholder = document.getElementById('frame-placeholder');
const frameLoading = document.getElementById('frame-loading');
const frameNumber = document.getElementById('frame-number');
const btnExtractFrame = document.getElementById('btn-extract-frame');

// Timeline scrubber elements
const timelapseScrubber = document.getElementById('timelapse-scrubber');
const frameSlider = document.getElementById('frame-slider');
const btnPrevFrame = document.getElementById('btn-prev-frame');
const btnNextFrame = document.getElementById('btn-next-frame');
const currentFrameNumber = document.getElementById('current-frame-number');
const lastFrameNumber = document.getElementById('last-frame-number');
const thumbnailStrip = document.getElementById('thumbnail-strip');

// Batch edit elements
const batchStartFrame = document.getElementById('batch-start-frame');
const batchEndFrame = document.getElementById('batch-end-frame');
const batchInterval = document.getElementById('batch-interval');
const batchCropLeft = document.getElementById('batch-crop-left');
const batchCropTop = document.getElementById('batch-crop-top');
const batchCropRight = document.getElementById('batch-crop-right');
const batchCropBottom = document.getElementById('batch-crop-bottom');
const btnCropFromCurrent = document.getElementById('btn-crop-from-current');
const batchBrightnessSlider = document.getElementById('batch-brightness-slider');
const batchBrightnessValue = document.getElementById('batch-brightness-value');
const batchContrastSlider = document.getElementById('batch-contrast-slider');
const batchContrastValue = document.getElementById('batch-contrast-value');
const batchSaturationSlider = document.getElementById('batch-saturation-slider');
const batchSaturationValue = document.getElementById('batch-saturation-value');
const btnApplyBatchEdit = document.getElementById('btn-apply-batch-edit');

// Action buttons
const btnGeneratePreviews = document.getElementById('btn-generate-previews');
const btnAssembleVideo = document.getElementById('btn-assemble-video');

// Assemble video modal elements
const assembleModal = document.getElementById('assemble-modal');
const closeAssembleModal = document.getElementById('close-assemble-modal');
const videoFps = document.getElementById('video-fps');
const videoFormat = document.getElementById('video-format');
const videoQuality = document.getElementById('video-quality');
const useEditedFrames = document.getElementById('use-edited-frames');
const videoFilename = document.getElementById('video-filename');
const btnStartAssembly = document.getElementById('btn-start-assembly');

// --- State ---
let sessionId = 'timelapse-editor-' + Date.now(); // Generate a unique session ID
let selectedTimelapseFolder = null;
let timelapseMetadata = null;
let currentFrameIndex = 0;
let totalFrames = 0;
let thumbnailsGenerated = false;
let previewsPath = null;

// --- API Functions ---

/**
 * List available timelapse sequences
 */
async function listTimelapses() {
    try {
        timelapseFrameCount.textContent = timelapseMetadata.frame_count || '0';
    timelapseDate.textContent = timelapseMetadata.date_captured || 'Unknown';
    
    // Show the info panel
    timelapseInfo.classList.remove('hidden');
    
    // Set default values for batch processing
    batchStartFrame.value = 0;
    batchEndFrame.value = totalFrames - 1;
    batchInterval.value = 1;
    
    // Set default filename for video assembly
    videoFilename.value = timelapseMetadata.name ? `${timelapseMetadata.name}_video` : '';
}

/**
 * Update frame control elements
 */
function updateFrameControls() {
    if (!selectedTimelapseFolder) {
        timelapseScrubber.classList.add('hidden');
        return;
    }
    
    // Show the scrubber
    timelapseScrubber.classList.remove('hidden');
    
    // Configure the slider
    frameSlider.min = 0;
    frameSlider.max = totalFrames - 1;
    frameSlider.value = currentFrameIndex;
    
    // Update frame number displays
    currentFrameNumber.textContent = `Frame ${currentFrameIndex + 1}`;
    lastFrameNumber.textContent = `Frame ${totalFrames}`;
}

/**
 * Update the thumbnail strip with preview images
 */
function updateThumbnailStrip(previews) {
    if (!thumbnailStrip || !previews || previews.length === 0) {
        return;
    }
    
    thumbnailStrip.innerHTML = '';
    
    // Calculate thumbnail size
    const thumbWidth = 80; // Fixed width for thumbnails
    
    previews.forEach((preview, index) => {
        // Calculate the corresponding frame index (if using sample interval)
        const frameIdx = index * 5; // Assuming sample_interval was 5
        
        // Create thumbnail element
        const thumbDiv = document.createElement('div');
        thumbDiv.className = 'thumbnail-item shrink-0 mx-1 cursor-pointer';
        thumbDiv.style.width = `${thumbWidth}px`;
        
        // Create image element
        const img = document.createElement('img');
        img.src = `/static/previews/${preview}?t=${Date.now()}`; // Add timestamp to prevent caching
        img.className = 'w-full h-auto border';
        img.dataset.frameIndex = frameIdx;
        
        // Add click handler to jump to this frame
        img.addEventListener('click', () => {
            loadFrame(frameIdx);
        });
        
        // Add frame number below thumbnail
        const frameNumDiv = document.createElement('div');
        frameNumDiv.className = 'text-xs text-center';
        frameNumDiv.textContent = `${frameIdx + 1}`;
        
        // Add elements to container
        thumbDiv.appendChild(img);
        thumbDiv.appendChild(frameNumDiv);
        thumbnailStrip.appendChild(thumbDiv);
    });
    
    // Add event listener for horizontal scroll with mouse wheel
    thumbnailStrip.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            thumbnailStrip.scrollLeft += e.deltaY;
        }
    });
    
    // Update selection
    updateThumbnailSelection();
}

/**
 * Update the selected thumbnail in the strip
 */
function updateThumbnailSelection() {
    if (!thumbnailStrip) return;
    
    // Remove selection from all thumbnails
    const thumbs = thumbnailStrip.querySelectorAll('.thumbnail-item img');
    thumbs.forEach(thumb => {
        thumb.classList.remove('border-blue-500', 'border-2');
        thumb.classList.add('border');
    });
    
    // Find the closest thumbnail to current frame and highlight it
    let closestThumb = null;
    let minDiff = Infinity;
    
    thumbs.forEach(thumb => {
        const frameIdx = parseInt(thumb.dataset.frameIndex);
        const diff = Math.abs(frameIdx - currentFrameIndex);
        if (diff < minDiff) {
            minDiff = diff;
            closestThumb = thumb;
        }
    });
    
    if (closestThumb) {
        closestThumb.classList.remove('border');
        closestThumb.classList.add('border-blue-500', 'border-2');
        
        // Scroll to the selected thumbnail
        closestThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

/**
 * Enable or disable controls based on timelapse loaded state
 */
function enableControls(enable) {
    // Extract and generate buttons
    btnExtractFrame.disabled = !enable;
    btnGeneratePreviews.disabled = !enable;
    btnAssembleVideo.disabled = !enable;
    btnSaveProject.disabled = !enable;
    
    // Batch edit controls
    batchStartFrame.disabled = !enable;
    batchEndFrame.disabled = !enable;
    batchInterval.disabled = !enable;
    batchCropLeft.disabled = !enable;
    batchCropTop.disabled = !enable;
    batchCropRight.disabled = !enable;
    batchCropBottom.disabled = !enable;
    btnCropFromCurrent.disabled = !enable;
    batchBrightnessSlider.disabled = !enable;
    batchContrastSlider.disabled = !enable;
    batchSaturationSlider.disabled = !enable;
    btnApplyBatchEdit.disabled = !enable;
}

/**
 * Show or hide loading state
 */
function showLoading(show) {
    if (show) {
        frameLoading.classList.remove('hidden');
        framePreview.classList.add('opacity-50');
    } else {
        frameLoading.classList.add('hidden');
        framePreview.classList.remove('opacity-50');
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial page load
    listTimelapses();
    
    // Timelapse listing
    btnRefreshTimelapses.addEventListener('click', listTimelapses);
    
    // Frame navigation
    frameSlider.addEventListener('input', () => {
        const frameIdx = parseInt(frameSlider.value);
        currentFrameNumber.textContent = `Frame ${frameIdx + 1}`;
    });
    
    frameSlider.addEventListener('change', () => {
        const frameIdx = parseInt(frameSlider.value);
        loadFrame(frameIdx);
    });
    
    btnPrevFrame.addEventListener('click', () => {
        if (currentFrameIndex > 0) {
            loadFrame(currentFrameIndex - 1);
        }
    });
    
    btnNextFrame.addEventListener('click', () => {
        if (currentFrameIndex < totalFrames - 1) {
            loadFrame(currentFrameIndex + 1);
        }
    });
    
    // Extract and generate functionality
    btnExtractFrame.addEventListener('click', extractCurrentFrame);
    btnGeneratePreviews.addEventListener('click', generatePreviews);
    
    // Batch edit controls
    batchBrightnessSlider.addEventListener('input', () => {
        batchBrightnessValue.textContent = batchBrightnessSlider.value;
    });
    
    batchContrastSlider.addEventListener('input', () => {
        batchContrastValue.textContent = batchContrastSlider.value;
    });
    
    batchSaturationSlider.addEventListener('input', () => {
        batchSaturationValue.textContent = batchSaturationSlider.value;
    });
    
    btnCropFromCurrent.addEventListener('click', () => {
        // This would use the current frame for crop settings
        alert('Using current frame for crop settings. This would extract dimensions from the current frame.');
        
        // Placeholder implementation - in reality we'd get actual frame dimensions
        batchCropLeft.value = 0;
        batchCropTop.value = 0;
        batchCropRight.value = 1920; // Placeholder value
        batchCropBottom.value = 1080; // Placeholder value
    });
    
    btnApplyBatchEdit.addEventListener('click', applyBatchEdit);
    
    // Video assembly
    btnAssembleVideo.addEventListener('click', () => {
        // Show the assembly modal
        assembleModal.classList.remove('hidden');
    });
    
    closeAssembleModal.addEventListener('click', () => {
        assembleModal.classList.add('hidden');
    });
    
    btnStartAssembly.addEventListener('click', assembleVideo);
    
    // Project save/load
    btnSaveProject.addEventListener('click', saveProject);
    btnLoadProject.addEventListener('click', loadProject);
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === assembleModal) {
            assembleModal.classList.add('hidden');
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Only process if a timelapse is loaded
        if (!selectedTimelapseFolder) return;
        
        switch (e.key) {
            case 'ArrowLeft':
                // Previous frame
                if (currentFrameIndex > 0) {
                    loadFrame(currentFrameIndex - 1);
                }
                break;
            case 'ArrowRight':
                // Next frame
                if (currentFrameIndex < totalFrames - 1) {
                    loadFrame(currentFrameIndex + 1);
                }
                break;
            case 'Home':
                // First frame
                loadFrame(0);
                break;
            case 'End':
                // Last frame
                loadFrame(totalFrames - 1);
                break;
        }
    });
});
List.innerHTML = '<li class="text-gray-500">Loading...</li>';
        
        const response = await fetch('/api/editor/timelapse/list');
        
        if (!response.ok) {
            throw new Error(`Error listing timelapses: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            updateTimelapseList(data.timelapses);
        } else {
            throw new Error(data.message || 'Failed to list timelapses');
        }
    } catch (error) {
        console.error('List error:', error);
        timelapseList.innerHTML = `<li class="text-red-500">Error: ${error.message}</li>`;
    }
}

/**
 * Load a timelapse sequence for editing
 */
async function loadTimelapse(folder) {
    try {
        showLoading(true);
        
        // Close previous session if exists
        if (selectedTimelapseFolder) {
            try {
                await fetch('/api/editor/timelapse/close', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId })
                });
            } catch (e) {
                console.warn('Error closing previous session:', e);
            }
        }
        
        // Create a new editing session
        const response = await fetch('/api/editor/timelapse/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: folder,
                session_id: sessionId
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error loading timelapse: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            selectedTimelapseFolder = folder;
            timelapseMetadata = data.metadata;
            currentFrameIndex = 0;
            totalFrames = timelapseMetadata.frame_count;
            thumbnailsGenerated = false;
            
            // Update UI
            updateTimelapseInfo();
            updateFrameControls();
            enableControls(true);
            loadFrame(0);
            
            // Highlight selected timelapse in list
            highlightSelectedTimelapse();
        } else {
            throw new Error(data.message || 'Failed to load timelapse');
        }
    } catch (error) {
        console.error('Load error:', error);
        alert(`Error loading timelapse: ${error.message}`);
        showLoading(false);
    }
}

/**
 * Load and display a specific frame
 */
async function loadFrame(index) {
    if (!selectedTimelapseFolder || index < 0 || index >= totalFrames) {
        return;
    }
    
    try {
        showLoading(true);
        
        // Clear any existing preview
        framePreview.src = '';
        
        // Calculate preview size to fit container
        const containerWidth = framePreviewContainer.clientWidth;
        const maxSize = Math.min(800, containerWidth);
        
        // Set the preview image source with the current timestamp to avoid caching
        const timestamp = Date.now();
        framePreview.src = `/api/editor/timelapse/frame_preview/${index}?session_id=${sessionId}&max_size=${maxSize}&t=${timestamp}`;
        
        // Show the preview when loaded
        framePreview.onload = function() {
            showLoading(false);
            framePreview.classList.remove('hidden');
            framePlaceholder.classList.add('hidden');
        };
        
        // Handle load error
        framePreview.onerror = function() {
            showLoading(false);
            framePreview.classList.add('hidden');
            framePlaceholder.classList.remove('hidden');
            framePlaceholder.textContent = 'Error loading frame';
        };
        
        // Update frame number display
        frameNumber.textContent = `Frame ${index + 1} of ${totalFrames}`;
        currentFrameIndex = index;
        
        // Update scrubber position
        frameSlider.value = index;
        currentFrameNumber.textContent = `Frame ${index + 1}`;
        
        // Update thumbnail strip selection
        updateThumbnailSelection();
    } catch (error) {
        console.error('Frame load error:', error);
        showLoading(false);
        framePreview.classList.add('hidden');
        framePlaceholder.classList.remove('hidden');
        framePlaceholder.textContent = 'Error loading frame';
    }
}

/**
 * Generate preview thumbnails for the timelapse
 */
async function generatePreviews() {
    if (!selectedTimelapseFolder) {
        return;
    }
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/editor/timelapse/previews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                sample_interval: 5, // Generate a preview for every 5th frame by default
                max_size: 150 // Small thumbnails for the strip
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error generating previews: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            thumbnailsGenerated = true;
            previewsPath = data.preview_dir;
            
            // Load thumbnails into the strip
            updateThumbnailStrip(data.previews);
        } else {
            throw new Error(data.message || 'Failed to generate previews');
        }
    } catch (error) {
        console.error('Preview generation error:', error);
        alert(`Error generating previews: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

/**
 * Extract current frame as a separate image
 */
async function extractCurrentFrame() {
    if (!selectedTimelapseFolder) {
        return;
    }
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/editor/timelapse/extract_frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                index: currentFrameIndex
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error extracting frame: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Frame extracted successfully: ${data.path}`);
        } else {
            throw new Error(data.message || 'Failed to extract frame');
        }
    } catch (error) {
        console.error('Frame extraction error:', error);
        alert(`Error extracting frame: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

/**
 * Apply batch edit to frames
 */
async function applyBatchEdit() {
    if (!selectedTimelapseFolder) {
        return;
    }
    
    try {
        showLoading(true);
        
        // Get batch edit parameters
        const startIndex = parseInt(batchStartFrame.value) || 0;
        const endIndex = parseInt(batchEndFrame.value) || (totalFrames - 1);
        const intervalValue = parseInt(batchInterval.value) || 1;
        
        // Validate range
        if (startIndex < 0 || endIndex >= totalFrames || startIndex > endIndex) {
            throw new Error('Invalid frame range.');
        }
        
        // Build crop parameters if all fields are filled
        let cropParams = null;
        if (batchCropLeft.value !== '' && batchCropTop.value !== '' && 
            batchCropRight.value !== '' && batchCropBottom.value !== '') {
            cropParams = [
                parseInt(batchCropLeft.value),
                parseInt(batchCropTop.value),
                parseInt(batchCropRight.value),
                parseInt(batchCropBottom.value)
            ];
        }
        
        // Build adjustment parameters
        const editParams = {};
        
        if (cropParams) {
            editParams.crop = cropParams;
        }
        
        // Only include if different from default
        if (parseFloat(batchBrightnessSlider.value) !== 1.0) {
            editParams.brightness = parseFloat(batchBrightnessSlider.value);
        }
        
        if (parseFloat(batchContrastSlider.value) !== 1.0) {
            editParams.contrast = parseFloat(batchContrastSlider.value);
        }
        
        if (parseFloat(batchSaturationSlider.value) !== 1.0) {
            editParams.saturation = parseFloat(batchSaturationSlider.value);
        }
        
        // Check if we have any edits to apply
        if (Object.keys(editParams).length === 0) {
            throw new Error('No edit parameters specified.');
        }
        
        const response = await fetch('/api/editor/timelapse/batch_edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                edit_params: editParams,
                start_idx: startIndex,
                end_idx: endIndex,
                interval: intervalValue
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error applying batch edit: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Batch edit applied successfully to frames ${startIndex}-${endIndex}.`);
        } else {
            throw new Error(data.message || 'Failed to apply batch edit');
        }
    } catch (error) {
        console.error('Batch edit error:', error);
        alert(`Error applying batch edit: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

/**
 * Assemble frames into a video
 */
async function assembleVideo() {
    if (!selectedTimelapseFolder) {
        return;
    }
    
    try {
        showLoading(true);
        
        // Get assembly parameters
        const fps = parseInt(videoFps.value) || 24;
        const format = videoFormat.value;
        const quality = videoQuality.value;
        const useEdited = useEditedFrames.checked;
        const filename = videoFilename.value.trim();
        
        const response = await fetch('/api/editor/timelapse/assemble', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                output_path: filename || null,
                fps: fps,
                format: format,
                quality: quality,
                use_edited: useEdited
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error assembling video: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Video assembled successfully: ${data.output_path}`);
            // Close the modal
            assembleModal.classList.add('hidden');
        } else {
            throw new Error(data.message || 'Failed to assemble video');
        }
    } catch (error) {
        console.error('Video assembly error:', error);
        alert(`Error assembling video: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

/**
 * Save the timelapse project
 */
async function saveProject() {
    if (!selectedTimelapseFolder) {
        return;
    }
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/editor/timelapse/save_project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error saving project: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Project saved successfully: ${data.project_path}`);
        } else {
            throw new Error(data.message || 'Failed to save project');
        }
    } catch (error) {
        console.error('Project save error:', error);
        alert(`Error saving project: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

/**
 * Load a timelapse project
 */
async function loadProject() {
    // This would typically have a file selection dialog
    alert('Project loading not implemented yet. This would open a file selection dialog.');
}

// --- UI Functions ---

/**
 * Update the timelapse list
 */
function updateTimelapseList(timelapses) {
    timelapseList.innerHTML = '';
    
    if (timelapses.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-gray-500';
        li.textContent = 'No timelapse sequences found';
        timelapseList.appendChild(li);
        return;
    }
    
    timelapses.forEach(timelapse => {
        const li = document.createElement('li');
        li.className = 'hover:bg-blue-100 cursor-pointer p-2 rounded my-1';
        if (timelapse.path === selectedTimelapseFolder) {
            li.classList.add('bg-blue-100');
        }
        li.textContent = timelapse.name;
        li.dataset.path = timelapse.path;
        li.addEventListener('click', () => loadTimelapse(timelapse.path));
        timelapseList.appendChild(li);
    });
}

/**
 * Highlight the selected timelapse in the list
 */
function highlightSelectedTimelapse() {
    const items = timelapseList.querySelectorAll('li');
    items.forEach(item => {
        if (item.dataset.path === selectedTimelapseFolder) {
            item.classList.add('bg-blue-100');
        } else {
            item.classList.remove('bg-blue-100');
        }
    });
}

/**
 * Update the timelapse information display
 */
function updateTimelapseInfo() {
    if (!selectedTimelapseFolder || !timelapseMetadata) {
        timelapseInfo.classList.add('hidden');
        return;
    }
    
    // Update info display
    timelapseName.textContent = timelapseMetadata.name || 'Unknown';
    timelapse