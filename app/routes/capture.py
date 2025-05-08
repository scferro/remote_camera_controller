import os
import datetime
from flask import current_app, jsonify, request
from app.routes import capture_bp
from app.routes.camera import get_camera
from app.config import OUTPUT_DIR, BASE_DIR

@capture_bp.route('/single', methods=['POST'])
def capture_single_api():
    """API endpoint to trigger a single image capture."""
    current_app.logger.info("API request: /api/capture/single")
    cam = get_camera()
    
    if cam:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        capture_dir = OUTPUT_DIR
        os.makedirs(capture_dir, exist_ok=True)
        
        # Create a full file path for the captured image
        capture_file = os.path.join(capture_dir, f"{timestamp}.jpg")
        
        success, filepath = cam.capture_image(save_path=capture_file)
        if success and filepath:
            relative_path = os.path.relpath(filepath, BASE_DIR)
            return jsonify({
                "success": True, 
                "message": f"Image captured: {os.path.basename(filepath)}", 
                "filepath": relative_path
            })
        elif success and not filepath:
            return jsonify({
                "success": True, 
                "message": "Image captured on camera (not downloaded).", 
                "filepath": None
            })
        else:
            return jsonify({
                "success": False, 
                "message": "Capture failed. Check camera status and logs."
            }), 500
    else:
        return jsonify({
            "success": False, 
            "message": "Camera not available."
        }), 503