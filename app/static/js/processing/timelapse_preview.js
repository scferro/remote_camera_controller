/**
 * Timelapse Preview Component
 * Handles display and navigation of timelapse images
 */

// --- DOM Elements ---
const noTimelapseSelected = document.getElementById('no-timelapse-selected');
const timelapsePreviewContainer = document.getElementById('timelapse-preview-container');
const currentFrame = document.getElementById('current-frame');
const currentFrameNumber = document.getElementById('current-frame-number');
const totalFrames = document.getElementById('total-frames');
const btnPlayPause = document.getElementById('btn-play-pause');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const frameSlider = document.getElementById('frame-slider');
const playbackSpeed = document.getElementById('playback-speed');
const thumbnailGrid = document.getElementById('thumbnail-grid');

// --- State ---
let currentFrameIndex = 0;
let isPlaying = false;
let playbackInterval = null;
let timelapseImages = [];
let currentTimelapseFolder = null;
let processedImagesAvailable = false;
let viewMode = 'original'; // 'original' or 'processed'

// --- Event Handlers ---

// Load and display timelapse images
async function loadTimelapseImages(folder) {
    if (!folder) return;
    
    currentTimelapseFolder = folder;
    timelapseImages = [];
    currentFrameIndex = 0;
    isPlaying = false;
    stopPlayback();
    
    // Show loading state
    noTimelapseSelected.classList.add('hidden');
    timelapsePreviewContainer.classList.remove('hidden');
    currentFrame.src = '';
    currentFrameNumber.textContent = '0';
    totalFrames.textContent = '0';
    thumbnailGrid.innerHTML = `
        <div class="bg-gray-200 animate-pulse h-16 rounded"></div>
        <div class="bg-gray-200 animate-pulse h-16 rounded"></div>
        <div class="bg-gray-200 animate-pulse h-16 rounded"></div>
        <div class="bg-gray-200 animate-pulse h-16 rounded"></div>
        <div class="bg-gray-200 animate-pulse h-16 rounded"></div>
    `;
    
    try {
        const response = await fetch(`/api/timelapse/images?folder=${encodeURIComponent(folder)}`);
        const data = await response.json();
        
        if (data && data.success && Array.isArray(data.images)) {
            timelapseImages = data.images;
            totalFrames.textContent = timelapseImages.length;
            
            // Initialize the frame slider
            frameSlider.min = 0;
            frameSlider.max = Math.max(0, timelapseImages.length - 1);
            frameSlider.value = 0;
            
            // Check if processed versions exist
            processedImagesAvailable = Boolean(data.processed_images_available);
            
            // Set view mode
            viewMode = processedImagesAvailable ? 'processed' : 'original';
            
            // If we have images, display the first one
            if (timelapseImages.length > 0) {
                showFrame(0);
                renderThumbnails();
            } else {
                thumbnailGrid.innerHTML = '<div class="text-gray-500 col-span-5 text-center">No images found in this timelapse sequence</div>';
            }
        } else {
            currentFrame.src = '';
            thumbnailGrid.innerHTML = `<div class="text-red-500 col-span-5 text-center">Error: ${data?.message || 'Could not load images'}</div>`;
        }
    } catch (error) {
        console.error('Error loading timelapse images:', error);
        currentFrame.src = '';
        thumbnailGrid.innerHTML = '<div class="text-red-500 col-span-5 text-center">Error loading images. Check console for details.</div>';
    }
}

// Show a specific frame
function showFrame(index) {
    if (!timelapseImages || timelapseImages.length === 0) return;
    
    // Clamp index to valid range
    index = Math.max(0, Math.min(timelapseImages.length - 1, index));
    currentFrameIndex = index;
    
    // Update UI
    currentFrameNumber.textContent = index + 1;
    frameSlider.value = index;
    
    // Set the image source
    const imagePathType = viewMode === 'processed' && processedImagesAvailable ? 'processed_path' : 'path';
    currentFrame.src = `/api/files/image?path=${encodeURIComponent(timelapseImages[index][imagePathType])}&t=${Date.now()}`;
    
    // Highlight current thumbnail
    const thumbnails = thumbnailGrid.querySelectorAll('.thumbnail');
    thumbnails.forEach((thumb, i) => {
        thumb.classList.toggle('active', i === index);
    });
}

