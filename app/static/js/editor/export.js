/**
 * Export Manager JavaScript Module
 * Handles exporting of edited images and timelapses
 */

class ExportManager {
    /**
     * Initialize a new export manager
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Default options
        this.options = Object.assign({
            type: 'image',                 // 'image' or 'timelapse'
            containerElement: null,        // Container element for export UI
            statusElement: null,           // Element to display export status
            progressElement: null,         // Element for progress indication
            formatSelectElement: null,     // Element for format selection
            qualitySliderElement: null,    // Element for quality selection
            filenameElement: null,         // Element for output filename
            saveButtonElement: null,       // Button to trigger save/export
            cancelButtonElement: null,     // Button to cancel export
            imageExportEndpoint: '/api/editor/image/save',  // Endpoint for image export
            timelapseExportEndpoint: '/api/editor/timelapse/assemble',  // Endpoint for timelapse export
            onExportComplete: null,        // Callback when export completes
            onExportError: null            // Callback when export fails
        }, options);
        
        // Initialize state
        this.isExporting = false;
        this.exportProgress = 0;
        this.sessionId = null;
        
        // Bind methods
        this.exportImage = this.exportImage.bind(this);
        this.exportTimelapse = this.exportTimelapse.bind(this);
        this.cancelExport = this.cancelExport.bind(this);
        this._updateProgress = this._updateProgress.bind(this);
        this._showStatus = this._showStatus.bind(this);
        
        // Initialize if container provided
        if (this.options.containerElement && this.options.saveButtonElement) {
            this._initializeEventListeners();
        }
    }
    
    /**
     * Initialize event listeners
     * @private
     */
    _initializeEventListeners() {
        // Save/export button
        if (this.options.saveButtonElement) {
            this.options.saveButtonElement.addEventListener('click', () => {
                if (this.options.type === 'image') {
                    this.exportImage();
                } else {
                    this.exportTimelapse();
                }
            });
        }
        
        // Cancel button
        if (this.options.cancelButtonElement) {
            this.options.cancelButtonElement.addEventListener('click', this.cancelExport);
        }
        
        // Format selection change - show/hide quality slider for JPEG
        if (this.options.formatSelectElement && this.options.qualitySliderElement) {
            this.options.formatSelectElement.addEventListener('change', () => {
                const format = this.options.formatSelectElement.value;
                const qualityContainer = this.options.qualitySliderElement.closest('.setting-group');
                
                if (format.toUpperCase() === 'JPEG') {
                    qualityContainer.classList.remove('hidden');
                } else {
                    qualityContainer.classList.add('hidden');
                }
            });
        }
    }
    
