import os
import logging
import rawpy
from PIL import Image
import subprocess # For calling ffmpeg

log = logging.getLogger(__name__)

# --- Configuration ---
FFMPEG_PATH = "ffmpeg" # Assumes ffmpeg is in the system PATH

# --- RAW Processing Function ---

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
    log.info(f"Processing RAW file: {raw_file_path}")
    try:
        with rawpy.imread(raw_file_path) as raw:
            log.info(f"RAW Params: Size={raw.sizes}, WB={raw.camera_whitebalance}, Colors={raw.num_colors}, ColorDesc={raw.color_desc}")

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

            # --- Post-processing with Pillow (Optional for more control) ---
            # For contrast/saturation, you'd typically use Pillow's ImageEnhance
            # from PIL import ImageEnhance
            # image = Image.fromarray(rgb_image)
            # enhancer = ImageEnhance.Contrast(image)
            # image = enhancer.enhance(contrast)
            # enhancer = ImageEnhance.Color(image) # Saturation
            # image = enhancer.enhance(saturation)
            # image.save(output_path, format=output_format, quality=95) # Example save

            # --- Direct save from rawpy (Simpler) ---
            image = Image.fromarray(rgb_image)
            save_options = {}
            if output_format.upper() == 'JPEG':
                save_options['quality'] = 95 # Set JPEG quality
            elif output_format.upper() == 'TIFF':
                 save_options['compression'] = 'tiff_deflate' # Example TIFF compression

            image.save(output_path, format=output_format, **save_options)

            log.info(f"Successfully processed RAW and saved to {output_path}")
            return True

    except rawpy.LibRawFileUnsupportedError:
        log.error(f"RAW file format not supported by LibRaw: {raw_file_path}")
        return False
    except FileNotFoundError:
        log.error(f"RAW file not found: {raw_file_path}")
        return False
    except Exception as e:
        log.error(f"Error processing RAW file {raw_file_path}: {e}", exc_info=True)
        return False


# --- Timelapse Assembly Function ---

def assemble_timelapse(image_folder, output_video_path, frame_rate=24, resolution=None, crop_rect=None):
    """
    Assembles a sequence of images into a video using ffmpeg.

    Args:
        image_folder (str): Path to the folder containing the image sequence.
        output_video_path (str): Path to save the output video file (e.g., .mp4).
        frame_rate (int): Desired frame rate for the output video.
        resolution (str): Desired output resolution (e.g., "1920x1080"). If None, uses image resolution.
        crop_rect (tuple): Cropping rectangle (x, y, width, height). If None, no cropping.

    Returns:
        bool: True if assembly was successful, False otherwise.
    """
    log.info(f"Assembling timelapse from folder: {image_folder}")
    log.info(f"Output: {output_video_path}, FPS: {frame_rate}, Resolution: {resolution}, Crop: {crop_rect}")

    # Find image files (assuming common extensions, sorted numerically/alphabetically)
    allowed_extensions = ('.jpg', '.jpeg', '.png', '.tif', '.tiff')
    try:
        images = sorted([f for f in os.listdir(image_folder)
                         if os.path.isfile(os.path.join(image_folder, f)) and f.lower().endswith(allowed_extensions)])
        if not images:
            log.error(f"No suitable image files found in {image_folder}")
            return False
        # Create a temporary file list or use pattern matching for ffmpeg
        # Using pattern matching is generally safer and handles large numbers of files better
        # Assuming files are named sequentially (e.g., img0001.jpg, img0002.jpg)
        first_image_path = os.path.join(image_folder, images[0])
        # Determine image format/pattern (e.g., %04d for img0001) - this is tricky!
        # A simpler approach for now: use glob pattern if filenames are consistent
        base, ext = os.path.splitext(images[0])
        pattern = f"{base[:-len(str(1))]}{'%'}{len(str(len(images)))}d{ext}" # Heuristic guess
        # A safer bet might be to use glob pattern
        glob_pattern = os.path.join(image_folder, f"*{ext}")
        log.info(f"Using image pattern for ffmpeg (best guess): {glob_pattern}")

    except Exception as e:
         log.error(f"Error listing or processing image files in {image_folder}: {e}")
         return False


    # Construct ffmpeg command
    cmd = [
        FFMPEG_PATH,
        '-y',  # Overwrite output file without asking
        '-framerate', str(frame_rate),
        '-pattern_type', 'glob', # Use glob pattern matching
        '-i', glob_pattern, # Input image sequence pattern
        '-c:v', 'libx264',  # Video codec (H.264 is widely compatible)
        '-pix_fmt', 'yuv420p',  # Pixel format for compatibility
        '-preset', 'medium', # Encoding speed/quality trade-off (e.g., slow, medium, fast)
        '-crf', '23', # Constant Rate Factor (lower means better quality, larger file size, 18-28 is common)
    ]

    # Add video filters (cropping, scaling) if needed
    video_filters = []
    if crop_rect:
        x, y, w, h = crop_rect
        video_filters.append(f"crop={w}:{h}:{x}:{y}")
    if resolution:
         video_filters.append(f"scale={resolution}")

    if video_filters:
         cmd.extend(['-vf', ",".join(video_filters)])

    cmd.append(output_video_path) # Output file path

    log.info(f"Executing ffmpeg command: {' '.join(cmd)}")

    try:
        # Run ffmpeg
        process = subprocess.run(cmd, capture_output=True, text=True, check=True)
        log.info("ffmpeg stdout:\n" + process.stdout)
        log.info("ffmpeg stderr:\n" + process.stderr) # ffmpeg often logs progress to stderr
        log.info(f"Timelapse video successfully assembled: {output_video_path}")
        return True
    except FileNotFoundError:
        log.error(f"ffmpeg command not found at '{FFMPEG_PATH}'. Is ffmpeg installed and in the system PATH?")
        return False
    except subprocess.CalledProcessError as e:
        log.error(f"ffmpeg command failed with exit code {e.returncode}")
        log.error("ffmpeg stdout:\n" + e.stdout)
        log.error("ffmpeg stderr:\n" + e.stderr)
        return False
    except Exception as e:
        log.error(f"An unexpected error occurred during ffmpeg execution: {e}", exc_info=True)
        return False

# --- Placeholder for Single Image Processing Endpoint Logic ---
def handle_single_image_processing(params):
    # 1. Get input file path from params
    # 2. Get processing settings (brightness, format, etc.) from params
    # 3. Generate output path
    # 4. Call process_raw()
    # 5. Return result (path to processed file or error)
    log.warning("handle_single_image_processing not implemented.")
    return None

# --- Placeholder for Timelapse Processing Endpoint Logic ---
def handle_timelapse_processing(params):
    # 1. Get input folder path from params
    # 2. Get processing settings (apply to all RAWs?)
    # 3. Get assembly settings (fps, resolution, crop)
    # 4. Optional: Process all RAWs in the folder to JPEGs in a temp dir
    # 5. Call assemble_timelapse() using processed images or original JPEGs
    # 6. Return result (path to video file or error)
    log.warning("handle_timelapse_processing not implemented.")
    return None
