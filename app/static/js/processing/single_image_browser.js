/**
 * Single Image Browser Component
 * Handles browsing and selection of images from captures, timelapses, or uploads
 */

// --- DOM Elements ---
const btnBrowseCaptures = document.getElementById('btn-browse-captures');
const btnBrowseTimelapses = document.getElementById('btn-browse-timelapses');
const btnBrowseUpload = document.getElementById('btn-browse-upload');
const uploadSection = document.getElementById('upload-section');
const fileBrowserSection = document.getElementById('file-browser-section');
const fileUploadInput = document.getElementById('file-upload');
const fileList = document.getElementById('file-list');
const currentPath = document.getElementById('current-path');
const btnParentDir = document.getElementById('btn-parent-dir');
const btnRefreshFiles = document.getElementById('btn-refresh-files');
const selectedFileInfo = document.getElementById('selected-file-info');
const selectedFilename = document.getElementById('selected-filename');
const selectedFiletype = document.getElementById('selected-filetype');
const selectedFilesize = document.getElementById('selected-filesize');
const selectedDimensions = document.getElementById('selected-dimensions');

// --- State ---
let currentBrowseMode = 'captures'; // 'captures', 'timelapses', 'upload'
let currentBrowsePath = '/single_captures';
let selectedFile = null;
let currentFileList = [];

// --- Event Handlers ---

// Toggle browse modes
function setBrowseMode(mode) {
    currentBrowseMode = mode;
    
    // Update UI
    [btnBrowseCaptures, btnBrowseTimelapses, btnBrowseUpload].forEach(btn => {
        btn.classList.remove('bg-blue-500', 'text-white', 'active');
        btn.classList.add('bg-gray-200', 'text-gray-700');
    });
    
    // Show/hide sections
    if (mode === 'upload') {
        uploadSection.classList.remove('hidden');
        fileBrowserSection.classList.add('hidden');
        btnBrowseUpload.classList.add('bg-blue-500', 'text-white', 'active');
        btnBrowseUpload.classList.remove('bg-gray-200', 'text-gray-700');
    } else {
        uploadSection.classList.add('hidden');
        fileBrowserSection.classList.remove('hidden');
        
        if (mode === 'captures') {
            currentBrowsePath = '/single_captures';
            btnBrowseCaptures.classList.add('bg-blue-500', 'text-white', 'active');
            btnBrowseCaptures.classList.remove('bg-gray-200', 'text-gray-700');
        } else if (mode === 'timelapses') {
            currentBrowsePath = '/timelapse_data';
            btnBrowseTimelapses.classList.add('bg-blue-500', 'text-white', 'active');
            btnBrowseTimelapses.classList.remove('bg-gray-200', 'text-gray-700');
        }
        
        currentPath.textContent = currentBrowsePath;
        loadFilesFromPath(currentBrowsePath);
    }
}

// Load files from a directory path
async function loadFilesFromPath(path) {
    fileList.innerHTML = '<li class="p-2">Loading files...</li>';
    
    try {
        const response = await fetch(`/api/files/list?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        
        if (data.success) {
            currentFileList = data.files || [];
            
            if (currentFileList.length === 0) {
                fileList.innerHTML = '<li class="p-2 text-gray-500">No files found in this directory</li>';
                return;
            }
            
            renderFileList();
        } else {
            fileList.innerHTML = `<li class="p-2 text-red-500">Error: ${data.message}</li>`;
        }
    } catch (error) {
        console.error('Error loading files:', error);
        fileList.innerHTML = '<li class="p-2 text-red-500">Error loading files. Check console for details.</li>';
    }
}

// Render the file list
function renderFileList() {
    fileList.innerHTML = '';
    
    currentFileList.forEach(file => {
        const li = document.createElement('li');
        li.className = 'p-2 hover:bg-blue-50 cursor-pointer flex items-center';
        
        // Add icon based on file type
        if (file.type === 'directory') {
            li.innerHTML = `<svg class="w-5 h-5 mr-2 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>`;
        } else if (file.isImage) {
            li.innerHTML = `<svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
        } else {
            li.innerHTML = `<svg class="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`;
        }
        
        // Add the file name
        const nameSpan = document.createElement('span');
        nameSpan.textContent = file.name;
        nameSpan.className = 'flex-grow';
        li.appendChild(nameSpan);
        
        // Add file size (if not a directory)
        if (file.type !== 'directory') {
            const sizeSpan = document.createElement('span');
            sizeSpan.textContent = formatFileSize(file.size);
            sizeSpan.className = 'text-xs text-gray-500';
            li.appendChild(sizeSpan);
        }
        
        // Add click handler
        li.addEventListener('click', () => {
            if (file.type === 'directory') {
                currentBrowsePath = file.path;
                currentPath.textContent = currentBrowsePath;
                loadFilesFromPath(currentBrowsePath);
            } else if (file.isImage) {
                selectFile(file);
            }
        });
        
        fileList.appendChild(li);
    });
}

