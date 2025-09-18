from flask import Blueprint

# Create blueprints for different route categories
camera_bp = Blueprint('camera', __name__, url_prefix='/api/camera')
capture_bp = Blueprint('capture', __name__, url_prefix='/api/capture')
preview_bp = Blueprint('preview', __name__, url_prefix='/api/preview')
timelapse_bp = Blueprint('timelapse', __name__, url_prefix='/api/timelapse')

# Create a separate blueprint for main routes
main_bp = Blueprint('main', __name__)

# Import main routes
from flask import current_app, render_template, send_from_directory, abort
import os

# Main page route
@main_bp.route('/')
def index():
    """Serves the main HTML page."""
    current_app.logger.info("Serving index page.")
    return render_template('pages/index.html')

# Preview image route
@preview_bp.route('/image/<filename>')
def preview_image(filename):
    """Serves the latest preview image with cache control headers."""
    from app.config import PREVIEW_FILE_PATH
    try:
        preview_dir = os.path.dirname(PREVIEW_FILE_PATH)
        response = send_from_directory(preview_dir, filename)
        # Add headers to prevent caching
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except FileNotFoundError:
        current_app.logger.warning(f"Preview file not found: {filename}")
        abort(404)

# Import routes to register them with blueprints
from app.routes.camera import *
from app.routes.capture import *
from app.routes.preview import *
from app.routes.timelapse import *