import os
import tempfile
from flask import current_app, jsonify, request, send_file
from werkzeug.utils import secure_filename
from app.routes.editor import image_editor_bp
from processing.image_editor import ImageEditor
from app.config import OUTPUT_DIR

# Dictionary to store image editor instances by session ID
image_editors = {}

@image_editor_bp.route('/load', methods=['POST'])
def load_image_api():
    """API endpoint to load an image for editing."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    image_path = data.get('path')
    session_id = data.get('session_id', 'default')
    
    if not image_path:
        return jsonify({"success": False, "message": "Image path is required"}), 400
    
    # Check if path is relative to OUTPUT_DIR
    if not os.path.isabs(image_path):
        image_path = os.path.join(OUTPUT_DIR, image_path)
    
    # Verify file exists
    if not os.path.isfile(image_path):
        return jsonify({
            "success": False, 
            "message": f"Image not found: {os.path.basename(image_path)}"
        }), 404
    
    try:
        # Create a new editor instance
        editor = ImageEditor(image_path)
        
        # Store in dictionary with session ID as key
        image_editors[session_id] = editor
        
        # Get basic metadata
        metadata = {
            "filename": os.path.basename(image_path),
            "path": image_path,
            "format": editor.metadata.get('format'),
            "size": editor.metadata.get('size'),
            "is_raw": editor.is_raw
        }
        
        return jsonify({
            "success": True,
            "message": f"Successfully loaded image: {os.path.basename(image_path)}",
            "metadata": metadata,
            "session_id": session_id
        })
    except Exception as e:
        current_app.logger.error(f"Error loading image {image_path}: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error loading image: {str(e)}"}), 500

@image_editor_bp.route('/preview', methods=['GET'])
def get_preview_api():
    """API endpoint to get a preview of the current image state."""
    session_id = request.args.get('session_id', 'default')
    max_size = int(request.args.get('max_size', 800))
    
    # Check if session exists
    if session_id not in image_editors:
        return jsonify({"success": False, "message": "No image loaded in this session"}), 404
    
    editor = image_editors[session_id]
    
    try:
        # Get the preview image
        preview = editor.get_preview(max_size)
        
        if not preview:
            return jsonify({"success": False, "message": "Failed to generate preview"}), 500
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp:
            temp_path = temp.name
            preview.save(temp_path, format='JPEG')
        
        # Send the file and ensure cleanup
        return send_file(
            temp_path,
            mimetype='image/jpeg',
            as_attachment=False,
            download_name=f"preview_{session_id}.jpg"
        )
    except Exception as e:
        current_app.logger.error(f"Error generating preview: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error generating preview: {str(e)}"}), 500

@image_editor_bp.route('/crop', methods=['POST'])
def crop_image_api():
    """API endpoint to crop the image."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    crop_coords = data.get('crop')
    
    if not crop_coords or len(crop_coords) != 4:
        return jsonify({
            "success": False, 
            "message": "Invalid crop coordinates. Format: [left, top, right, bottom]"
        }), 400
    
    # Check if session exists
    if session_id not in image_editors:
        return jsonify({"success": False, "message": "No image loaded in this session"}), 404
    
    editor = image_editors[session_id]
    
    try:
        # Apply crop
        success = editor.crop(*crop_coords)
        
        if success:
            return jsonify({
                "success": True,
                "message": f"Image cropped to {crop_coords}"
            })
        else:
            return jsonify({"success": False, "message": "Failed to crop image"}), 500
    except Exception as e:
        current_app.logger.error(f"Error cropping image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error cropping image: {str(e)}"}), 500