// Go up one directory
function navigateToParentDir() {
    const pathParts = currentBrowsePath.split('/');
    
    // Don't go above the root captures/timelapses directories
    if (
        (currentBrowseMode === 'captures' && currentBrowsePath === '/single_captures') || 
        (currentBrowseMode === 'timelapses' && currentBrowsePath === '/timelapse_data')
    ) {
        return;
    }
    
    // Remove the last part and reconstruct the path
    pathParts.pop();
    currentBrowsePath = pathParts.join('/') || '/';
    currentPath.textContent = currentBrowsePath;
    
    loadFilesFromPath(currentBrowsePath);
}

// Select a file and show its info
function selectFile(file) {
    selectedFile = file;
    
    // Update UI to show file is selected
    const fileItems = fileList.querySelectorAll('li');
    fileItems.forEach(item => {
        item.classList.remove('bg-blue-100');
    });
    
    // Find the item for this file and highlight it
    fileItems.forEach(item => {
        if (item.querySelector('span').textContent === file.name) {
            item.classList.add('bg-blue-100');
        }
    });
    
    // Show file info
    selectedFileInfo.classList.remove('hidden');
    selectedFilename.textContent = file.name;
    selectedFiletype.textContent = file.type.toUpperCase();
    selectedFilesize.textContent = formatFileSize(file.size);
    
    // If we have dimensions, show them
    if (file.dimensions) {
        selectedDimensions.textContent = `${file.dimensions.width} × ${file.dimensions.height}`;
    } else {
        selectedDimensions.textContent = 'Loading...';
        
        // Fetch image dimensions (mock implementation)
        setTimeout(() => {
            // This would be a real API call in production
            selectedDimensions.textContent = '3000 × 2000';
        }, 500);
    }
    
    // Dispatch event so other components know a file was selected
    const event = new CustomEvent('singleImageSelected', { detail: file });
    document.dispatchEvent(event);
}

// Handle file upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check if it's an image
    const isImage = file.type.startsWith('image/') || 
                   file.name.toLowerCase().endsWith('.arw') ||
                   file.name.toLowerCase().endsWith('.raw') || 
                   file.name.toLowerCase().endsWith('.nef') ||
                   file.name.toLowerCase().endsWith('.cr2');
                   
    if (!isImage) {
        alert('Please select an image file.');
        return;
    }
    
    // Create a file object similar to those from the API
    const uploadedFile = {
        name: file.name,
        path: 'uploaded',
        size: file.size,
        type: file.type || 'image/unknown',
        isImage: true,
        isUploaded: true,
        file: file  // Keep reference to the original File object
    };
    
    // Select this file
    selectFile(uploadedFile);
}

// Format file size in human-readable format
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Initialize
function initSingleImageBrowser() {
    if (!btnBrowseCaptures || !fileList) {
        console.warn('Single image browser: Some required DOM elements not found');
        return;
    }
    
    // Set up event listeners
    btnBrowseCaptures.addEventListener('click', () => setBrowseMode('captures'));
    btnBrowseTimelapses.addEventListener('click', () => setBrowseMode('timelapses'));
    btnBrowseUpload.addEventListener('click', () => setBrowseMode('upload'));
    btnParentDir.addEventListener('click', navigateToParentDir);
    btnRefreshFiles.addEventListener('click', () => loadFilesFromPath(currentBrowsePath));
    fileUploadInput.addEventListener('change', handleFileUpload);
    
    // Initialize with captures mode
    setBrowseMode('captures');
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', initSingleImageBrowser);

// Exports
window.singleImageBrowser = {
    selectFile,
    loadFilesFromPath,
    refreshFileList: () => loadFilesFromPath(currentBrowsePath)
};