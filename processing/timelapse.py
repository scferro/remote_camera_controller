import os
import logging
import subprocess
from app.config import FFMPEG_PATH

logger = logging.getLogger(__name__)

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
    logger.info(f"Assembling timelapse from folder: {image_folder}")
    logger.info(f"Output: {output_video_path}, FPS: {frame_rate}, Resolution: {resolution}, Crop: {crop_rect}")

    # Find image files (assuming common extensions, sorted numerically/alphabetically)
    allowed_extensions = ('.jpg', '.jpeg', '.png', '.tif', '.tiff')
    try:
        images = sorted([f for f in os.listdir(image_folder)
                        if os.path.isfile(os.path.join(image_folder, f)) 
                        and f.lower().endswith(allowed_extensions)])
        
        if not images:
            logger.error(f"No suitable image files found in {image_folder}")
            return False
            
        # Get file extension from first image
        _, ext = os.path.splitext(images[0])
        # Use glob pattern for input
        glob_pattern = os.path.join(image_folder, f"*{ext}")
        logger.info(f"Using image pattern for ffmpeg: {glob_pattern}")

    except Exception as e:
        logger.error(f"Error listing or processing image files in {image_folder}: {e}")
        return False

    # Construct ffmpeg command
    cmd = [
        FFMPEG_PATH,
        '-y',  # Overwrite output file without asking
        '-framerate', str(frame_rate),
        '-pattern_type', 'glob',  # Use glob pattern matching
        '-i', glob_pattern,  # Input image sequence pattern
        '-c:v', 'libx264',  # Video codec (H.264 is widely compatible)
        '-pix_fmt', 'yuv420p',  # Pixel format for compatibility
        '-preset', 'medium',  # Encoding speed/quality trade-off (e.g., slow, medium, fast)
        '-crf', '23',  # Constant Rate Factor (lower means better quality, larger file size, 18-28 is common)
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

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_video_path), exist_ok=True)
    
    cmd.append(output_video_path)  # Output file path

    logger.info(f"Executing ffmpeg command: {' '.join(cmd)}")

    try:
        # Run ffmpeg
        process = subprocess.run(cmd, capture_output=True, text=True, check=True)
        logger.info("ffmpeg stdout:\n" + process.stdout)
        logger.info("ffmpeg stderr:\n" + process.stderr)  # ffmpeg often logs progress to stderr
        logger.info(f"Timelapse video successfully assembled: {output_video_path}")
        return True
    except FileNotFoundError:
        logger.error(f"ffmpeg command not found at '{FFMPEG_PATH}'. Is ffmpeg installed and in the system PATH?")
        return False
    except subprocess.CalledProcessError as e:
        logger.error(f"ffmpeg command failed with exit code {e.returncode}")
        logger.error("ffmpeg stdout:\n" + e.stdout)
        logger.error("ffmpeg stderr:\n" + e.stderr)
        return False
    except Exception as e:
        logger.error(f"An unexpected error occurred during ffmpeg execution: {e}", exc_info=True)
        return False