import os
import logging
import threading
import time
import datetime
from flask import Flask, render_template, jsonify, request, Response, send_from_directory, abort
from camera_control import gphoto_handler # Import the camera handler module
from processing import image_processor # Import the processing module (will be basic for now)

# --- Configuration ---
# Base directory of the application
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
# Directory for storing timelapse sequences
TIMELAPSE_DIR = os.path.join(BASE_DIR, 'timelapse_data')
# Directory for storing processed output
OUTPUT_DIR = os.path.join(BASE_DIR, 'processed_output')
# Directory for static files (like preview)
STATIC_DIR = os.path.join(BASE_DIR, 'static')
PREVIEW_FILE_PATH = os.path.join(STATIC_DIR, 'previews', 'preview.jpg')
# Ensure the preview directory exists within the static directory
os.makedirs(os.path.dirname(PREVIEW_FILE_PATH), exist_ok=True)

# Ensure other directories exist
os.makedirs(TIMELAPSE_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Logging Setup ---
# Use DEBUG level to see detailed logs added for settings
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - [%(threadName)s] - %(message)s')
log = logging.getLogger(__name__)

# --- Flask App Initialization ---
app = Flask(__name__, static_folder=STATIC_DIR) # Point static folder explicitly
app.config['SECRET_KEY'] = os.urandom(24) # Needed for session management, flash messages etc.

# --- Global State & Locking ---
# Use a lock for camera access to prevent concurrent operations from different threads/requests
camera_lock = threading.Lock()
camera_handler_instance = None # Holds the initialized CameraHandler instance

# Preview state
preview_thread = None
preview_active = threading.Event() # Event to signal preview thread to stop
preview_rate = 1.0 # Default FPS

# Timelapse state
timelapse_thread = None
timelapse_active = threading.Event() # Event to signal timelapse thread to stop
timelapse_status = {"active": False, "message": "Idle", "count": 0, "total": 0, "folder": None}

# --- Camera Initialization ---
def get_camera():
    """Initializes and returns the camera handler instance, handling errors."""
    global camera_handler_instance
    # Use lock to prevent race conditions during initialization check/creation
    with camera_lock:
        if camera_handler_instance is None:
            log.info("Initializing Camera Handler...")
            try:
                # Pass the lock to the handler
                camera_handler_instance = gphoto_handler.CameraHandler(lock=camera_lock)
                log.info("Camera Handler initialized (instance created).")
            except Exception as e:
                log.error(f"Failed to initialize camera handler: {e}", exc_info=True)
                camera_handler_instance = None # Ensure it's None if init fails
    return camera_handler_instance

# --- Helper Functions ---
def generate_preview_frames():
    """Background thread function to capture preview frames."""
    global preview_rate
    log.info(f"Preview thread started. Target rate: {preview_rate} FPS")
    cam = get_camera()
    if not cam:
        log.error("Preview thread: Camera not available.")
        return

    while not preview_active.is_set():
        start_time = time.time()
        try:
            # Attempt to capture preview
            success = cam.capture_preview(PREVIEW_FILE_PATH)
            if not success:
                log.warning("Preview capture failed in loop.")
                # Optional: Signal frontend about the failure?
                # For now, just wait before retrying
                preview_active.wait(2.0) # Use event wait, wait longer if capture fails
                continue

        except Exception as e:
            log.error(f"Error during preview capture: {e}", exc_info=True)
            # Wait before retrying after an error
            preview_active.wait(2.0)
            continue # Continue the loop

        # Calculate sleep time to maintain target frame rate
        elapsed_time = time.time() - start_time
        sleep_duration = max(0, (1.0 / preview_rate) - elapsed_time)
        # log.debug(f"Preview captured in {elapsed_time:.3f}s, sleeping for {sleep_duration:.3f}s")
        if sleep_duration > 0:
            preview_active.wait(sleep_duration) # Use event wait for interruptibility

    log.info("Preview thread finished.")
    # Clean up preview file maybe? Or leave the last frame?
    # try:
    #     if os.path.exists(PREVIEW_FILE_PATH):
    #         os.remove(PREVIEW_FILE_PATH)
    #         log.info("Cleaned up preview file.")
    # except OSError as e:
    #     log.error(f"Error removing preview file: {e}")


def run_timelapse(interval, count, format_override):
    """Background thread function for timelapse capture."""
    global timelapse_status
    log.info(f"Timelapse thread started. Interval: {interval}s, Count: {count}, Format: {format_override}")
    cam = get_camera()
    if not cam:
        log.error("Timelapse thread: Camera not available.")
        timelapse_status = {"active": False, "message": "Error: Camera not available", "count": 0, "total": count, "folder": None}
        return

    # Create unique folder for this timelapse sequence
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    sequence_folder_name = f"{timestamp}_timelapse_{count}x{interval}s"
    sequence_path = os.path.join(TIMELAPSE_DIR, sequence_folder_name)
    try:
        os.makedirs(sequence_path)
        log.info(f"Created timelapse directory: {sequence_path}")
        timelapse_status["folder"] = sequence_folder_name
    except OSError as e:
        log.error(f"Failed to create timelapse directory {sequence_path}: {e}")
        timelapse_status = {"active": False, "message": f"Error: Cannot create directory {sequence_folder_name}", "count": 0, "total": count, "folder": None}
        return

    timelapse_status["active"] = True
    timelapse_status["total"] = count

    for i in range(count):
        if timelapse_active.is_set():
            log.info("Timelapse cancelled by user.")
            timelapse_status["message"] = f"Cancelled after {i} images."
            timelapse_status["active"] = False
            return

        timelapse_status["count"] = i + 1
        timelapse_status["message"] = f"Capturing image {i+1} of {count}..."
        log.info(timelapse_status["message"])

        cycle_start = time.time()  # Start timer immediately before capture

        try:
            # Build a full file path using save_path keyword
            photo_file = os.path.join(sequence_path, f"{i+1:04d}.jpg")
            success, filepath = cam.capture_image(save_path=photo_file)
            if success:
                log.info(f"Image {i+1} captured successfully: {filepath}")
            else:
                log.error(f"Failed to capture image {i+1}.")
                timelapse_status["message"] = f"Error capturing image {i+1}. Stopping."
                timelapse_status["active"] = False
                return
        except Exception as e:
            log.error(f"Exception during timelapse capture {i+1}: {e}", exc_info=True)
            timelapse_status["message"] = f"Error capturing image {i+1}. Stopping."
            timelapse_status["active"] = False
            return

        # Compute wait time relative to cycle start so timing is exact
        wait_time = max(0, interval - (time.time() - cycle_start))
        if i < count - 1:
            timelapse_status["message"] = f"Image {i+1}/{count} captured. Waiting {wait_time:.1f}s..."
            log.info(f"Waiting {wait_time:.1f} seconds for next capture...")
            if timelapse_active.wait(wait_time):
                log.info("Timelapse cancelled during wait.")
                timelapse_status["message"] = f"Cancelled after {i+1} images."
                timelapse_status["active"] = False
                return

    log.info("Timelapse sequence completed.")
    timelapse_status["message"] = f"Completed {count} images in folder {sequence_folder_name}."
    timelapse_status["active"] = False


# --- Routes ---

@app.route('/')
def index():
    """Serves the main HTML page."""
    log.info("Serving index page.")
    return render_template('index.html')

# Serve static files (CSS, JS) - Flask does this automatically if static_folder is set
# We still need a route for the dynamic preview image
@app.route('/static/previews/<filename>')
def preview_image(filename):
    """Serves the latest preview image."""
    # Add headers to prevent caching
    try:
        response = send_from_directory(os.path.dirname(PREVIEW_FILE_PATH), filename)
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except FileNotFoundError:
        log.warning(f"Preview file not found: {filename}")
        # Return a 404 or perhaps a default placeholder image?
        # For now, let Flask handle the 404
        abort(404)


# --- API Endpoints ---

@app.route('/api/camera/status', methods=['GET'])
def get_camera_status_api():
    """API endpoint to get current camera status and basic info."""
    log.debug("API request: /api/camera/status")
    cam = get_camera()
    if cam:
        status = cam.get_status()
        return jsonify(status)
    else:
        return jsonify({"connected": False, "model": "N/A", "message": "Camera handler initialization failed or camera not detected."})

@app.route('/api/camera/settings', methods=['GET'])
def get_camera_settings_api():
    """API endpoint to get configurable camera settings."""
    log.debug("API request: /api/camera/settings")
    cam = get_camera()
    if cam:
        settings = cam.list_all_config()
        if settings is None:
             log.error("list_all_config() returned None.") # Log if None
             return jsonify({"error": "Failed to retrieve settings from camera."}), 500

        # *** ADDED DEBUG LOG ***
        # Be careful logging this if settings contain sensitive info, but useful for debug
        # Limit log size if necessary
        settings_str = str(settings)
        log.debug(f"Settings data being returned to frontend (length {len(settings_str)}): {settings_str[:1000]}{'...' if len(settings_str) > 1000 else ''}")
        # ***********************

        return jsonify(settings) # Return the actual settings dict
    else:
        log.warning("Camera not available for /api/camera/settings request.")
        return jsonify({"error": "Camera not available."}), 503 # Service Unavailable

@app.route('/api/camera/setting/<path:setting_name>', methods=['POST'])
def set_camera_setting_api(setting_name):
    """API endpoint to set a specific camera setting."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request: Content-Type must be application/json"}), 400

    data = request.get_json()
    value = data.get('value')

    if value is None:
         return jsonify({"success": False, "message": "Invalid request: 'value' field missing in JSON body"}), 400

    # Need to replace placeholder separators used in JS with '/' for gphoto2
    setting_name_gphoto = setting_name.replace("///", "/") # Use the triple slash separator
    log.info(f"API request: Set '{setting_name_gphoto}' to '{value}'")

    cam = get_camera()
    if cam:
        success, message = cam.set_config(setting_name_gphoto, value)
        return jsonify({"success": success, "message": message})
    else:
        return jsonify({"success": False, "message": "Camera not available."}), 503

@app.route('/api/capture/single', methods=['POST'])
def capture_single_api():
    """API endpoint to trigger a single image capture."""
    log.info("API request: /api/capture/single")
    cam = get_camera()
    if cam:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        capture_dir = os.path.join(OUTPUT_DIR, "single_captures")
        os.makedirs(capture_dir, exist_ok=True)
        # Create a full file path for the captured image.
        capture_file = os.path.join(capture_dir, f"{timestamp}.jpg")
        
        success, filepath = cam.capture_image(save_path=capture_file)
        if success and filepath:
            relative_path = os.path.relpath(filepath, BASE_DIR)
            return jsonify({"success": True, "message": f"Image captured: {os.path.basename(filepath)}", "filepath": relative_path})
        elif success and not filepath:
             return jsonify({"success": True, "message": "Image captured on camera (not downloaded).", "filepath": None})
        else:
            return jsonify({"success": False, "message": "Capture failed. Check camera status and logs."}), 500
    else:
        return jsonify({"success": False, "message": "Camera not available."}), 503

@app.route('/api/preview/start', methods=['POST'])
def start_preview_api():
    """API endpoint to start the live preview stream."""
    global preview_thread, preview_active, preview_rate
    if preview_thread and preview_thread.is_alive():
        log.warning("Preview start request received, but preview is already active.")
        return jsonify({"success": False, "message": "Preview already running."})

    rate = request.json.get('rate', 1.0)
    try:
        preview_rate = float(rate)
        if preview_rate <= 0: raise ValueError("Rate must be positive")
    except (ValueError, TypeError):
        log.warning(f"Invalid preview rate received: {rate}. Using default {preview_rate} FPS.")
        # Keep default rate

    log.info(f"API request: /api/preview/start (Rate: {preview_rate} FPS)")

    cam = get_camera()
    if not cam:
         return jsonify({"success": False, "message": "Camera not available."}), 503

    # Clear the stop event, set the thread, and start it
    preview_active.clear()
    preview_thread = threading.Thread(target=generate_preview_frames, name="PreviewThread", daemon=True)
    preview_thread.start()

    return jsonify({"success": True, "message": f"Preview started at {preview_rate} FPS."})

@app.route('/api/preview/stop', methods=['POST'])
def stop_preview_api():
    """API endpoint to stop the live preview stream."""
    global preview_thread, preview_active
    log.info("API request: /api/preview/stop")

    if preview_thread and preview_thread.is_alive():
        preview_active.set() # Signal the thread to stop
        preview_thread.join(timeout=5.0) # Wait for the thread to finish
        if preview_thread.is_alive():
            log.warning("Preview thread did not stop gracefully after timeout.")
            # It's a daemon thread, so it will exit when the main app exits anyway
        preview_thread = None
        log.info("Preview stopped.")
        return jsonify({"success": True, "message": "Preview stopped."})
    else:
        log.warning("Preview stop request received, but preview was not active.")
        return jsonify({"success": False, "message": "Preview not running."})


@app.route('/api/timelapse/start', methods=['POST'])
def start_timelapse_api():
    """API endpoint to start a timelapse sequence."""
    global timelapse_thread, timelapse_active, timelapse_status
    log.info("API request: /api/timelapse/start")

    if timelapse_thread and timelapse_thread.is_alive():
        return jsonify({"success": False, "message": "Timelapse already in progress."}), 409 # Conflict

    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request: Content-Type must be application/json"}), 400

    data = request.get_json()
    try:
        interval = int(data.get('interval', 5))
        count = int(data.get('count', 100))
        format_override = data.get('format', 'current') # e.g., 'RAW', 'JPEG', 'current'
        if interval <= 0 or count <= 0:
            raise ValueError("Interval and count must be positive.")
    except (ValueError, TypeError, KeyError) as e:
        log.error(f"Invalid timelapse parameters: {data} - {e}")
        return jsonify({"success": False, "message": f"Invalid parameters: {e}. Interval and count must be positive integers."}), 400

    cam = get_camera()
    if not cam:
        return jsonify({"success": False, "message": "Camera not available."}), 503

    timelapse_active.clear() # Clear stop flag
    timelapse_status = {"active": True, "message": "Starting...", "count": 0, "total": count, "folder": None}
    timelapse_thread = threading.Thread(target=run_timelapse,
                                        args=(interval, count, format_override),
                                        name="TimelapseThread",
                                        daemon=True)
    timelapse_thread.start()

    return jsonify({"success": True, "message": f"Timelapse started ({count} images, {interval}s interval)."})


@app.route('/api/timelapse/stop', methods=['POST'])
def stop_timelapse_api():
    """API endpoint to stop the current timelapse sequence."""
    global timelapse_thread, timelapse_active, timelapse_status
    log.info("API request: /api/timelapse/stop")

    if timelapse_thread and timelapse_thread.is_alive():
        timelapse_active.set() # Signal the thread to stop
        # Don't join here, let it finish the current step and exit gracefully if possible
        log.info("Stop signal sent to timelapse thread.")
        # Update status immediately for responsiveness, thread will update final status
        timelapse_status["message"] = "Stopping..."
        timelapse_status["active"] = False # Mark as inactive from API perspective
        return jsonify({"success": True, "message": "Stop signal sent to timelapse."})
    else:
        return jsonify({"success": False, "message": "No active timelapse to stop."})

@app.route('/api/timelapse/status', methods=['GET'])
def get_timelapse_status_api():
    """API endpoint to get the status of the timelapse."""
    global timelapse_status
    # Ensure status reflects thread life
    if timelapse_status.get("active", False) and (timelapse_thread is None or not timelapse_thread.is_alive()):
         # If status says active but thread is dead, update status
         if not timelapse_active.is_set(): # Check if it wasn't manually stopped
              timelapse_status["message"] = "Error: Timelapse thread terminated unexpectedly."
         timelapse_status["active"] = False

    return jsonify(timelapse_status)

@app.route('/api/timelapse/list', methods=['GET'])
def list_timelapses_api():
    """API endpoint to list available timelapse sequence folders."""
    log.debug("API request: /api/timelapse/list")
    try:
        if not os.path.isdir(TIMELAPSE_DIR):
             log.warning(f"Timelapse directory does not exist: {TIMELAPSE_DIR}")
             return jsonify({"timelapses": [], "message": "Timelapse directory not found."})

        folders = [d for d in os.listdir(TIMELAPSE_DIR) if os.path.isdir(os.path.join(TIMELAPSE_DIR, d))]
        # Optional: Sort folders, maybe newest first
        folders.sort(reverse=True)
        return jsonify({"timelapses": folders})
    except Exception as e:
        log.error(f"Error listing timelapse directories: {e}", exc_info=True)
        return jsonify({"error": "Failed to list timelapse directories."}), 500


# --- Video Endpoints (Placeholders - Very Experimental) ---

@app.route('/api/video/start', methods=['POST'])
def start_video_api():
    log.warning("API request: /api/video/start (Experimental - Likely Unsupported)")
    # TODO: Attempt to use gphoto2 --capture-movie if supported by camera
    return jsonify({"success": False, "message": "Video recording via gphoto2 is generally not supported or reliable."}), 501 # Not Implemented

@app.route('/api/video/stop', methods=['POST'])
def stop_video_api():
    log.warning("API request: /api/video/stop (Experimental)")
    # TODO: Attempt to stop movie capture if started
    return jsonify({"success": False, "message": "Video recording via gphoto2 is generally not supported or reliable."}), 501 # Not Implemented


# --- Processing Endpoints (Placeholders) ---

@app.route('/api/process/single', methods=['POST'])
def process_single_image_api():
    log.info("API request: /api/process/single")
    # TODO: Get file path and processing parameters from request
    # TODO: Call functions in image_processor.py
    return jsonify({"success": False, "message": "Single image processing not implemented yet."}), 501

@app.route('/api/process/timelapse', methods=['POST'])
def process_timelapse_api():
    log.info("API request: /api/process/timelapse")
    # TODO: Get timelapse folder name and processing/assembly parameters
    # TODO: Call functions in image_processor.py
    return jsonify({"success": False, "message": "Timelapse processing and assembly not implemented yet."}), 501


# --- Main Execution ---
if __name__ == '__main__':
    log.info("Attempting to initialize camera...")
    # Initialize camera handler instance on startup
    cam_instance = get_camera()
    if cam_instance and cam_instance.camera:
         log.info("Camera handler successfully initialized on startup.")
    else:
         log.warning("Camera handler failed to initialize on startup. Will retry on first request.")

    log.info("Starting Flask server on http://0.0.0.0:5000")
    # IMPORTANT: Disable debug and reloader for reliable camera interaction
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True, use_reloader=False)
