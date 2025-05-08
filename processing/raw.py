import os
import logging
from PIL import Image
import rawpy

logger = logging.getLogger(__name__)

def process_raw(raw_file_path, output_path, use_camera_wb=True, brightness=1.0, contrast=1.0, saturation=1.0, output_format='JPEG'):
    """
    Processes a RAW image file using rawpy.

    Args:
        raw_file_path (str): Path to the input RAW file (.ARW, .CR2, .NEF, etc.).
        output_path (str): Path to save the processed image (e.g., .jpg, .png, .tiff).
        use_camera_wb (bool): If True, use the white balance recorded by the camera.
        brightness (float): Brightness adjustment factor (1.0 is no change).
        contrast (float): Contrast adjustment factor (1.0 is no change). NOT directly supported by rawpy defaults, needs custom curve.
        saturation (float): Saturation adjustment factor (1.0 is no change). NOT directly supported by rawpy defaults.
        output_format (str): Desired output format ('JPEG', 'PNG', 'TIFF').

    Returns:
        bool: True if processing was successful, False otherwise.
    """
    logger.info(f"Processing RAW file: {raw_file_path}")
    try:
        with rawpy.imread(raw_file_path) as raw:
            logger.info(f"RAW Params: Size={raw.sizes}, WB={raw.camera_whitebalance}, Colors={raw.num_colors}, ColorDesc={raw.color_desc}")

            # Basic processing parameters
            # Note: rawpy's default postprocessing already applies a gamma curve,
            # brightness/contrast/saturation often require more complex handling
            # or integration with libraries like Pillow/OpenCV after initial debayering.
            # The 'brightness' param in postprocess is more like exposure compensation.
            rgb_image = raw.postprocess(
                gamma=(1, 1), # Linear gamma, apply curve later if needed
                no_auto_bright=True, # Disable auto brightness adjustment
                use_camera_wb=use_camera_wb,
                output_bps=8, # Output 8-bit per channel for standard formats
                user_black=None, # Use camera black levels
                user_sat=None, # Use camera saturation level (rawpy doesn't have simple scale factor)
                bright=brightness # This acts more like exposure adjustment
                #demosaic_algorithm=rawpy.DemosaicAlgorithm.DHT # Example: Choose demosaic alg.
            )

            # Convert to PIL Image for further processing and saving
            image = Image.fromarray(rgb_image)
            
            # Optional: Apply additional processing with PIL if needed
            # from PIL import ImageEnhance
            # if contrast != 1.0:
            #     enhancer = ImageEnhance.Contrast(image)
            #     image = enhancer.enhance(contrast)
            # if saturation != 1.0:
            #     enhancer = ImageEnhance.Color(image)  # Saturation
            #     image = enhancer.enhance(saturation)

            # Save the processed image
            save_options = {}
            if output_format.upper() == 'JPEG':
                save_options['quality'] = 95  # Set JPEG quality
            elif output_format.upper() == 'TIFF':
                save_options['compression'] = 'tiff_deflate'  # Example TIFF compression

            # Ensure output directory exists
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            image.save(output_path, format=output_format, **save_options)

            logger.info(f"Successfully processed RAW and saved to {output_path}")
            return True

    except rawpy.LibRawFileUnsupportedError:
        logger.error(f"RAW file format not supported by LibRaw: {raw_file_path}")
        return False
    except FileNotFoundError:
        logger.error(f"RAW file not found: {raw_file_path}")
        return False
    except Exception as e:
        logger.error(f"Error processing RAW file {raw_file_path}: {e}", exc_info=True)
        return False