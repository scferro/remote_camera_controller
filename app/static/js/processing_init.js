/**
 * Processing Initialization Module
 * Ensures all processing components are properly loaded and connected
 */

// --- Component Initialization States ---
const componentStates = {
    singleImageBrowser: false,
    singleImagePreview: false,
    singleImageEditing: false,
    singleImageExport: false,
    timelapseBrowser: false,
    timelapsePreview: false,
    timelapseEditing: false,
    timelapseExport: false
};

// Track initialization progress
function updateComponentState(component, isInitialized) {
    componentStates[component] = isInitialized;
    console.log(`Processing component ${component} initialized: ${isInitialized}`);
    checkAllComponentsInitialized();
}

// Check if all components are initialized
function checkAllComponentsInitialized() {
    const allInitialized = Object.values(componentStates).every(state => state);
    if (allInitialized) {
        console.log('All processing components initialized');
        // Trigger any post-initialization actions
        postInitialization();
    }
}

// Actions to perform after all components are initialized
function postInitialization() {
    // Force a browser refresh of the file browser if it exists
    if (window.singleImageBrowser && typeof window.singleImageBrowser.refreshFileList === 'function') {
        setTimeout(() => window.singleImageBrowser.refreshFileList(), 500);
    }
    
    if (window.timelapseBrowser && typeof window.timelapseBrowser.refreshFolderList === 'function') {
        setTimeout(() => window.timelapseBrowser.refreshFolderList(), 500);
    }
}

// Initialize all processing components and verify DOM elements
function initProcessingComponents() {
    // --- Single Image Processing Components ---
    
    // Browser component
    const singleImageBrowserInit = function() {
        const component = document.getElementById('single-image-browser');
        if (component) {
            // Register that this component exists
            updateComponentState('singleImageBrowser', true);
            
            // Force a file list refresh
            if (window.singleImageBrowser && typeof window.singleImageBrowser.refreshFileList === 'function') {
                window.singleImageBrowser.refreshFileList();
            }
        } else {
            console.warn('Single image browser component not found in DOM');
        }
    };
    
    // Preview component
    const singleImagePreviewInit = function() {
        const component = document.getElementById('single-image-preview');
        if (component) {
            updateComponentState('singleImagePreview', true);
        } else {
            console.warn('Single image preview component not found in DOM');
        }
    };
    
    // Editing component
    const singleImageEditingInit = function() {
        const component = document.getElementById('editing-controls');
        if (component) {
            updateComponentState('singleImageEditing', true);
        } else {
            console.warn('Single image editing controls not found in DOM');
        }
    };
    
    // Export component
    const singleImageExportInit = function() {
        const component = document.getElementById('export-controls');
        if (component) {
            updateComponentState('singleImageExport', true);
        } else {
            console.warn('Single image export controls not found in DOM');
        }
    };
    
    // --- Timelapse Processing Components ---
    
    // Browser component
    const timelapseBrowserInit = function() {
        const component = document.getElementById('timelapse-browser');
        if (component) {
            updateComponentState('timelapseBrowser', true);
            
            // Force a folder list refresh
            if (window.timelapseBrowser && typeof window.timelapseBrowser.refreshFolderList === 'function') {
                window.timelapseBrowser.refreshFolderList();
            }
        } else {
            console.warn('Timelapse browser component not found in DOM');
        }
    };
    
    // Preview component
    const timelapsePreviewInit = function() {
        const component = document.getElementById('timelapse-preview');
        if (component) {
            updateComponentState('timelapsePreview', true);
        } else {
            console.warn('Timelapse preview component not found in DOM');
        }
    };
    
    // Editing component
    const timelapseEditingInit = function() {
        const component = document.getElementById('timelapse-editing-controls');
        if (component) {
            updateComponentState('timelapseEditing', true);
        } else {
            console.warn('Timelapse editing controls not found in DOM');
        }
    };
    
    // Export component
    const timelapseExportInit = function() {
        const component = document.getElementById('timelapse-export-controls');
        if (component) {
            updateComponentState('timelapseExport', true);
        } else {
            console.warn('Timelapse export controls not found in DOM');
        }
    };
    
    // Verify all components exist in DOM
    singleImageBrowserInit();
    singleImagePreviewInit();
    singleImageEditingInit();
    singleImageExportInit();
    timelapseBrowserInit();
    timelapsePreviewInit();
    timelapseEditingInit();
    timelapseExportInit();
}

// Initialize components when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Processing init: DOM loaded');
    
    // Add a small delay to ensure all component scripts have loaded
    setTimeout(initProcessingComponents, 200);
    
    // Force initialization check after a longer delay as fallback
    setTimeout(function() {
        if (!Object.values(componentStates).every(state => state)) {
            console.warn('Some processing components failed to initialize. Forcing post-initialization...');
            postInitialization();
        }
    }, 1000);
});

// Make init functions available globally
window.processingInit = {
    initComponents: initProcessingComponents,
    componentStates: componentStates
};