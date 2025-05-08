/**
 * Timelapse Export Component
 * Handles timelapse video assembly and image sequence export
 */

// --- DOM Elements ---
const noTimelapseSelectedExport = document.getElementById('no-timelapse-selected-export');
const timelapseExportControls = document.getElementById('timelapse-export-controls');
const tlFps = document.getElementById('tl-fps');
const tlCodec = document.getElementById('tl-codec');
const tlQuality = document.getElementById('tl-quality');
const tlQualityValue = document.getElementById('tl-quality-value');
const tlResolutionPreset = document.getElementById('tl-resolution-preset');
const tlCustomSize = document.getElementById('tl-custom-size');
const tlCustomWidth = document.getElementById('tl-custom-width');
const tlCustomHeight = document.getElementById('tl-custom-height');
const tlCropX = document.getElementById('tl-crop-x');
const tlCropY = document.getElementById('tl-crop-y');
const tlCropW = document.getElementById('tl-crop-w');
const tlCropH = document.getElementById('tl-crop-h');
const tlExportImages = document.getElementById('tl-export-images');
const tlExportFilename = document.getElementById('tl-export-filename');
const btnAssembleTimelapse = document.getElementById('btn-assemble-timelapse');
const btnExportTimelapseFrames = document.getElementById('btn-export-timelapse-frames');
const timelapseAssemblyStatus = document.getElementById('timelapse-assembly-status');

// --- State ---
let currentTimelapseFolder = null;
let currentTimelapseInfo = null;
let isAssembling = false;

// --- Quality Settings Maps ---
const qualityLabels = ['Low', 'Medium-Low', 'Medium', 'Medium-High', 'High'];
const codecParams = {
    'h264': {
        crf: [28, 26, 23, 20, 18],
        preset: ['ultrafast', 'fast', 'medium', 'slow', 'veryslow']
    },
    'h265': {
        crf: [30, 28, 25, 22, 20],
        preset: ['ultrafast', 'fast', 'medium', 'slow', 'veryslow']
    },
    'prores': {
        profile: [0, 1, 2, 3, 3], // 0=Proxy, 1=LT, 2=Standard, 3=HQ
        preset: ['medium', 'medium', 'medium', 'medium', 'medium']
    },
    'vp9': {
        crf: [33, 30, 27, 24, 20],
        speed: [8, 6, 4, 2, 0] // Higher is faster encoding, lower is better quality
    }
};

// --- Event Handlers ---

// Show/hide export controls
function showExportControls(folder, info) {
    currentTimelapseFolder = folder;
    currentTimelapseInfo = info;
    
    if (!folder) {
        noTimelapseSelectedExport.classList.remove('hidden');
        timelapseExportControls.classList.add('hidden');
        return;
    }
    
    noTimelapseSelectedExport.classList.add('hidden');
    timelapseExportControls.classList.remove('hidden');
    
    // Set default export filename based on folder name
    tlExportFilename.placeholder = folder;
    
    // Reset status
    timelapseAssemblyStatus.classList.add('hidden');
}

// Update quality value display
function updateQualityDisplay() {
    const qualityIndex = parseInt(tlQuality.value) - 1;
    tlQualityValue.textContent = qualityLabels[qualityIndex];
}

// Toggle custom size inputs
function toggleCustomSize() {
    if (tlResolutionPreset.value === 'custom') {
        tlCustomSize.classList.remove('hidden');
    } else {
        tlCustomSize.classList.add('hidden');
    }
}

// Get resolution settings
function getResolutionSettings() {
    if (tlResolutionPreset.value === 'original') {
        return null;
    } else if (tlResolutionPreset.value === 'custom') {
        const width = tlCustomWidth.value ? parseInt(tlCustomWidth.value) : null;
        const height = tlCustomHeight.value ? parseInt(tlCustomHeight.value) : null;
        
        if (width && height) {
            return `${width}x${height}`;
        }
        return null;
    } else {
        // Return the preset value (e.g., "1920x1080")
        return tlResolutionPreset.value;
    }
}

// Get crop settings
function getCropSettings() {
    const x = tlCropX.value ? parseInt(tlCropX.value) : null;
    const y = tlCropY.value ? parseInt(tlCropY.value) : null;
    const w = tlCropW.value ? parseInt(tlCropW.value) : null;
    const h = tlCropH.value ? parseInt(tlCropH.value) : null;
    
    if (x !== null && y !== null && w !== null && h !== null && w > 0 && h > 0) {
        return [x, y, w, h];
    }
    
    return null;
}

