/**
 * Selector JavaScript Module
 * Handles file and folder selection functionality
 */

class FileSelector {
    /**
     * Initialize a new file selector
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Default options
        this.options = Object.assign({
            containerElement: null,        // Container element for the selector
            directoryListElement: null,    // Element to display directories
            fileListElement: null,         // Element to display files
            currentPathElement: null,      // Element to display current path
            parentDirButton: null,         // Button to navigate to parent directory
            refreshButton: null,           // Button to refresh the listing
            fileFilter: null,              // Function to filter files
            onFileSelect: null,            // Callback when a file is selected
            thumbnailSize: 150,            // Size of thumbnails
            apiEndpoint: '/api/editor/preview/browse',  // API endpoint for browsing
            thumbnailEndpoint: '/api/editor/preview/thumbnail'  // API endpoint for thumbnails
        }, options);
        
        // Initialize state
        this.currentDirectory = '';
        this.selectedFile = null;
        this.isLoading = false;
        
        // Bind methods
        this.browse = this.browse.bind(this);
        this.selectFile = this.selectFile.bind(this);
        this.navigateToParent = this.navigateToParent.bind(this);
        this.refresh = this.refresh.bind(this);
        this._updateUI = this._updateUI.bind(this);
        
        // Initialize if container provided
        if (this.options.containerElement) {
            this._initializeEventListeners();
            this.browse();  // Initial browsing
        }
    }
    
    /**
     * Initialize event listeners
     * @private
     */
    _initializeEventListeners() {
        // Refresh button
        if (this.options.refreshButton) {
            this.options.refreshButton.addEventListener('click', this.refresh);
        }
        
        // Parent directory button
        if (this.options.parentDirButton) {
            this.options.parentDirButton.addEventListener('click', this.navigateToParent);
        }
    }
    
