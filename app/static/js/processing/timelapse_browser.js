/**
 * Timelapse Browser Component
 * Handles listing and selection of timelapse sequences
 */

// --- DOM Elements ---
const timelapseList = document.getElementById('timelapse-list');
const btnRefreshTimelapses = document.getElementById('btn-refresh-timelapses');
const selectedTimelapseInfo = document.getElementById('selected-timelapse-info');
const selectedTimelapseName = document.getElementById('selected-timelapse-name');
const timelapseCreationDate = document.getElementById('timelapse-creation-date');
const timelapseImageCount = document.getElementById('timelapse-image-count');
const timelapseImageType = document.getElementById('timelapse-image-type');
const timelapseProcessingStatus = document.getElementById('timelapse-processing-status');
const noTimelapsesMessage = document.getElementById('no-timelapses-message');
const timelapseCount = document.getElementById('timelapse-count');

// --- State ---
let timelapseSequences = [];
let selectedTimelapseFolder = null;

// --- Event Handlers ---

// Fetch and display timelapse folders
async function listTimelapses() {
    if (!timelapseList) return;
    
    timelapseList.innerHTML = '<li class="p-2">Loading timelapse sequences...</li>';
    
    try {
        const response = await fetch('/api/timelapse/list');
        const data = await response.json();
        
        if (data && Array.isArray(data.timelapses)) {
            timelapseSequences = data.timelapses;
            
            if (timelapseSequences.length === 0) {
                timelapseList.innerHTML = '';
                noTimelapsesMessage.classList.remove('hidden');
                timelapseCount.textContent = '0 timelapses found';
                return;
            }
            
            noTimelapsesMessage.classList.add('hidden');
            timelapseCount.textContent = `${timelapseSequences.length} timelapses found`;
            
            renderTimelapseList();
        } else {
            timelapseList.innerHTML = `<li class="p-2 text-red-500">Error: ${data?.message || 'Could not load timelapse list'}</li>`;
            timelapseCount.textContent = '0 timelapses found';
        }
    } catch (error) {
        console.error('Error fetching timelapse list:', error);
        timelapseList.innerHTML = '<li class="p-2 text-red-500">Error loading timelapses. Check console for details.</li>';
        timelapseCount.textContent = '0 timelapses found';
    }
}

// Render the timelapse list to the DOM
function renderTimelapseList() {
    timelapseList.innerHTML = '';
    
    timelapseSequences.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'p-2 hover:bg-blue-50 cursor-pointer flex items-center';
        
        // Folder icon
        li.innerHTML = `<svg class="w-5 h-5 mr-2 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>`;
        
        // Add folder name
        const nameSpan = document.createElement('span');
        nameSpan.textContent = folder.name || folder;
        nameSpan.className = 'flex-grow';
        li.appendChild(nameSpan);
        
        // Add date if available
        if (folder.date) {
            const dateSpan = document.createElement('span');
            dateSpan.textContent = formatDate(folder.date);
            dateSpan.className = 'text-xs text-gray-500';
            li.appendChild(dateSpan);
        }
        
        // Highlight if selected
        if (folder.name === selectedTimelapseFolder || folder === selectedTimelapseFolder) {
            li.classList.add('bg-blue-100');
        }
        
        // Add click handler
        li.addEventListener('click', () => {
            selectTimelapseFolder(folder.name || folder);
        });
        
        timelapseList.appendChild(li);
    });
}

// Select a timelapse folder and display its info
async function selectTimelapseFolder(folderName) {
    selectedTimelapseFolder = folderName;
    
    // Update UI
    const items = timelapseList.querySelectorAll('li');
    items.forEach(item => {
        item.classList.remove('bg-blue-100');
        const itemName = item.querySelector('span').textContent;
        if (itemName === folderName) {
            item.classList.add('bg-blue-100');
        }
    });
    
    // Show the info panel and update folder name
    selectedTimelapseInfo.classList.remove('hidden');
    selectedTimelapseName.textContent = folderName;
    
    // Reset other fields while loading
    timelapseCreationDate.textContent = 'Loading...';
    timelapseImageCount.textContent = 'Loading...';
    timelapseImageType.textContent = 'Loading...';
    timelapseProcessingStatus.textContent = 'Checking...';
    
    // Fetch detailed info for this folder
    try {
        const response = await fetch(`/api/timelapse/info?folder=${encodeURIComponent(folderName)}`);
        const data = await response.json();
        
        if (data && data.success) {
            timelapseCreationDate.textContent = formatDate(data.created_at);
            timelapseImageCount.textContent = data.image_count || '0';
            
            // Determine image type from the files
            if (data.image_types && data.image_types.length > 0) {
                timelapseImageType.textContent = data.image_types.join(', ').toUpperCase();
            } else {
                timelapseImageType.textContent = 'Unknown';
            }
            
            // Check if this has been processed before
            timelapseProcessingStatus.textContent = data.processed ? 'Processed' : 'Not processed';
            
            // Dispatch event so other components know a timelapse was selected
            const event = new CustomEvent('timelapseSelected', { 
                detail: { 
                    folder: folderName,
                    info: data 
                } 
            });
            document.dispatchEvent(event);
        } else {
            timelapseCreationDate.textContent = 'Unknown';
            timelapseImageCount.textContent = 'Unknown';
            timelapseImageType.textContent = 'Unknown';
            timelapseProcessingStatus.textContent = 'Unknown';
        }
    } catch (error) {
        console.error('Error fetching timelapse details:', error);
        timelapseCreationDate.textContent = 'Error';
        timelapseImageCount.textContent = 'Error';
        timelapseImageType.textContent = 'Error';
        timelapseProcessingStatus.textContent = 'Error';
    }
}

// Helper to format dates
function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return dateStr; // Return the original string if parsing fails
    }
}

// Initialize
function initTimelapseBrowser() {
    if (!timelapseList || !btnRefreshTimelapses) {
        console.warn('Timelapse browser: Some required DOM elements not found');
        return;
    }
    
    // Set up event listeners
    btnRefreshTimelapses.addEventListener('click', listTimelapses);
    
    // Initial load
    listTimelapses();
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', initTimelapseBrowser);

// Exports
window.timelapseBrowser = {
    refreshFolderList: listTimelapses,
    selectFolder: selectTimelapseFolder,
    getSelectedFolder: () => selectedTimelapseFolder
};