/**
 * Timelapse Scrubber JavaScript Module
 * Handles frame navigation and thumbnail strip for timelapses
 */

class TimelapseScrubber {
    /**
     * Initialize a new timelapse scrubber
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Default options
        this.options = Object.assign({
            containerElement: null,         // Container element for the scrubber
            framePreviewElement: null,      // Element for the frame preview
            frameSliderElement: null,       // Range slider for frame navigation
            currentFrameElement: null,      // Element to display current frame number
            lastFrameElement: null,         // Element to display last frame number
            thumbnailStripElement: null,    // Element for thumbnail strip
            prevFrameButton: null,          // Button for previous frame
            nextFrameButton: null,          // Button for next frame
            playPauseButton: null,          // Button for play/pause
            speedSelectElement: null,       // Element for playback speed selection
            loadingElement: null,           // Element for loading indicator
            placeholderElement: null,       // Element for placeholder message
            onFrameChange: null,            // Callback when frame changes
            framePreviewUrl: '/api/editor/timelapse/frame_preview/', // URL for frame previews
            sessionId: 'default',           // Session ID for API requests
            maxPreviewSize: 800             // Maximum size for preview images
        }, options);
        
        // Initialize state
        this.totalFrames = 0;
        this.currentFrameIndex = 0;
        this.isPlaying = false;
        this.playbackSpeed = 1.0;
        this.playbackTimer = null;
        this.isLoading = false;
        this.thumbnailsLoaded = false;
        
        // Bind methods
        this.initialize = this.initialize.bind(this);
        this.loadFrame = this.loadFrame.bind(this);
        this.nextFrame = this.nextFrame.bind(this);
        this.prevFrame = this.prevFrame.bind(this);
        this.play = this.play.bind(this);
        this.pause = this.pause.bind(this);
        this.togglePlayPause = this.togglePlayPause.bind(this);
        this.updateThumbnailStrip = this.updateThumbnailStrip.bind(this);
        
        // Initialize if container provided
        if (this.options.containerElement) {
            this._initializeEventListeners();
        }
    }
    
    /**
     * Initialize event listeners
     * @private
     */
    _initializeEventListeners() {
        // Slider events
        if (this.options.frameSliderElement) {
            this.options.frameSliderElement.addEventListener('input', () => {
                const frameIdx = parseInt(this.options.frameSliderElement.value);
                if (this.options.currentFrameElement) {
                    this.options.currentFrameElement.textContent = `Frame ${frameIdx + 1}`;
                }
            });
            
            this.options.frameSliderElement.addEventListener('change', () => {
                const frameIdx = parseInt(this.options.frameSliderElement.value);
                this.loadFrame(frameIdx);
            });
        }
        
        // Navigation buttons
        if (this.options.prevFrameButton) {
            this.options.prevFrameButton.addEventListener('click', this.prevFrame);
        }
        
        if (this.options.nextFrameButton) {
            this.options.nextFrameButton.addEventListener('click', this.nextFrame);
        }
        
        // Play/pause button
        if (this.options.playPauseButton) {
            this.options.playPauseButton.addEventListener('click', this.togglePlayPause);
        }
        
        // Speed selection
        if (this.options.speedSelectElement) {
            this.options.speedSelectElement.addEventListener('change', () => {
                this.playbackSpeed = parseFloat(this.options.speedSelectElement.value);
                if (this.isPlaying) {
                    this.pause();
                    this.play();
                }
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Only process if initialized
            if (this.totalFrames === 0) return;
            
            switch (e.key) {
                case 'ArrowLeft':
                    this.prevFrame();
                    break;
                case 'ArrowRight':
                    this.nextFrame();
                    break;
                case ' ':  // Space bar
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                case 'Home':
                    this.loadFrame(0);
                    break;
                case 'End':
                    this.loadFrame(this.totalFrames - 1);
                    break;
            }
        });
    }
    
    /**
     * Initialize the scrubber with frame count
     * @param {number} frameCount - Total number of frames
     */
    initialize(frameCount) {
        this.totalFrames = frameCount;
        this.currentFrameIndex = 0;
        
        // Configure slider
        if (this.options.frameSliderElement) {
            this.options.frameSliderElement.min = 0;
            this.options.frameSliderElement.max = frameCount - 1;
            this.options.frameSliderElement.value = 0;
            this.options.frameSliderElement.disabled = frameCount === 0;
        }
        
        // Update frame number displays
        if (this.options.currentFrameElement) {
            this.options.currentFrameElement.textContent = `Frame 1`;
        }
        
        if (this.options.lastFrameElement) {
            this.options.lastFrameElement.textContent = `Frame ${frameCount}`;
        }
        
        // Enable/disable navigation buttons
        if (this.options.prevFrameButton) {
            this.options.prevFrameButton.disabled = frameCount === 0;
        }
        
        if (this.options.nextFrameButton) {
            this.options.nextFrameButton.disabled = frameCount === 0;
        }
        
        // Enable/disable play button
        if (this.options.playPauseButton) {
            this.options.playPauseButton.disabled = frameCount < 2;
        }
        
        // Enable/disable speed selection
        if (this.options.speedSelectElement) {
            this.options.speedSelectElement.disabled = frameCount < 2;
        }
        
        // Reset playback state
        this.isPlaying = false;
        if (this.playbackTimer) {
            clearInterval(this.playbackTimer);
            this.playbackTimer = null;
        }
        
        // Reset thumbnail strip
        this.thumbnailsLoaded = false;
        if (this.options.thumbnailStripElement) {
            this.options.thumbnailStripElement.innerHTML = '<div class="text-gray-500 text-center py-4 w-full">Thumbnails will appear here</div>';
        }
        
        // Load first frame if available
        if (frameCount > 0) {
            this.loadFrame(0);
        }
    }
    
    /**
     * Load and display a specific frame
     * @param {number} index - Frame index (0-based)
     * @returns {Promise<boolean>} - Success status
     */
    async loadFrame(index) {
        if (index < 0 || index >= this.totalFrames) {
            return false;
        }
        
        try {
            this._showLoading(true);
            
            // Clear any existing preview
            if (this.options.framePreviewElement) {
                this.options.framePreviewElement.src = '';
            }
            
            // Update current frame index
            this.currentFrameIndex = index;
            
            // Update slider position
            if (this.options.frameSliderElement) {
                this.options.frameSliderElement.value = index;
            }
            
            // Update frame number display
            if (this.options.currentFrameElement) {
                this.options.currentFrameElement.textContent = `Frame ${index + 1}`;
            }
            
            // Calculate preview size to fit container
            const containerWidth = this.options.containerElement ? this.options.containerElement.clientWidth : 800;
            const maxSize = Math.min(this.options.maxPreviewSize, containerWidth);
            
            // Set the preview image source with the current timestamp to avoid caching
            const timestamp = Date.now();
            const previewUrl = `${this.options.framePreviewUrl}${index}?session_id=${this.options.sessionId}&max_size=${maxSize}&t=${timestamp}`;
            
            if (this.options.framePreviewElement) {
                // Set load and error handlers
                this.options.framePreviewElement.onload = () => {
                    this._showLoading(false);
                    this.options.framePreviewElement.classList.remove('hidden');
                    if (this.options.placeholderElement) {
                        this.options.placeholderElement.classList.add('hidden');
                    }
                };
                
                this.options.framePreviewElement.onerror = () => {
                    this._showLoading(false);
                    this.options.framePreviewElement.classList.add('hidden');
                    if (this.options.placeholderElement) {
                        this.options.placeholderElement.classList.remove('hidden');
                        this.options.placeholderElement.textContent = 'Error loading frame';
                    }
                };
                
                // Set the source
                this.options.framePreviewElement.src = previewUrl;
            }
            
            // Update thumbnail selection
            this._updateThumbnailSelection();
            
            // Call frame change callback if provided
            if (typeof this.options.onFrameChange === 'function') {
                this.options.onFrameChange(index);
            }
            
            return true;
        } catch (error) {
            console.error('Frame load error:', error);
            this._showLoading(false);
            if (this.options.framePreviewElement) {
                this.options.framePreviewElement.classList.add('hidden');
            }
            if (this.options.placeholderElement) {
                this.options.placeholderElement.classList.remove('hidden');
                this.options.placeholderElement.textContent = 'Error loading frame';
            }
            return false;
        }
    }
    
    /**
     * Navigate to the next frame
     * @returns {Promise<boolean>} - Success status
     */
    async nextFrame() {
        if (this.currentFrameIndex < this.totalFrames - 1) {
            return await this.loadFrame(this.currentFrameIndex + 1);
        }
        return false;
    }
    
    /**
     * Navigate to the previous frame
     * @returns {Promise<boolean>} - Success status
     */
    async prevFrame() {
        if (this.currentFrameIndex > 0) {
            return await this.loadFrame(this.currentFrameIndex - 1);
        }
        return false;
    }
    
    /**
     * Start playback
     */
    play() {
        if (this.isPlaying || this.totalFrames < 2) {
            return;
        }
        
        this.isPlaying = true;
        
        // Update play/pause button if available
        if (this.options.playPauseButton) {
            const playIcon = this.options.playPauseButton.querySelector('#play-icon');
            if (playIcon) {
                playIcon.textContent = '⏸';
            }
            this.options.playPauseButton.textContent = this.options.playPauseButton.textContent.replace('Play', 'Pause');
        }
        
        // Calculate frame delay based on playback speed
        const frameDelay = 1000 / (24 * this.playbackSpeed);  // Assuming 24fps as base
        
        // Start playback timer
        this.playbackTimer = setInterval(() => {
            this.nextFrame().then(success => {
                // If reached the end, stop playback
                if (!success) {
                    this.pause();
                }
            });
        }, frameDelay);
    }
    
    /**
     * Pause playback
     */
    pause() {
        if (!this.isPlaying) {
            return;
        }
        
        this.isPlaying = false;
        
        // Clear playback timer
        if (this.playbackTimer) {
            clearInterval(this.playbackTimer);
            this.playbackTimer = null;
        }
        
        // Update play/pause button if available
        if (this.options.playPauseButton) {
            const playIcon = this.options.playPauseButton.querySelector('#play-icon');
            if (playIcon) {
                playIcon.textContent = '▶';
            }
            this.options.playPauseButton.textContent = this.options.playPauseButton.textContent.replace('Pause', 'Play');
        }
    }
    
    /**
     * Toggle between play and pause
     */
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    /**
     * Update the thumbnail strip with preview images
     * @param {Array} thumbnails - Array of thumbnail paths
     * @param {number} sampleInterval - Frame interval between thumbnails
     */
    updateThumbnailStrip(thumbnails, sampleInterval = 5) {
        if (!this.options.thumbnailStripElement || !thumbnails || thumbnails.length === 0) {
            return;
        }
        
        this.thumbnailsLoaded = true;
        this.options.thumbnailStripElement.innerHTML = '';
        
        // Calculate thumbnail size
        const thumbWidth = 80; // Fixed width for thumbnails
        
        thumbnails.forEach((thumbnail, index) => {
            // Calculate the corresponding frame index (using sample interval)
            const frameIdx = index * sampleInterval;
            
            // Create thumbnail element
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'thumbnail-item shrink-0 mx-1 cursor-pointer';
            thumbDiv.style.width = `${thumbWidth}px`;
            
            // Create image element
            const img = document.createElement('img');
            img.src = `/static/previews/${thumbnail}?t=${Date.now()}`; // Add timestamp to prevent caching
            img.className = 'w-full h-auto border';
            img.dataset.frameIndex = frameIdx;
            
            // Add click handler to jump to this frame
            img.addEventListener('click', () => {
                this.loadFrame(frameIdx);
            });
            
            // Add frame number below thumbnail
            const frameNumDiv = document.createElement('div');
            frameNumDiv.className = 'text-xs text-center';
            frameNumDiv.textContent = `${frameIdx + 1}`;
            
            // Add elements to container
            thumbDiv.appendChild(img);
            thumbDiv.appendChild(frameNumDiv);
            this.options.thumbnailStripElement.appendChild(thumbDiv);
        });
        
        // Add event listener for horizontal scroll with mouse wheel
        this.options.thumbnailStripElement.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                this.options.thumbnailStripElement.scrollLeft += e.deltaY;
            }
        });
        
        // Update selection
        this._updateThumbnailSelection();
    }
    
    /**
     * Update the selected thumbnail in the strip
     * @private
     */
    _updateThumbnailSelection() {
        if (!this.options.thumbnailStripElement || !this.thumbnailsLoaded) return;
        
        // Remove selection from all thumbnails
        const thumbs = this.options.thumbnailStripElement.querySelectorAll('.thumbnail-item img');
        thumbs.forEach(thumb => {
            thumb.classList.remove('border-blue-500', 'border-2');
            thumb.classList.add('border');
        });
        
        // Find the closest thumbnail to current frame and highlight it
        let closestThumb = null;
        let minDiff = Infinity;
        
        thumbs.forEach(thumb => {
            const frameIdx = parseInt(thumb.dataset.frameIndex);
            const diff = Math.abs(frameIdx - this.currentFrameIndex);
            if (diff < minDiff) {
                minDiff = diff;
                closestThumb = thumb;
            }
        });
        
        if (closestThumb) {
            closestThumb.classList.remove('border');
            closestThumb.classList.add('border-blue-500', 'border-2');
            
            // Scroll to the selected thumbnail
            closestThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
    
    /**
     * Show or hide loading state
     * @param {boolean} show - Whether to show loading
     * @private
     */
    _showLoading(show) {
        this.isLoading = show;
        
        if (this.options.loadingElement) {
            if (show) {
                this.options.loadingElement.classList.remove('hidden');
                if (this.options.framePreviewElement) {
                    this.options.framePreviewElement.classList.add('opacity-50');
                }
            } else {
                this.options.loadingElement.classList.add('hidden');
                if (this.options.framePreviewElement) {
                    this.options.framePreviewElement.classList.remove('opacity-50');
                }
            }
        }
    }
}

// Export class to global scope
window.TimelapseScrubber = TimelapseScrubber;