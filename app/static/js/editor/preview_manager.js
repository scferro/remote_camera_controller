/**
 * Preview Manager JavaScript Module
 * Handles preview rendering, caching, and zooming functionality
 */

class PreviewManager {
    /**
     * Initialize a new preview manager
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Default options
        this.options = Object.assign({
            previewContainer: null,      // Container element for the preview
            imageElement: null,          // Image element
            placeholderElement: null,    // Placeholder element (shown when no image is loaded)
            loadingElement: null,        // Loading indicator element
            maxPreviewSize: 800,         // Maximum preview size (pixels)
            cacheDuration: 300000,       // Cache duration in milliseconds (5 minutes)
            baseUrl: '/api/editor/image/preview', // Base URL for preview API
            baseParams: {}               // Base parameters to include in all API calls
        }, options);
        
        // Initialize state
        this.currentZoom = 1.0;
        this.isLoading = false;
        this.originalSize = null;
        this.imageCache = new Map();
        this.panEnabled = false;
        this.lastPosition = null;
        
        // Bind methods
        this.loadPreview = this.loadPreview.bind(this);
        this.zoomIn = this.zoomIn.bind(this);
        this.zoomOut = this.zoomOut.bind(this);
        this.resetZoom = this.resetZoom.bind(this);
        this._handleMouseDown = this._handleMouseDown.bind(this);
        this._handleMouseMove = this._handleMouseMove.bind(this);
        this._handleMouseUp = this._handleMouseUp.bind(this);
        
        // Initialize if container provided
        if (this.options.previewContainer && this.options.imageElement) {
            this._initializeEventListeners();
        }
    }
    
    /**
     * Initialize event listeners for panning/zooming
     * @private
     */
    _initializeEventListeners() {
        const container = this.options.previewContainer;
        const image = this.options.imageElement;
        
        // Pan functionality
        image.addEventListener('mousedown', this._handleMouseDown);
        window.addEventListener('mousemove', this._handleMouseMove);
        window.addEventListener('mouseup', this._handleMouseUp);
        
        // Zoom with mouse wheel
        container.addEventListener('wheel', (e) => {
            if (!image.classList.contains('hidden')) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    this.zoomIn(0.1);
                } else {
                    this.zoomOut(0.1);
                }
            }
        });
    }
    
    /**
     * Handle mouse down for panning
     * @private
     */
    _handleMouseDown(e) {
        if (this.currentZoom > 1.0) {
            this.panEnabled = true;
            this.lastPosition = { x: e.clientX, y: e.clientY };
            this.options.imageElement.style.cursor = 'grabbing';
        }
    }
    
    /**
     * Handle mouse move for panning
     * @private
     */
    _handleMouseMove(e) {
        if (this.panEnabled && this.lastPosition) {
            const dx = e.clientX - this.lastPosition.x;
            const dy = e.clientY - this.lastPosition.y;
            
            const image = this.options.imageElement;
            const container = this.options.previewContainer;
            
            // Get current position from transform or initialize
            const currentTransform = window.getComputedStyle(image).transform;
            let matrix = new DOMMatrix(currentTransform);
            
            // Apply the pan
            const newMatrix = new DOMMatrix()
                .translate(matrix.e + dx, matrix.f + dy)
                .scale(this.currentZoom);
            
            // Apply the new transform
            image.style.transform = newMatrix.toString();
            
            // Update last position
            this.lastPosition = { x: e.clientX, y: e.clientY };
        }
    }
    
    /**
     * Handle mouse up to end panning
     * @private
     */
    _handleMouseUp() {
        this.panEnabled = false;
        this.lastPosition = null;
        if (this.options.imageElement) {
            this.options.imageElement.style.cursor = this.currentZoom > 1.0 ? 'grab' : 'default';
        }
    }
    
    /**
     * Load a preview image
     * @param {Object} params - Parameters for the preview
     * @returns {Promise<boolean>} - Success status
     */
    async loadPreview(params = {}) {
        // Combine base params with provided params
        const previewParams = Object.assign({}, this.options.baseParams, params);
        
        // Extract elements from options
        const {
            previewContainer,
            imageElement,
            placeholderElement,
            loadingElement,
            maxPreviewSize,
            baseUrl
        } = this.options;
        
        // Validate required elements
        if (!previewContainer || !imageElement) {
            console.error('Preview container or image element not provided');
            return false;
        }
        
        try {
            this._showLoading(true);
            
            // Build query string
            const queryParams = new URLSearchParams();
            for (const [key, value] of Object.entries(previewParams)) {
                queryParams.append(key, value);
            }
            
            // Add max size and timestamp to avoid caching
            queryParams.append('max_size', maxPreviewSize);
            queryParams.append('t', Date.now());
            
            // Build the full URL
            const previewUrl = `${baseUrl}?${queryParams.toString()}`;
            
            // Check cache first
            const cachedImage = this._getCachedImage(previewUrl);
            if (cachedImage) {
                this._updatePreview(cachedImage);
                return true;
            }
            
            // Load the image
            imageElement.src = '';
            imageElement.onload = () => {
                this._showLoading(false);
                
                // Show the image
                imageElement.classList.remove('hidden');
                if (placeholderElement) {
                    placeholderElement.classList.add('hidden');
                }
                
                // Save original dimensions
                this.originalSize = {
                    width: imageElement.naturalWidth,
                    height: imageElement.naturalHeight
                };
                
                // Reset zoom
                this.resetZoom();
                
                // Cache the image
                this._cacheImage(previewUrl, imageElement.src);
            };
            
            imageElement.onerror = () => {
                this._showLoading(false);
                imageElement.classList.add('hidden');
                if (placeholderElement) {
                    placeholderElement.classList.remove('hidden');
                    placeholderElement.textContent = 'Error loading preview';
                }
            };
            
            // Set the source
            imageElement.src = previewUrl;
            
            return true;
        } catch (error) {
            console.error('Preview loading error:', error);
            this._showLoading(false);
            if (imageElement) imageElement.classList.add('hidden');
            if (placeholderElement) {
                placeholderElement.classList.remove('hidden');
                placeholderElement.textContent = 'Error loading preview';
            }
            return false;
        }
    }
    
    /**
     * Zoom in by a specified amount
     * @param {number} amount - Amount to zoom in by
     */
    zoomIn(amount = 0.25) {
        const maxZoom = 5.0;
        this.currentZoom = Math.min(this.currentZoom + amount, maxZoom);
        this._applyZoom();
    }
    
    /**
     * Zoom out by a specified amount
     * @param {number} amount - Amount to zoom out by
     */
    zoomOut(amount = 0.25) {
        const minZoom = 0.5;
        this.currentZoom = Math.max(this.currentZoom - amount, minZoom);
        this._applyZoom();
    }
    
    /**
     * Reset zoom to fit container
     */
    resetZoom() {
        this.currentZoom = 1.0;
        const image = this.options.imageElement;
        if (image) {
            image.style.transform = `scale(${this.currentZoom})`;
            image.style.cursor = 'default';
        }
    }
    
    /**
     * Apply current zoom level
     * @private
     */
    _applyZoom() {
        const image = this.options.imageElement;
        if (image) {
            image.style.transform = `scale(${this.currentZoom})`;
            
            // Change cursor when zoomed in to indicate panning is available
            image.style.cursor = this.currentZoom > 1.0 ? 'grab' : 'default';
        }
    }
    
    /**
     * Show or hide loading indicator
     * @param {boolean} show - Whether to show loading
     * @private
     */
    _showLoading(show) {
        this.isLoading = show;
        
        const loadingElement = this.options.loadingElement;
        const imageElement = this.options.imageElement;
        
        if (loadingElement) {
            if (show) {
                loadingElement.classList.remove('hidden');
                if (imageElement) imageElement.classList.add('opacity-50');
            } else {
                loadingElement.classList.add('hidden');
                if (imageElement) imageElement.classList.remove('opacity-50');
            }
        }
    }
    
    /**
     * Cache an image URL
     * @param {string} key - Cache key
     * @param {string} imageUrl - Image URL
     * @private
     */
    _cacheImage(key, imageUrl) {
        this.imageCache.set(key, {
            url: imageUrl,
            timestamp: Date.now()
        });
        
        // Clean up old cache entries
        this._cleanCache();
    }
    
    /**
     * Get a cached image if available and not expired
     * @param {string} key - Cache key
     * @returns {string|null} - Cached image URL or null
     * @private
     */
    _getCachedImage(key) {
        const cached = this.imageCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.options.cacheDuration) {
            return cached.url;
        }
        return null;
    }
    
    /**
     * Clean expired cache entries
     * @private
     */
    _cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.imageCache.entries()) {
            if (now - value.timestamp > this.options.cacheDuration) {
                this.imageCache.delete(key);
            }
        }
    }
    
    /**
     * Update preview with a cached image
     * @param {string} imageUrl - Cached image URL
     * @private
     */
    _updatePreview(imageUrl) {
        const imageElement = this.options.imageElement;
        const placeholderElement = this.options.placeholderElement;
        
        if (imageElement) {
            this._showLoading(true);
            
            imageElement.onload = () => {
                this._showLoading(false);
                imageElement.classList.remove('hidden');
                if (placeholderElement) {
                    placeholderElement.classList.add('hidden');
                }
                
                // Reset zoom
                this.resetZoom();
            };
            
            imageElement.onerror = () => {
                this._showLoading(false);
                imageElement.classList.add('hidden');
                if (placeholderElement) {
                    placeholderElement.classList.remove('hidden');
                    placeholderElement.textContent = 'Error loading preview';
                }
            };
            
            imageElement.src = imageUrl;
        }
    }
}