import os
import logging
import shutil
import json
from datetime import datetime
import subprocess
from PIL import Image
import numpy as np
from .image_editor import ImageEditor

logger = logging.getLogger(__name__)

class TimelapseEditor:
    """
    Class for editing and managing timelapse sequences.
    Provides tools for scrubbing, frame extraction, batch editing, and video assembly.
    """
    
    def __init__(self, sequence_path):
        """
        Initialize the timelapse editor with a sequence directory.
        
        Args:
            sequence_path (str): Path to the timelapse sequence directory
        """
        self.sequence_path = sequence_path
        self.frames = []
        self.frame_count = 0
        self.preview_path = None
        self.metadata = {}
        self.edited_frames_path = None
        
        # Initialize
        self._scan_sequence()
    
    def _scan_sequence(self):
        """Scan the sequence directory and catalog available frames."""
        try:
            if not os.path.isdir(self.sequence_path):
                logger.error(f"Sequence path not found or not a directory: {self.sequence_path}")
                return False
            
            # Find all image files in the directory
            image_extensions = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.arw', '.cr2', '.nef']
            self.frames = []
            
            for filename in sorted(os.listdir(self.sequence_path)):
                file_path = os.path.join(self.sequence_path, filename)
                if os.path.isfile(file_path) and os.path.splitext(filename)[1].lower() in image_extensions:
                    self.frames.append(file_path)
            
            self.frame_count = len(self.frames)
            
            # Extract sequence metadata
            folder_name = os.path.basename(self.sequence_path)
            sequence_info = {
                'name': folder_name,
                'path': self.sequence_path,
                'frame_count': self.frame_count,
                'date_captured': self._extract_date_from_folder_name(folder_name),
                'first_frame': self.frames[0] if self.frames else None,
                'last_frame': self.frames[-1] if self.frames else None,
            }
            
            # Save to metadata
            self.metadata = sequence_info
            
            logger.info(f"Scanned sequence {folder_name}: {self.frame_count} frames found")
            return True
        except Exception as e:
            logger.error(f"Error scanning sequence directory {self.sequence_path}: {e}", exc_info=True)
            return False
    
    def _extract_date_from_folder_name(self, folder_name):
        """Extract date from folder name if it follows the expected format."""
        try:
            # Expected format: YYYYMMDD_HHMMSS_timelapse...
            if len(folder_name) >= 15 and folder_name[8] == '_':
                date_str = folder_name[:15]
                return datetime.strptime(date_str, "%Y%m%d_%H%M%S").strftime("%Y-%m-%d %H:%M:%S")
        except:
            pass
        
        return None
    
    def get_metadata(self):
        """
        Get metadata about the timelapse sequence.
        
        Returns:
            dict: Sequence metadata
        """
        return self.metadata
    
    def get_frame_path(self, index):
        """
        Get the path to a specific frame.
        
        Args:
            index (int): Frame index (0-based)
            
        Returns:
            str: Path to the frame or None if invalid index
        """
        if 0 <= index < self.frame_count:
            return self.frames[index]
        else:
            logger.warning(f"Requested invalid frame index: {index}, available: 0-{self.frame_count-1}")
            return None
    
    def get_frame_preview(self, index, max_size=800):
        """
        Get a preview of a specific frame.
        
        Args:
            index (int): Frame index (0-based)
            max_size (int): Maximum dimension for the preview
            
        Returns:
            PIL.Image: Frame preview or None on error
        """
        frame_path = self.get_frame_path(index)
        if not frame_path:
            return None
        
        try:
            # Use the ImageEditor to get the preview
            editor = ImageEditor(frame_path)
            return editor.get_preview(max_size)
        except Exception as e:
            logger.error(f"Error generating preview for frame {index}: {e}", exc_info=True)
            return None
    
    def generate_sequence_preview(self, output_dir, sample_interval=10, max_size=300):
        """
        Generate a series of preview thumbnails for the sequence.
        
        Args:
            output_dir (str): Directory to save previews
            sample_interval (int): Take every Nth frame
            max_size (int): Maximum dimension for thumbnails
            
        Returns:
            list: Paths to generated previews
        """
        if self.frame_count == 0:
            return []
        
        try:
            # Create output directory if it doesn't exist
            os.makedirs(output_dir, exist_ok=True)
            
            preview_paths = []
            for i in range(0, self.frame_count, sample_interval):
                preview = self.get_frame_preview(i, max_size)
                if preview:
                    output_path = os.path.join(output_dir, f"preview_{i:04d}.jpg")
                    preview.save(output_path, "JPEG", quality=80)
                    preview_paths.append(output_path)
            
            # Save the preview path for later use
            self.preview_path = output_dir
            
            logger.info(f"Generated {len(preview_paths)} preview thumbnails")
            return preview_paths
        except Exception as e:
            logger.error(f"Error generating sequence previews: {e}", exc_info=True)
            return []
    
    def extract_frame(self, index, output_path=None):
        """
        Extract and save a specific frame.
        
        Args:
            index (int): Frame index (0-based)
            output_path (str): Path to save the frame (or None to auto-generate)
            
        Returns:
            str: Path to the saved frame or None on error
        """
        frame_path = self.get_frame_path(index)
        if not frame_path:
            return None
        
        try:
            # Generate output path if not provided
            if output_path is None:
                output_dir = os.path.join(
                    os.path.dirname(self.sequence_path), 
                    f"{os.path.basename(self.sequence_path)}_extracted"
                )
                os.makedirs(output_dir, exist_ok=True)
                output_path = os.path.join(output_dir, f"frame_{index:04d}.jpg")
            
            # Copy the frame (for non-RAW) or convert (for RAW)
            if os.path.splitext(frame_path)[1].lower() in ['.jpg', '.jpeg', '.png']:
                shutil.copy2(frame_path, output_path)
            else:
                # Use ImageEditor to convert RAW to JPEG
                editor = ImageEditor(frame_path)
                editor.save(output_path, format='JPEG')
            
            logger.info(f"Extracted frame {index} to {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"Error extracting frame {index}: {e}", exc_info=True)
            return None
    
    def batch_edit_frames(self, edit_params, output_dir=None, start_idx=0, end_idx=None, interval=1):
        """
        Apply the same edits to multiple frames in the sequence.
        
        Args:
            edit_params (dict): Dictionary of edit parameters
            output_dir (str): Directory to save edited frames (or None to auto-generate)
            start_idx (int): Starting frame index
            end_idx (int): Ending frame index (or None for all frames)
            interval (int): Process every Nth frame
            
        Returns:
            str: Path to the output directory or None on error
        """
        if self.frame_count == 0:
            return None
        
        # Set default end index if not specified
        if end_idx is None or end_idx >= self.frame_count:
            end_idx = self.frame_count - 1
        
        try:
            # Generate output directory if not provided
            if output_dir is None:
                output_dir = os.path.join(
                    os.path.dirname(self.sequence_path), 
                    f"{os.path.basename(self.sequence_path)}_edited"
                )
            
            # Create output directory
            os.makedirs(output_dir, exist_ok=True)
            
            # Process frames
            processed_count = 0
            for i in range(start_idx, end_idx + 1, interval):
                frame_path = self.get_frame_path(i)
                if frame_path:
                    # Create output path
                    output_path = os.path.join(output_dir, f"frame_{i:04d}.jpg")
                    
                    # Load the frame with ImageEditor
                    editor = ImageEditor(frame_path)
                    
                    # Apply edits
                    if 'crop' in edit_params:
                        left, top, right, bottom = edit_params['crop']
                        editor.crop(left, top, right, bottom)
                    
                    if 'brightness' in edit_params:
                        editor.adjust_brightness(edit_params['brightness'])
                    
                    if 'contrast' in edit_params:
                        editor.adjust_contrast(edit_params['contrast'])
                    
                    if 'saturation' in edit_params:
                        editor.adjust_saturation(edit_params['saturation'])
                    
                    if 'rotate' in edit_params:
                        angle = edit_params['rotate']
                        editor.rotate(angle)
                    
                    if 'resize' in edit_params:
                        width, height = edit_params['resize']
                        editor.resize(width, height)
                    
                    if 'filter' in edit_params:
                        editor.apply_filter(edit_params['filter'])
                    
                    # Save the edited frame
                    editor.save(output_path, format='JPEG')
                    processed_count += 1
            
            # Save the edited frames path
            self.edited_frames_path = output_dir
            
            logger.info(f"Batch edited {processed_count} frames to {output_dir}")
            return output_dir
        except Exception as e:
            logger.error(f"Error batch editing frames: {e}", exc_info=True)
            return None
    
    def assemble_video(self, output_path, fps=24, format='mp4', quality='high', use_edited=True, resize=None, crop_rect=None):
        """
        Assemble frames into a video using ffmpeg.
        
        Args:
            output_path (str): Path for the output video
            fps (int): Frames per second
            format (str): Output format ('mp4', 'mov', etc.)
            quality (str): Quality preset ('high', 'medium', 'low')
            use_edited (bool): Use the edited frames if available
            resize (tuple): Optional (width, height) to resize frames
            crop_rect (tuple): Optional (left, top, right, bottom) to crop frames
            
        Returns:
            bool: Success status
        """
        try:
            # Determine the frames directory
            if use_edited and self.edited_frames_path and os.path.isdir(self.edited_frames_path):
                frames_dir = self.edited_frames_path
                frame_pattern = os.path.join(frames_dir, "frame_%04d.jpg")
            else:
                # Original frames may be scattered or named differently - need to ensure sequential naming
                # Create a temporary directory with sequential frames
                temp_dir = os.path.join(
                    os.path.dirname(self.sequence_path), 
                    f"{os.path.basename(self.sequence_path)}_temp_frames"
                )
                os.makedirs(temp_dir, exist_ok=True)
                
                # Copy/convert frames to temp directory
                for i, frame_path in enumerate(self.frames):
                    output_frame = os.path.join(temp_dir, f"frame_{i:04d}.jpg")
                    if os.path.splitext(frame_path)[1].lower() in ['.jpg', '.jpeg', '.png']:
                        shutil.copy2(frame_path, output_frame)
                    else:
                        # Convert RAW to JPEG
                        editor = ImageEditor(frame_path)
                        editor.save(output_frame, format='JPEG')
                
                frames_dir = temp_dir
                frame_pattern = os.path.join(frames_dir, "frame_%04d.jpg")
            
            # Set ffmpeg quality preset
            if quality == 'high':
                preset = 'slow'
                crf = '18'
            elif quality == 'medium':
                preset = 'medium'
                crf = '23'
            else:  # low
                preset = 'fast'
                crf = '28'
            
            # Ensure output directory exists
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            
            # Build ffmpeg command
            cmd = [
                'ffmpeg',
                '-y',  # Overwrite output without asking
                '-framerate', str(fps),
                '-i', frame_pattern,
                '-c:v', 'libx264',
                '-preset', preset,
                '-crf', crf,
                '-pix_fmt', 'yuv420p'
            ]
            
            # Add filters if needed
            filter_params = []
            
            if crop_rect:
                left, top, right, bottom = crop_rect
                width = right - left
                height = bottom - top
                filter_params.append(f"crop={width}:{height}:{left}:{top}")
            
            if resize:
                width, height = resize
                filter_params.append(f"scale={width}:{height}")
            
            if filter_params:
                filter_string = ",".join(filter_params)
                cmd.extend(['-vf', filter_string])
            
            # Add output path
            cmd.append(output_path)
            
            # Execute ffmpeg
            logger.info(f"Running ffmpeg command: {' '.join(cmd)}")
            process = subprocess.run(cmd, capture_output=True, text=True)
            
            if process.returncode != 0:
                logger.error(f"ffmpeg error: {process.stderr}")
                return False
            
            logger.info(f"Successfully assembled video: {output_path}")
            
            # Clean up temp directory if we created one
            if frames_dir.endswith('_temp_frames') and os.path.exists(frames_dir):
                shutil.rmtree(frames_dir)
            
            return True
        except Exception as e:
            logger.error(f"Error assembling video: {e}", exc_info=True)
            return False
    
    def save_project(self, output_path):
        """
        Save the project state to a JSON file.
        
        Args:
            output_path (str): Path to save the project file
            
        Returns:
            bool: Success status
        """
        try:
            project_data = {
                'sequence_path': self.sequence_path,
                'frame_count': self.frame_count,
                'metadata': self.metadata,
                'edited_frames_path': self.edited_frames_path,
                'preview_path': self.preview_path,
                'timestamp': datetime.now().isoformat()
            }
            
            with open(output_path, 'w') as f:
                json.dump(project_data, f, indent=2)
                
            logger.info(f"Saved project state to {output_path}")
            return True
        except Exception as e:
            logger.error(f"Error saving project state: {e}", exc_info=True)
            return False
    
    @classmethod
    def load_project(cls, project_path):
        """
        Load a timelapse project from a saved state.
        
        Args:
            project_path (str): Path to the project file
            
        Returns:
            TimelapseEditor: Loaded project or None on error
        """
        try:
            with open(project_path, 'r') as f:
                project_data = json.load(f)
            
            # Ensure the sequence path exists
            sequence_path = project_data.get('sequence_path')
            if not os.path.isdir(sequence_path):
                logger.error(f"Sequence directory not found: {sequence_path}")
                return None
            
            # Create a new instance and update its state
            editor = cls(sequence_path)
            editor.edited_frames_path = project_data.get('edited_frames_path')
            editor.preview_path = project_data.get('preview_path')
            
            logger.info(f"Loaded project from {project_path}")
            return editor
        except Exception as e:
            logger.error(f"Error loading project {project_path}: {e}", exc_info=True)
            return None