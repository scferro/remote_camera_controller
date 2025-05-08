import os
import uuid
import json
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from flask import current_app, jsonify, request, url_for, send_file
from app.routes import processing_bp
from processing import raw, timelapse
from app.config import TIMELAPSE_DIR, SINGLE_CAPTURES_DIR, OUTPUT_DIR, STATIC_DIR

# Configure logger
logger = logging.getLogger(__name__)

# Dictionary to store background task status
background_tasks = {}

# Thread pool for background processing
executor = ThreadPoolExecutor(max_workers=2)

# Allowed image formats
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'tiff', 'tif', 'arw', 'raw', 'nef', 'cr2', 'dng'}

# Helper functions
def ensure_static_file_copy(output_path, static_type='processed'):
    """
    Ensures a file is copied to the static directory for web access.
    
    Args:
        output_path (str): Path to the original file
        static_type (str): Type of static file (processed, exports, etc.)
    
    Returns:
        str: URL for accessing the file via static route
    """
    import shutil
    
    # Get the filename
    filename = os.path.basename(output_path)
    
    # Create the static directory path
    static_dir = os.path.join(STATIC_DIR, static_type)
    os.makedirs(static_dir, exist_ok=True)
    
    # Set the static path and copy the file
    static_path = os.path.join(static_dir, filename)
    shutil.copy2(output_path, static_path)
    
    # Return the URL
    return url_for('static', filename=f'{static_type}/{filename}', _external=True)