// Get codec settings based on selected quality
function getCodecSettings() {
    const codec = tlCodec.value;
    const qualityIndex = parseInt(tlQuality.value) - 1;
    
    if (codec === 'h264' || codec === 'h265') {
        return {
            codec: codec === 'h264' ? 'libx264' : 'libx265',
            crf: codecParams[codec].crf[qualityIndex],
            preset: codecParams[codec].preset[qualityIndex]
        };
    } else if (codec === 'prores') {
        return {
            codec: 'prores_ks',
            profile: codecParams.prores.profile[qualityIndex]
        };
    } else if (codec === 'vp9') {
        return {
            codec: 'libvpx-vp9',
            crf: codecParams.vp9.crf[qualityIndex],
            speed: codecParams.vp9.speed[qualityIndex]
        };
    }
    
    // Default to h264 medium quality
    return {
        codec: 'libx264',
        crf: 23,
        preset: 'medium'
    };
}

// Assemble timelapse into video
async function assembleTimelapse() {
    if (!currentTimelapseFolder || isAssembling) return;
    
    // Check if we have images
    if (currentTimelapseInfo && currentTimelapseInfo.image_count === 0) {
        alert('No images found in this timelapse sequence.');
        return;
    }
    
    // Set assembling state
    isAssembling = true;
    btnAssembleTimelapse.disabled = true;
    btnExportTimelapseFrames.disabled = true;
    timelapseAssemblyStatus.classList.remove('hidden');
    timelapseAssemblyStatus.innerHTML = `
        <div class="flex items-center">
            <div class="mr-2 w-4 h-4 rounded-full animate-pulse bg-blue-500"></div>
            <span>Processing timelapse...</span>
        </div>
        <p class="mt-1">This might take several minutes depending on the sequence length.</p>
    `;
    
    // Get export settings
    const settings = {
        folder: currentTimelapseFolder,
        fps: parseInt(tlFps.value) || 24,
        codec_settings: getCodecSettings(),
        resolution: getResolutionSettings(),
        crop_rect: getCropSettings(),
        output_filename: tlExportFilename.value || null
    };
    
    // Also apply any current editing settings if we have them
    if (window.timelapseEditing) {
        settings.edit_settings = window.timelapseEditing.getCurrentSettings();
    }
    
    try {
        const response = await fetch('/api/process/timelapse/video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Request was accepted, we should poll for status
            pollAssemblyStatus(data.task_id);
        } else {
            timelapseAssemblyStatus.innerHTML = `<div class="text-red-500">Error: ${data.message || 'Assembly failed'}</div>`;
            resetAssemblyState();
        }
    } catch (error) {
        console.error('Error assembling timelapse:', error);
        timelapseAssemblyStatus.innerHTML = `<div class="text-red-500">Error: ${error.message || 'Check console for details'}</div>`;
        resetAssemblyState();
    }
}

// Export timelapse frames as image sequence
async function exportTimelapseFrames() {
    if (!currentTimelapseFolder || isAssembling) return;
    
    // Check if we have images
    if (currentTimelapseInfo && currentTimelapseInfo.image_count === 0) {
        alert('No images found in this timelapse sequence.');
        return;
    }
    
    // Confirm large exports
    if (currentTimelapseInfo && currentTimelapseInfo.image_count > 50) {
        if (!confirm(`You're about to export ${currentTimelapseInfo.image_count} images. This might take a while. Continue?`)) {
            return;
        }
    }
    
    // Set assembling state
    isAssembling = true;
    btnAssembleTimelapse.disabled = true;
    btnExportTimelapseFrames.disabled = true;
    timelapseAssemblyStatus.classList.remove('hidden');
    timelapseAssemblyStatus.innerHTML = `
        <div class="flex items-center">
            <div class="mr-2 w-4 h-4 rounded-full animate-pulse bg-blue-500"></div>
            <span>Exporting frames...</span>
        </div>
        <p class="mt-1">This might take several minutes depending on the sequence length.</p>
    `;
    
    // Get export settings
    const settings = {
        folder: currentTimelapseFolder,
        resolution: getResolutionSettings(),
        crop_rect: getCropSettings(),
        output_filename: tlExportFilename.value || null
    };
    
    // Also apply any current editing settings if we have them
    if (window.timelapseEditing) {
        settings.edit_settings = window.timelapseEditing.getCurrentSettings();
    }
    
    try {
        const response = await fetch('/api/process/timelapse/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Request was accepted, we should poll for status
            pollExportStatus(data.task_id);
        } else {
            timelapseAssemblyStatus.innerHTML = `<div class="text-red-500">Error: ${data.message || 'Export failed'}</div>`;
            resetAssemblyState();
        }
    } catch (error) {
        console.error('Error exporting timelapse frames:', error);
        timelapseAssemblyStatus.innerHTML = `<div class="text-red-500">Error: ${error.message || 'Check console for details'}</div>`;
        resetAssemblyState();
    }
}

