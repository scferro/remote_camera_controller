from flask import Blueprint

# Create blueprints for different route categories
camera_bp = Blueprint('camera', __name__, url_prefix='/api/camera')
capture_bp = Blueprint('capture', __name__, url_prefix='/api/capture')
preview_bp = Blueprint('preview', __name__, url_prefix='/api/preview')
timelapse_bp = Blueprint('timelapse', __name__, url_prefix='/api/timelapse')
processing_bp = Blueprint('processing', __name__, url_prefix='/api/process')
files_bp = Blueprint('files', __name__, url_prefix='/api/files')

# Create a separate blueprint for main routes
main_bp = Blueprint('main', __name__)

# Import necessary modules for files blueprint
import os
from flask import current_app, jsonify, request, send_file
from app.config import TIMELAPSE_DIR, SINGLE_CAPTURES_DIR, OUTPUT_DIR

# Define file routes directly in the blueprint
@files_bp.route('/list', methods=['GET'])
def list_files_api():
    """API endpoint to list files in a directory."""
    path = request.args.get('path', '')
    current_app.logger.info(f"API request: /api/files/list with path: {path}")
    
    if not path:
        # Return a list of root directories
        roots = [
            {"name": "Single Captures", "path": "/single_captures", "type": "directory"},
            {"name": "Timelapse Data", "path": "/timelapse_data", "type": "directory"}
        ]
        return jsonify({"success": True, "files": roots})
    
    try:
        # Handle special directory references
        if path == '/single_captures':
            full_path = SINGLE_CAPTURES_DIR
        elif path == '/timelapse_data':
            full_path = TIMELAPSE_DIR
        elif path.startswith(SINGLE_CAPTURES_DIR) or path.startswith(TIMELAPSE_DIR) or path.startswith(OUTPUT_DIR):
            # Path is already a full system path
            full_path = path
        elif path.startswith('/'):
            # Path is a web path, convert to system path
            if path.startswith('/single_captures/'):
                rel_path = path[len('/single_captures/'):]
                full_path = os.path.join(SINGLE_CAPTURES_DIR, rel_path)
            elif path.startswith('/timelapse_data/'):
                rel_path = path[len('/timelapse_data/'):]
                full_path = os.path.join(TIMELAPSE_DIR, rel_path)
            else:
                # Default to output dir for other paths
                full_path = os.path.join(OUTPUT_DIR, path.lstrip('/'))
        else:
            # Relative path (relative to OUTPUT_DIR)
            full_path = os.path.join(OUTPUT_DIR, path)
        
        current_app.logger.info(f"Resolved path: {full_path}")
            
        # Check if path is secure (within allowed directories)
        if not (full_path.startswith(SINGLE_CAPTURES_DIR) or 
                full_path.startswith(TIMELAPSE_DIR) or 
                full_path.startswith(OUTPUT_DIR)):
            return jsonify({"success": False, "message": "Access to this path is not allowed"}), 403
        
        if not os.path.exists(full_path):
            current_app.logger.error(f"Path not found: {full_path}")
            # Return empty directory instead of error for cleaner UI
            return jsonify({"success": True, "path": path, "files": []})
        
        if not os.path.isdir(full_path):
            return jsonify({"success": False, "message": f"Path is not a directory: {path}"}), 400
        
        # List files and directories
        files = []
        for item in os.listdir(full_path):
            item_path = os.path.join(full_path, item)
            item_type = 'directory' if os.path.isdir(item_path) else 'file'
            
            # Check if file is an image
            is_image = False
            if item_type == 'file':
                ext = os.path.splitext(item)[1].lower()
                if ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.arw', '.raw', '.nef', '.cr2']:
                    is_image = True
            
            # Get file size for files
            size = os.path.getsize(item_path) if item_type == 'file' else 0
            
            # Create web-friendly path for client side
            if item_path.startswith(SINGLE_CAPTURES_DIR):
                web_path = item_path.replace(SINGLE_CAPTURES_DIR, '/single_captures')
            elif item_path.startswith(TIMELAPSE_DIR):
                web_path = item_path.replace(TIMELAPSE_DIR, '/timelapse_data')
            else:
                web_path = item_path
                
            files.append({
                'name': item,
                'path': web_path,
                'type': item_type,
                'size': size,
                'isImage': is_image
            })
        
        # Also create a web-friendly path for the current directory
        if full_path.startswith(SINGLE_CAPTURES_DIR):
            web_path = full_path.replace(SINGLE_CAPTURES_DIR, '/single_captures')
        elif full_path.startswith(TIMELAPSE_DIR):
            web_path = full_path.replace(TIMELAPSE_DIR, '/timelapse_data')
        else:
            web_path = full_path
            
        return jsonify({
            "success": True,
            "path": web_path,
            "files": files
        })
    except Exception as e:
        current_app.logger.error(f"Error listing files: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error listing files: {str(e)}"}), 500

