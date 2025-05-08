import os
import tempfile
from flask import current_app, jsonify, request, send_file
from werkzeug.utils import secure_filename
from app.routes.editor import timelapse_editor_bp
from processing.timelapse_editor import TimelapseEditor
from app.config import TIMELAPSE_DIR, OUTPUT_DIR

# Dictionary to store timelapse editor instances by session ID
timelapse_editors = {}

@timelapse_editor_bp.route('/load', methods=['POST'])
def load_timelapse_api():
    """API endpoint to load a timelapse sequence for editing."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    sequence_path = data.get('path')
    session_id = data.get('session_id', 'default')
    
    if not sequence_path:
        return jsonify({"success": False, "message": "Sequence path is required"}), 400
    
    # Check if path is relative to TIMELAPSE_DIR
    if not os.path.isabs(sequence_path):
        sequence_path = os.path.join(TIMELAPSE_DIR, sequence_path)
    
    # Verify directory exists
    if not os.path.isdir(sequence_path):
        return jsonify({
            "success": False, 
            "message": f"Timelapse sequence not found: {os.path.basename(sequence_path)}"
        }), 404
    
    try:
        # Create a new editor instance
        editor = TimelapseEditor(sequence_path)
        
        # Store in dictionary with session ID as key
        timelapse_editors[session_id] = editor
        
        # Get metadata
        metadata = editor.get_metadata()
        
        return jsonify({
            "success": True,
            "message": f"Successfully loaded timelapse sequence: {os.path.basename(sequence_path)}",
            "metadata": metadata,
            "session_id": session_id
        })
    except Exception as e:
        current_app.logger.error(f"Error loading timelapse {sequence_path}: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error loading timelapse: {str(e)}"}), 500

@timelapse_editor_bp.route('/list', methods=['GET'])
def list_timelapses_api():
    """API endpoint to list available timelapse sequences for editing."""
    try:
        # Ensure timelapse directory exists
        if not os.path.isdir(TIMELAPSE_DIR):
            return jsonify({"success": False, "message": "Timelapse directory not found"}), 404
        
        # Find all directories in TIMELAPSE_DIR
        timelapses = []
        for item in os.listdir(TIMELAPSE_DIR):
            full_path = os.path.join(TIMELAPSE_DIR, item)
            if os.path.isdir(full_path):
                # Get basic info
                timelapses.append({
                    "name": item,
                    "path": full_path,
                    "modified": os.path.getmtime(full_path)
                })
        
        # Sort by modification time (newest first)
        timelapses.sort(key=lambda x: x['modified'], reverse=True)
        
        return jsonify({
            "success": True,
            "timelapses": timelapses
        })
    except Exception as e:
        current_app.logger.error(f"Error listing timelapses: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error listing timelapses: {str(e)}"}), 500

@timelapse_editor_bp.route('/frame/<int:index>', methods=['GET'])
def get_frame_api():
    """API endpoint to get a specific frame from the timelapse."""
    session_id = request.args.get('session_id', 'default')
    index = int(request.args.get('index', 0))
    
    # Check if session exists
    if session_id not in timelapse_editors:
        return jsonify({"success": False, "message": "No timelapse loaded in this session"}), 404
    
    editor = timelapse_editors[session_id]
    
    try:
        # Get the frame path
        frame_path = editor.get_frame_path(index)
        
        if not frame_path:
            return jsonify({"success": False, "message": f"Invalid frame index: {index}"}), 400
        
        # Return the file
        return send_file(
            frame_path,
            as_attachment=False,
            download_name=f"frame_{index:04d}{os.path.splitext(frame_path)[1]}"
        )
    except Exception as e:
        current_app.logger.error(f"Error retrieving frame {index}: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error retrieving frame: {str(e)}"}), 500

@timelapse_editor_bp.route('/frame_preview/<int:index>', methods=['GET'])
def get_frame_preview_api():
    """API endpoint to get a preview of a specific frame."""
    session_id = request.args.get('session_id', 'default')
    index = int(request.args.get('index', 0))
    max_size = int(request.args.get('max_size', 800))
    
    # Check if session exists
    if session_id not in timelapse_editors:
        return jsonify({"success": False, "message": "No timelapse loaded in this session"}), 404
    
    editor = timelapse_editors[session_id]
    
    try:
        # Get the frame preview
        preview = editor.get_frame_preview(index, max_size)
        
        if not preview:
            return jsonify({"success": False, "message": f"Could not generate preview for frame {index}"}), 500
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp:
            temp_path = temp.name
            preview.save(temp_path, format='JPEG')
        
        # Return the file
        return send_file(
            temp_path,
            mimetype='image/jpeg',
            as_attachment=False,
            download_name=f"frame_preview_{index:04d}.jpg"
        )
    except Exception as e:
        current_app.logger.error(f"Error generating frame preview {index}: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error generating frame preview: {str(e)}"}), 500

@timelapse_editor_bp.route('/previews', methods=['POST'])
def generate_previews_api():
    """API endpoint to generate preview thumbnails for the timelapse."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    sample_interval = data.get('sample_interval', 10)
    max_size = data.get('max_size', 300)
    
    # Check if session exists
    if session_id not in timelapse_editors:
        return jsonify({"success": False, "message": "No timelapse loaded in this session"}), 404
    
    editor = timelapse_editors[session_id]
    
    try:
        # Create a directory for previews
        preview_dir = os.path.join(
            os.path.dirname(editor.sequence_path), 
            f"{os.path.basename(editor.sequence_path)}_previews"
        )
        
        # Generate previews
        preview_paths = editor.generate_sequence_preview(preview_dir, sample_interval, max_size)
        
        if not preview_paths:
            return jsonify({"success": False, "message": "Failed to generate previews"}), 500
        
        return jsonify({
            "success": True,
            "message": f"Generated {len(preview_paths)} preview thumbnails",
            "previews": [os.path.basename(p) for p in preview_paths],
            "preview_dir": preview_dir
        })
    except Exception as e:
        current_app.logger.error(f"Error generating previews: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error generating previews: {str(e)}"}), 500

