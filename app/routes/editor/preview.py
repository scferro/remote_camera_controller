import os
import tempfile
from flask import current_app, jsonify, request, send_file
from werkzeug.utils import secure_filename
from PIL import Image
import io
from app.routes.editor import preview_bp
from app.config import OUTPUT_DIR, TIMELAPSE_DIR

# Global cache for preview thumbnails
thumbnail_cache = {}

@preview_bp.route('/thumbnail', methods=['GET'])
def get_thumbnail_api():
    """API endpoint to get a thumbnail of an image."""
    path = request.args.get('path')
    max_size = int(request.args.get('max_size', 300))
    cache_key = f"{path}_{max_size}"
    
    if not path:
        return jsonify({"success": False, "message": "Image path is required"}), 400
    
    # Check if path is relative 
    if not os.path.isabs(path):
        # Try both directories
        if os.path.exists(os.path.join(OUTPUT_DIR, path)):
            path = os.path.join(OUTPUT_DIR, path)
        elif os.path.exists(os.path.join(TIMELAPSE_DIR, path)):
            path = os.path.join(TIMELAPSE_DIR, path)
        else:
            return jsonify({"success": False, "message": f"Image not found: {path}"}), 404
    
    # Verify file exists
    if not os.path.isfile(path):
        return jsonify({"success": False, "message": f"Image not found: {path}"}), 404
    
    try:
        # Check cache first
        if cache_key in thumbnail_cache:
            # We store the thumbnail data in the cache
            thumb_data = thumbnail_cache[cache_key]
            return send_file(
                io.BytesIO(thumb_data),
                mimetype='image/jpeg',
                as_attachment=False,
                download_name=f"thumbnail_{os.path.basename(path)}"
            )
        
        # Generate thumbnail
        with Image.open(path) as img:
            # Calculate new dimensions while maintaining aspect ratio
            width, height = img.size
            if width > height:
                new_width = min(width, max_size)
                new_height = int(height * (new_width / width))
            else:
                new_height = min(height, max_size)
                new_width = int(width * (new_height / height))
            
            # Resize the image
            thumb = img.resize((new_width, new_height), Image.LANCZOS)
            
            # Save to BytesIO
            thumb_io = io.BytesIO()
            thumb.save(thumb_io, format='JPEG', quality=85)
            thumb_data = thumb_io.getvalue()
            
            # Add to cache
            thumbnail_cache[cache_key] = thumb_data
            
            # Return the thumbnail
            thumb_io.seek(0)
            return send_file(
                thumb_io,
                mimetype='image/jpeg',
                as_attachment=False,
                download_name=f"thumbnail_{os.path.basename(path)}"
            )
    except Exception as e:
        current_app.logger.error(f"Error generating thumbnail for {path}: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error generating thumbnail: {str(e)}"}), 500

@preview_bp.route('/batch_thumbnails', methods=['POST'])
def batch_thumbnails_api():
    """API endpoint to prepare thumbnails for multiple images in batch."""
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400
    
    data = request.get_json()
    paths = data.get('paths', [])
    max_size = data.get('max_size', 200)
    
    if not paths:
        return jsonify({"success": False, "message": "Image paths are required"}), 400
    
    try:
        results = []
        for path in paths:
            # Get absolute path
            if not os.path.isabs(path):
                # Try both directories
                if os.path.exists(os.path.join(OUTPUT_DIR, path)):
                    abs_path = os.path.join(OUTPUT_DIR, path)
                elif os.path.exists(os.path.join(TIMELAPSE_DIR, path)):
                    abs_path = os.path.join(TIMELAPSE_DIR, path)
                else:
                    results.append({
                        "path": path,
                        "success": False,
                        "message": "File not found"
                    })
                    continue
            else:
                abs_path = path
            
            # Check if file exists
            if not os.path.isfile(abs_path):
                results.append({
                    "path": path,
                    "success": False,
                    "message": "File not found"
                })
                continue
            
            # Generate a cache key
            cache_key = f"{abs_path}_{max_size}"
            
            try:
                # Generate thumbnail (add to cache even if we don't return the actual image data)
                if cache_key not in thumbnail_cache:
                    with Image.open(abs_path) as img:
                        # Calculate new dimensions
                        width, height = img.size
                        if width > height:
                            new_width = min(width, max_size)
                            new_height = int(height * (new_width / width))
                        else:
                            new_height = min(height, max_size)
                            new_width = int(width * (new_height / height))
                        
                        # Resize
                        thumb = img.resize((new_width, new_height), Image.LANCZOS)
                        
                        # Save to BytesIO
                        thumb_io = io.BytesIO()
                        thumb.save(thumb_io, format='JPEG', quality=85)
                        thumb_data = thumb_io.getvalue()
                        
                        # Add to cache
                        thumbnail_cache[cache_key] = thumb_data
                
                # Add to results
                results.append({
                    "path": path,
                    "success": True,
                    "thumbnail_url": f"/api/editor/preview/thumbnail?path={path}&max_size={max_size}"
                })
            except Exception as e:
                current_app.logger.error(f"Error processing thumbnail for {path}: {e}")
                results.append({
                    "path": path,
                    "success": False,
                    "message": str(e)
                })
        
        return jsonify({
            "success": True,
            "thumbnails": results
        })
    except Exception as e:
        current_app.logger.error(f"Error processing batch thumbnails: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error processing batch thumbnails: {str(e)}"}), 500

