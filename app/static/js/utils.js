/**
 * Utility functions for the camera control application
 */

// --- Utility Functions ---
function showSpinner(show = true) {
    const statusSpinner = document.getElementById('status-spinner');
    if (statusSpinner) {
        statusSpinner.classList.toggle('hidden', !show);
    }
}

function disableControls(disable = true) {
    const btnCaptureSingle = document.getElementById('btn-capture-single');
    const btnStartTimelapse = document.getElementById('btn-start-timelapse');

    if (btnCaptureSingle) btnCaptureSingle.disabled = disable;
    if (btnStartTimelapse) btnStartTimelapse.disabled = disable;
}

async function fetchApi(url, options = {}, showLoading = true) {
    const fetchOptions = (typeof options === 'object' && options !== null) ? options : {};

    if (showLoading) showSpinner(true);
    let responseData = null;
    try {
        console.debug(`Fetching ${url} with options:`, fetchOptions);
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            console.error(`API Error ${response.status}: ${response.statusText} for ${url}`);
            if (url.includes('/api/camera/status') || url.includes('/api/camera/settings') || url.includes('/api/camera/quality')) {
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
let currentTabId = null;

function switchTab(targetTabId) {
    console.debug(`Switching to tab: ${targetTabId}`);

    // Stop preview if leaving the preview tab
    if (currentTabId === '#tab-preview' && targetTabId !== '#tab-preview' && window.isPreviewActive) {
        console.log("Switching away from Preview tab, stopping preview.");
        window.stopPreview();
    }

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

    currentTabId = targetTabId;
}

// Form persistence utilities
function saveFormValue(element) {
    if (element.id) {
        const value = element.type === 'checkbox' || element.type === 'radio' ? element.checked : element.value;
        localStorage.setItem(`form_${element.id}`, JSON.stringify(value));
    }
}

function restoreFormData() {
    document.querySelectorAll('input, select, textarea').forEach(element => {
        if (element.id) {
            const savedValue = localStorage.getItem(`form_${element.id}`);
            if (savedValue !== null) {
                try {
                    const parsedValue = JSON.parse(savedValue);
                    if (element.type === 'checkbox' || element.type === 'radio') {
                        element.checked = parsedValue;
                    } else {
                        element.value = parsedValue;
                    }
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (e) {
                    console.warn(`Failed to restore value for ${element.id}:`, e);
                }
            }
        }
    });
}

// Initialize tab event listeners and form persistence
document.addEventListener('DOMContentLoaded', () => {
    // Set up tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
        if (button) {
            button.addEventListener('click', () => {
                const targetTabId = button.getAttribute('data-tab-target');
                if (targetTabId) {
                    switchTab(targetTabId);
                }
            });
        }
    });

    // Activate preview tab by default
    switchTab('#tab-preview');

    // Set up form persistence
    document.addEventListener('input', (e) => {
        saveFormValue(e.target);
    });

    document.addEventListener('change', (e) => {
        saveFormValue(e.target);
    });

    // Restore form data after a brief delay to ensure all elements are loaded
    setTimeout(restoreFormData, 100);
});