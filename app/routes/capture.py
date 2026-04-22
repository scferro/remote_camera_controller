from flask import current_app, jsonify
from app.routes import capture_bp
from app.routes.camera import get_camera

@capture_bp.route('/single', methods=['POST'])
def capture_single_api():
    """API endpoint to trigger a single image capture."""
    current_app.logger.info("API request: /api/capture/single")
    cam = get_camera()

    if cam:
        success, filepath_info = cam.capture_image()
        if success:
            return jsonify({
                "success": True,
                "message": f"Image captured: {filepath_info or 'saved to camera card'}",
                "filepath": filepath_info
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