@files_bp.route('/image', methods=['GET'])
def get_image_api():
    """API endpoint to get an image file."""
    path = request.args.get('path', '')
    current_app.logger.info(f"API request: /api/files/image with path: {path}")
    
    if not path:
        return jsonify({"success": False, "message": "Path parameter is required"}), 400
    
    try:
        # Convert web paths to system paths
        if path.startswith('/single_captures/'):
            rel_path = path[len('/single_captures/'):]
            system_path = os.path.join(SINGLE_CAPTURES_DIR, rel_path)
        elif path.startswith('/timelapse_data/'):
            rel_path = path[len('/timelapse_data/'):]
            system_path = os.path.join(TIMELAPSE_DIR, rel_path)
        elif path.startswith(SINGLE_CAPTURES_DIR) or path.startswith(TIMELAPSE_DIR) or path.startswith(OUTPUT_DIR):
            # Path is already a full system path
            system_path = path
        else:
            # Default to output dir
            system_path = os.path.join(OUTPUT_DIR, path.lstrip('/'))
            
        current_app.logger.info(f"Resolved image path: {system_path}")
        
        # Ensure path is secure (within allowed directories)
        if not (system_path.startswith(SINGLE_CAPTURES_DIR) or 
                system_path.startswith(TIMELAPSE_DIR) or 
                system_path.startswith(OUTPUT_DIR)):
            return jsonify({"success": False, "message": "Access to this path is not allowed"}), 403
        
        if not os.path.exists(system_path):
            return jsonify({"success": False, "message": f"File not found: {system_path}"}), 404
        
        if not os.path.isfile(system_path):
            return jsonify({"success": False, "message": f"Path is not a file: {system_path}"}), 400
        
        # Check if the file is an image (including RAW formats)
        ext = os.path.splitext(system_path)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.arw', '.raw', '.nef', '.cr2']:
            return jsonify({"success": False, "message": f"File is not an image: {system_path}"}), 400
        
        # For RAW files, generate a preview on the fly
        raw_formats = ['.arw', '.raw', '.nef', '.cr2']
        if ext in raw_formats:
            try:
                # Import the raw processing module
                from processing.raw import process_raw
                
                # Create a temporary preview in the app's static folder
                from app.config import STATIC_DIR
                import tempfile
                import time
                
                # Use a deterministic filename to support caching
                filename_base = os.path.basename(system_path)
                name, ext = os.path.splitext(filename_base)
                # Create deterministic hash based on path and modification time
                file_mtime = os.path.getmtime(system_path)
                preview_name = f"preview_{name}_{hash(str(file_mtime))}.jpg"
                preview_path = os.path.join(STATIC_DIR, "previews", preview_name)
                
                # Ensure the preview directory exists
                os.makedirs(os.path.dirname(preview_path), exist_ok=True)
                
                # Check if preview already exists
                if os.path.exists(preview_path):
                    current_app.logger.info(f"Using existing preview for RAW file: {system_path}")
                    success = True
                else:
                    # Process the RAW file with default settings
                    current_app.logger.info(f"Generating preview for RAW file: {system_path}")
                    success = process_raw(
                        system_path, 
                        preview_path,
                        use_camera_wb=True,
                        brightness=1.0,
                        contrast=1.0,
                        saturation=1.0,
                        output_format='JPEG'
                    )
                
                if success:
                    # Return the preview image with cache-control headers
                    response = send_file(preview_path)
                    response.headers['Cache-Control'] = 'max-age=3600'  # Cache for 1 hour
                    return response
                else:
                    current_app.logger.error(f"Failed to generate preview for RAW file: {system_path}")
                    return jsonify({"success": False, "message": "Failed to generate preview"}), 500
                    
            except Exception as e:
                current_app.logger.error(f"Error generating RAW preview: {e}", exc_info=True)
                return jsonify({"success": False, "message": f"Error generating RAW preview: {str(e)}"}), 500
        
        # For regular image files, return them directly
        return send_file(system_path)
    except Exception as e:
        current_app.logger.error(f"Error getting image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error getting image: {str(e)}"}), 500

@files_bp.route('/download', methods=['GET'])
def download_file_api():
    """API endpoint to download a file."""
    path = request.args.get('path', '')
    current_app.logger.info(f"API request: /api/files/download with path: {path}")
    
    if not path:
        return jsonify({"success": False, "message": "Path parameter is required"}), 400
    
    try:
        # Convert web paths to system paths
        if path.startswith('/single_captures/'):
            rel_path = path[len('/single_captures/'):]
            system_path = os.path.join(SINGLE_CAPTURES_DIR, rel_path)
        elif path.startswith('/timelapse_data/'):
            rel_path = path[len('/timelapse_data/'):]
            system_path = os.path.join(TIMELAPSE_DIR, rel_path)
        elif path.startswith(SINGLE_CAPTURES_DIR) or path.startswith(TIMELAPSE_DIR) or path.startswith(OUTPUT_DIR):
            # Path is already a full system path
            system_path = path
        else:
            # Default to output dir
            system_path = os.path.join(OUTPUT_DIR, path.lstrip('/'))
            
        current_app.logger.info(f"Resolved download path: {system_path}")
        
        # Ensure path is secure (within allowed directories)
        if not (system_path.startswith(SINGLE_CAPTURES_DIR) or 
                system_path.startswith(TIMELAPSE_DIR) or 
                system_path.startswith(OUTPUT_DIR)):
            return jsonify({"success": False, "message": "Access to this path is not allowed"}), 403
        
        if not os.path.exists(system_path):
            return jsonify({"success": False, "message": f"File not found: {system_path}"}), 404
        
        if not os.path.isfile(system_path):
            return jsonify({"success": False, "message": f"Path is not a file: {system_path}"}), 400
        
        # Return the file as an attachment (for download)
        return send_file(system_path, as_attachment=True)
    except Exception as e:
        current_app.logger.error(f"Error downloading file: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error downloading file: {str(e)}"}), 500

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
from app.routes.processing import *