    /**
     * Browse a directory
     * @param {string} directory - Directory path to browse (or empty for default)
     * @returns {Promise<boolean>} - Success status
     */
    async browse(directory = '') {
        if (this.isLoading) return false;
        
        try {
            this.isLoading = true;
            this._showLoading(true);
            
            // Construct the API URL
            const url = `${this.options.apiEndpoint}?dir=${encodeURIComponent(directory)}`;
            
            // Fetch directory contents
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Error listing directory: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.currentDirectory = data.contents.path;
                this._updateUI(data.contents);
                return true;
            } else {
                throw new Error(data.message || 'Failed to browse directory');
            }
        } catch (error) {
            console.error('Browse error:', error);
            this._showError(`Error browsing directory: ${error.message}`);
            return false;
        } finally {
            this.isLoading = false;
            this._showLoading(false);
        }
    }
    
    /**
     * Navigate to parent directory
     * @returns {Promise<boolean>} - Success status
     */
    async navigateToParent() {
        if (this.isLoading || !this.options.parentDirButton || this.options.parentDirButton.disabled) {
            return false;
        }
        
        // Get parent directory from current path
        const parent = this.currentDirectory.substring(0, this.currentDirectory.lastIndexOf('/'));
        return await this.browse(parent);
    }
    
    /**
     * Refresh the current directory listing
     * @returns {Promise<boolean>} - Success status
     */
    async refresh() {
        return await this.browse(this.currentDirectory);
    }
    
    /**
     * Select a file
     * @param {string} filePath - Path to the file
     * @returns {boolean} - Success status
     */
    selectFile(filePath) {
        this.selectedFile = filePath;
        
        // Update UI to show selection
        if (this.options.fileListElement) {
            const items = this.options.fileListElement.querySelectorAll('.file-item');
            items.forEach(item => {
                if (item.dataset.path === filePath) {
                    item.classList.add('selected', 'border-blue-500', 'bg-blue-50');
                } else {
                    item.classList.remove('selected', 'border-blue-500', 'bg-blue-50');
                }
            });
        }
        
        // Call the selection callback if provided
        if (typeof this.options.onFileSelect === 'function') {
            this.options.onFileSelect(filePath);
        }
        
        return true;
    }
    
    /**
     * Update the UI with directory contents
     * @param {Object} contents - Directory contents
     * @private
     */
    _updateUI(contents) {
        // Update current path display
        if (this.options.currentPathElement) {
            this.options.currentPathElement.textContent = contents.path;
        }
        
        // Enable/disable parent directory button
        if (this.options.parentDirButton) {
            this.options.parentDirButton.disabled = !contents.parent;
        }
        
        // Update directory list
        if (this.options.directoryListElement) {
            const dirList = document.createElement('ul');
            dirList.className = 'list-none text-sm';
            
            if (contents.directories.length === 0) {
                const li = document.createElement('li');
                li.className = 'text-gray-500';
                li.textContent = 'No subdirectories';
                dirList.appendChild(li);
            } else {
                contents.directories.forEach(dir => {
                    const li = document.createElement('li');
                    li.className = 'hover:bg-blue-100 cursor-pointer p-1 rounded flex items-center';
                    li.innerHTML = `<span class="text-yellow-500 mr-1">📁</span> ${dir.name}`;
                    li.addEventListener('click', () => this.browse(dir.path));
                    dirList.appendChild(li);
                });
            }
            
            this.options.directoryListElement.innerHTML = '';
            this.options.directoryListElement.appendChild(dirList);
        }
        
        // Update file list
        if (this.options.fileListElement) {
            // Filter files if a filter function is provided
            let files = contents.files;
            if (typeof this.options.fileFilter === 'function') {
                files = files.filter(this.options.fileFilter);
            }
            
            const container = document.createElement('div');
            container.className = 'grid grid-cols-3 gap-2';
            
            if (files.length === 0) {
                const noFiles = document.createElement('div');
                noFiles.className = 'text-gray-500 col-span-3 text-center py-4';
                noFiles.textContent = 'No files found';
                container.appendChild(noFiles);
            } else {
                files.forEach(file => {
                    const fileDiv = document.createElement('div');
                    fileDiv.className = 'file-item border rounded p-1 cursor-pointer hover:border-blue-500';
                    fileDiv.dataset.path = file.path;
                    
                    // Check if this is the selected file
                    if (file.path === this.selectedFile) {
                        fileDiv.classList.add('selected', 'border-blue-500', 'bg-blue-50');
                    }
                    
                    // Create thumbnail image
                    const img = document.createElement('img');
                    img.src = `${this.options.thumbnailEndpoint}?path=${encodeURIComponent(file.path)}&max_size=${this.options.thumbnailSize}`;
                    img.alt = file.name;
                    img.className = 'w-full h-auto aspect-square object-contain bg-gray-100';
                    
                    // Add filename below the thumbnail
                    const fileName = document.createElement('div');
                    fileName.className = 'text-xs truncate mt-1 text-center';
                    fileName.title = file.name;
                    fileName.textContent = file.name;
                    
                    // Add click event to select the file
                    fileDiv.addEventListener('click', () => this.selectFile(file.path));
                    
                    fileDiv.appendChild(img);
                    fileDiv.appendChild(fileName);
                    container.appendChild(fileDiv);
                });
            }
            
            this.options.fileListElement.innerHTML = '';
            this.options.fileListElement.appendChild(container);
        }
    }
    
    /**
     * Show or hide loading state
     * @param {boolean} show - Whether to show loading
     * @private
     */
    _showLoading(show) {
        if (this.options.directoryListElement) {
            this.options.directoryListElement.classList.toggle('opacity-50', show);
        }
        
        if (this.options.fileListElement) {
            this.options.fileListElement.classList.toggle('opacity-50', show);
        }
    }
    
    /**
     * Show an error message
     * @param {string} message - Error message
     * @private
     */
    _showError(message) {
        if (this.options.fileListElement) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'text-red-500 text-center py-4';
            errorDiv.textContent = message;
            this.options.fileListElement.innerHTML = '';
            this.options.fileListElement.appendChild(errorDiv);
        }
    }
}

// TimelapseSelector class for selecting timelapse sequences
class TimelapseSelector {
    /**
     * Initialize a new timelapse selector
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Default options
        this.options = Object.assign({
            containerElement: null,       // Container element for the selector
            listElement: null,            // Element to display timelapse list
            infoElement: null,            // Element to display selected timelapse info
            nameElement: null,            // Element to display timelapse name
            frameCountElement: null,      // Element to display frame count
            dateElement: null,            // Element to display capture date
            refreshButton: null,          // Button to refresh the listing
            loadProjectButton: null,      // Button to load a project
            saveProjectButton: null,      // Button to save a project
            onTimelapseSelect: null,      // Callback when a timelapse is selected
            apiEndpoint: '/api/editor/timelapse/list'  // API endpoint for listing timelapses
        }, options);
        
        // Initialize state
        this.selectedTimelapse = null;
        this.timelapseMetadata = null;
        this.isLoading = false;
        
        // Bind methods
        this.listTimelapses = this.listTimelapses.bind(this);
        this.selectTimelapse = this.selectTimelapse.bind(this);
        this._updateUI = this._updateUI.bind(this);
        
        // Initialize if container provided
        if (this.options.containerElement) {
            this._initializeEventListeners();
            this.listTimelapses();  // Initial listing
        }
    }
    
    /**
     * Initialize event listeners
     * @private
     */
    _initializeEventListeners() {
        // Refresh button
        if (this.options.refreshButton) {
            this.options.refreshButton.addEventListener('click', this.listTimelapses);
        }
    }
    