// Render thumbnail grid
function renderThumbnails() {
    thumbnailGrid.innerHTML = '';
    
    // Only show a reasonable number of thumbnails
    const thumbCount = Math.min(timelapseImages.length, 20); // Limit to 20 thumbnails for performance
    const step = timelapseImages.length <= 20 ? 1 : Math.floor(timelapseImages.length / 20);
    
    for (let i = 0; i < timelapseImages.length; i += step) {
        if (thumbnailGrid.children.length >= 20) break;
        
        const div = document.createElement('div');
        div.className = 'relative';
        
        const img = document.createElement('img');
        img.className = 'thumbnail w-full h-16 object-cover rounded';
        img.alt = `Frame ${i + 1}`;
        
        // Set image source
        const imagePathType = viewMode === 'processed' && processedImagesAvailable ? 'processed_path' : 'path';
        img.src = `/api/files/image?path=${encodeURIComponent(timelapseImages[i][imagePathType])}&thumbnail=true&t=${Date.now()}`;
        
        // Highlight if this is the current frame
        if (i === currentFrameIndex) {
            img.classList.add('active');
        }
        
        // Add click handler
        img.addEventListener('click', () => {
            showFrame(i);
        });
        
        div.appendChild(img);
        
        // Add frame number overlay
        const frameNumber = document.createElement('div');
        frameNumber.className = 'absolute bottom-0 right-0 bg-black bg-opacity-50 text-white text-xs px-1 rounded-tl';
        frameNumber.textContent = i + 1;
        div.appendChild(frameNumber);
        
        thumbnailGrid.appendChild(div);
    }
}

// Toggle playback
function togglePlayback() {
    if (isPlaying) {
        stopPlayback();
    } else {
        startPlayback();
    }
}

// Start playback
function startPlayback() {
    if (isPlaying || !timelapseImages || timelapseImages.length <= 1) return;
    
    isPlaying = true;
    
    // Update button UI
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    
    // Calculate playback interval based on selected speed
    const speed = parseFloat(playbackSpeed.value);
    const intervalMs = 1000 / (24 * speed); // Base rate of 24fps, modified by speed
    
    // Start interval
    playbackInterval = setInterval(() => {
        currentFrameIndex = (currentFrameIndex + 1) % timelapseImages.length;
        showFrame(currentFrameIndex);
    }, intervalMs);
}

// Stop playback
function stopPlayback() {
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
    
    isPlaying = false;
    
    // Update button UI
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
}

// Handle slider change
function handleSliderChange() {
    const index = parseInt(frameSlider.value, 10);
    showFrame(index);
}

// Handle playback speed change
function handleSpeedChange() {
    if (isPlaying) {
        // Restart playback with new speed
        stopPlayback();
        startPlayback();
    }
}

// Switch between original and processed view
function setViewMode(mode) {
    if (mode === viewMode || !processedImagesAvailable) return;
    
    viewMode = mode;
    showFrame(currentFrameIndex); // Refresh current frame with new path
    renderThumbnails(); // Refresh thumbnails
}

// Initialize
function initTimelapsePreview() {
    if (!timelapsePreviewContainer || !noTimelapseSelected) {
        console.warn('Timelapse preview: Some required DOM elements not found');
        return;
    }
    
    // Set up event listeners
    btnPlayPause.addEventListener('click', togglePlayback);
    frameSlider.addEventListener('input', handleSliderChange);
    playbackSpeed.addEventListener('change', handleSpeedChange);
    
    // Listen for timelapse selection events
    document.addEventListener('timelapseSelected', (event) => {
        loadTimelapseImages(event.detail.folder);
    });
    
    // Listen for timelapse processing events
    document.addEventListener('timelapseProcessed', (event) => {
        // Reload images if this is our current timelapse
        if (event.detail.folder === currentTimelapseFolder) {
            loadTimelapseImages(currentTimelapseFolder);
        }
    });
    
    // Initialize with no timelapse
    noTimelapseSelected.classList.remove('hidden');
    timelapsePreviewContainer.classList.add('hidden');
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', initTimelapsePreview);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (playbackInterval) {
        clearInterval(playbackInterval);
    }
});

// Exports
window.timelapsePreview = {
    loadImages: loadTimelapseImages,
    showFrame,
    togglePlayback,
    setViewMode
};