@timelapse_editor_bp.route('/extract_frame', methods=['POST'])
def extract_frame_api():
    """API endpoint to extract a specific frame from the timelapse."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    index = data.get('index')
    output_path = data.get('output_path')
    
    if index is None:
        return jsonify({"success": False, "message": "Frame index is required"}), 400
    
    # Check if session exists
    if session_id not in timelapse_editors:
        return jsonify({"success": False, "message": "No timelapse loaded in this session"}), 404
    
    editor = timelapse_editors[session_id]
    
    try:
        # Extract the frame
        saved_path = editor.extract_frame(index, output_path)
        
        if not saved_path:
            return jsonify({"success": False, "message": f"Failed to extract frame {index}"}), 500
        
        return jsonify({
            "success": True,
            "message": f"Frame {index} extracted",
            "path": saved_path
        })
    except Exception as e:
        current_app.logger.error(f"Error extracting frame {index}: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error extracting frame: {str(e)}"}), 500

@timelapse_editor_bp.route('/batch_edit', methods=['POST'])
def batch_edit_api():
    """API endpoint to batch edit frames in the timelapse."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    edit_params = data.get('edit_params', {})
    start_idx = data.get('start_idx', 0)
    end_idx = data.get('end_idx')
    interval = data.get('interval', 1)
    output_dir = data.get('output_dir')
    
    if not edit_params:
        return jsonify({"success": False, "message": "Edit parameters are required"}), 400
    
    # Check if session exists
    if session_id not in timelapse_editors:
        return jsonify({"success": False, "message": "No timelapse loaded in this session"}), 404
    
    editor = timelapse_editors[session_id]
    
    try:
        # Batch edit frames
        output_dir = editor.batch_edit_frames(edit_params, output_dir, start_idx, end_idx, interval)
        
        if not output_dir:
            return jsonify({"success": False, "message": "Failed to batch edit frames"}), 500
        
        return jsonify({
            "success": True,
            "message": "Frames batch edited successfully",
            "output_dir": output_dir
        })
    except Exception as e:
        current_app.logger.error(f"Error batch editing frames: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error batch editing frames: {str(e)}"}), 500

