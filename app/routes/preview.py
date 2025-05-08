import time
import threading
from flask import current_app, jsonify, request
from app.routes import preview_bp
from app.routes.camera import get_camera
from app.config import PREVIEW_FILE_PATH

def generate_preview_frames(app, rotation=0, flip=False):
    """Background thread function to capture preview frames."""
    # Use the passed app instance instead of trying to get it from current_app
    logger = app.logger
    
    logger.info(f"Preview thread started. Target rate: {app.preview_rate} FPS, Rotation: {rotation}°, Flip: {flip}")
    
    # Use app context to ensure proper access to app attributes
    with app.app_context():
        cam = get_camera()
        
        if not cam:
            logger.error("Preview thread: Camera not available.")
            return

        while not app.preview_active.is_set():
            start_time = time.time()
            try:
                # Pass flip parameter to capture_preview
                success = cam.capture_preview(PREVIEW_FILE_PATH, rotation, flip)
                if not success:
                    logger.warning("Preview capture failed in loop.")
                    app.preview_active.wait(2.0)
                    continue

            except Exception as e:
                logger.error(f"Error during preview capture: {e}", exc_info=True)
                app.preview_active.wait(2.0)
                continue

            elapsed_time = time.time() - start_time
            sleep_duration = max(0, (1.0 / app.preview_rate) - elapsed_time)
            if sleep_duration > 0:
                app.preview_active.wait(sleep_duration)

        logger.info("Preview thread finished.")

@preview_bp.route('/start', methods=['POST'])
def start_preview_api():
    """API endpoint to start the live preview stream."""
    app = current_app
    
    if app.preview_thread and app.preview_thread.is_alive():
        app.logger.warning("Preview start request received, but preview is already active.")
        return jsonify({"success": False, "message": "Preview already running."})

    data = request.json or {}
    rate = data.get('rate', 1.0)
    rotation = data.get('rotation', 0)  # Get rotation preference (0 or 90)
    flip = data.get('flip', False)  # Get flip preference
    
    try:
        app.preview_rate = float(rate)
        if app.preview_rate <= 0: 
            raise ValueError("Rate must be positive")
    except (ValueError, TypeError):
        app.logger.warning(f"Invalid preview rate received: {rate}. Using default {app.preview_rate} FPS.")

    app.logger.info(f"API request: /api/preview/start (Rate: {app.preview_rate} FPS, Rotation: {rotation}°, Flip: {flip})")

    cam = get_camera()
    if not cam:
        return jsonify({"success": False, "message": "Camera not available."}), 503

    # Get a reference to the current app for the thread
    app_instance = current_app._get_current_object()
    
    app.preview_active.clear()
    app.preview_thread = threading.Thread(
        target=generate_preview_frames,
        args=(app_instance, rotation, flip),  # Pass app instance to the thread
        name="PreviewThread",
        daemon=True
    )
    app.preview_thread.start()

    return jsonify({"success": True, "message": f"Preview started at {app.preview_rate} FPS."})

@preview_bp.route('/stop', methods=['POST'])
def stop_preview_api():
    """API endpoint to stop the live preview stream."""
    app = current_app
    app.logger.info("API request: /api/preview/stop")

    if app.preview_thread and app.preview_thread.is_alive():
        app.preview_active.set()  # Signal the thread to stop
        app.preview_thread.join(timeout=5.0)  # Wait for the thread to finish
        if app.preview_thread.is_alive():
            app.logger.warning("Preview thread did not stop gracefully after timeout.")
            # It's a daemon thread, so it will exit when the main app exits anyway
        app.preview_thread = None
        app.logger.info("Preview stopped.")
        return jsonify({"success": True, "message": "Preview stopped."})
    else:
        app.logger.warning("Preview stop request received, but preview was not active.")
        return jsonify({"success": False, "message": "Preview not running."})