    /**
     * List available timelapse sequences
     * @returns {Promise<boolean>} - Success status
     */
    async listTimelapses() {
        if (this.isLoading) return false;
        
        try {
            this.isLoading = true;
            this._showLoading(true);
            
            if (this.options.listElement) {
                this.options.listElement.innerHTML = '<li class="text-gray-500">Loading...</li>';
            }
            
            // Fetch timelapse list
            const response = await fetch(this.options.apiEndpoint);
            
            if (!response.ok) {
                throw new Error(`Error listing timelapses: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this._updateUI(data.timelapses);
                return true;
            } else {
                throw new Error(data.message || 'Failed to list timelapses');
            }
        } catch (error) {
            console.error('List error:', error);
            this._showError(`Error listing timelapses: ${error.message}`);
            return false;
        } finally {
            this.isLoading = false;
            this._showLoading(false);
        }
    }
    
    /**
     * Select a timelapse sequence
     * @param {string} timelapsePath - Path to the timelapse
     * @param {Object} metadata - Timelapse metadata (optional)
     * @returns {boolean} - Success status
     */
    selectTimelapse(timelapsePath, metadata = null) {
        this.selectedTimelapse = timelapsePath;
        this.timelapseMetadata = metadata;
        
        // Update UI to show selection
        this._updateSelection();
        
        // Call the selection callback if provided
        if (typeof this.options.onTimelapseSelect === 'function') {
            this.options.onTimelapseSelect(timelapsePath, metadata);
        }
        
        return true;
    }
    
    /**
     * Enable or disable project buttons
     * @param {boolean} enable - Whether to enable buttons
     */
    enableProjectButtons(enable) {
        if (this.options.saveProjectButton) {
            this.options.saveProjectButton.disabled = !enable;
        }
    }
    
    /**
     * Update the UI with timelapse list
     * @param {Array} timelapses - List of timelapse sequences
     * @private
     */
    _updateUI(timelapses) {
        if (!this.options.listElement) return;
        
        this.options.listElement.innerHTML = '';
        
        if (timelapses.length === 0) {
            const li = document.createElement('li');
            li.className = 'text-gray-500';
            li.textContent = 'No timelapse sequences found';
            this.options.listElement.appendChild(li);
            return;
        }
        
        timelapses.forEach(timelapse => {
            const li = document.createElement('li');
            li.className = 'hover:bg-blue-100 cursor-pointer p-2 rounded my-1';
            
            // Check if this is the selected timelapse
            if (timelapse.path === this.selectedTimelapse) {
                li.classList.add('bg-blue-100');
            }
            
            li.textContent = timelapse.name;
            li.dataset.path = timelapse.path;
            
            // Add click event to select the timelapse
            li.addEventListener('click', () => {
                // This just sets the selected state - loading would be handled by the callback
                this.selectTimelapse(timelapse.path);
            });
            
            this.options.listElement.appendChild(li);
        });
    }
    
    /**
     * Update the selected timelapse in the UI
     * @private
     */
    _updateSelection() {
        // Update list selection
        if (this.options.listElement) {
            const items = this.options.listElement.querySelectorAll('li');
            items.forEach(item => {
                if (item.dataset.path === this.selectedTimelapse) {
                    item.classList.add('bg-blue-100');
                } else {
                    item.classList.remove('bg-blue-100');
                }
            });
        }
        
        // Show info panel if metadata is available
        if (this.timelapseMetadata && this.options.infoElement) {
            this.options.infoElement.classList.remove('hidden');
            
            // Update info elements
            if (this.options.nameElement) {
                this.options.nameElement.textContent = this.timelapseMetadata.name || 'Unknown';
            }
            
            if (this.options.frameCountElement) {
                this.options.frameCountElement.textContent = this.timelapseMetadata.frame_count || '0';
            }
            
            if (this.options.dateElement) {
                this.options.dateElement.textContent = this.timelapseMetadata.date_captured || 'Unknown';
            }
        } else if (this.options.infoElement) {
            this.options.infoElement.classList.add('hidden');
        }
    }
    
    /**
     * Show or hide loading state
     * @param {boolean} show - Whether to show loading
     * @private
     */
    _showLoading(show) {
        if (this.options.listElement) {
            this.options.listElement.classList.toggle('opacity-50', show);
        }
    }
    
    /**
     * Show an error message
     * @param {string} message - Error message
     * @private
     */
    _showError(message) {
        if (this.options.listElement) {
            const li = document.createElement('li');
            li.className = 'text-red-500';
            li.textContent = message;
            this.options.listElement.innerHTML = '';
            this.options.listElement.appendChild(li);
        }
    }
}

// Export classes to global scope
window.FileSelector = FileSelector;
window.TimelapseSelector = TimelapseSelector;