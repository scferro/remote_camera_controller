/**
 * Debug script for troubleshooting processing components
 */
console.log("Debug script loaded");

// Create a consistent way to log element status
function logElementState(id, message) {
    const element = document.getElementById(id);
    console.log(`Element '${id}': ${element ? 'Found' : 'NOT FOUND'} ${message ? ' - ' + message : ''}`);
    if (element) {
        console.log(`  - Display style: ${window.getComputedStyle(element).display}`);
        console.log(`  - Visibility: ${window.getComputedStyle(element).visibility}`);
        console.log(`  - Has .hidden class: ${element.classList.contains('hidden')}`);
    }
}

// Check DOM elements on load
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded - checking elements");
    
    // Check panel elements
    console.log("--- PANEL ELEMENTS ---");
    logElementState('editing-controls', 'Editing controls');
    logElementState('no-image-selected-edit', 'No image selected message (editing)');
    logElementState('export-controls', 'Export controls');
    logElementState('no-image-selected-export', 'No image selected message (export)');
    
    // Listen for image selection events
    document.addEventListener('singleImageSelected', function(event) {
        console.log("*** IMAGE SELECTED EVENT FIRED ***");
        console.log("Selected file:", event.detail);
        
        // Log the state after a small delay to see changes
        setTimeout(function() {
            console.log("--- ELEMENTS AFTER SELECTION ---");
            logElementState('editing-controls', 'Editing controls');
            logElementState('no-image-selected-edit', 'No image selected message (editing)');
            logElementState('export-controls', 'Export controls');
            logElementState('no-image-selected-export', 'No image selected message (export)');
        }, 500);
    });
    
    // Log when tabs are clicked
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            console.log(`Tab clicked: ${button.textContent.trim()} (${button.getAttribute('data-tab')})`);
        });
    });
});

// Add hook to show/hide controlled by JS
window.debugShowElement = function(id) {
    const element = document.getElementById(id);
    if (element) {
        element.classList.remove('hidden');
        console.log(`Showing element ${id}`);
    } else {
        console.log(`Element ${id} not found`);
    }
};

window.debugHideElement = function(id) {
    const element = document.getElementById(id);
    if (element) {
        element.classList.add('hidden');
        console.log(`Hiding element ${id}`);
    } else {
        console.log(`Element ${id} not found`);
    }
};