    /**
     * Set the session ID for API requests
     * @param {string} sessionId - Session ID
     */
    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }
    
    /**
     * Enable or disable export controls
     * @param {boolean} enable - Whether to enable controls
     */
    enableControls(enable) {
        if (this.options.formatSelectElement) {
            this.options.formatSelectElement.disabled = !enable;
        }
        
        if (this.options.qualitySliderElement) {
            this.options.qualitySliderElement.disabled = !enable;
        }
        
        if (this.options.filenameElement) {
            this.options.filenameElement.disabled = !enable;
        }
        
        if (this.options.saveButtonElement) {
            this.options.saveButtonElement.disabled = !enable;
        }
    }
    
    /**
     * Set default filename
     * @param {string} filename - Default filename
     */
    setDefaultFilename(filename) {
        if (this.options.filenameElement) {
            this.options.filenameElement.value = filename;
        }
    }
    
    /**
     * Export the edited image
     * @returns {Promise<boolean>} - Success status
     */
    async exportImage() {
        if (this.isExporting || !this.sessionId) {
            return false;
        }
        
        try {
            this.isExporting = true;
            this._updateProgress(0);
            this._showStatus('Starting export...');
            this.enableControls(false);
            
            // Get export parameters
            const format = this.options.formatSelectElement ? this.options.formatSelectElement.value : 'JPEG';
            const quality = this.options.qualitySliderElement ? parseInt(this.options.qualitySliderElement.value) : 95;
            const filename = this.options.filenameElement ? this.options.filenameElement.value.trim() : '';
            
            // Update progress
            this._updateProgress(10);
            this._showStatus('Processing image...');
            
            // Call the export API
            const response = await fetch(this.options.imageExportEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    output_path: filename || null,
                    format: format,
                    quality: quality
                })
            });
            
            if (!response.ok) {
                throw new Error(`Export failed: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Export failed');
            }
            
            // Update progress to complete
            this._updateProgress(100);
            this._showStatus(`Image saved successfully to ${data.path}`);
            
            // Call success callback if provided
            if (typeof this.options.onExportComplete === 'function') {
                this.options.onExportComplete(data);
            }
            
            return true;
        } catch (error) {
            console.error('Export error:', error);
            this._showStatus(`Export failed: ${error.message}`);
            
            // Call error callback if provided
            if (typeof this.options.onExportError === 'function') {
                this.options.onExportError(error);
            }
            
            return false;
        } finally {
            this.isExporting = false;
            this.enableControls(true);
        }
    }
    
    /**
     * Export the timelapse as a video
     * @returns {Promise<boolean>} - Success status
     */
    async exportTimelapse() {
        if (this.isExporting || !this.sessionId) {
            return false;
        }
        
        try {
            this.isExporting = true;
            this._updateProgress(0);
            this._showStatus('Starting video assembly...');
            this.enableControls(false);
            
            // Get export parameters (for timelapse, these would include fps, format, etc.)
            const fpsElement = document.getElementById('video-fps');
            const formatElement = document.getElementById('video-format');
            const qualityElement = document.getElementById('video-quality');
            const useEditedElement = document.getElementById('use-edited-frames');
            
            const fps = fpsElement ? parseInt(fpsElement.value) : 24;
            const format = formatElement ? formatElement.value : 'mp4';
            const quality = qualityElement ? qualityElement.value : 'high';
            const useEdited = useEditedElement ? useEditedElement.checked : true;
            const filename = this.options.filenameElement ? this.options.filenameElement.value.trim() : '';
            
            // Update progress at intervals to show activity
            const progressInterval = setInterval(() => {
                // Increment progress slowly up to 90% (the final 10% is for completion)
                if (this.exportProgress < 90) {
                    this._updateProgress(this.exportProgress + 5);
                    this._showStatus('Assembling video...');
                }
            }, 1000);
            
            // Call the export API
            const response = await fetch(this.options.timelapseExportEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    output_path: filename || null,
                    fps: fps,
                    format: format,
                    quality: quality,
                    use_edited: useEdited
                })
            });
            
            // Clear the progress interval
            clearInterval(progressInterval);
            
            if (!response.ok) {
                throw new Error(`Export failed: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Export failed');
            }
            
            // Update progress to complete
            this._updateProgress(100);
            this._showStatus(`Video assembled successfully to ${data.output_path}`);
            
            // Call success callback if provided
            if (typeof this.options.onExportComplete === 'function') {
                this.options.onExportComplete(data);
            }
            
            return true;
        } catch (error) {
            console.error('Export error:', error);
            this._showStatus(`Export failed: ${error.message}`);
            
            // Call error callback if provided
            if (typeof this.options.onExportError === 'function') {
                this.options.onExportError(error);
            }
            
            return false;
        } finally {
            this.isExporting = false;
            this.enableControls(true);
        }
    }
    
    /**
     * Cancel the current export
     */
    cancelExport() {
        if (!this.isExporting) {
            return;
        }
        
        // In a real implementation, this would call an API to cancel the export
        // For now, we just update the state
        this.isExporting = false;
        this._showStatus('Export cancelled');
        this.enableControls(true);
    }
    
    /**
     * Update the progress indicator
     * @param {number} percentage - Progress percentage (0-100)
     * @private
     */
    _updateProgress(percentage) {
        this.exportProgress = percentage;
        
        if (this.options.progressElement) {
            // If it's a progress element, update the value
            if (this.options.progressElement.tagName === 'PROGRESS') {
                this.options.progressElement.value = percentage;
            } else {
                // Otherwise, update the width of a progress bar
                this.options.progressElement.style.width = `${percentage}%`;
            }
        }
    }
    
    /**
     * Show a status message
     * @param {string} message - Status message
     * @private
     */
    _showStatus(message) {
        if (this.options.statusElement) {
            this.options.statusElement.textContent = message;
        }
    }
}

// Export class to global scope
window.ExportManager = ExportManager;