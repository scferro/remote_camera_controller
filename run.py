#!/usr/bin/env python3
"""
Main entry point for the Remote Camera Controller application.
Initializes and runs the Flask application.
"""
import logging
from app import create_app
from app.config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG

# Configure root logger
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - [%(threadName)s] - %(message)s'
)
logger = logging.getLogger(__name__)

# Create the Flask application
app = create_app()

if __name__ == '__main__':
    logger.info(f"Starting Flask server on http://{FLASK_HOST}:{FLASK_PORT}")
    # IMPORTANT: Disable debug and reloader for reliable camera interaction
    app.run(
        host=FLASK_HOST, 
        port=FLASK_PORT, 
        debug=FLASK_DEBUG, 
        threaded=True, 
        use_reloader=False
    )