@image_editor_bp.route('/adjust', methods=['POST'])
def adjust_image_api():
    """API endpoint to apply image adjustments."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    adjustments = data.get('adjustments', {})
    
    if not adjustments:
        return jsonify({"success": False, "message": "No adjustments specified"}), 400
    
    # Check if session exists
    if session_id not in image_editors:
        return jsonify({"success": False, "message": "No image loaded in this session"}), 404
    
    editor = image_editors[session_id]
    
    try:
        results = {}
        
        # Apply each adjustment
        if 'brightness' in adjustments:
            results['brightness'] = editor.adjust_brightness(adjustments['brightness'])
        
        if 'contrast' in adjustments:
            results['contrast'] = editor.adjust_contrast(adjustments['contrast'])
        
        if 'saturation' in adjustments:
            results['saturation'] = editor.adjust_saturation(adjustments['saturation'])
        
        return jsonify({
            "success": True,
            "message": "Applied image adjustments",
            "results": results
        })
    except Exception as e:
        current_app.logger.error(f"Error adjusting image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error adjusting image: {str(e)}"}), 500

@image_editor_bp.route('/rotate', methods=['POST'])
def rotate_image_api():
    """API endpoint to rotate the image."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    angle = data.get('angle')
    expand = data.get('expand', True)
    
    if angle is None:
        return jsonify({"success": False, "message": "Rotation angle is required"}), 400
    
    # Check if session exists
    if session_id not in image_editors:
        return jsonify({"success": False, "message": "No image loaded in this session"}), 404
    
    editor = image_editors[session_id]
    
    try:
        # Apply rotation
        success = editor.rotate(angle, expand)
        
        if success:
            return jsonify({
                "success": True,
                "message": f"Image rotated by {angle} degrees"
            })
        else:
            return jsonify({"success": False, "message": "Failed to rotate image"}), 500
    except Exception as e:
        current_app.logger.error(f"Error rotating image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error rotating image: {str(e)}"}), 500

@image_editor_bp.route('/resize', methods=['POST'])
def resize_image_api():
    """API endpoint to resize the image."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    width = data.get('width')
    height = data.get('height')
    maintain_aspect = data.get('maintain_aspect', True)
    
    if width is None or height is None:
        return jsonify({"success": False, "message": "Width and height are required"}), 400
    
    # Check if session exists
    if session_id not in image_editors:
        return jsonify({"success": False, "message": "No image loaded in this session"}), 404
    
    editor = image_editors[session_id]
    
    try:
        # Apply resize
        success = editor.resize(width, height, maintain_aspect)
        
        if success:
            return jsonify({
                "success": True,
                "message": f"Image resized to {width}x{height}"
            })
        else:
            return jsonify({"success": False, "message": "Failed to resize image"}), 500
    except Exception as e:
        current_app.logger.error(f"Error resizing image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error resizing image: {str(e)}"}), 500

@image_editor_bp.route('/filter', methods=['POST'])
def apply_filter_api():
    """API endpoint to apply a filter to the image."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    filter_type = data.get('filter')
    
    if not filter_type:
        return jsonify({"success": False, "message": "Filter type is required"}), 400
    
    # Check if session exists
    if session_id not in image_editors:
        return jsonify({"success": False, "message": "No image loaded in this session"}), 404
    
    editor = image_editors[session_id]
    
    try:
        # Apply filter
        success = editor.apply_filter(filter_type)
        
        if success:
            return jsonify({
                "success": True,
                "message": f"Applied {filter_type} filter to image"
            })
        else:
            return jsonify({"success": False, "message": f"Failed to apply {filter_type} filter"}), 500
    except Exception as e:
        current_app.logger.error(f"Error applying filter: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error applying filter: {str(e)}"}), 500

@image_editor_bp.route('/reset', methods=['POST'])
def reset_image_api():
    """API endpoint to reset all edits."""
    session_id = request.json.get('session_id', 'default')
    
    # Check if session exists
    if session_id not in image_editors:
        return jsonify({"success": False, "message": "No image loaded in this session"}), 404
    
    editor = image_editors[session_id]
    
    try:
        # Reset image
        success = editor.reset()
        
        if success:
            return jsonify({
                "success": True,
                "message": "All edits reset to original state"
            })
        else:
            return jsonify({"success": False, "message": "Failed to reset image"}), 500
    except Exception as e:
        current_app.logger.error(f"Error resetting image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error resetting image: {str(e)}"}), 500

