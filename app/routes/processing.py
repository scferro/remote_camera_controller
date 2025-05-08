import os
from flask import current_app, jsonify, request
from app.routes import processing_bp
from processing import raw, timelapse
from app.config import TIMELAPSE_DIR, OUTPUT_DIR

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
    full_input_path = os.path.abspath(os.path.join(OUTPUT_DIR, input_file))
    if not os.path.isfile(full_input_path):
        return jsonify({"success": False, "message": f"Input file not found: {input_file}"}), 404
    
    # Extract processing parameters
    params = {
        'use_camera_wb': data.get('use_camera_wb', True),
        'brightness': data.get('brightness', 1.0),
        'contrast': data.get('contrast', 1.0),
        'saturation': data.get('saturation', 1.0),
        'output_format': data.get('output_format', 'JPEG')
    }
    
    # Generate output path
    base_name, ext = os.path.splitext(os.path.basename(input_file))
    output_file = f"{base_name}_processed.jpg"
    full_output_path = os.path.join(OUTPUT_DIR, 'processed', output_file)
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(full_output_path), exist_ok=True)
    
    # Process the image - currently a placeholder as not fully implemented
    try:
        current_app.logger.info(f"Processing image {input_file} with params: {params}")
        # Call the actual processing function when implemented
        # success = raw.process_raw(full_input_path, full_output_path, **params)
        
        # For now, return placeholder response
        return jsonify({
            "success": False, 
            "message": "Single image processing not implemented yet.",
            "output_path": full_output_path
        }), 501
    except Exception as e:
        current_app.logger.error(f"Error processing image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error processing image: {str(e)}"}), 500

@processing_bp.route('/timelapse', methods=['POST'])
def process_timelapse_api():
    """API endpoint to process and assemble a timelapse."""
    current_app.logger.info("API request: /api/process/timelapse")
    
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
    
    # Extract processing parameters
    process_raw = data.get('process_raw', False)
    raw_settings = data.get('raw_settings', {})
    assembly_settings = data.get('assembly_settings', {})
    
    # Generate output path for video
    output_file = f"{folder_name}_video.mp4"
    output_dir = os.path.join(TIMELAPSE_DIR, 'processed')
    full_output_path = os.path.join(output_dir, output_file)
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Process the timelapse - currently a placeholder as not fully implemented
    try:
        current_app.logger.info(f"Processing timelapse {folder_name}")
        
        # Call the actual processing function when implemented
        # success = timelapse.assemble_timelapse(
        #    full_folder_path, 
        #    full_output_path,
        #    frame_rate=assembly_settings.get('frame_rate', 24),
        #    resolution=assembly_settings.get('resolution'),
        #    crop_rect=assembly_settings.get('crop_rect')
        # )
        
        # For now, return placeholder response
        return jsonify({
            "success": False, 
            "message": "Timelapse processing and assembly not implemented yet.",
            "output_path": full_output_path
        }), 501
    except Exception as e:
        current_app.logger.error(f"Error processing timelapse: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error processing timelapse: {str(e)}"}), 500