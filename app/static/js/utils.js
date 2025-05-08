/**
 * Utility functions for the camera control application
 */

// --- Utility Functions ---
function showSpinner(show = true) {
    // Check if element exists before trying to modify it
    const statusSpinner = document.getElementById('status-spinner');
    if (statusSpinner) {
        statusSpinner.classList.toggle('hidden', !show);
    }
}

function disableControls(disable = true) {
    // Disable buttons during critical operations, checking if they exist first
    const btnCaptureSingle = document.getElementById('btn-capture-single');
    const btnStartTimelapse = document.getElementById('btn-start-timelapse');
    
    if (btnCaptureSingle) btnCaptureSingle.disabled = disable;
    if (btnStartTimelapse) btnStartTimelapse.disabled = disable;
    // Add others as needed
}

/**
 * Helper function to make API calls
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {boolean} showLoading - Whether to show loading spinner
 * @returns {Promise<Object|null>} - The response data or null
 */
async function fetchApi(url, options = {}, showLoading = true) {
    const fetchOptions = (typeof options === 'object' && options !== null) ? options : {};

    if (showLoading) showSpinner(true);
    let responseData = null;
    try {
        console.debug(`Fetching ${url} with options:`, fetchOptions);
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            console.error(`API Error ${response.status}: ${response.statusText} for ${url}`);
            // Handle both camera status and settings endpoints silently when camera is disconnected
            if (url.includes('/api/camera/status') || url.includes('/api/camera/settings')) {
                return null;
            }
            try {
                const errData = await response.json();
                console.error("Error details:", errData);
                if (!url.includes('/static/previews/preview.jpg')) {
                    alert(`API Error: ${errData.message || response.statusText}`);
                }
            } catch (e) {
                if (!url.includes('/static/previews/preview.jpg')) {
                    alert(`API Error ${response.status}: ${response.statusText}`);
                }
            }
        } else {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                responseData = await response.json();
            } else {
                console.warn(`Received non-JSON response for ${url}. Content-Type: ${contentType}`);
                responseData = await response.text();
            }
        }
    } catch (error) {
        console.error(`Network or fetch error for ${url}:`, error);
        // Handle both camera status and settings endpoints silently when there are errors
        if (url.includes('/api/camera/status') || url.includes('/api/camera/settings')) {
            return null;
        }
        if (!url.includes('/static/previews/preview.jpg')) {
            alert(`Network or Fetch Error: ${error.message}. Is the server running?`);
        }
        return null;
    } finally {
        if (showLoading) showSpinner(false);
    }
    return responseData;
}

// Tab switching functionality
function switchTab(targetTabId) {
    console.debug(`Switching to tab: ${targetTabId}`);
    // Hide all content panels
    document.querySelectorAll('.tab-content').forEach(content => {
        if (content) content.classList.add('hidden');
    });

    // Deactivate all tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        if (button) button.classList.remove('active');
    });

    // Show the target content panel
    const targetContent = document.querySelector(targetTabId);
    if (targetContent) {
        targetContent.classList.remove('hidden');
    } else {
        console.error(`Tab content not found for target: ${targetTabId}`);
    }

    // Activate the target tab button
    const targetButton = document.querySelector(`[data-tab-target="${targetTabId}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    } else {
        console.error(`Tab button not found for target: ${targetTabId}`);
    }

    // Stop preview if switching away from the live control tab
    if (targetTabId !== '#tab-live-control' && window.isPreviewActive) {
        console.log("Switching tab away from Live Control, stopping preview.");
        window.stopPreview(); // Call async function but don't wait for it here
    }
}

// Initialize tab event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Set up tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
        if (button) {
            button.addEventListener('click', () => {
                const targetTabId = button.getAttribute('data-tab-target');
                if (targetTabId) {
                    switchTab(targetTabId);
                } else {
                    console.error("Tab button clicked but missing data-tab-target attribute.");
                }
            });
        }
    });

    // Activate the first tab by default
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    if (tabButtons.length > 0 && tabContents.length > 0) {
        switchTab('#tab-live-control');
    } else {
        console.error("Tab buttons or content panels not found on DOM load.");
    }
});