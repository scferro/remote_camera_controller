import os
import datetime
import threading
import time
from flask import current_app, jsonify, request
from app.routes import timelapse_bp
from app.routes.camera import get_camera
from app.config import TIMELAPSE_DIR

def run_timelapse(interval, count, format_override):
    """Background thread function for timelapse capture."""
    app = current_app._get_current_object()  # Get actual app, not proxy
    logger = app.logger
    
    logger.info(f"Timelapse thread started. Interval: {interval}s, Count: {count}, Format: {format_override}")
    cam = get_camera()
    
    if not cam:
        logger.error("Timelapse thread: Camera not available.")
        app.timelapse_status = {
            "active": False, 
            "message": "Error: Camera not available", 
            "count": 0, 
            "total": count, 
            "folder": None
        }
        return

    # Create unique folder for this timelapse sequence
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    sequence_folder_name = f"{timestamp}_timelapse_{count}x{interval}s"
    sequence_path = os.path.join(TIMELAPSE_DIR, sequence_folder_name)
    
    try:
        os.makedirs(sequence_path)
        logger.info(f"Created timelapse directory: {sequence_path}")
        app.timelapse_status["folder"] = sequence_folder_name
    except OSError as e:
        logger.error(f"Failed to create timelapse directory {sequence_path}: {e}")
        app.timelapse_status = {
            "active": False, 
            "message": f"Error: Cannot create directory {sequence_folder_name}", 
            "count": 0, 
            "total": count, 
            "folder": None
        }
        return

    app.timelapse_status["active"] = True
    app.timelapse_status["total"] = count

    for i in range(count):
        if app.timelapse_active.is_set():
            logger.info("Timelapse cancelled by user.")
            app.timelapse_status["message"] = f"Cancelled after {i} images."
            app.timelapse_status["active"] = False
            return

        app.timelapse_status["count"] = i + 1
        app.timelapse_status["message"] = f"Capturing image {i+1} of {count}..."
        logger.info(app.timelapse_status["message"])

        cycle_start = time.time()  # Start timer immediately before capture

        try:
            # Build a full file path using save_path keyword
            photo_file = os.path.join(sequence_path, f"{i+1:04d}.jpg")
            success, filepath = cam.capture_image(save_path=photo_file)
            
            if success:
                logger.info(f"Image {i+1} captured successfully: {filepath}")
            else:
                logger.error(f"Failed to capture image {i+1}.")
                app.timelapse_status["message"] = f"Error capturing image {i+1}. Stopping."
                app.timelapse_status["active"] = False
                return
                
        except Exception as e:
            logger.error(f"Exception during timelapse capture {i+1}: {e}", exc_info=True)
            app.timelapse_status["message"] = f"Error capturing image {i+1}. Stopping."
            app.timelapse_status["active"] = False
            return

        # Compute wait time relative to cycle start so timing is exact
        wait_time = max(0, interval - (time.time() - cycle_start))
        if i < count - 1:
            app.timelapse_status["message"] = f"Image {i+1}/{count} captured. Waiting {wait_time:.1f}s..."
            logger.info(f"Waiting {wait_time:.1f} seconds for next capture...")
            if app.timelapse_active.wait(wait_time):
                logger.info("Timelapse cancelled during wait.")
                app.timelapse_status["message"] = f"Cancelled after {i+1} images."
                app.timelapse_status["active"] = False
                return

    logger.info("Timelapse sequence completed.")
    app.timelapse_status["message"] = f"Completed {count} images in folder {sequence_folder_name}."
    app.timelapse_status["active"] = False

@timelapse_bp.route('/start', methods=['POST'])
def start_timelapse_api():
    """API endpoint to start a timelapse sequence."""
    app = current_app
    app.logger.info("API request: /api/timelapse/start")

    if app.timelapse_thread and app.timelapse_thread.is_alive():
        return jsonify({"success": False, "message": "Timelapse already in progress."}), 409  # Conflict

    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request: Content-Type must be application/json"}), 400

    data = request.get_json()
    try:
        interval = int(data.get('interval', 5))
        count = int(data.get('count', 100))
        format_override = data.get('format', 'current')  # e.g., 'RAW', 'JPEG', 'current'
        if interval <= 0 or count <= 0:
            raise ValueError("Interval and count must be positive.")
    except (ValueError, TypeError, KeyError) as e:
        app.logger.error(f"Invalid timelapse parameters: {data} - {e}")
        return jsonify({"success": False, "message": f"Invalid parameters: {e}. Interval and count must be positive integers."}), 400

    cam = get_camera()
    if not cam:
        return jsonify({"success": False, "message": "Camera not available."}), 503

    app.timelapse_active.clear()  # Clear stop flag
    app.timelapse_status = {"active": True, "message": "Starting...", "count": 0, "total": count, "folder": None}
    app.timelapse_thread = threading.Thread(
        target=run_timelapse,
        args=(interval, count, format_override),
        name="TimelapseThread",
        daemon=True
    )
    app.timelapse_thread.start()

    return jsonify({"success": True, "message": f"Timelapse started ({count} images, {interval}s interval)."})

@timelapse_bp.route('/stop', methods=['POST'])
def stop_timelapse_api():
    """API endpoint to stop the current timelapse sequence."""
    app = current_app
    app.logger.info("API request: /api/timelapse/stop")

    if app.timelapse_thread and app.timelapse_thread.is_alive():
        app.timelapse_active.set()  # Signal the thread to stop
        # Don't join here, let it finish the current step and exit gracefully if possible
        app.logger.info("Stop signal sent to timelapse thread.")
        # Update status immediately for responsiveness, thread will update final status
        app.timelapse_status["message"] = "Stopping..."
        app.timelapse_status["active"] = False  # Mark as inactive from API perspective
        return jsonify({"success": True, "message": "Stop signal sent to timelapse."})
    else:
        return jsonify({"success": False, "message": "No active timelapse to stop."})

@timelapse_bp.route('/status', methods=['GET'])
def get_timelapse_status_api():
    """API endpoint to get the status of the timelapse."""
    app = current_app
    # Ensure status reflects thread life
    if app.timelapse_status.get("active", False) and (app.timelapse_thread is None or not app.timelapse_thread.is_alive()):
        # If status says active but thread is dead, update status
        if not app.timelapse_active.is_set():  # Check if it wasn't manually stopped
            app.timelapse_status["message"] = "Error: Timelapse thread terminated unexpectedly."
        app.timelapse_status["active"] = False

    return jsonify(app.timelapse_status)

@timelapse_bp.route('/list', methods=['GET'])
def list_timelapses_api():
    """API endpoint to list available timelapse sequence folders."""
    app = current_app
    app.logger.debug("API request: /api/timelapse/list")
    try:
        if not os.path.isdir(TIMELAPSE_DIR):
            app.logger.warning(f"Timelapse directory does not exist: {TIMELAPSE_DIR}")
            return jsonify({"timelapses": [], "message": "Timelapse directory not found."})

        folders = [d for d in os.listdir(TIMELAPSE_DIR) if os.path.isdir(os.path.join(TIMELAPSE_DIR, d))]
        # Sort folders, newest first
        folders.sort(reverse=True)
        return jsonify({"timelapses": folders})
    except Exception as e:
        app.logger.error(f"Error listing timelapse directories: {e}", exc_info=True)
        return jsonify({"error": "Failed to list timelapse directories."}), 500