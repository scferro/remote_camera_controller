import gphoto2 as gp
import os
import logging
import threading
from PIL import Image # For resizing preview if needed

log = logging.getLogger(__name__)

class CameraHandler:
    """Handles all interactions with the camera via gphoto2."""

    def __init__(self, lock=None):
        """
        Initializes the camera handler.

        Args:
            lock: A threading.Lock() object to ensure thread-safe camera access.
                  If None, a new lock is created.
        """
        self.camera = None
        self.context = None
        # Use the provided lock or create a new one
        self.lock = lock if lock else threading.Lock()
        log.info("CameraHandler created. Initializing camera connection...")
        # Attempt initialization immediately. If it fails, log the error
        # but allow the handler object to be created. Subsequent calls will fail until re-initialized.
        try:
            self.initialize_camera()
        except ConnectionError as e:
            log.error(f"Initial camera connection failed: {e}")
            # No need to raise here, status checks will handle the disconnected state


    def initialize_camera(self):
        """Detects and initializes the first available camera."""
        with self.lock: # Ensure exclusive access during initialization
            if self.camera:
                log.warning("Camera already initialized. Releasing first.")
                self._release_camera() # Ensure clean state before re-init

            try:
                log.debug("Creating gphoto2 context...")
                self.context = gp.Context()
                log.debug("Creating gphoto2 camera object...")
                self.camera = gp.Camera()
                log.debug("Attempting camera.init()... (This might take a moment or hang if connection fails)")
                self.camera.init(self.context) # <<<--- HANG POINT LIKELY HERE
                log.debug("camera.init() completed.")
                # Get status right after init, skip connection check inside status
                # Need to get model name directly from summary text now
                summary_text = self.camera.get_summary(self.context).text
                model_name = "Unknown Model"
                for line in summary_text.splitlines():
                    if line.strip().startswith("Model:"):
                        model_name = line.split(":", 1)[1].strip()
                        break
                log.info(f"Camera initialized successfully: {model_name}")
                return True
            except gp.GPhoto2Error as ex:
                self.camera = None # Ensure camera is None if init fails
                self.context = None
                if ex.code == gp.GP_ERROR_MODEL_NOT_FOUND:
                    log.error("Camera not found. Is it connected, turned on, and in 'PC Remote' USB mode?")
                elif ex.code == gp.GP_ERROR_CAMERA_BUSY:
                     log.error("Camera is busy. Another process might be using it?")
                else:
                    log.error(f"Error initializing camera: {ex.code} - {ex.string}", exc_info=True)
                # Re-raise the exception so the caller knows init failed
                raise ConnectionError(f"Failed to initialize camera: {ex.string}") from ex
            except Exception as e:
                 self.camera = None
                 self.context = None
                 log.error(f"An unexpected error occurred during camera initialization: {e}", exc_info=True)
                 raise ConnectionError(f"Unexpected error initializing camera: {e}") from e

    def _release_camera(self):
        """Releases the camera connection safely."""
        # This method assumes the lock is already held by the caller
        if self.camera:
            try:
                log.info("Releasing camera...")
                self.camera.exit(self.context)
                self.camera = None
                self.context = None
                log.info("Camera released.")
            except gp.GPhoto2Error as ex:
                log.error(f"Error releasing camera: {ex.code} - {ex.string}")
                # Even if exit fails, set to None to allow re-initialization attempt
                self.camera = None
                self.context = None
            except Exception as e:
                 log.error(f"Unexpected error releasing camera: {e}", exc_info=True)
                 self.camera = None
                 self.context = None


    def get_status(self, check_connection=True):
        """
        Gets basic camera status information.

        Args:
            check_connection (bool): If True and camera is not connected, attempt re-initialization.
        """
        with self.lock:
            if not self.camera and check_connection:
                # Try to re-initialize if not connected and check_connection is True
                try:
                    log.info("Camera not connected, attempting re-initialization for status check...")
                    self.initialize_camera()
                except ConnectionError as e:
                     log.warning(f"Re-initialization failed during status check: {e}")
                     return {"connected": False, "model": "N/A", "message": f"Connection failed: {e}"}

            # If initialization succeeded or was already connected
            if self.camera:
                try:
                    # Getting summary can sometimes fail if camera state changes, wrap in try/except
                    log.debug("Getting camera summary...")
                    summary = self.camera.get_summary(self.context)
                    log.debug("Camera summary retrieved.")
                    # Extract model from summary text
                    model_name = "N/A"
                    try:
                        for line in summary.text.splitlines():
                             if line.strip().startswith("Model:"):
                                model_name = line.split(":", 1)[1].strip()
                                break
                    except Exception:
                        log.warning("Could not parse model name from summary text.")

                    # TODO: Add more useful status checks if possible (battery, card space?)
                    # config = self.camera.get_config(self.context)
                    # battery_level = self._get_config_value(config, 'batterylevel') # Example name
                    return {
                        "connected": True,
                        "model": model_name,
                        "message": "Ready"
                        # "battery": battery_level
                    }
                except gp.GPhoto2Error as ex:
                    log.error(f"Error getting camera summary: {ex.code} - {ex.string}")
                    # If getting status fails, maybe connection is lost?
                    self._release_camera() # Release potentially broken connection
                    return {"connected": False, "model": "N/A", "message": f"Error communicating: {ex.string}"}
                except Exception as e:
                    log.error(f"Unexpected error getting camera status: {e}", exc_info=True)
                    self._release_camera()
                    return {"connected": False, "model": "N/A", "message": f"Unexpected error: {e}"}
            else:
                 # Camera object is not available (initialization failed or released)
                 return {"connected": False, "model": "N/A", "message": "Camera not initialized or connection lost."}


    def list_all_config(self):
        """Lists all configuration settings available on the camera."""
        with self.lock:
            if not self._ensure_camera_connected(): return None # Return None on connection error

            try:
                log.info("Fetching camera configuration tree...")
                config = self.camera.get_config(self.context)
                config_dict = self._walk_config(config)
                log.info("Configuration tree fetched successfully.")
                return config_dict
            except gp.GPhoto2Error as ex:
                log.error(f"Error getting configuration: {ex.code} - {ex.string}")
                return None
            except Exception as e:
                 log.error(f"Unexpected error listing config: {e}", exc_info=True)
                 return None

    def _walk_config(self, widget, level=0):
        """Recursively walks the configuration widget tree and returns a dictionary."""
        config_dict = {}
        try:
             # Check if widget is valid before getting children
             if not widget: return None
             widget_name_for_log = widget.get_name() if hasattr(widget, 'get_name') else 'Unnamed Widget'
             children = widget.get_children()
        except gp.GPhoto2Error as e:
             log.warning(f"Could not get children for widget '{widget_name_for_log}': {e.string}")
             children = [] # Treat as leaf if children cannot be retrieved
        except Exception as e:
             log.error(f"Unexpected error getting children for widget '{widget_name_for_log}': {e}", exc_info=True)
             children = []


        if not children: # If it's a leaf node (actual setting)
            try:
                # Check widget validity again before accessing properties
                if not widget: return None

                widget_name = widget.get_name()
                widget_label = widget.get_label()
                widget_type_enum = widget.get_type()
                widget_type_str = gp.gp_widget_type_as_string(widget_type_enum)
                widget_readonly = widget.get_readonly()

                setting_info = {
                    "label": widget_label,
                    "type": widget_type_str,
                    "readonly": widget_readonly,
                    "value": None, # Default value
                }

                # Getting value might fail for some widgets
                try:
                    setting_info["value"] = widget.get_value()
                except gp.GPhoto2Error as e:
                    # Don't log excessively common errors like "Could not get widget value" unless debugging
                    if e.code != gp.GP_ERROR_BAD_PARAMETERS: # Example: filter out less critical errors
                         log.warning(f"Could not get value for widget '{widget_name}' ({widget_label}): {e.string} (Code: {e.code})")
                    setting_info["value"] = "Error reading value"
                except Exception as e_val:
                     log.error(f"Unexpected error getting value for widget '{widget_name}': {e_val}", exc_info=True)
                     setting_info["value"] = "Error reading value"


                # Add choices for relevant types
                if widget_type_enum in [gp.GP_WIDGET_CHOICE, gp.GP_WIDGET_RADIO, gp.GP_WIDGET_MENU]:
                    try:
                        setting_info["choices"] = [widget.get_choice(i) for i in range(widget.count_choices())]
                    except gp.GPhoto2Error as e:
                         log.warning(f"Could not get choices for widget '{widget_name}': {e.string}")
                         setting_info["choices"] = ["Error reading choices"]
                    except Exception as e_choices:
                         log.error(f"Unexpected error getting choices for widget '{widget_name}': {e_choices}", exc_info=True)
                         setting_info["choices"] = ["Error reading choices"]


                # Add range info for RANGE type
                if widget_type_enum == gp.GP_WIDGET_RANGE:
                    try:
                        min_val, max_val, step = widget.get_range()
                        setting_info["min"] = min_val
                        setting_info["max"] = max_val
                        setting_info["step"] = step
                    except gp.GPhoto2Error as e:
                        log.warning(f"Could not get range for widget '{widget_name}': {e.string}")
                    except Exception as e_range:
                         log.error(f"Unexpected error getting range for widget '{widget_name}': {e_range}", exc_info=True)


                return setting_info
            except gp.GPhoto2Error as e:
                 # Error getting basic widget info (name, label, type)
                 widget_name_for_log = 'Unknown Widget'
                 try: widget_name_for_log = widget.get_name() # Try to get name for logging
                 except: pass
                 log.warning(f"Error processing widget attributes for '{widget_name_for_log}': {e.string}")
                 return None # Skip this widget if basic info fails
            except Exception as e_basic:
                 widget_name_for_log = 'Unknown Widget'
                 try: widget_name_for_log = widget.get_name()
                 except: pass
                 log.error(f"Unexpected error processing widget attributes for '{widget_name_for_log}': {e_basic}", exc_info=True)
                 return None


        # If it's a section with children
        for child in children:
             try:
                 # Check child validity
                 if not child: continue
                 child_name = child.get_name()
                 child_config = self._walk_config(child, level + 1)
                 if child_config: # Only add if the child walk returned something valid
                     config_dict[child_name] = child_config
             except gp.GPhoto2Error as e:
                  child_name_for_log = 'Unknown Child Widget'
                  try: child_name_for_log = child.get_name()
                  except: pass
                  log.warning(f"Error processing child widget '{child_name_for_log}': {e.string}. Skipping.")
                  continue
             except Exception as e_child:
                  child_name_for_log = 'Unknown Child Widget'
                  try: child_name_for_log = child.get_name()
                  except: pass
                  log.error(f"Unexpected error processing child widget '{child_name_for_log}': {e_child}. Skipping.", exc_info=True)
                  continue


        # Special handling for top-level widget (usually a section)
        if level == 0:
            return config_dict
        else:
            # Return section info along with children, only if it has valid children
            if config_dict:
                try:
                     # Check widget validity before accessing properties
                    if not widget: return None
                    section_info = {
                        "label": widget.get_label(),
                        "type": gp.gp_widget_type_as_string(widget.get_type()), # Usually 'SECTION'
                        "readonly": widget.get_readonly(),
                        "children": config_dict
                    }
                    return section_info
                except gp.GPhoto2Error as e:
                    widget_name_for_log = 'Unknown Section Widget'
                    try: widget_name_for_log = widget.get_name()
                    except: pass
                    log.warning(f"Error processing section widget attributes for '{widget_name_for_log}': {e.string}")
                    return None # Return None if section info fails
                except Exception as e_section:
                    widget_name_for_log = 'Unknown Section Widget'
                    try: widget_name_for_log = widget.get_name()
                    except: pass
                    log.error(f"Unexpected error processing section widget attributes for '{widget_name_for_log}': {e_section}", exc_info=True)
                    return None
            else:
                # Don't return empty sections
                return None


    def get_config(self, setting_name):
        """Gets the value of a specific configuration setting using its full path."""
        with self.lock:
            if not self._ensure_camera_connected(): return None

            try:
                config = self.camera.get_config(self.context)
                # Use find_widget which handles nested paths like '/main/actions/capture'
                widget = gp.check_result(gp.gp_widget_find_by_name(config, setting_name))
                value = widget.get_value()
                log.debug(f"Get config '{setting_name}': '{value}'")
                return value
            except gp.GPhoto2Error as ex:
                # GP_ERROR_BAD_PARAMETERS often means the setting name was wrong
                if ex.code == gp.GP_ERROR_BAD_PARAMETERS:
                     log.error(f"Setting '{setting_name}' not found or invalid.")
                else:
                     log.error(f"Error getting config '{setting_name}': {ex.code} - {ex.string}")
                return None
            except Exception as e:
                 log.error(f"Unexpected error getting config '{setting_name}': {e}", exc_info=True)
                 return None

    def set_config(self, setting_name, value):
        """Sets the value of a specific configuration setting using its full path."""
        widget = None # Define widget outside try block for use in finally/except
        with self.lock:
            if not self._ensure_camera_connected():
                return False, "Camera not connected."

            try:
                log.info(f"Attempting to set config '{setting_name}' to '{value}'")
                config = self.camera.get_config(self.context)
                # Use find_widget which handles nested paths
                widget = gp.check_result(gp.gp_widget_find_by_name(config, setting_name))

                # Check if read-only
                if widget.get_readonly():
                     msg = f"Setting '{setting_name}' ({widget.get_label()}) is read-only."
                     log.warning(msg)
                     return False, msg

                # Get current value before attempting to set
                current_value = widget.get_value()

                # Convert value type if necessary (e.g., range needs float, toggle needs int)
                widget_type = widget.get_type()
                try:
                    if widget_type == gp.GP_WIDGET_RANGE:
                        # Ensure value is within range
                        min_val, max_val, step = widget.get_range()
                        value_to_set = max(min_val, min(max_val, float(value)))
                        # Optional: Adjust to nearest step? Might be complex.
                        log.debug(f"Range setting '{setting_name}': Input '{value}', Clamped/Converted: '{value_to_set}' (Range: {min_val}-{max_val}, Step: {step})")
                    elif widget_type == gp.GP_WIDGET_TOGGLE:
                        # Ensure value is 0 or 1
                        value_to_set = 1 if int(value) != 0 else 0
                        log.debug(f"Toggle setting '{setting_name}': Input '{value}', Converted: '{value_to_set}'")
                    # Add other type conversions if needed (e.g., DATE)
                    else:
                         value_to_set = str(value) # Default to string for CHOICE/RADIO/TEXT etc.
                         log.debug(f"Other setting '{setting_name}': Input '{value}', Converted: '{value_to_set}'")
                except ValueError as e:
                     msg = f"Invalid value type for setting '{setting_name}'. Cannot convert '{value}' for widget type {gp.gp_widget_type_as_string(widget_type)}. Error: {e}"
                     log.error(msg)
                     return False, msg
                except gp.GPhoto2Error as e_range:
                     # Handle error getting range info
                     log.warning(f"Could not get range for setting '{setting_name}' during set operation: {e_range.string}")
                     # Fallback to simple float conversion if range check fails
                     try: value_to_set = float(value)
                     except ValueError: return False, f"Invalid float value '{value}' for range setting '{setting_name}'."


                # Check if value is valid for CHOICE/RADIO/MENU types
                if widget_type in [gp.GP_WIDGET_CHOICE, gp.GP_WIDGET_RADIO, gp.GP_WIDGET_MENU]:
                    try:
                        choices = [widget.get_choice(i) for i in range(widget.count_choices())]
                        # Compare as strings for flexibility, handle potential None choices
                        str_choices = [str(c) for c in choices if c is not None]
                        str_value_to_set = str(value_to_set)
                        if str_value_to_set not in str_choices:
                            msg = f"Invalid value '{str_value_to_set}' for setting '{setting_name}'. Available choices: {str_choices}"
                            log.error(msg)
                            return False, msg
                    except gp.GPhoto2Error as e_choice:
                         log.warning(f"Could not get choices for setting '{setting_name}' during set operation: {e_choice.string}")
                         # Proceed with setting if choices check fails? Or return error?
                         # return False, f"Could not verify choices for '{setting_name}'."


                # Compare potentially type-converted values as strings for robust comparison
                if str(current_value) == str(value_to_set):
                     msg = f"Value for '{setting_name}' is already '{current_value}'. No change needed."
                     log.info(msg)
                     return True, msg # Report success as no change was required

                log.debug(f"Setting widget '{setting_name}' from '{current_value}' (type {type(current_value)}) to '{value_to_set}' (type {type(value_to_set)})")
                widget.set_value(value_to_set)
                self.camera.set_config(config, self.context)
                log.info(f"Successfully set config '{setting_name}' to '{value_to_set}'")

                # Optional: Verify the change by reading back immediately
                try:
                    new_config = self.camera.get_config(self.context)
                    check_widget = gp.check_result(gp.gp_widget_find_by_name(new_config, setting_name))
                    new_value = check_widget.get_value()
                    log.info(f"Verified setting: {setting_name} = {new_value}")
                    if str(new_value) != str(value_to_set):
                        log.warning(f"Verification failed! Setting '{setting_name}' is '{new_value}' after attempting to set to '{value_to_set}'.")
                        # Revert UI by fetching settings again? Or just report error?
                        return False, f"Verification failed. Value is still '{new_value}'."
                except gp.GPhoto2Error as verify_ex:
                     log.warning(f"Could not verify setting '{setting_name}' after change: {verify_ex.string}")
                except Exception as verify_e:
                     log.warning(f"Unexpected error verifying setting '{setting_name}': {verify_e}", exc_info=True)


                return True, f"Setting '{setting_name}' updated to '{value_to_set}'."

            except gp.GPhoto2Error as ex:
                log.error(f"Error setting config '{setting_name}' to '{value}': {ex.code} - {ex.string}")
                # Attempt to get current value again if setting failed, helps UI revert
                current_val_after_fail = "Unknown"
                if widget: # Check if widget was successfully found before the error
                    try: current_val_after_fail = widget.get_value()
                    except: pass # Ignore errors getting value after failure
                extra_msg = f" Current value is '{current_val_after_fail}'."

                # Specific handling for bad parameters (likely wrong setting name)
                if ex.code == gp.GP_ERROR_BAD_PARAMETERS:
                     return False, f"Setting '{setting_name}' not found or invalid."

                return False, f"gphoto2 error: {ex.string}." + extra_msg
            except Exception as e:
                 log.error(f"Unexpected error setting config '{setting_name}': {e}", exc_info=True)
                 return False, f"Unexpected error: {e}"

    def capture_preview(self, target_path):
        """Captures a preview frame and saves it to target_path."""
        with self.lock:
            if not self._ensure_camera_connected(): return False

            try:
                # log.debug("Capturing preview...") # Can be noisy
                # CORRECTED: capture_preview takes no arguments
                camera_file = self.camera.capture_preview()
                file_data = camera_file.get_data_and_size()

                # Check if data is valid
                if not file_data or len(file_data) == 0:
                    log.warning("Captured preview data is empty.")
                    # Try to delete the target file if it exists but is now empty
                    if os.path.exists(target_path):
                        try: os.remove(target_path)
                        except OSError: pass
                    return False

                # Save the data directly to the target file
                with open(target_path, 'wb') as f:
                    f.write(file_data)

                # Optional: Validate saved file (e.g., check size > 0)
                if os.path.getsize(target_path) == 0:
                     log.warning(f"Preview file saved but is empty: {target_path}")
                     return False

                # Optional: Resize preview using Pillow if needed
                # try:
                #     img = Image.open(target_path)
                #     # img.thumbnail((640, 480)) # Example resize
                #     img.save(target_path, "JPEG") # Save resized
                # except Exception as img_err:
                #     log.error(f"Failed to process/resize preview image: {img_err}")
                    # Decide if this should be a fatal error for the preview

                # log.debug(f"Preview saved to {target_path}")
                return True
            except gp.GPhoto2Error as ex:
                # Common errors: Not supported, camera busy, PTP timeout
                log.warning(f"Could not capture preview: {ex.code} - {ex.string}")
                # If capture fails repeatedly, maybe connection is bad?
                if ex.code in [gp.GP_ERROR_IO, gp.GP_ERROR_PTP_TIMEOUT, gp.GP_ERROR_CAMERA_BUSY, gp.GP_ERROR_CAMERA_ERROR]:
                    log.warning("Potential connection issue during preview. Releasing camera handle.")
                    # Force release on persistent errors
                    self._release_camera()
                # Try to delete the target file if capture failed
                if os.path.exists(target_path):
                    try: os.remove(target_path)
                    except OSError: pass
                return False
            except Exception as e:
                 log.error(f"Unexpected error capturing preview: {e}", exc_info=True)
                 # Try to delete the target file on unexpected error
                 if os.path.exists(target_path):
                     try: os.remove(target_path)
                     except OSError: pass
                 return False

    def capture_image(self, download_dir=None):
        """
        Captures a full-resolution image and optionally downloads it.

        Args:
            download_dir (str, optional): The directory to save the captured image(s).
                                          If None, the image remains on the camera.

        Returns:
            tuple: (bool, str or None) - Success status and the path to the downloaded file
                   (or the camera file path if not downloaded), or None on failure.
                   Note: If RAW+JPEG, might return path to JPEG.
        """
        with self.lock:
            if not self._ensure_camera_connected(): return False, None

            try:
                log.info("Capturing image...")
                # Capture image, leaves file on camera storage
                # CORRECTED: capture takes context as argument
                file_path = self.camera.capture(gp.GP_CAPTURE_IMAGE, self.context)
                log.info(f"Image captured on camera: Folder: '{file_path.folder}', Name: '{file_path.name}'")

                if download_dir:
                    # Ensure download directory exists
                    os.makedirs(download_dir, exist_ok=True)
                    target_filename = os.path.join(download_dir, file_path.name)
                    log.info(f"Downloading image to: {target_filename}...")

                    try:
                        # CORRECTED: file_get takes context as argument
                        camera_file = self.camera.file_get(
                            file_path.folder, file_path.name, gp.GP_FILE_TYPE_NORMAL, self.context)
                        camera_file.save(target_filename)
                        log.info(f"Image successfully saved to {target_filename}")

                        # Optional: Delete from camera after download?
                        # try:
                        #     # CORRECTED: file_delete takes context
                        #     self.camera.file_delete(file_path.folder, file_path.name, self.context)
                        #     log.info(f"Deleted {file_path.name} from camera.")
                        # except gp.GPhoto2Error as del_ex:
                        #     log.warning(f"Could not delete file from camera: {del_ex}")

                        return True, target_filename

                    except gp.GPhoto2Error as dl_ex:
                        log.error(f"Failed to download/save image '{file_path.name}': {dl_ex.code} - {dl_ex.string}")
                        return False, None
                    except Exception as dl_e:
                         log.error(f"Unexpected error downloading/saving image '{file_path.name}': {dl_e}", exc_info=True)
                         return False, None
                else:
                    # Not downloading, return success and camera path
                    return True, f"{file_path.folder}/{file_path.name}"

            except gp.GPhoto2Error as ex:
                log.error(f"Could not capture image: {ex.code} - {ex.string}")
                # Consider releasing camera on certain errors
                if ex.code in [gp.GP_ERROR_IO, gp.GP_ERROR_PTP_TIMEOUT, gp.GP_ERROR_CAMERA_ERROR, gp.GP_ERROR_CAMERA_BUSY]:
                     log.warning("Potential connection issue during capture. Releasing camera handle.")
                     self._release_camera()
                return False, None
            except Exception as e:
                 log.error(f"Unexpected error capturing image: {e}", exc_info=True)
                 return False, None

    def _ensure_camera_connected(self):
        """Internal helper to check connection and attempt re-init if needed."""
        # Assumes lock is already held
        if self.camera:
            # Optional: Add a quick check here? e.g., try getting a simple config value?
            # This adds overhead but might detect stale connections earlier.
            # try:
            #     # Getting config is relatively expensive, maybe a cheaper check?
            #     # self.camera.get_config(self.context) # Throws error if connection died silently
            #     pass # Assume connected if object exists for now
            # except gp.GPhoto2Error as check_ex:
            #      log.warning(f"Camera connection check failed ({check_ex.code} - {check_ex.string}). Attempting re-init.")
            #      self._release_camera() # Release the potentially dead handle
            #      self.camera = None # Force re-init below
            # else:
            #      return True # Quick check passed
            return True # Assume connected if object exists (original behavior)


        # If self.camera is None
        log.warning("Camera is not connected. Attempting to initialize...")
        try:
            return self.initialize_camera() # This already logs errors internally
        except ConnectionError:
            # initialize_camera already logged the error
            return False

    def __del__(self):
        """Ensure camera is released when the object is destroyed."""
        # This might be called during interpreter shutdown, logging might not work reliably here
        print("CameraHandler being destroyed. Releasing camera...") # Use print as fallback
        # Acquire lock to prevent race condition if release is happening elsewhere
        if self.lock.acquire(blocking=False): # Use non-blocking acquire in __del__
            try:
                if self.camera:
                    print(f"Releasing camera object {id(self.camera)} in __del__")
                    self._release_camera()
            finally:
                self.lock.release()
        else:
             print("Could not acquire lock in __del__ to release camera. Might be held by another thread.")
