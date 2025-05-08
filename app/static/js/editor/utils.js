/**
 * Editor Utilities JavaScript Module
 * Provides shared functionality for the image and timelapse editors
 */

/**
 * Fetch API wrapper with error handling
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Fetch options
 * @param {boolean} showError - Whether to show error alerts
 * @returns {Promise<Object|null>} - The response data or null on error
 */
async function fetchEditorApi(url, options = {}, showError = true) {
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorText = response.statusText;
            
            try {
                // Try to parse error as JSON first
                const errorData = await response.json();
                if (showError) {
                    alert(`API Error: ${errorData.message || errorText}`);
                }
                console.error(`API Error (${response.status}): ${errorData.message || errorText}`);
                return null;
            } catch (parseError) {
                // Not JSON, use status text
                if (showError) {
                    alert(`API Error: ${errorText} (${response.status})`);
                }
                console.error(`API Error (${response.status}): ${errorText}`);
                return null;
            }
        }
        
        // Check content type for JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else {
            // Return response object for non-JSON responses (like images)
            return response;
        }
    } catch (error) {
        console.error('Network Error:', error);
        if (showError) {
            alert(`Network Error: ${error.message}`);
        }
        return null;
    }
}

/**
 * Format a file size in bytes to a human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size string
 */
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' bytes';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    } else if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } else {
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
}

/**
 * Format a timestamp to a readable date string
 * @param {number} timestamp - Unix timestamp
 * @returns {string} - Formatted date string
 */
function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Generate a unique session ID
 * @returns {string} - Session ID
 */
function generateSessionId(prefix = 'editor') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Show a loading spinner
 * @param {HTMLElement} container - Container element
 * @param {boolean} show - Whether to show or hide the spinner
 */
function showSpinner(container, show = true) {
    // Check if spinner already exists
    let spinner = container.querySelector('.editor-spinner');
    
    if (show) {
        if (!spinner) {
            // Create spinner if it doesn't exist
            spinner = document.createElement('div');
            spinner.className = 'editor-spinner';
            spinner.innerHTML = `
                <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div class="bg-white p-4 rounded-lg flex items-center">
                        <div class="spinner mr-3"></div>
                        <div>Loading...</div>
                    </div>
                </div>
            `;
            container.appendChild(spinner);
        } else {
            spinner.classList.remove('hidden');
        }
    } else if (spinner) {
        spinner.classList.add('hidden');
    }
}

/**
 * Debounce function to limit how often a function can be called
 * @param {Function} func - The function to debounce
 * @param {number} wait - The debounce delay in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Get dimensions of an image
 * @param {string} src - Image URL
 * @returns {Promise<{width: number, height: number}>} - Image dimensions
 */
function getImageDimensions(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
            reject(new Error('Failed to load image'));
        };
        img.src = src;
    });
}

// Export functions to global scope if needed in multiple modules
window.fetchEditorApi = fetchEditorApi;
window.formatFileSize = formatFileSize;
window.formatDate = formatDate;
window.generateSessionId = generateSessionId;
window.showSpinner = showSpinner;
window.debounce = debounce;
window.getImageDimensions = getImageDimensions;