/**
 * Main processing module
 * Coordinates between single image and timelapse processing components
 */

// --- DOM Elements ---
// Tab navigation
const tabLiveControl = document.getElementById('tab-live-control');
const tabTimelapseProcessing = document.getElementById('tab-timelapse-processing');
const tabSingleProcessing = document.getElementById('tab-single-processing');

// Common API functions

/**
 * Generic API fetch function with error handling
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Fetch options
 * @param {boolean} showErrors - Whether to show error alerts
 * @returns {Promise<Object>} - Response data or null on error
 */
async function fetchApi(url, options = {}, showErrors = true) {
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`API error (${url}):`, error);
        
        if (showErrors) {
            alert(`Error: ${error.message}`);
        }
        
        return null;
    }
}

// --- Tab Management ---
function setupTabNavigation() {
    // Add event listeners to tab buttons if they exist
    const tabButtons = document.querySelectorAll('[data-tab]');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            switchToTab(tabName);
            
            // Update active state for tab buttons
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
        });
    });
}

function switchToTab(tabName) {
    // Hide all tabs
    [tabLiveControl, tabTimelapseProcessing, tabSingleProcessing].forEach(tab => {
        if (tab) tab.classList.add('hidden');
    });
    
    // Show the selected tab
    if (tabName === 'live-control' && tabLiveControl) {
        tabLiveControl.classList.remove('hidden');
    } else if (tabName === 'timelapse-processing' && tabTimelapseProcessing) {
        tabTimelapseProcessing.classList.remove('hidden');
    } else if (tabName === 'single-processing' && tabSingleProcessing) {
        tabSingleProcessing.classList.remove('hidden');
    }
}

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('Processing.js: DOM loaded');
    
    // Set up tab navigation
    setupTabNavigation();
    
    // Make fetchApi available globally
    window.fetchApi = fetchApi;
});

// --- Exports ---
// Make functions available to other modules
window.processing = {
    switchToTab
};