def allowed_file(filename):
    """Check if a file has an allowed extension"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

@processing_bp.route('/single', methods=['POST'])
def process_single_image_api():
    """API endpoint to process a single image."""
    current_app.logger.info("API request: /api/process/single")
    
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request: Content-Type must be application/json"}), 400
    
    data = request.get_json()
    input_file = data.get('input_file')
    
    if not input_file:
        return jsonify({"success": False, "message": "Input file path is required"}), 400
    
    # Validate file exists
    full_input_path = os.path.abspath(input_file)
    if not os.path.isfile(full_input_path):
        return jsonify({"success": False, "message": f"Input file not found: {input_file}"}), 404
    
    # Extract processing parameters
    params = {
        'use_camera_wb': data.get('use_camera_wb', True),
        'brightness': float(data.get('brightness', 1.0)),
        'contrast': float(data.get('contrast', 1.0)),
        'saturation': float(data.get('saturation', 1.0)),
        'highlight_recovery': int(data.get('highlight_recovery', 0)),
        'color_temp': int(data.get('color_temp', 5500)),
        'tint': int(data.get('tint', 0)),
        'output_format': data.get('output_format', 'JPEG')
    }
    
    # Generate output path
    base_name, ext = os.path.splitext(os.path.basename(input_file))
    output_file = f"{base_name}_processed.jpg"
    # Create the output path in the output directory
    processed_dir = os.path.join(OUTPUT_DIR, 'processed')
    full_output_path = os.path.join(processed_dir, output_file)
    
    # Ensure output directory exists
    os.makedirs(processed_dir, exist_ok=True)
    
    # Process the image
    try:
        current_app.logger.info(f"Processing image {input_file} with params: {params}")
        
        # Process to main storage location
        success = raw.process_raw(
            full_input_path, 
            full_output_path, 
            **params
        )
        
        if success:
            # Copy to static directory and get URL
            image_url = ensure_static_file_copy(full_output_path, 'processed')
            
            return jsonify({
                "success": True, 
                "message": "Image processed successfully",
                "output_path": full_output_path,
                "output_url": image_url
            })
        else:
            return jsonify({
                "success": False, 
                "message": "Failed to process image"
            }), 500
    except Exception as e:
        current_app.logger.error(f"Error processing image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error processing image: {str(e)}"}), 500

@processing_bp.route('/upload', methods=['POST'])
def process_uploaded_image_api():
    """API endpoint to process an uploaded image."""
    current_app.logger.info("API request: /api/process/upload")
    
    if 'file' not in request.files:
        return jsonify({"success": False, "message": "No file part in the request"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "message": "No file selected"}), 400
    
    if not allowed_file(file.filename):
        return jsonify({"success": False, "message": f"File type not allowed. Allowed types: {ALLOWED_IMAGE_EXTENSIONS}"}), 400
    
    # Get processing settings
    settings_json = request.form.get('settings', '{}')
    try:
        settings = json.loads(settings_json)
    except json.JSONDecodeError:
        settings = {}
    
    # Extract processing parameters
    params = {
        'use_camera_wb': settings.get('use_camera_wb', True),
        'brightness': float(settings.get('brightness', 1.0)),
        'contrast': float(settings.get('contrast', 1.0)),
        'saturation': float(settings.get('saturation', 1.0)),
        'highlight_recovery': int(settings.get('highlight_recovery', 0)),
        'color_temp': int(settings.get('color_temp', 5500)),
        'tint': int(settings.get('tint', 0)),
        'output_format': settings.get('output_format', 'JPEG')
    }
    
    try:
        # Save the uploaded file
        uploads_dir = os.path.join(OUTPUT_DIR, 'uploads')
        os.makedirs(uploads_dir, exist_ok=True)
        
        filename = file.filename
        upload_path = os.path.join(uploads_dir, filename)
        file.save(upload_path)
        
        # Generate output path
        base_name, ext = os.path.splitext(filename)
        output_file = f"{base_name}_processed.jpg"
        # Create the output path in the output directory
        processed_dir = os.path.join(OUTPUT_DIR, 'processed')
        full_output_path = os.path.join(processed_dir, output_file)
        
        # Ensure output directory exists
        os.makedirs(processed_dir, exist_ok=True)
        
        # Process the image
        current_app.logger.info(f"Processing uploaded image {filename} with params: {params}")
        
        # Process to main storage location
        success = raw.process_raw(
            upload_path, 
            full_output_path, 
            **params
        )
        
        if success:
            # Copy to static directory and get URL
            image_url = ensure_static_file_copy(full_output_path, 'processed')
            
            return jsonify({
                "success": True, 
                "message": "Image processed successfully",
                "output_path": full_output_path,
                "output_url": image_url
            })
        else:
            return jsonify({
                "success": False, 
                "message": "Failed to process image"
            }), 500
    except Exception as e:
        current_app.logger.error(f"Error processing uploaded image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error processing image: {str(e)}"}), 500

@processing_bp.route('/export/single', methods=['POST'])
def export_single_image_api():
    """API endpoint to export a processed single image."""
    current_app.logger.info("API request: /api/export/single")
    
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request: Content-Type must be application/json"}), 400
    
    data = request.get_json()
    input_file = data.get('input_file')
    
    if not input_file:
        return jsonify({"success": False, "message": "Input file path is required"}), 400
    
    # Validate file exists
    full_input_path = os.path.abspath(input_file)
    if not os.path.isfile(full_input_path):
        return jsonify({"success": False, "message": f"Input file not found: {input_file}"}), 404
    
    # Extract processing parameters
    edit_settings = data.get('edit_settings', {})
    params = {
        'use_camera_wb': edit_settings.get('use_camera_wb', True),
        'brightness': float(edit_settings.get('brightness', 1.0)),
        'contrast': float(edit_settings.get('contrast', 1.0)),
        'saturation': float(edit_settings.get('saturation', 1.0)),
        'highlight_recovery': int(edit_settings.get('highlight_recovery', 0)),
        'color_temp': int(edit_settings.get('color_temp', 5500)),
        'tint': int(edit_settings.get('tint', 0)),
        'output_format': data.get('format', 'JPEG')
    }
    
    # Generate output path
    output_filename = data.get('output_filename')
    if not output_filename:
        base_name, ext = os.path.splitext(os.path.basename(input_file))
        output_filename = f"{base_name}_exported"
    
    # Add appropriate extension
    output_format = params['output_format'].upper()
    if output_format == 'JPEG':
        output_ext = '.jpg'
    elif output_format == 'PNG':
        output_ext = '.png'
    elif output_format == 'TIFF':
        output_ext = '.tiff'
    else:
        output_ext = '.jpg'
        
    output_file = f"{output_filename}{output_ext}"
    
    # Create the output path in the output directory
    exports_dir = os.path.join(OUTPUT_DIR, 'exports')
    full_output_path = os.path.join(exports_dir, output_file)
    
    # Ensure output directory exists
    os.makedirs(exports_dir, exist_ok=True)
    
    try:
        current_app.logger.info(f"Exporting image {input_file} with params: {params}")
        
        success = raw.process_raw(
            full_input_path, 
            full_output_path, 
            **params
        )
        
        if success:
            # Copy to static directory and get URL
            image_url = ensure_static_file_copy(full_output_path, 'exports')
            
            return jsonify({
                "success": True, 
                "message": "Image exported successfully",
                "output_path": full_output_path,
                "output_url": image_url
            })
        else:
            return jsonify({
                "success": False, 
                "message": "Failed to export image"
            }), 500
    except Exception as e:
        current_app.logger.error(f"Error exporting image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error exporting image: {str(e)}"}), 500

@processing_bp.route('/timelapse/batch', methods=['POST'])
def process_timelapse_batch_api():
    """API endpoint to process a batch of timelapse images."""
    current_app.logger.info("API request: /api/process/timelapse/batch")
    
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request: Content-Type must be application/json"}), 400
    
    data = request.get_json()
    folder_name = data.get('folder')
    
    if not folder_name:
        return jsonify({"success": False, "message": "Timelapse folder name is required"}), 400
    
    # Validate folder exists
    full_folder_path = os.path.join(TIMELAPSE_DIR, folder_name)
    if not os.path.isdir(full_folder_path):
        return jsonify({
            "success": False, 
            "message": f"Timelapse folder not found: {folder_name}"
        }), 404
    
    # Extract processing settings
    settings = data.get('settings', {})
    processing_settings = {
        'brightness': float(settings.get('brightness', 1.0)),
        'contrast': float(settings.get('contrast', 1.0)),
        'saturation': float(settings.get('saturation', 1.0)),
        'use_camera_wb': settings.get('use_camera_wb', True),
        'highlight_recovery': int(settings.get('highlight_recovery', 0)),
        'color_temp': int(settings.get('color_temp', 5500)),
        'tint': int(settings.get('tint', 0)),
        'output_format': 'JPEG'
    }
    
    # Generate a unique task ID
    task_id = str(uuid.uuid4())
    
    # Create processed output directory
    processed_output_dir = os.path.join(TIMELAPSE_DIR, 'processed', folder_name)
    os.makedirs(processed_output_dir, exist_ok=True)
    
    # Start background task
    background_tasks[task_id] = {
        'status': 'started',
        'progress': 0,
        'start_time': datetime.now().isoformat(),
        'message': 'Processing started'
    }
    
    executor.submit(
        process_timelapse_batch_task,
        task_id, 
        full_folder_path, 
        processed_output_dir, 
        processing_settings, 
        settings.get('scope', 'all')
    )
    
    return jsonify({
        "success": True,
        "message": "Timelapse batch processing started",
        "task_id": task_id
    })

def process_timelapse_batch_task(task_id, folder_path, output_dir, settings, scope):
    """Background task to process a batch of timelapse images."""
    try:
        # Update task status
        background_tasks[task_id]['status'] = 'processing'
        
        # Get all image files in the folder
        image_extensions = ('.jpg', '.jpeg', '.png', '.tif', '.tiff', '.arw', '.raw', '.nef', '.cr2')
        image_files = []
        
        for root, _, files in os.walk(folder_path):
            for file in files:
                if file.lower().endswith(image_extensions):
                    image_files.append(os.path.join(root, file))
        
        if not image_files:
            background_tasks[task_id] = {
                'status': 'failed',
                'progress': 100,
                'message': 'No suitable image files found in the folder'
            }
            return
        
        # Sort image files to maintain sequence
        image_files.sort()
        
        # Process batch
        batch_results = raw.process_image_batch(image_files, output_dir, settings)
        
        # Update task status based on results
        if batch_results['successful'] > 0:
            background_tasks[task_id] = {
                'status': 'completed',
                'progress': 100,
                'processed_count': batch_results['successful'],
                'total_count': batch_results['total'],
                'message': f"Successfully processed {batch_results['successful']} of {batch_results['total']} images"
            }
        else:
            background_tasks[task_id] = {
                'status': 'failed',
                'progress': 100,
                'message': 'Failed to process any images'
            }
    except Exception as e:
        logger.error(f"Error in timelapse batch processing task: {e}", exc_info=True)
        background_tasks[task_id] = {
            'status': 'failed',
            'progress': 100,
            'message': str(e)
        }

@processing_bp.route('/timelapse/batch/status', methods=['GET'])
def timelapse_batch_status_api():
    """API endpoint to check the status of a timelapse batch processing task."""
    task_id = request.args.get('task_id')
    
    if not task_id or task_id not in background_tasks:
        return jsonify({
            "success": False,
            "message": "Invalid or expired task ID"
        }), 404
    
    task_info = background_tasks[task_id]
    
    # Clean up completed tasks after some time
    if task_info['status'] in ['completed', 'failed'] and len(background_tasks) > 10:
        # Keep the task info for this request, but remove old ones
        for old_id in list(background_tasks.keys()):
            if old_id != task_id and background_tasks[old_id]['status'] in ['completed', 'failed']:
                del background_tasks[old_id]
    
    return jsonify({
        "success": True,
        "status": task_info['status'],
        "progress": task_info.get('progress', 0),
        "message": task_info.get('message', ''),
        "processed_count": task_info.get('processed_count', 0),
        "total_count": task_info.get('total_count', 0)
    })

@processing_bp.route('/timelapse/video', methods=['POST'])
def process_timelapse_video_api():
    """API endpoint to process and assemble a timelapse video."""
    current_app.logger.info("API request: /api/process/timelapse/video")
    
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request: Content-Type must be application/json"}), 400
    
    data = request.get_json()
    folder_name = data.get('folder')
    
    if not folder_name:
        return jsonify({"success": False, "message": "Timelapse folder name is required"}), 400
    
    # Validate folder exists
    full_folder_path = os.path.join(TIMELAPSE_DIR, folder_name)
    if not os.path.isdir(full_folder_path):
        return jsonify({
            "success": False, 
            "message": f"Timelapse folder not found: {folder_name}"
        }), 404
    
    # Extract settings
    edit_settings = data.get('edit_settings', {})
    processing_settings = {
        'brightness': float(edit_settings.get('brightness', 1.0)),
        'contrast': float(edit_settings.get('contrast', 1.0)),
        'saturation': float(edit_settings.get('saturation', 1.0)),
        'use_camera_wb': edit_settings.get('use_camera_wb', True),
        'highlight_recovery': int(edit_settings.get('highlight_recovery', 0)),
        'color_temp': int(edit_settings.get('color_temp', 5500)),
        'tint': int(edit_settings.get('tint', 0)),
        'output_format': 'JPEG'
    }
    
    video_settings = {
        'frame_rate': int(data.get('fps', 24)),
        'resolution': data.get('resolution'),
        'crop_rect': data.get('crop_rect'),
        'codec_settings': data.get('codec_settings'),
        'output_filename': data.get('output_filename')
    }
    
    # Generate a unique task ID
    task_id = str(uuid.uuid4())
    
    # Create output directory
    output_dir = os.path.join(TIMELAPSE_DIR, 'processed', folder_name)
    os.makedirs(output_dir, exist_ok=True)
    
    # Start background task
    background_tasks[task_id] = {
        'status': 'started',
        'progress': 0,
        'start_time': datetime.now().isoformat(),
        'message': 'Processing started'
    }
    
    executor.submit(
        process_timelapse_video_task,
        task_id, 
        full_folder_path, 
        output_dir, 
        processing_settings, 
        video_settings
    )
    
    return jsonify({
        "success": True,
        "message": "Timelapse video processing started",
        "task_id": task_id
    })

def process_timelapse_video_task(task_id, folder_path, output_dir, processing_settings, video_settings):
    """Background task to process a timelapse into a video."""
    try:
        # Update task status
        background_tasks[task_id]['status'] = 'processing'
        background_tasks[task_id]['message'] = 'Processing images and assembling video'
        
        # Process the timelapse sequence
        result = timelapse.process_timelapse_sequence(
            folder_path, 
            output_dir, 
            processing_settings, 
            video_settings
        )
        
        # Update task status based on results
        if result['success']:
            background_tasks[task_id] = {
                'status': 'completed',
                'progress': 100,
                'message': result['message'],
                'output_path': result.get('output_video', ''),
                'processed_count': result.get('processed_count', 0),
                'total_count': result.get('total_count', 0)
            }
        else:
            background_tasks[task_id] = {
                'status': 'failed',
                'progress': 100,
                'message': result['message']
            }
    except Exception as e:
        logger.error(f"Error in timelapse video processing task: {e}", exc_info=True)
        background_tasks[task_id] = {
            'status': 'failed',
            'progress': 100,
            'message': str(e)
        }

@processing_bp.route('/timelapse/video/status', methods=['GET'])
def timelapse_video_status_api():
    """API endpoint to check the status of a timelapse video processing task."""
    task_id = request.args.get('task_id')
    
    if not task_id or task_id not in background_tasks:
        return jsonify({
            "success": False,
            "message": "Invalid or expired task ID"
        }), 404
    
    task_info = background_tasks[task_id]
    
    # Clean up completed tasks after some time
    if task_info['status'] in ['completed', 'failed'] and len(background_tasks) > 10:
        # Keep the task info for this request, but remove old ones
        for old_id in list(background_tasks.keys()):
            if old_id != task_id and background_tasks[old_id]['status'] in ['completed', 'failed']:
                del background_tasks[old_id]
    
    return jsonify({
        "success": True,
        "status": task_info['status'],
        "progress": task_info.get('progress', 0),
        "message": task_info.get('message', ''),
        "output_path": task_info.get('output_path', ''),
        "processed_count": task_info.get('processed_count', 0),
        "total_count": task_info.get('total_count', 0)
    })

@processing_bp.route('/timelapse/export', methods=['POST'])
def export_timelapse_frames_api():
    """API endpoint to export processed timelapse frames."""
    current_app.logger.info("API request: /api/process/timelapse/export")
    
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request: Content-Type must be application/json"}), 400
    
    data = request.get_json()
    folder_name = data.get('folder')
    
    if not folder_name:
        return jsonify({"success": False, "message": "Timelapse folder name is required"}), 400
    
    # Validate folder exists
    full_folder_path = os.path.join(TIMELAPSE_DIR, folder_name)
    if not os.path.isdir(full_folder_path):
        return jsonify({
            "success": False, 
            "message": f"Timelapse folder not found: {folder_name}"
        }), 404
    
    # Extract settings
    edit_settings = data.get('edit_settings', {})
    processing_settings = {
        'brightness': float(edit_settings.get('brightness', 1.0)),
        'contrast': float(edit_settings.get('contrast', 1.0)),
        'saturation': float(edit_settings.get('saturation', 1.0)),
        'use_camera_wb': edit_settings.get('use_camera_wb', True),
        'highlight_recovery': int(edit_settings.get('highlight_recovery', 0)),
        'color_temp': int(edit_settings.get('color_temp', 5500)),
        'tint': int(edit_settings.get('tint', 0)),
        'output_format': data.get('format', 'JPEG')
    }
    
    video_settings = {
        'resolution': data.get('resolution'),
        'crop_rect': data.get('crop_rect'),
        'output_filename': data.get('output_filename'),
        'assemble_video': False  # Skip video assembly
    }
    
    # Generate a unique task ID
    task_id = str(uuid.uuid4())
    
    # Create output directory
    output_dir = os.path.join(TIMELAPSE_DIR, 'processed', folder_name)
    os.makedirs(output_dir, exist_ok=True)
    
    # Start background task
    background_tasks[task_id] = {
        'status': 'started',
        'progress': 0,
        'start_time': datetime.now().isoformat(),
        'message': 'Exporting frames started'
    }
    
    executor.submit(
        process_timelapse_export_task,
        task_id, 
        full_folder_path, 
        output_dir, 
        processing_settings, 
        video_settings
    )
    
    return jsonify({
        "success": True,
        "message": "Timelapse frame export started",
        "task_id": task_id
    })

def process_timelapse_export_task(task_id, folder_path, output_dir, processing_settings, video_settings):
    """Background task to export processed timelapse frames."""
    try:
        # Update task status
        background_tasks[task_id]['status'] = 'processing'
        background_tasks[task_id]['message'] = 'Processing and exporting frames'
        
        # Process the timelapse sequence with export_images=True
        result = timelapse.process_timelapse_sequence(
            folder_path, 
            output_dir, 
            processing_settings, 
            video_settings,
            export_images=True
        )
        
        # Update task status based on results
        if result['success']:
            background_tasks[task_id] = {
                'status': 'completed',
                'progress': 100,
                'message': result['message'],
                'output_dir': result.get('output_dir', ''),
                'processed_count': result.get('processed_count', 0),
                'total_count': result.get('total_count', 0)
            }
        else:
            background_tasks[task_id] = {
                'status': 'failed',
                'progress': 100,
                'message': result['message']
            }
    except Exception as e:
        logger.error(f"Error in timelapse export task: {e}", exc_info=True)
        background_tasks[task_id] = {
            'status': 'failed',
            'progress': 100,
            'message': str(e)
        }

@processing_bp.route('/timelapse/export/status', methods=['GET'])
def timelapse_export_status_api():
    """API endpoint to check the status of a timelapse export task."""
    task_id = request.args.get('task_id')
    
    if not task_id or task_id not in background_tasks:
        return jsonify({
            "success": False,
            "message": "Invalid or expired task ID"
        }), 404
    
    task_info = background_tasks[task_id]
    
    return jsonify({
        "success": True,
        "status": task_info['status'],
        "progress": task_info.get('progress', 0),
        "message": task_info.get('message', ''),
        "output_dir": task_info.get('output_dir', ''),
        "processed_count": task_info.get('processed_count', 0),
        "total_count": task_info.get('total_count', 0)
    })

@processing_bp.route('/files/list', methods=['GET'])
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
        elif path.startswith('/'):
            # Path is already absolute
            full_path = path
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
            
            files.append({
                'name': item,
                'path': item_path,
                'type': item_type,
                'size': size,
                'isImage': is_image
            })
        
        return jsonify({
            "success": True,
            "path": full_path,
            "files": files
        })
    except Exception as e:
        current_app.logger.error(f"Error listing files: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error listing files: {str(e)}"}), 500

@processing_bp.route('/files/image', methods=['GET'])
def get_image_api():
    """API endpoint to get an image file."""
    path = request.args.get('path', '')
    
    if not path:
        return jsonify({"success": False, "message": "Path parameter is required"}), 400
    
    try:
        # Ensure path is secure (within allowed directories)
        if not (path.startswith(SINGLE_CAPTURES_DIR) or 
                path.startswith(TIMELAPSE_DIR) or 
                path.startswith(OUTPUT_DIR)):
            return jsonify({"success": False, "message": "Access to this path is not allowed"}), 403
        
        if not os.path.exists(path):
            return jsonify({"success": False, "message": f"File not found: {path}"}), 404
        
        if not os.path.isfile(path):
            return jsonify({"success": False, "message": f"Path is not a file: {path}"}), 400
        
        # Check if the file is an image
        ext = os.path.splitext(path)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff']:
            return jsonify({"success": False, "message": f"File is not an image: {path}"}), 400
        
        # Return the image file
        return send_file(path)
    except Exception as e:
        current_app.logger.error(f"Error getting image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error getting image: {str(e)}"}), 500

@processing_bp.route('/files/download', methods=['GET'])
def download_file_api():
    """API endpoint to download a file."""
    path = request.args.get('path', '')
    
    if not path:
        return jsonify({"success": False, "message": "Path parameter is required"}), 400
    
    try:
        # Ensure path is secure (within allowed directories)
        if not (path.startswith(SINGLE_CAPTURES_DIR) or 
                path.startswith(TIMELAPSE_DIR) or 
                path.startswith(OUTPUT_DIR)):
            return jsonify({"success": False, "message": "Access to this path is not allowed"}), 403
        
        if not os.path.exists(path):
            return jsonify({"success": False, "message": f"File not found: {path}"}), 404
        
        if not os.path.isfile(path):
            return jsonify({"success": False, "message": f"Path is not a file: {path}"}), 400
        
        # Return the file as an attachment (for download)
        return send_file(path, as_attachment=True)
    except Exception as e:
        current_app.logger.error(f"Error downloading file: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error downloading file: {str(e)}"}), 500