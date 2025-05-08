import os
import logging
import subprocess
import glob
import shutil
import tempfile
from . import raw
from app.config import FFMPEG_PATH

logger = logging.getLogger(__name__)

def assemble_timelapse(image_folder, output_video_path, frame_rate=24, resolution=None, 
                       crop_rect=None, codec_settings=None):
    """
    Assembles a sequence of images into a video using ffmpeg.

    Args:
        image_folder (str): Path to the folder containing the image sequence.
        output_video_path (str): Path to save the output video file (e.g., .mp4).
        frame_rate (int): Desired frame rate for the output video.
        resolution (str): Desired output resolution (e.g., "1920x1080"). If None, uses image resolution.
        crop_rect (list): Cropping rectangle [x, y, width, height]. If None, no cropping.
        codec_settings (dict): Advanced codec settings for video encoding.

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

    # Parse codec settings
    if codec_settings is None:
        codec_settings = {
            'codec': 'libx264',
            'crf': 23,
            'preset': 'medium'
        }
        
    codec = codec_settings.get('codec', 'libx264')
    
    # Construct ffmpeg command
    cmd = [
        FFMPEG_PATH,
        '-y',  # Overwrite output file without asking
        '-framerate', str(frame_rate),
        '-pattern_type', 'glob',  # Use glob pattern matching
        '-i', glob_pattern,  # Input image sequence pattern
    ]
    
    # Add codec-specific flags
    if codec == 'libx264' or codec == 'libx265':
        # H.264/H.265 settings
        cmd.extend([
            '-c:v', codec,
            '-pix_fmt', 'yuv420p',  # Pixel format for compatibility
            '-preset', codec_settings.get('preset', 'medium'),
            '-crf', str(codec_settings.get('crf', 23)),
        ])
    elif codec == 'prores_ks':
        # ProRes settings
        profile = codec_settings.get('profile', 2)  # Standard profile by default
        profile_map = {
            0: 'proxy',     # ProRes Proxy
            1: 'lt',        # ProRes LT
            2: 'standard',  # ProRes Standard
            3: 'hq',        # ProRes HQ
            4: '4444',      # ProRes 4444
            5: '4444xq'     # ProRes 4444 XQ
        }
        profile_value = profile_map.get(profile, 'standard')
        cmd.extend([
            '-c:v', 'prores_ks',
            '-profile:v', profile_value,
            '-pix_fmt', 'yuv422p10le',  # 10-bit 4:2:2 color for ProRes
        ])
    elif codec == 'libvpx-vp9':
        # VP9 settings
        crf = codec_settings.get('crf', 30)
        speed = codec_settings.get('speed', 2)
        cmd.extend([
            '-c:v', 'libvpx-vp9',
            '-crf', str(crf),
            '-b:v', '0',  # Variable bitrate
            '-cpu-used', str(speed),  # Encoding speed (0=slowest/best, 4=default, 8=fastest)
        ])
    else:
        # Default to H.264
        cmd.extend([
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'medium',
            '-crf', '23',
        ])

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


def process_timelapse_sequence(timelapse_folder, output_dir, processing_settings=None, 
                               video_settings=None, export_images=False):
    """
    Process a timelapse sequence: applies image processing to all frames and optionally assembles video.
    
    Args:
        timelapse_folder (str): Path to the folder containing the timelapse images.
        output_dir (str): Path to save processed outputs.
        processing_settings (dict): Settings for image processing.
        video_settings (dict): Settings for video assembly.
        export_images (bool): Whether to export processed frames as images.
        
    Returns:
        dict: Results summary including success status and paths.
    """
    logger.info(f"Processing timelapse sequence: {timelapse_folder}")
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Default settings
    if processing_settings is None:
        processing_settings = {
            'brightness': 1.0,
            'contrast': 1.0,
            'saturation': 1.0,
            'use_camera_wb': True,
            'output_format': 'JPEG'
        }
        
    if video_settings is None:
        video_settings = {
            'frame_rate': 24,
            'resolution': None,
            'crop_rect': None,
            'codec_settings': None
        }
    
    # Find all images in the timelapse folder
    image_extensions = ('.jpg', '.jpeg', '.png', '.tif', '.tiff', '.arw', '.raw', '.nef', '.cr2')
    image_files = []
    
    for ext in image_extensions:
        pattern = os.path.join(timelapse_folder, f"*{ext}")
        image_files.extend(glob.glob(pattern))
        # Also check for uppercase extensions
        pattern = os.path.join(timelapse_folder, f"*{ext.upper()}")
        image_files.extend(glob.glob(pattern))
    
    # Sort images to maintain sequence order
    image_files.sort()
    
    if not image_files:
        logger.error(f"No image files found in {timelapse_folder}")
        return {
            'success': False,
            'message': "No image files found in timelapse folder",
            'progress': 100
        }
    
    # Create temporary directory for processed frames
    with tempfile.TemporaryDirectory() as temp_dir:
        # Process all images in the sequence
        batch_results = raw.process_image_batch(
            image_files, 
            temp_dir if not export_images else os.path.join(output_dir, 'frames'),
            processing_settings
        )
        
        # Check if processing was successful
        if batch_results['successful'] == 0:
            logger.error("Failed to process any images in the timelapse")
            return {
                'success': False,
                'message': "Failed to process timelapse images",
                'progress': 100
            }
        
        # Export just the processed images if requested
        if export_images and not video_settings.get('assemble_video', True):
            return {
                'success': True,
                'message': f"Exported {batch_results['successful']} processed images",
                'output_dir': os.path.join(output_dir, 'frames'),
                'processed_count': batch_results['successful'],
                'total_count': len(image_files),
                'progress': 100
            }
        
        # Generate output video path
        video_filename = os.path.basename(os.path.normpath(timelapse_folder))
        if video_settings.get('output_filename'):
            video_filename = video_settings['output_filename']
        
        video_ext = '.mp4'  # Default extension
        codec = video_settings.get('codec_settings', {}).get('codec', 'libx264')
        if codec == 'prores_ks':
            video_ext = '.mov'  # ProRes is typically in MOV container
        elif codec == 'libvpx-vp9':
            video_ext = '.webm'  # VP9 is typically in WebM container
            
        video_path = os.path.join(output_dir, f"{video_filename}{video_ext}")
        
        # Assemble the video from processed frames
        video_success = assemble_timelapse(
            temp_dir if not export_images else os.path.join(output_dir, 'frames'),
            video_path,
            frame_rate=video_settings.get('frame_rate', 24),
            resolution=video_settings.get('resolution'),
            crop_rect=video_settings.get('crop_rect'),
            codec_settings=video_settings.get('codec_settings')
        )
        
        if not video_success:
            logger.error("Failed to assemble timelapse video")
            return {
                'success': False,
                'message': "Successfully processed images but failed to create video",
                'output_dir': os.path.join(output_dir, 'frames') if export_images else None,
                'processed_count': batch_results['successful'],
                'total_count': len(image_files),
                'progress': 100
            }
    
    # Return successful result
    return {
        'success': True,
        'message': "Successfully processed timelapse and created video",
        'output_video': video_path,
        'output_dir': os.path.join(output_dir, 'frames') if export_images else None,
        'processed_count': batch_results['successful'],
        'total_count': len(image_files),
        'progress': 100
    }