@preview_bp.route('/clear_cache', methods=['POST'])
def clear_cache_api():
    """API endpoint to clear the thumbnail cache."""
    global thumbnail_cache
    thumbnail_cache = {}
    
    return jsonify({
        "success": True,
        "message": "Thumbnail cache cleared"
    })

@preview_bp.route('/metadata', methods=['GET'])
def get_metadata_api():
    """API endpoint to get metadata about an image without loading it for editing."""
    path = request.args.get('path')
    
    if not path:
        return jsonify({"success": False, "message": "Image path is required"}), 400
    
    # Check if path is relative
    if not os.path.isabs(path):
        # Try both directories
        if os.path.exists(os.path.join(OUTPUT_DIR, path)):
            path = os.path.join(OUTPUT_DIR, path)
        elif os.path.exists(os.path.join(TIMELAPSE_DIR, path)):
            path = os.path.join(TIMELAPSE_DIR, path)
        else:
            return jsonify({"success": False, "message": f"Image not found: {path}"}), 404
    
    # Verify file exists
    if not os.path.isfile(path):
        return jsonify({"success": False, "message": f"Image not found: {path}"}), 404
    
    try:
        # Extract basic metadata
        with Image.open(path) as img:
            metadata = {
                "filename": os.path.basename(path),
                "path": path,
                "format": img.format,
                "mode": img.mode,
                "size": {
                    "width": img.width,
                    "height": img.height
                },
                "file_size": os.path.getsize(path),
                "modified": os.path.getmtime(path)
            }
            
            # Extract EXIF data if available
            if hasattr(img, '_getexif') and callable(img._getexif):
                exif = img._getexif()
                if exif:
                    # Extract just a few key EXIF values for now
                    exif_tags = {
                        271: 'Make',
                        272: 'Model',
                        306: 'DateTime',
                        33432: 'Copyright',
                        36867: 'DateTimeOriginal',
                        37377: 'ShutterSpeedValue',
                        37378: 'ApertureValue',
                        37380: 'ExposureBiasValue',
                        37383: 'MeteringMode',
                        37384: 'FlashMode', 
                        37385: 'Flash',
                        37386: 'FocalLength',
                        37520: 'SubSecTimeOriginal',
                        41488: 'FocalLengthIn35mmFilm',
                        41729: 'SceneType',
                    }
                    
                    metadata['exif'] = {}
                    for tag, name in exif_tags.items():
                        if tag in exif:
                            metadata['exif'][name] = str(exif[tag])
        
        return jsonify({
            "success": True,
            "metadata": metadata
        })
    except Exception as e:
        current_app.logger.error(f"Error getting metadata for {path}: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error getting metadata: {str(e)}"}), 500

@preview_bp.route('/browse', methods=['GET'])
def browse_images_api():
    """API endpoint to browse images in a directory structure."""
    base_dir = request.args.get('dir', OUTPUT_DIR)
    
    # Security check - don't allow browsing outside allowed directories
    if not (base_dir.startswith(OUTPUT_DIR) or base_dir.startswith(TIMELAPSE_DIR)):
        base_dir = OUTPUT_DIR
    
    # Verify directory exists
    if not os.path.isdir(base_dir):
        return jsonify({"success": False, "message": f"Directory not found: {base_dir}"}), 404
    
    try:
        # Get directory contents
        contents = {
            "path": base_dir,
            "parent": os.path.dirname(base_dir) if base_dir != OUTPUT_DIR and base_dir != TIMELAPSE_DIR else None,
            "directories": [],
            "files": []
        }
        
        # List directories and files
        for item in os.listdir(base_dir):
            item_path = os.path.join(base_dir, item)
            
            if os.path.isdir(item_path):
                contents["directories"].append({
                    "name": item,
                    "path": item_path,
                    "modified": os.path.getmtime(item_path)
                })
            elif os.path.isfile(item_path):
                # Only include image files
                ext = os.path.splitext(item)[1].lower()
                if ext in ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.arw', '.cr2', '.nef']:
                    contents["files"].append({
                        "name": item,
                        "path": item_path,
                        "size": os.path.getsize(item_path),
                        "modified": os.path.getmtime(item_path),
                        "thumbnail_url": f"/api/editor/preview/thumbnail?path={item_path}&max_size=150"
                    })
        
        # Sort by name
        contents["directories"].sort(key=lambda x: x["name"])
        contents["files"].sort(key=lambda x: x["name"])
        
        return jsonify({
            "success": True,
            "contents": contents
        })
    except Exception as e:
        current_app.logger.error(f"Error browsing directory {base_dir}: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"Error browsing directory: {str(e)}"}), 500