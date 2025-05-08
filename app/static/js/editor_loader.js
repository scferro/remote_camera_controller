/**
 * Editor Module Loader
 * Loads all the necessary JavaScript modules for the editor functionality
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Editor Module Loader: Starting to load editor JavaScript modules');
    
    // Function to dynamically load a script
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                console.log(`Successfully loaded: ${src}`);
                resolve();
            };
            script.onerror = () => {
                console.error(`Failed to load: ${src}`);
                reject(new Error(`Failed to load script: ${src}`));
            };
            document.head.appendChild(script);
        });
    };
    
    // Get tab elements
    const singleProcessingTab = document.getElementById('tab-single-processing');
    const timelapseProcessingTab = document.getElementById('tab-timelapse-processing');
    
    // Detect which editor components are present in the page
    const hasImageEditor = singleProcessingTab !== null;
    const hasTimelapseEditor = timelapseProcessingTab !== null;
    
    // Start by loading common utilities
    const commonScripts = [
        '/static/js/editor/utils.js'
    ];
    
    // Scripts specific to image editor
    const imageEditorScripts = [
        '/static/js/editor/preview_manager.js',
        '/static/js/editor/selector.js',
        '/static/js/editor/export.js',
        '/static/js/editor/image_editor.js'
    ];
    
    // Scripts specific to timelapse editor
    const timelapseEditorScripts = [
        '/static/js/editor/preview_manager.js',
        '/static/js/editor/selector.js',
        '/static/js/editor/scrubber.js',
        '/static/js/editor/export.js',
        '/static/js/editor/timelapse_editor.js'
    ];
    
    // Determine which scripts to load based on which tabs are present
    let scriptsToLoad = commonScripts;
    
    if (hasImageEditor) {
        console.log('Editor Module Loader: Loading Image Editor modules');
        scriptsToLoad = [...scriptsToLoad, ...imageEditorScripts];
    }
    
    if (hasTimelapseEditor) {
        console.log('Editor Module Loader: Loading Timelapse Editor modules');
        scriptsToLoad = [...scriptsToLoad, ...timelapseEditorScripts];
    }
    
    // Remove duplicate scripts (like preview_manager.js that may be in both)
    scriptsToLoad = [...new Set(scriptsToLoad)];
    
    // Load all scripts sequentially to ensure dependencies are met
    scriptsToLoad.reduce((promise, script) => {
        return promise.then(() => loadScript(script));
    }, Promise.resolve())
    .then(() => {
        console.log('Editor Module Loader: All modules loaded successfully');
        // Dispatch an event to notify that all scripts are loaded
        const event = new CustomEvent('editorModulesLoaded');
        document.dispatchEvent(event);
    })
    .catch((error) => {
        console.error('Editor Module Loader: Error loading modules', error);
    });
    
    // Add tab change detection to initialize editors when tabs are activated
    const tabButtons = document.querySelectorAll('.tab-button');
    if (tabButtons.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Get the target tab ID from the button
                const targetTabId = this.dataset.tab;
                
                // If switching to image processing tab
                if (targetTabId === 'tab-single-processing') {
                    if (window.initImageEditor && typeof window.initImageEditor === 'function') {
                        window.initImageEditor();
                    }
                }
                
                // If switching to timelapse processing tab
                if (targetTabId === 'tab-timelapse-processing') {
                    if (window.initTimelapseEditor && typeof window.initTimelapseEditor === 'function') {
                        window.initTimelapseEditor();
                    }
                }
            });
        });
    }
});