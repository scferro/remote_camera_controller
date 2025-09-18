import logging
import threading
from flask import Flask, current_app

# Configure logging
logging.basicConfig(level=logging.DEBUG, 
                   format='%(asctime)s - %(levelname)s - [%(threadName)s] - %(message)s')
logger = logging.getLogger(__name__)

# Create and configure Flask app
def create_app():
    from app.config import STATIC_DIR, FLASK_SECRET_KEY
    
    app = Flask(__name__, static_folder=STATIC_DIR)
    app.config['SECRET_KEY'] = FLASK_SECRET_KEY
    
    # Global state
    app.camera_lock = threading.Lock()
    app.camera_handler_instance = None
    
    # Preview state
    app.preview_thread = None
    app.preview_active = threading.Event()
    app.preview_rate = 1.0  # Default FPS
    
    # Timelapse state
    app.timelapse_thread = None
    app.timelapse_active = threading.Event()
    app.timelapse_status = {
        "active": False, 
        "message": "Idle", 
        "count": 0, 
        "total": 0, 
        "folder": None
    }
    
    # Register blueprints
    from app.routes import main_bp, camera_bp, capture_bp, preview_bp, timelapse_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(camera_bp)
    app.register_blueprint(capture_bp)
    app.register_blueprint(preview_bp)
    app.register_blueprint(timelapse_bp)
    
    # Initialize camera handler (with Flask 2.x compatible approach)
    from app.routes.camera import get_camera
    
    # Use a function to initialize camera on first request
    def initialize_camera():
        with app.app_context():
            logger.info("Attempting to initialize camera at startup...")
            cam_instance = get_camera()
            if cam_instance and hasattr(cam_instance, 'camera') and cam_instance.camera:
                logger.info("Camera handler successfully initialized on startup.")
            else:
                logger.warning("Camera handler failed to initialize on startup. Will retry on first request.")
    
    # Register a callback to run after first request
    @app.after_request
    def after_request_func(response):
        # Execute only once using a flag
        if not getattr(app, '_camera_initialized', False):
            app._camera_initialized = True
            # Initialize in the background to avoid delaying the response
            threading.Thread(target=initialize_camera, daemon=True).start()
        return response
    
    return app