import os

# Base directory of the application
BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

# Directory for storing timelapse sequences
TIMELAPSE_DIR = os.path.join(BASE_DIR, 'timelapse_data')

# Directory for storing single images
SINGLE_CAPTURES_DIR = os.path.join(BASE_DIR, 'single_captures')

# Directory for storing output files (processed images, etc.)
OUTPUT_DIR = SINGLE_CAPTURES_DIR  # For backward compatibility

# Directory for static files (like preview)
STATIC_DIR = os.path.join(BASE_DIR, 'app', 'static')

# Path for preview image
PREVIEW_FILE_PATH = os.path.join(STATIC_DIR, 'previews', 'preview.jpg')

# Ensure directories exist
os.makedirs(os.path.dirname(PREVIEW_FILE_PATH), exist_ok=True)
os.makedirs(TIMELAPSE_DIR, exist_ok=True)
os.makedirs(SINGLE_CAPTURES_DIR, exist_ok=True)

# Create additional directories for processed outputs
os.makedirs(os.path.join(SINGLE_CAPTURES_DIR, 'processed'), exist_ok=True)
os.makedirs(os.path.join(SINGLE_CAPTURES_DIR, 'exports'), exist_ok=True)
os.makedirs(os.path.join(SINGLE_CAPTURES_DIR, 'uploads'), exist_ok=True)
os.makedirs(os.path.join(TIMELAPSE_DIR, 'processed'), exist_ok=True)

# Flask configuration
FLASK_SECRET_KEY = os.urandom(24)
FLASK_HOST = '0.0.0.0'
FLASK_PORT = 5000
FLASK_DEBUG = False

# FFMPEG path - assumes ffmpeg is in system PATH
FFMPEG_PATH = "ffmpeg"