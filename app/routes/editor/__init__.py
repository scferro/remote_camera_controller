from flask import Blueprint

# Create blueprints for different editor functionalities
image_editor_bp = Blueprint('image_editor', __name__, url_prefix='/api/editor/image')
timelapse_editor_bp = Blueprint('timelapse_editor', __name__, url_prefix='/api/editor/timelapse')
preview_bp = Blueprint('editor_preview', __name__, url_prefix='/api/editor/preview')

# Import routes to register them with blueprints
from app.routes.editor.image import *
from app.routes.editor.timelapse import *
from app.routes.editor.preview import *