// Poll for assembly status
async function pollAssemblyStatus(taskId, interval = 2000) {
    if (!taskId) return;
    
    try {
        const response = await fetch(`/api/process/timelapse/video/status?task_id=${taskId}`);
        const data = await response.json();
        
        if (data.success) {
            if (data.status === 'completed') {
                // Assembly completed
                timelapseAssemblyStatus.innerHTML = `
                    <div class="text-green-500">Video assembly completed!</div>
                    <p>Output: ${data.output_path}</p>
                    <a href="/api/files/download?path=${encodeURIComponent(data.output_path)}" 
                       class="button-primary text-sm mt-2 inline-block">Download Video</a>
                `;
                resetAssemblyState();
            } else if (data.status === 'failed') {
                // Assembly failed
                timelapseAssemblyStatus.innerHTML = `<div class="text-red-500">Assembly failed: ${data.message || 'Unknown error'}</div>`;
                resetAssemblyState();
            } else {
                // Still processing, update progress and poll again
                const progress = data.progress !== undefined ? data.progress : 'in progress';
                timelapseAssemblyStatus.innerHTML = `
                    <div class="flex items-center">
                        <div class="mr-2 w-4 h-4 rounded-full animate-pulse bg-blue-500"></div>
                        <span>Processing timelapse... ${typeof progress === 'number' ? `${progress}%` : ''}</span>
                    </div>
                    <p class="mt-1">${data.message || 'This might take several minutes.'}</p>
                `;
                
                setTimeout(() => pollAssemblyStatus(taskId, interval), interval);
            }
        } else {
            timelapseAssemblyStatus.innerHTML = `<div class="text-red-500">Error checking status: ${data.message}</div>`;
            resetAssemblyState();
        }
    } catch (error) {
        console.error('Error polling assembly status:', error);
        timelapseAssemblyStatus.innerHTML = `<div class="text-red-500">Error checking status: ${error.message || 'Check console for details'}</div>`;
        resetAssemblyState();
    }
}

// Poll for export status
async function pollExportStatus(taskId, interval = 2000) {
    if (!taskId) return;
    
    try {
        const response = await fetch(`/api/process/timelapse/export/status?task_id=${taskId}`);
        const data = await response.json();
        
        if (data.success) {
            if (data.status === 'completed') {
                // Export completed
                timelapseAssemblyStatus.innerHTML = `
                    <div class="text-green-500">Image export completed!</div>
                    <p>Exported ${data.processed_count || 'all'} images to: ${data.output_dir}</p>
                `;
                resetAssemblyState();
            } else if (data.status === 'failed') {
                // Export failed
                timelapseAssemblyStatus.innerHTML = `<div class="text-red-500">Export failed: ${data.message || 'Unknown error'}</div>`;
                resetAssemblyState();
            } else {
                // Still processing, update progress and poll again
                const processed = data.processed_count || 0;
                const total = data.total_count || '?';
                const progress = data.progress !== undefined ? data.progress : 'in progress';
                
                timelapseAssemblyStatus.innerHTML = `
                    <div class="flex items-center">
                        <div class="mr-2 w-4 h-4 rounded-full animate-pulse bg-blue-500"></div>
                        <span>Exporting frames... ${typeof progress === 'number' ? `${progress}%` : ''}</span>
                    </div>
                    <p class="mt-1">Processed ${processed}/${total} images</p>
                `;
                
                setTimeout(() => pollExportStatus(taskId, interval), interval);
            }
        } else {
            timelapseAssemblyStatus.innerHTML = `<div class="text-red-500">Error checking status: ${data.message}</div>`;
            resetAssemblyState();
        }
    } catch (error) {
        console.error('Error polling export status:', error);
        timelapseAssemblyStatus.innerHTML = `<div class="text-red-500">Error checking status: ${error.message || 'Check console for details'}</div>`;
        resetAssemblyState();
    }
}

// Reset assembly state
function resetAssemblyState() {
    isAssembling = false;
    btnAssembleTimelapse.disabled = false;
    btnExportTimelapseFrames.disabled = false;
}

// Initialize
function initTimelapseExport() {
    if (!timelapseExportControls || !noTimelapseSelectedExport) {
        console.warn('Timelapse export: Some required DOM elements not found');
        return;
    }
    
    // Set up event listeners
    tlQuality.addEventListener('input', updateQualityDisplay);
    tlResolutionPreset.addEventListener('change', toggleCustomSize);
    btnAssembleTimelapse.addEventListener('click', assembleTimelapse);
    btnExportTimelapseFrames.addEventListener('click', exportTimelapseFrames);
    
    // Listen for timelapse selection events
    document.addEventListener('timelapseSelected', (event) => {
        showExportControls(event.detail.folder, event.detail.info);
    });
    
    // Initialize state
    updateQualityDisplay();
    toggleCustomSize();
    showExportControls(null, null);
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', initTimelapseExport);

// Exports
window.timelapseExport = {
    assembleTimelapse,
    exportFrames: exportTimelapseFrames
};