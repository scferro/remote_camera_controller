import os
import logging
from PIL import Image, ImageEnhance, ImageFilter
import rawpy
import numpy as np

logger = logging.getLogger(__name__)

class ImageEditor:
    """
    Class for handling image editing operations on both RAW and regular image files.
    """
    
    def __init__(self, input_path):
        """
        Initialize the image editor with an input file.
        
        Args:
            input_path (str): Path to the input image file
        """
        self.input_path = input_path
        self.image = None
        self.original_image = None
        self.is_raw = self._check_if_raw()
        self.metadata = {}
        self.edit_history = []
        
        # Load the image
        self.load_image()
    
    def _check_if_raw(self):
        """Check if the input file is a RAW format based on extension."""
        raw_extensions = ['.arw', '.cr2', '.crw', '.dng', '.nef', '.orf', '.pef', '.raf', '.raw', '.rw2', '.srw']
        ext = os.path.splitext(self.input_path)[1].lower()
        return ext in raw_extensions
    
    def load_image(self):
        """Load the image from the input path."""
        try:
            if self.is_raw:
                # Use rawpy to load RAW file
                with rawpy.imread(self.input_path) as raw:
                    rgb = raw.postprocess(
                        use_camera_wb=True,
                        no_auto_bright=False,
                        output_bps=8
                    )
                    self.image = Image.fromarray(rgb)
                    self.original_image = self.image.copy()
                    self.metadata['raw_sizes'] = raw.sizes
                    self.metadata['raw_color_desc'] = raw.color_desc
            else:
                # Use PIL to load regular image
                self.image = Image.open(self.input_path)
                self.original_image = self.image.copy()
                
            # Store basic metadata
            self.metadata['format'] = self.image.format
            self.metadata['mode'] = self.image.mode
            self.metadata['size'] = self.image.size
            
            logger.info(f"Successfully loaded image: {self.input_path}")
            return True
        except Exception as e:
            logger.error(f"Error loading image {self.input_path}: {e}", exc_info=True)
            return False
    
    def get_preview(self, max_size=800):
        """
        Get a resized preview of the current image state.
        
        Args:
            max_size (int): Maximum dimension (width or height) for the preview
            
        Returns:
            PIL.Image: Resized preview image
        """
        if not self.image:
            return None
            
        # Calculate new dimensions while maintaining aspect ratio
        width, height = self.image.size
        if width > height:
            new_width = min(width, max_size)
            new_height = int(height * (new_width / width))
        else:
            new_height = min(height, max_size)
            new_width = int(width * (new_height / height))
            
        # Return a resized copy
        return self.image.resize((new_width, new_height), Image.LANCZOS)
    
    def crop(self, left, top, right, bottom):
        """
        Crop the current image.
        
        Args:
            left, top, right, bottom (int): Crop coordinates
            
        Returns:
            bool: Success status
        """
        try:
            if not self.image:
                return False
                
            # Store the action for history
            self.edit_history.append(('crop', (left, top, right, bottom)))
            
            # Perform the crop
            self.image = self.image.crop((left, top, right, bottom))
            return True
        except Exception as e:
            logger.error(f"Error cropping image: {e}", exc_info=True)
            return False
    
    def adjust_brightness(self, factor):
        """
        Adjust image brightness.
        
        Args:
            factor (float): Brightness factor (0.0-2.0, 1.0 is original)
            
        Returns:
            bool: Success status
        """
        try:
            if not self.image:
                return False
                
            # Store the action for history
            self.edit_history.append(('brightness', factor))
            
            # Apply brightness adjustment
            enhancer = ImageEnhance.Brightness(self.image)
            self.image = enhancer.enhance(factor)
            return True
        except Exception as e:
            logger.error(f"Error adjusting brightness: {e}", exc_info=True)
            return False
    
    def adjust_contrast(self, factor):
        """
        Adjust image contrast.
        
        Args:
            factor (float): Contrast factor (0.0-2.0, 1.0 is original)
            
        Returns:
            bool: Success status
        """
        try:
            if not self.image:
                return False
                
            # Store the action for history
            self.edit_history.append(('contrast', factor))
            
            # Apply contrast adjustment
            enhancer = ImageEnhance.Contrast(self.image)
            self.image = enhancer.enhance(factor)
            return True
        except Exception as e:
            logger.error(f"Error adjusting contrast: {e}", exc_info=True)
            return False
    
    def adjust_saturation(self, factor):
        """
        Adjust image saturation.
        
        Args:
            factor (float): Saturation factor (0.0-2.0, 1.0 is original)
            
        Returns:
            bool: Success status
        """
        try:
            if not self.image:
                return False
                
            # Store the action for history
            self.edit_history.append(('saturation', factor))
            
            # Apply saturation adjustment
            enhancer = ImageEnhance.Color(self.image)
            self.image = enhancer.enhance(factor)
            return True
        except Exception as e:
            logger.error(f"Error adjusting saturation: {e}", exc_info=True)
            return False
    
    def rotate(self, angle, expand=True):
        """
        Rotate the image.
        
        Args:
            angle (float): Rotation angle in degrees
            expand (bool): Whether to expand the output to fit the rotated image
            
        Returns:
            bool: Success status
        """
        try:
            if not self.image:
                return False
                
            # Store the action for history
            self.edit_history.append(('rotate', (angle, expand)))
            
            # Apply rotation
            self.image = self.image.rotate(angle, expand=expand, resample=Image.BICUBIC)
            return True
        except Exception as e:
            logger.error(f"Error rotating image: {e}", exc_info=True)
            return False
    
    def resize(self, width, height, maintain_aspect=True):
        """
        Resize the image.
        
        Args:
            width (int): Target width
            height (int): Target height
            maintain_aspect (bool): Whether to maintain aspect ratio
            
        Returns:
            bool: Success status
        """
        try:
            if not self.image:
                return False
                
            # Calculate new dimensions if maintaining aspect ratio
            if maintain_aspect:
                orig_width, orig_height = self.image.size
                ratio = min(width / orig_width, height / orig_height)
                new_width = int(orig_width * ratio)
                new_height = int(orig_height * ratio)
            else:
                new_width, new_height = width, height
                
            # Store the action for history
            self.edit_history.append(('resize', (new_width, new_height)))
            
            # Apply resize
            self.image = self.image.resize((new_width, new_height), Image.LANCZOS)
            return True
        except Exception as e:
            logger.error(f"Error resizing image: {e}", exc_info=True)
            return False
    
    def apply_filter(self, filter_type):
        """
        Apply a filter to the image.
        
        Args:
            filter_type (str): Filter type ('blur', 'sharpen', 'contour', etc.)
            
        Returns:
            bool: Success status
        """
        try:
            if not self.image:
                return False
                
            # Store the action for history
            self.edit_history.append(('filter', filter_type))
            
            # Apply the appropriate filter
            if filter_type == 'blur':
                self.image = self.image.filter(ImageFilter.BLUR)
            elif filter_type == 'sharpen':
                self.image = self.image.filter(ImageFilter.SHARPEN)
            elif filter_type == 'contour':
                self.image = self.image.filter(ImageFilter.CONTOUR)
            elif filter_type == 'edge_enhance':
                self.image = self.image.filter(ImageFilter.EDGE_ENHANCE)
            elif filter_type == 'emboss':
                self.image = self.image.filter(ImageFilter.EMBOSS)
            elif filter_type == 'smooth':
                self.image = self.image.filter(ImageFilter.SMOOTH)
            elif filter_type == 'detail':
                self.image = self.image.filter(ImageFilter.DETAIL)
            else:
                logger.warning(f"Unknown filter type: {filter_type}")
                return False
                
            return True
        except Exception as e:
            logger.error(f"Error applying filter {filter_type}: {e}", exc_info=True)
            return False
    
    def reset(self):
        """
        Reset to the original image state.
        
        Returns:
            bool: Success status
        """
        try:
            if not self.original_image:
                return False
                
            # Clear edit history
            self.edit_history = []
            
            # Reset to original
            self.image = self.original_image.copy()
            return True
        except Exception as e:
            logger.error(f"Error resetting image: {e}", exc_info=True)
            return False
    
    def undo(self):
        """
        Undo the last edit operation.
        
        Returns:
            bool: Success status
        """
        try:
            if not self.edit_history:
                return False
                
            # Reset and replay all actions except the last one
            self.image = self.original_image.copy()
            history = self.edit_history[:-1]
            self.edit_history = []
            
            # Replay all actions
            for action, params in history:
                if action == 'crop':
                    self.crop(*params)
                elif action == 'brightness':
                    self.adjust_brightness(params)
                elif action == 'contrast':
                    self.adjust_contrast(params)
                elif action == 'saturation':
                    self.adjust_saturation(params)
                elif action == 'rotate':
                    self.rotate(*params)
                elif action == 'resize':
                    self.resize(*params)
                elif action == 'filter':
                    self.apply_filter(params)
            
            return True
        except Exception as e:
            logger.error(f"Error undoing last action: {e}", exc_info=True)
            return False
    
    def save(self, output_path, format=None, quality=95):
        """
        Save the edited image.
        
        Args:
            output_path (str): Path to save the output image
            format (str): Output format (JPEG, PNG, etc.)
            quality (int): JPEG quality (1-100)
            
        Returns:
            bool: Success status
        """
        try:
            if not self.image:
                return False
                
            # Create output directory if it doesn't exist
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            
            # Determine format from output path if not specified
            if not format:
                format = os.path.splitext(output_path)[1][1:].upper()
                if not format:
                    format = 'JPEG'
            
            # Save options
            save_opts = {}
            if format.upper() == 'JPEG':
                save_opts['quality'] = quality
            
            # Save the image
            self.image.save(output_path, format=format, **save_opts)
            logger.info(f"Successfully saved image to {output_path}")
            return True
        except Exception as e:
            logger.error(f"Error saving image to {output_path}: {e}", exc_info=True)
            return False