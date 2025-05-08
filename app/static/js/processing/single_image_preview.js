/**
 * Single Image Preview Component
 * Handles displaying and switching between original and processed images
 */

// --- DOM Elements ---
const noImageSelected = document.getElementById('no-image-selected');
const imagePreviewContainer = document.getElementById('image-preview-container');
const btnPreviewOriginal = document.getElementById('btn-preview-original');
const btnPreviewProcessed = document.getElementById('btn-preview-processed');
const btnPreviewSplit = document.getElementById('btn-preview-split');
const originalPreview = document.getElementById('original-preview');
const processedPreview = document.getElementById('processed-preview');
const splitPreview = document.getElementById('split-preview');
const originalImage = document.getElementById('original-image');
const processedImage = document.getElementById('processed-image');
const originalSplitImage = document.getElementById('original-split-image');
const processedSplitImage = document.getElementById('processed-split-image');
const previewControls = document.getElementById('preview-controls');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');

// --- State ---
let currentPreviewMode = 'original'; // 'original', 'processed', 'split'
let currentScale = 1;
let currentImageFile = null;
let processedImageUrl = null;

// --- Event Handlers ---

// Set the preview mode
function setPreviewMode(mode) {
    currentPreviewMode = mode;
    
    // Update UI
    [btnPreviewOriginal, btnPreviewProcessed, btnPreviewSplit].forEach(btn => {
        btn.classList.remove('bg-blue-500', 'text-white', 'active');
        btn.classList.add('bg-gray-200', 'text-gray-700');
    });
    
    // Hide all previews first
    originalPreview.classList.add('hidden');
    processedPreview.classList.add('hidden');
    splitPreview.classList.add('hidden');
    
    // Show the selected preview type
    if (mode === 'original') {
        originalPreview.classList.remove('hidden');
        btnPreviewOriginal.classList.add('bg-blue-500', 'text-white', 'active');
        btnPreviewOriginal.classList.remove('bg-gray-200', 'text-gray-700');
    } else if (mode === 'processed') {
        processedPreview.classList.remove('hidden');
        btnPreviewProcessed.classList.add('bg-blue-500', 'text-white', 'active');
        btnPreviewProcessed.classList.remove('bg-gray-200', 'text-gray-700');
    } else if (mode === 'split') {
        splitPreview.classList.remove('hidden');
        btnPreviewSplit.classList.add('bg-blue-500', 'text-white', 'active');
        btnPreviewSplit.classList.remove('bg-gray-200', 'text-gray-700');
    }
}

// Display an image in the preview
function displayImage(file) {
    currentImageFile = file;
    
    // If no file, show the no-image-selected message
    if (!file) {
        noImageSelected.classList.remove('hidden');
        imagePreviewContainer.classList.add('hidden');
        previewControls.classList.add('hidden');
        return;
    }
    
    // Hide the no-image message and show the preview container
    noImageSelected.classList.add('hidden');
    imagePreviewContainer.classList.remove('hidden');
    previewControls.classList.remove('hidden');
    
    // Set image sources based on whether it's a local file or uploaded
    if (file.isUploaded && file.file) {
        // For uploaded files, use createObjectURL
        const objectUrl = URL.createObjectURL(file.file);
        originalImage.src = objectUrl;
        originalSplitImage.src = objectUrl;
        
        // Clean up previous ObjectURL if any
        originalImage.onload = () => {
            // We only revoke when we're sure the image has loaded
            // URL.revokeObjectURL(objectUrl);
        };
    } else {
        // For server-side files, construct the path
        const imagePath = `/api/files/image?path=${encodeURIComponent(file.path)}`;
        originalImage.src = imagePath;
        originalSplitImage.src = imagePath;
    }
    
    // Reset any previous processed image
    processedImageUrl = null;
    processedImage.src = originalImage.src; // Default to showing original until processed
    processedSplitImage.src = originalImage.src; // Same for split view
    
    // Default to original view
    setPreviewMode('original');
    
    // Reset zoom
    resetZoom();
}

// Update the processed image preview
function updateProcessedPreview(url) {
    processedImageUrl = url;
    processedImage.src = url;
    processedSplitImage.src = url;
}

// Handle zoom controls
function zoomIn() {
    currentScale += 0.1;
    applyZoom();
}

function zoomOut() {
    currentScale = Math.max(0.1, currentScale - 0.1);
    applyZoom();
}

function resetZoom() {
    currentScale = 1;
    applyZoom();
}

function applyZoom() {
    // Apply zoom to visible images
    [originalImage, processedImage, originalSplitImage, processedSplitImage].forEach(img => {
        img.style.transform = `scale(${currentScale})`;
    });
}

// Initialize
function initSingleImagePreview() {
    if (!noImageSelected || !imagePreviewContainer) {
        console.warn('Single image preview: Some required DOM elements not found');
        return;
    }
    
    // Set up event listeners
    btnPreviewOriginal.addEventListener('click', () => setPreviewMode('original'));
    btnPreviewProcessed.addEventListener('click', () => setPreviewMode('processed'));
    btnPreviewSplit.addEventListener('click', () => setPreviewMode('split'));
    btnZoomIn.addEventListener('click', zoomIn);
    btnZoomOut.addEventListener('click', zoomOut);
    btnZoomReset.addEventListener('click', resetZoom);
    
    // Listen for image selection events
    document.addEventListener('singleImageSelected', (event) => {
        displayImage(event.detail);
    });
    
    // Listen for processed image events
    document.addEventListener('imageProcessed', (event) => {
        updateProcessedPreview(event.detail.url);
    });
    
    // Initialize with no image
    displayImage(null);
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', initSingleImagePreview);

// Exports
window.singleImagePreview = {
    displayImage,
    updateProcessedPreview,
    setPreviewMode
};