import os
import logging
from PIL import Image

logger = logging.getLogger(__name__)

def get_image_metadata(image_path):
    """
    Extracts metadata from an image file.
    
    Args:
        image_path (str): Path to the image file
        
    Returns:
        dict: Dictionary containing image metadata
    """
    try:
        with Image.open(image_path) as img:
            metadata = {
                'format': img.format,
                'mode': img.mode,
                'size': img.size,
                'width': img.width,
                'height': img.height,
            }
            
            # Try to get Exif data if available
            if hasattr(img, '_getexif') and callable(img._getexif):
                exif = img._getexif()
                if exif:
                    metadata['exif'] = exif
                    
            return metadata
    except Exception as e:
        logger.error(f"Error getting metadata for {image_path}: {e}")
        return None

def resize_image(input_path, output_path, max_size=None, scale_factor=None, quality=95):
    """
    Resizes an image while maintaining aspect ratio.
    
    Args:
        input_path (str): Path to the input image
        output_path (str): Path to save the resized image
        max_size (tuple): Maximum (width, height) - image will be resized to fit within these dimensions
        scale_factor (float): Scale factor to resize by (e.g., 0.5 for half size)
        quality (int): JPEG quality (1-100)
        
    Returns:
        bool: True if successful, False otherwise
    """
    if not max_size and not scale_factor:
        logger.error("Either max_size or scale_factor must be provided")
        return False
        
    try:
        with Image.open(input_path) as img:
            original_width, original_height = img.size
            
            if scale_factor:
                new_width = int(original_width * scale_factor)
                new_height = int(original_height * scale_factor)
            else:
                max_width, max_height = max_size
                # Calculate scaling factor to fit within max dimensions
                width_ratio = max_width / original_width if max_width else float('inf')
                height_ratio = max_height / original_height if max_height else float('inf')
                scale = min(width_ratio, height_ratio)
                
                # Only scale down, not up
                if scale >= 1:
                    logger.info(f"Image {input_path} already smaller than max_size, no resize needed")
                    # If output path is different, just copy the image
                    if input_path != output_path:
                        img.save(output_path, quality=quality)
                    return True
                    
                new_width = int(original_width * scale)
                new_height = int(original_height * scale)
            
            # Ensure output directory exists
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            # Resize and save
            resized_img = img.resize((new_width, new_height), Image.LANCZOS)
            resized_img.save(output_path, quality=quality)
            
            logger.info(f"Resized image from {original_width}x{original_height} to {new_width}x{new_height}")
            return True
            
    except Exception as e:
        logger.error(f"Error resizing image {input_path}: {e}")
        return False