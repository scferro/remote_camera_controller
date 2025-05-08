import os

# Base directory of the application
BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

# Directory for storing timelapse sequences
TIMELAPSE_DIR = os.path.join(BASE_DIR, 'timelapse_data')

# Directory for storing single images
OUTPUT_DIR = os.path.join(BASE_DIR, 'single_captures')

# Directory for static files (like preview)
STATIC_DIR = os.path.join(BASE_DIR, 'app', 'static')

# Path for preview image
PREVIEW_FILE_PATH = os.path.join(STATIC_DIR, 'previews', 'preview.jpg')

# Ensure directories exist
os.makedirs(os.path.dirname(PREVIEW_FILE_PATH), exist_ok=True)
os.makedirs(TIMELAPSE_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Flask configuration
FLASK_SECRET_KEY = os.urandom(24)
FLASK_HOST = '0.0.0.0'
FLASK_PORT = 5000
FLASK_DEBUG = False

# FFMPEG path - assumes ffmpeg is in system PATH
FFMPEG_PATH = "ffmpeg"