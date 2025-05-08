import os
import logging
import numpy as np
from PIL import Image, ImageEnhance
import rawpy

logger = logging.getLogger(__name__)

def process_raw(raw_file_path, output_path, use_camera_wb=True, brightness=1.0, 
                contrast=1.0, saturation=1.0, highlight_recovery=0, 
                color_temp=5500, tint=0, output_format='JPEG'):
    """
    Processes a RAW image file using rawpy with enhanced controls.

    Args:
        raw_file_path (str): Path to the input RAW file (.ARW, .CR2, .NEF, etc.).
        output_path (str): Path to save the processed image (e.g., .jpg, .png, .tiff).
        use_camera_wb (bool): If True, use the white balance recorded by the camera.
        brightness (float): Brightness adjustment factor (1.0 is no change).
        contrast (float): Contrast adjustment factor (1.0 is no change).
        saturation (float): Saturation adjustment factor (1.0 is no change).
        highlight_recovery (int): Amount of highlight recovery (0-100).
        color_temp (int): Color temperature in Kelvin (ignored if use_camera_wb=True).
        tint (int): Tint adjustment (-100 to +100, 0 is neutral).
        output_format (str): Desired output format ('JPEG', 'PNG', 'TIFF').

    Returns:
        bool: True if processing was successful, False otherwise.
    """
    logger.info(f"Processing RAW file: {raw_file_path}")
    
    # Ensure input file is a raw file or common image format
    ext = os.path.splitext(raw_file_path)[1].lower()
    is_raw = ext in ('.arw', '.raw', '.nef', '.cr2', '.dng')
    is_common_image = ext in ('.jpg', '.jpeg', '.png', '.tif', '.tiff')
    
    if not (is_raw or is_common_image):
        logger.error(f"Unsupported file format: {ext}")
        return False
    
    try:
        if is_raw:
            # Process raw file
            processed_image = _process_raw_file(
                raw_file_path, use_camera_wb, brightness, 
                highlight_recovery, color_temp, tint
            )
        else:
            # Process common image format with PIL
            processed_image = Image.open(raw_file_path)
        
        # Apply post-processing with PIL regardless of input type
        processed_image = _apply_pil_adjustments(
            processed_image, brightness, contrast, saturation
        )
        
        # Prepare for saving
        save_options = {}
        if output_format.upper() == 'JPEG':
            save_options['quality'] = 95  # Set JPEG quality
            if processed_image.mode != 'RGB':
                processed_image = processed_image.convert('RGB')
        elif output_format.upper() == 'PNG':
            save_options['compress_level'] = 6  # Medium compression
        elif output_format.upper() == 'TIFF':
            save_options['compression'] = 'tiff_deflate'
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Save the processed image
        processed_image.save(output_path, format=output_format, **save_options)
        logger.info(f"Successfully processed image and saved to {output_path}")
        return True
    
    except Exception as e:
        logger.error(f"Error processing file {raw_file_path}: {e}", exc_info=True)
        return False