@timelapse_editor_bp.route('/assemble', methods=['POST'])
def assemble_video_api():
    """API endpoint to assemble a video from the timelapse frames."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    output_path = data.get('output_path')
    fps = data.get('fps', 24)
    format = data.get('format', 'mp4')
    quality = data.get('quality', 'high')
    use_edited = data.get('use_edited', True)
    resize = data.get('resize')
    crop_rect = data.get('crop_rect')
    
    # Check if session exists
    if session_id not in timelapse_editors:
        return jsonify({"success": False, "message": "No timelapse loaded in this session"}), 404
    
    editor = timelapse_editors[session_id]
    
    try:
        # Generate output path if not provided
        if not output_path:
            processed_dir = os.path.join(OUTPUT_DIR, 'processed_videos')
            os.makedirs(processed_dir, exist_ok=True)
            
            sequence_name = os.path.basename(editor.sequence_path)
            output_path = os.path.join(
                processed_dir, 
                f"{sequence_name}_video.{format}"
            )
        
        # Assemble the video
        success = editor.assemble_video(output_path, fps, format, quality, use_edited, resize, crop_rect)
        
        if not success:
            return jsonify({"success": False, "message": "Failed to assemble video"}), 500
        
        return jsonify({
            "success": True,
            "message": "Video assembled successfully",
            "output_path": output_path
        })
    except Exception as e:
        current_app.logger.error(f"Error assembling video: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error assembling video: {str(e)}"}), 500

@timelapse_editor_bp.route('/save_project', methods=['POST'])
def save_project_api():
    """API endpoint to save the timelapse project state."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    session_id = data.get('session_id', 'default')
    output_path = data.get('output_path')
    
    # Check if session exists
    if session_id not in timelapse_editors:
        return jsonify({"success": False, "message": "No timelapse loaded in this session"}), 404
    
    editor = timelapse_editors[session_id]
    
    try:
        # Generate output path if not provided
        if not output_path:
            projects_dir = os.path.join(OUTPUT_DIR, 'timelapse_projects')
            os.makedirs(projects_dir, exist_ok=True)
            
            sequence_name = os.path.basename(editor.sequence_path)
            output_path = os.path.join(
                projects_dir, 
                f"{sequence_name}_project.json"
            )
        
        # Save the project
        success = editor.save_project(output_path)
        
        if not success:
            return jsonify({"success": False, "message": "Failed to save project"}), 500
        
        return jsonify({
            "success": True,
            "message": "Project saved successfully",
            "project_path": output_path
        })
    except Exception as e:
        current_app.logger.error(f"Error saving project: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error saving project: {str(e)}"}), 500

@timelapse_editor_bp.route('/load_project', methods=['POST'])
def load_project_api():
    """API endpoint to load a timelapse project from a saved state."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    project_path = data.get('project_path')
    session_id = data.get('session_id', 'default')
    
    if not project_path:
        return jsonify({"success": False, "message": "Project path is required"}), 400
    
    # Check if file exists
    if not os.path.isfile(project_path):
        return jsonify({
            "success": False, 
            "message": f"Project file not found: {os.path.basename(project_path)}"
        }), 404
    
    try:
        # Load the project
        editor = TimelapseEditor.load_project(project_path)
        
        if not editor:
            return jsonify({"success": False, "message": "Failed to load project"}), 500
        
        # Store in dictionary with session ID as key
        timelapse_editors[session_id] = editor
        
        # Get metadata
        metadata = editor.get_metadata()
        
        return jsonify({
            "success": True,
            "message": f"Successfully loaded project: {os.path.basename(project_path)}",
            "metadata": metadata,
            "session_id": session_id
        })
    except Exception as e:
        current_app.logger.error(f"Error loading project {project_path}: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error loading project: {str(e)}"}), 500

@timelapse_editor_bp.route('/close', methods=['POST'])
def close_session_api():
    """API endpoint to close a timelapse editing session."""
    session_id = request.json.get('session_id', 'default')
    
    # Check if session exists
    if session_id in timelapse_editors:
        # Remove the editor instance
        del timelapse_editors[session_id]
        
        return jsonify({
            "success": True,
            "message": f"Editing session {session_id} closed"
        })
    else:
        return jsonify({"success": False, "message": "Session not found"}), 404