@image_editor_bp.route('/undo', methods=['POST'])
def undo_edit_api():
    """API endpoint to undo the last edit."""
    session_id = request.json.get('session_id', 'default')
    
    # Check if session exists
    if session_id not in image_editors:
        return jsonify({"success": False, "message": "No image loaded in this session"}), 404
    
    editor = image_editors[session_id]
    
    try:
        # Undo last edit
        success = editor.undo()
        
        if success:
            return jsonify({
                "success": True,
                "message": "Undid last edit"
            })
        else:
            return jsonify({"success": False, "message": "Nothing to undo"}), 400
    except Exception as e:
        current_app.logger.error(f"Error undoing edit: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error undoing edit: {str(e)}"}), 500

@image_editor_bp.route('/save', methods=['POST'])
def save_image_api():
    """API endpoint to save the edited image."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    output_path = data.get('output_path')
    format = data.get('format')
    quality = data.get('quality', 95)
    
    # Check if session exists
    if session_id not in image_editors:
        return jsonify({"success": False, "message": "No image loaded in this session"}), 404
    
    editor = image_editors[session_id]
    
    try:
        # Generate output path if not provided
        if not output_path:
            # Create a directory for processed images if it doesn't exist
            processed_dir = os.path.join(OUTPUT_DIR, 'processed')
            os.makedirs(processed_dir, exist_ok=True)
            
            # Generate a filename based on the original
            orig_name = os.path.basename(editor.input_path)
            base_name, ext = os.path.splitext(orig_name)
            
            if not format:
                format = 'JPEG' if ext.lower() in ['.jpg', '.jpeg'] else 'PNG'
                
            new_ext = '.jpg' if format.upper() == 'JPEG' else '.png'
            output_path = os.path.join(processed_dir, f"{base_name}_edited{new_ext}")
        
        # If path is relative, make it absolute in the OUTPUT_DIR
        if not os.path.isabs(output_path):
            output_path = os.path.join(OUTPUT_DIR, output_path)
        
        # Save the image
        success = editor.save(output_path, format, quality)
        
        if success:
            return jsonify({
                "success": True,
                "message": f"Image saved to {os.path.basename(output_path)}",
                "path": output_path
            })
        else:
            return jsonify({"success": False, "message": "Failed to save image"}), 500
    except Exception as e:
        current_app.logger.error(f"Error saving image: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error saving image: {str(e)}"}), 500

@image_editor_bp.route('/list', methods=['GET'])
def list_images_api():
    """API endpoint to list available images for editing."""
    try:
        # Ensure output directory exists
        if not os.path.isdir(OUTPUT_DIR):
            return jsonify({"success": False, "message": "Output directory not found"}), 404
        
        # Find all image files in the directory and subdirectories
        image_files = []
        image_extensions = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.arw', '.cr2', '.nef']
        
        for root, _, files in os.walk(OUTPUT_DIR):
            for file in files:
                if os.path.splitext(file)[1].lower() in image_extensions:
                    # Get relative path from OUTPUT_DIR
                    rel_path = os.path.relpath(os.path.join(root, file), OUTPUT_DIR)
                    image_files.append({
                        "name": file,
                        "path": rel_path,
                        "full_path": os.path.join(root, file),
                        "size": os.path.getsize(os.path.join(root, file)),
                        "modified": os.path.getmtime(os.path.join(root, file))
                    })
        
        # Sort by modification time (newest first)
        image_files.sort(key=lambda x: x['modified'], reverse=True)
        
        return jsonify({
            "success": True,
            "images": image_files
        })
    except Exception as e:
        current_app.logger.error(f"Error listing images: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error listing images: {str(e)}"}), 500

@image_editor_bp.route('/close', methods=['POST'])
def close_session_api():
    """API endpoint to close an editing session."""
    session_id = request.json.get('session_id', 'default')
    
    # Check if session exists
    if session_id in image_editors:
        # Remove the editor instance
        del image_editors[session_id]
        
        return jsonify({
            "success": True,
            "message": f"Editing session {session_id} closed"
        })
    else:
        return jsonify({"success": False, "message": "Session not found"}), 404