def _process_raw_file(raw_file_path, use_camera_wb, brightness, highlight_recovery, color_temp, tint):
    """Process a RAW file using rawpy with detailed controls."""
    with rawpy.imread(raw_file_path) as raw:
        logger.info(f"RAW Params: Size={raw.sizes}, WB={raw.camera_whitebalance}, "
                   f"Colors={raw.num_colors}, ColorDesc={raw.color_desc}")
        
        # Configure rawpy postprocessing options
        # Set up white balance
        if use_camera_wb:
            # Use camera's white balance
            user_wb = None
        else:
            # Manual white balance based on color temperature and tint
            # This is a simplified approximation
            # Temperature: lower = cooler/blue, higher = warmer/yellow
            # Tint: negative = green, positive = magenta
            
            # Convert temperature to RGB multipliers (simplified)
            temp_factor = max(0.1, min(2.0, color_temp / 5500))
            
            # Scale red based on temperature
            r_mult = 1.0
            if temp_factor < 1.0:  # Cooler than neutral
                r_mult = max(0.5, temp_factor)  # Reduce red
            else:  # Warmer than neutral
                r_mult = min(2.0, temp_factor)  # Increase red
                
            # Scale blue inversely to temperature
            b_mult = 1.0
            if temp_factor < 1.0:  # Cooler than neutral
                b_mult = min(2.0, 1.0 / temp_factor)  # Increase blue
            else:  # Warmer than neutral
                b_mult = max(0.5, 1.0 / temp_factor)  # Reduce blue
                
            # Apply tint by adjusting green channel
            tint_factor = 1.0 + (tint / 200.0)  # Scale to approx. ±0.5
            g_mult = max(0.5, min(2.0, tint_factor))
            
            # Normalize multipliers so the green channel is 1.0
            user_wb = [r_mult/g_mult, 1.0, b_mult/g_mult, 1.0]
        
        # Configure highlight recovery
        highlight_mode = rawpy.HighlightMode.Clip  # Default
        if highlight_recovery > 0:
            # Map 0-100 scale to appropriate highlight recovery mode
            if highlight_recovery > 75:
                highlight_mode = rawpy.HighlightMode.Reconstruct
            elif highlight_recovery > 50:
                highlight_mode = rawpy.HighlightMode.ReconstructAndBlend
            elif highlight_recovery > 25:
                highlight_mode = rawpy.HighlightMode.Blend
            else:
                highlight_mode = rawpy.HighlightMode.Color
        
        # Apply basic brightness (exposure compensation)
        bright_val = max(0.25, min(4.0, brightness))
        
        # Process the raw image
        rgb_image = raw.postprocess(
            gamma=(1, 1),  # Linear gamma, we'll apply curve later with PIL
            no_auto_bright=True,  # Disable auto brightness adjustment
            use_camera_wb=use_camera_wb,
            user_wb=user_wb,
            output_bps=16,  # 16-bit for better quality before PIL processing
            bright=bright_val,
            highlight_mode=highlight_mode,
            demosaic_algorithm=rawpy.DemosaicAlgorithm.AHD  # Higher quality demosaic
        )
        
        # Convert to PIL Image
        # Convert 16-bit to 8-bit for PIL compatibility
        rgb_image_8bit = (rgb_image >> 8).astype(np.uint8)
        image = Image.fromarray(rgb_image_8bit)
        return image


def _apply_pil_adjustments(image, brightness, contrast, saturation):
    """Apply additional PIL adjustments for fine-tuning the image."""
    # Make sure image is in RGB mode for consistent processing
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Apply brightness adjustment if needed
    if brightness != 1.0:
        enhancer = ImageEnhance.Brightness(image)
        image = enhancer.enhance(brightness)
    
    # Apply contrast adjustment
    if contrast != 1.0:
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(contrast)
    
    # Apply saturation adjustment
    if saturation != 1.0:
        enhancer = ImageEnhance.Color(image)
        image = enhancer.enhance(saturation)
    
    return image


def process_image_batch(image_paths, output_dir, settings):
    """
    Process a batch of images with the same settings.
    
    Args:
        image_paths (list): List of image paths to process.
        output_dir (str): Directory to save processed images.
        settings (dict): Processing settings to apply to all images.
        
    Returns:
        dict: Summary of processing results.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    results = {
        'total': len(image_paths),
        'successful': 0,
        'failed': 0,
        'processed_files': []
    }
    
    for i, image_path in enumerate(image_paths):
        try:
            # Generate output filename
            base_name = os.path.basename(image_path)
            name, ext = os.path.splitext(base_name)
            output_format = settings.get('output_format', 'JPEG')
            output_ext = '.jpg' if output_format == 'JPEG' else f'.{output_format.lower()}'
            output_path = os.path.join(output_dir, f"{name}_processed{output_ext}")
            
            # Process the image
            success = process_raw(
                image_path, 
                output_path,
                use_camera_wb=settings.get('use_camera_wb', True),
                brightness=settings.get('brightness', 1.0),
                contrast=settings.get('contrast', 1.0),
                saturation=settings.get('saturation', 1.0),
                highlight_recovery=settings.get('highlight_recovery', 0),
                color_temp=settings.get('color_temp', 5500),
                tint=settings.get('tint', 0),
                output_format=output_format
            )
            
            if success:
                results['successful'] += 1
                results['processed_files'].append(output_path)
            else:
                results['failed'] += 1
                
            # Calculate progress as a percentage
            results['progress'] = int(100 * (i + 1) / len(image_paths))
            
        except Exception as e:
            logger.error(f"Error processing image {image_path}: {e}", exc_info=True)
            results['failed'] += 1
    
    results['progress'] = 100  # Mark as complete
    return results