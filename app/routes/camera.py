from flask import current_app, jsonify, request
from app.routes import camera_bp
from camera_control import gphoto_handler

def get_camera():
    """Initializes and returns the camera handler instance, handling errors."""
    app = current_app
    
    # Use lock to prevent race conditions during initialization check/creation
    with app.camera_lock:
        if app.camera_handler_instance is None:
            app.logger.info("Initializing Camera Handler...")
            try:
                # Pass the lock to the handler
                app.camera_handler_instance = gphoto_handler.CameraHandler(lock=app.camera_lock)
                app.logger.info("Camera Handler initialized (instance created).")
            except Exception as e:
                app.logger.error(f"Failed to initialize camera handler: {e}", exc_info=True)
                app.camera_handler_instance = None  # Ensure it's None if init fails
    
    return app.camera_handler_instance

@camera_bp.route('/status', methods=['GET'])
def get_camera_status_api():
    """API endpoint to get current camera status and basic info."""
    current_app.logger.debug("API request: /api/camera/status")
    cam = get_camera()
    
    if cam:
        status = cam.get_status()
        return jsonify(status)
    else:
        return jsonify({
            "connected": False, 
            "model": "N/A", 
            "message": "Camera handler initialization failed or camera not detected."
        })

@camera_bp.route('/settings', methods=['GET'])
def get_camera_settings_api():
    """API endpoint to get configurable camera settings."""
    current_app.logger.debug("API request: /api/camera/settings")
    cam = get_camera()
    
    if cam:
        settings = cam.list_all_config()
        if settings is None:
            current_app.logger.error("list_all_config() returned None.")
            return jsonify({"error": "Failed to retrieve settings from camera."}), 500

        # Debug log - limit log size if necessary
        settings_str = str(settings)
        current_app.logger.debug(
            f"Settings data being returned to frontend (length {len(settings_str)}): "
            f"{settings_str[:1000]}{'...' if len(settings_str) > 1000 else ''}"
        )
        
        return jsonify(settings)
    else:
        current_app.logger.warning("Camera not available for /api/camera/settings request.")
        return jsonify({"error": "Camera not available."}), 503  # Service Unavailable

@camera_bp.route('/setting/<path:setting_name>', methods=['POST'])
def set_camera_setting_api(setting_name):
    """API endpoint to set a specific camera setting."""
    if not request.is_json:
        return jsonify({
            "success": False, 
            "message": "Invalid request: Content-Type must be application/json"
        }), 400

    data = request.get_json()
    value = data.get('value')

    if value is None:
        return jsonify({
            "success": False, 
            "message": "Invalid request: 'value' field missing in JSON body"
        }), 400

    # Need to replace placeholder separators used in JS with '/' for gphoto2
    setting_name_gphoto = setting_name.replace("///", "/")  # Use the triple slash separator
    current_app.logger.info(f"API request: Set '{setting_name_gphoto}' to '{value}'")

    cam = get_camera()
    if cam:
        success, message = cam.set_config(setting_name_gphoto, value)
        return jsonify({"success": success, "message": message})
    else:
        return jsonify({"success": False, "message": "Camera not available."}), 503