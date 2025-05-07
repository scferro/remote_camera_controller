import gphoto2 as gp
import os
import logging
import threading
from PIL import Image # For resizing preview if needed
import time # For adding delays if needed

log = logging.getLogger(__name__)

# Helper dictionary to map gphoto2 widget type constants to strings
WIDGET_TYPE_MAP = {
    gp.GP_WIDGET_WINDOW: 'WINDOW',
    gp.GP_WIDGET_SECTION: 'SECTION',
    gp.GP_WIDGET_TEXT: 'TEXT',
    gp.GP_WIDGET_RANGE: 'RANGE',
    gp.GP_WIDGET_TOGGLE: 'TOGGLE',
    gp.GP_WIDGET_RADIO: 'RADIO',
    gp.GP_WIDGET_MENU: 'MENU',
    gp.GP_WIDGET_BUTTON: 'BUTTON',
    gp.GP_WIDGET_DATE: 'DATE',
    # gp.GP_WIDGET_CHOICE: 'CHOICE' # Removed this line
}

class CameraHandler:
    """Handles all interactions with the camera via gphoto2."""

    def __init__(self, lock=None):
        """
        Initializes the camera handler state but does NOT connect immediately.

        Args:
            lock: A threading.Lock() object to ensure thread-safe camera access.
                  If None, a new lock is created.
        """
        self.camera = None
        self.context = None
        # Use the provided lock or create a new one
        self.lock = lock if lock else threading.Lock()
        log.info("CameraHandler created. Connection will be initialized on first use.")
        # DO NOT CALL initialize_camera() here anymore


    def initialize_camera(self):
        """
        Detects and initializes the first available camera.
        THIS SHOULD ONLY BE CALLED FROM WITHIN _ensure_camera_connected (or similar locked context).
        """
        # This method assumes the lock is already held by the caller
        if self.camera:
            log.warning("initialize_camera called but camera object already exists. Releasing first.")
            try:
                self.camera.exit(self.context)
            except Exception as exit_e:
                 log.warning(f"Ignoring error during exit before re-init: {exit_e}")
            finally:
                 self.camera = None
                 self.context = None


        try:
            log.debug("Creating gphoto2 context...")
            self.context = gp.Context()
            log.debug("Creating gphoto2 camera object...")
            self.camera = gp.Camera()
            log.info("Attempting camera.init()...")
            start_time = time.time()
            self.camera.init(self.context)
            end_time = time.time()
            log.info(f"camera.init() completed in {end_time - start_time:.2f}s.")

            # Get model name after successful init
            try:
                summary_text = self.camera.get_summary(self.context).text
                model_name = "Unknown Model"
                for line in summary_text.splitlines():
                    if line.strip().startswith("Model:"):
                        model_name = line.split(":", 1)[1].strip()
                        break
                log.info(f"Camera initialized successfully: {model_name}")
            except Exception as summary_e:
                 log.warning(f"Could not get/parse summary after init: {summary_e}")
                 log.info("Camera initialized successfully (model unknown).")

            return True
        except gp.GPhoto2Error as ex:
            self.camera = None
            self.context = None
            if ex.code == gp.GP_ERROR_MODEL_NOT_FOUND:
                log.error("Camera not found. Is it connected, turned on, and in 'PC Remote' USB mode?")
            elif ex.code == gp.GP_ERROR_CAMERA_BUSY:
                 log.error("Camera is busy. Another process might be using it?")
            elif ex.code == gp.GP_ERROR_IO:
                 log.error(f"Camera I/O Error during init ({ex.code} - {ex.string}). Check connection/permissions.")
            else:
                log.error(f"Error initializing camera: {ex.code} - {ex.string}", exc_info=True)
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
            log.info("Releasing camera connection...")
            try:
                self.camera.exit(self.context)
                log.info("Camera released successfully.")
            except gp.GPhoto2Error as ex:
                log.error(f"Error releasing camera: {ex.code} - {ex.string}")
            except Exception as e:
                 log.error(f"Unexpected error releasing camera: {e}", exc_info=True)
            finally:
                 self.camera = None
                 self.context = None
        else:
            log.debug("_release_camera called but camera object was already None.")


    def _ensure_camera_connected(self):
        """
        Internal helper to check connection and attempt initialization if needed.
        MUST be called within a `with self.lock:` block.
        Returns True if connected (or connection succeeds), False otherwise.
        """
        # Assumes lock is already held
        if self.camera:
            return True

        log.info("Camera connection required. Attempting to initialize...")
        try:
            return self.initialize_camera()
        except ConnectionError as e:
            log.error(f"Failed to establish camera connection: {e}")
            return False
        except Exception as e_init:
             log.error(f"Unexpected error during lazy initialization: {e_init}", exc_info=True)
             return False


    def get_status(self):
        """Gets basic camera status information."""
        with self.lock:
            if not self._ensure_camera_connected():
                 return {"connected": False, "model": "N/A", "message": "Connection failed or camera not available."}

            try:
                log.debug("Getting camera summary...")
                summary = self.camera.get_summary(self.context)
                log.debug("Camera summary retrieved.")
                model_name = "N/A"
                try:
                    for line in summary.text.splitlines():
                         if line.strip().startswith("Model:"):
                            model_name = line.split(":", 1)[1].strip()
                            break
                except Exception:
                    log.warning("Could not parse model name from summary text.")

                return {
                    "connected": True,
                    "model": model_name,
                    "message": "Ready"
                }
            except gp.GPhoto2Error as ex:
                log.error(f"Error getting camera summary (after connection): {ex.code} - {ex.string}")
                self._release_camera()
                return {"connected": False, "model": "N/A", "message": f"Error communicating: {ex.string}"}
            except Exception as e:
                log.error(f"Unexpected error getting camera status: {e}", exc_info=True)
                self._release_camera()
                return {"connected": False, "model": "N/A", "message": f"Unexpected error: {e}"}


    # --- Configuration Methods ---

    def list_all_config(self):
        """
        Lists all configuration settings available on the camera by walking the widget tree.
        Returns a dictionary representing the configuration structure.
        """
        with self.lock:
            if not self._ensure_camera_connected():
                log.error("Cannot list config, camera not connected.")
                return None

            try:
                log.info("Fetching camera configuration tree root...")
                config_root = self.camera.get_config(self.context)
                log.info("Walking configuration tree...")
                config_dict = {}
                root_children = config_root.get_children()
                for child in root_children:
                    try:
                        child_name = child.get_name()
                        processed_child = self._walk_config_recursive(child)
                        if processed_child:
                             config_dict[child_name] = processed_child
                    except gp.GPhoto2Error as child_ex:
                         log.warning(f"Error processing top-level config child: {child_ex.string}. Skipping.")
                    except Exception as child_e:
                         log.error(f"Unexpected error processing top-level config child: {child_e}. Skipping.", exc_info=True)

                log.info(f"Configuration tree walk completed. Found {len(config_dict)} top-level items.")
                return config_dict if config_dict else {}

            except gp.GPhoto2Error as ex:
                log.error(f"Error getting configuration root: {ex.code} - {ex.string}")
                if ex.code in [gp.GP_ERROR_IO, gp.GP_ERROR_CAMERA_ERROR]:
                     self._release_camera()
                return None
            except Exception as e:
                 log.error(f"Unexpected error listing config: {e}", exc_info=True)
                 return None

    def _get_widget_type_str(self, widget_type_enum):
        """Helper function to safely get the string name for a widget type."""
        return WIDGET_TYPE_MAP.get(widget_type_enum, 'UNKNOWN')

    def _walk_config_recursive(self, widget):
        """Recursively processes a single configuration widget and its children."""
        if not widget:
            return None

        widget_info = {}
        try:
            widget_name = widget.get_name()
            widget_label = widget.get_label()
            widget_type_enum = widget.get_type()
            widget_type_str = self._get_widget_type_str(widget_type_enum)

            # Fetch the current value of the widget
            try:
                widget_value = widget.get_value()
                if widget_value is None:
                    log.warning(f"Widget '{widget_name}' has no value (None).")
                    widget_value = "N/A"
            except gp.GPhoto2Error as e:
                log.warning(f"Could not get value for widget '{widget_name}': {e.string}")
                widget_value = "N/A"
            except Exception as e_value:
                log.error(f"Unexpected error getting value for widget '{widget_name}': {e_value}", exc_info=True)
                widget_value = "N/A"

            widget_info = {
                "label": widget_label,
                "type": widget_type_str,
                "readonly": widget.get_readonly(),
                "value": widget_value,  # Include the fetched value
            }

            if widget_type_enum == gp.GP_WIDGET_RANGE:
                try:
                    min_val, max_val, step = widget.get_range()
                    widget_info["min"] = min_val
                    widget_info["max"] = max_val
                    widget_info["step"] = step
                except gp.GPhoto2Error as e:
                    log.warning(f"Could not get range for widget '{widget_name}': {e.string}")
                except Exception as e_range:
                    log.error(f"Unexpected error getting range for widget '{widget_name}': {e_range}", exc_info=True)

            children_dict = {}
            try:
                children = widget.get_children()
                if children:
                    for child in children:
                        try:
                            child_name = child.get_name()
                            processed_child = self._walk_config_recursive(child)
                            if processed_child:
                                children_dict[child_name] = processed_child
                        except gp.GPhoto2Error as child_ex:
                            log.warning(f"Error processing child '{child.get_name() if child else 'N/A'}' of '{widget_name}': {child_ex.string}. Skipping child.")
                        except Exception as child_e:
                            log.error(f"Unexpected error processing child '{child.get_name() if child else 'N/A'}' of '{widget_name}': {child_e}. Skipping child.", exc_info=True)

                    if children_dict:
                        widget_info["children"] = children_dict

            except gp.GPhoto2Error as e:
                if widget_type_enum == gp.GP_WIDGET_SECTION or widget_type_enum == gp.GP_WIDGET_WINDOW:
                    log.warning(f"Could not get children for section widget '{widget_name}': {e.string}")
            except Exception as e_children:
                log.error(f"Unexpected error getting children for widget '{widget_name}': {e_children}", exc_info=True)

            return widget_info

        except gp.GPhoto2Error as e:
            widget_name_for_log = 'Unknown Widget'
            try:
                widget_name_for_log = widget.get_name()
            except:
                pass
            log.warning(f"Error processing widget attributes for '{widget_name_for_log}': {e.string}")
            return None
        except Exception as e_basic:
            widget_name_for_log = 'Unknown Widget'
            try:
                widget_name_for_log = widget.get_name()
            except:
                pass
            log.error(f"Unexpected error processing widget attributes for '{widget_name_for_log}': {e_basic}", exc_info=True)
            return None

    def _find_widget_by_path(self, config_root, path_elements):
        """Manually find a widget by traversing the tree using path elements."""
        widget = config_root
        try:
            for element in path_elements:
                widget = widget.get_child_by_name(element)
            return widget
        except gp.GPhoto2Error as ex:
             log.error(f"Widget not found at path {'/'.join(path_elements)}: {ex.string}")
             return None
        except Exception as e:
             log.error(f"Unexpected error finding widget at path {'/'.join(path_elements)}: {e}", exc_info=True)
             return None


    def get_config(self, setting_name):
        """Gets the value of a specific configuration setting using its full path."""
        with self.lock:
            if not self._ensure_camera_connected(): return None

            try:
                # *** CORRECTED: Manually find widget then get value ***
                config = self.camera.get_config(self.context)
                path_elements = setting_name.split('/')
                widget = self._find_widget_by_path(config, path_elements)
                if widget:
                    value = widget.get_value()
                    log.debug(f"Get config '{setting_name}': '{value}'")
                    return value
                else:
                    # _find_widget_by_path already logged the error
                    return None
            except gp.GPhoto2Error as ex:
                log.error(f"Error getting config value for '{setting_name}': {ex.code} - {ex.string}")
                return None
            except Exception as e:
                 log.error(f"Unexpected error getting config '{setting_name}': {e}", exc_info=True)
                 return None

    def set_config(self, setting_name, value):
        """Sets the value of a specific configuration setting using its full path."""
        with self.lock:
            if not self._ensure_camera_connected():
                return False, "Camera not connected."

            try:
                log.info(f"Attempting to set config '{setting_name}' to '{value}'")
                config = self.camera.get_config(self.context)
                # *** CORRECTED: Manually find the widget ***
                path_elements = setting_name.split('/')
                widget = self._find_widget_by_path(config, path_elements)

                if not widget:
                    # _find_widget_by_path already logged the error
                    return False, f"Setting '{setting_name}' not found."

                # Check if read-only
                if widget.get_readonly():
                     msg = f"Setting '{setting_name}' ({widget.get_label()}) is read-only."
                     log.warning(msg)
                     return False, msg

                # Perform type conversion and validation based on widget type
                widget_type = widget.get_type()
                value_to_set = value
                try:
                    if widget_type == gp.GP_WIDGET_RANGE:
                        min_val, max_val, step = widget.get_range()
                        value_to_set = max(min_val, min(max_val, float(value)))
                    elif widget_type == gp.GP_WIDGET_TOGGLE:
                        value_to_set = 1 if int(value) != 0 else 0
                    else:
                         value_to_set = str(value)
                except ValueError as e:
                     msg = f"Invalid value type for setting '{setting_name}'. Cannot convert '{value}'. Error: {e}"
                     log.error(msg)
                     return False, msg
                except gp.GPhoto2Error as e_range:
                     log.warning(f"Could not get range for setting '{setting_name}' during validation: {e_range.string}")
                     value_to_set = str(value)

                # Check choices if applicable
                if widget_type in [gp.GP_WIDGET_RADIO, gp.GP_WIDGET_MENU]:
                    try:
                        choices = [widget.get_choice(i) for i in range(widget.count_choices())]
                        str_choices = [str(c) for c in choices if c is not None]
                        if str(value_to_set) not in str_choices:
                            msg = f"Invalid value '{value_to_set}' for setting '{setting_name}'. Available: {str_choices}"
                            log.error(msg)
                            return False, msg
                    except gp.GPhoto2Error as e_choice:
                         log.warning(f"Could not get choices for setting '{setting_name}' during validation: {e_choice.string}")

                # Get current value *after* potential type conversion for comparison
                current_value = widget.get_value()
                if str(current_value) == str(value_to_set):
                     msg = f"Value for '{setting_name}' is already '{current_value}'. No change needed."
                     log.info(msg)
                     return True, msg

                # *** CORRECTED: Set value on the found widget, then apply the whole config ***
                log.debug(f"Setting widget '{setting_name}' from '{current_value}' to '{value_to_set}' (Type: {type(value_to_set)})")
                widget.set_value(value_to_set)
                self.camera.set_config(config, self.context)
                log.info(f"Successfully applied config change for '{setting_name}' to '{value_to_set}'")

                # Optional verification
                try:
                    # Re-fetch config and widget to verify
                    new_config = self.camera.get_config(self.context)
                    check_widget = self._find_widget_by_path(new_config, path_elements)
                    if check_widget:
                        new_value = check_widget.get_value()
                        log.info(f"Verified setting: {setting_name} = {new_value}")
                        if str(new_value) != str(value_to_set):
                            log.warning(f"Verification failed! Setting '{setting_name}' is '{new_value}' after set attempt.")
                            return False, f"Verification failed. Value is still '{new_value}'."
                    else:
                         log.warning(f"Could not find widget '{setting_name}' for verification.")
                except Exception as verify_e:
                     log.warning(f"Could not verify setting '{setting_name}' after change: {verify_e}")

                return True, f"Setting '{setting_name}' updated to '{value_to_set}'."

            except gp.GPhoto2Error as ex:
                log.error(f"Error setting config '{setting_name}' to '{value}': {ex.code} - {ex.string}")
                current_val_after_fail = "Unknown"
                try: # Try to read value again after failure using get_config
                    current_val_after_fail = self.get_config(setting_name)
                except: pass
                extra_msg = f" Current value is '{current_val_after_fail}'."
                if ex.code == gp.GP_ERROR_NOT_SUPPORTED:
                     return False, f"Setting '{setting_name}' is not supported for setting."
                return False, f"gphoto2 error: {ex.string}." + extra_msg
            except Exception as e:
                 log.error(f"Unexpected error setting config '{setting_name}': {e}", exc_info=True)
                 return False, f"Unexpected error: {e}"


    def capture_preview(self, target_path):
        """Captures a preview frame and saves it to target_path."""
        # This function remains the same as the previous version
        with self.lock:
            if not self._ensure_camera_connected(): return False

            try:
                camera_file = self.camera.capture_preview()
                file_data = camera_file.get_data_and_size()

                if not file_data or len(file_data) == 0:
                    log.warning("Captured preview data is empty.")
                    if os.path.exists(target_path):
                        try: os.remove(target_path)
                        except OSError: pass
                    return False

                with open(target_path, 'wb') as f:
                    f.write(file_data)

                if os.path.getsize(target_path) == 0:
                     log.warning(f"Preview file saved but is empty: {target_path}")
                     return False

                return True
            except gp.GPhoto2Error as ex:
                log.warning(f"Could not capture preview: {ex.code} - {ex.string}")
                if ex.code in [gp.GP_ERROR_IO, gp.GP_ERROR_CAMERA_ERROR, gp.GP_ERROR_TIMEOUT, gp.GP_ERROR_CAMERA_BUSY]:
                    log.warning("Potential connection issue during preview. Releasing camera handle.")
                    self._release_camera()
                if os.path.exists(target_path):
                    try: os.remove(target_path)
                    except OSError: pass
                return False
            except Exception as e:
                 log.error(f"Unexpected error capturing preview: {e}", exc_info=True)
                 if os.path.exists(target_path):
                     try: os.remove(target_path)
                     except OSError: pass
                 return False

    def capture_image(self, save_path):
        """
        Captures a full-resolution image, downloads it, saves it to the specified file path,
        attempts to delete it from the camera, then fully disconnects to ensure a fresh connection next time.
        """
        with self.lock:
            if not self._ensure_camera_connected():
                return False, None

            try:
                log.info("Capturing image...")
                file_path = self.camera.capture(gp.GP_CAPTURE_IMAGE, self.context)
                log.info(f"Image captured on camera: Folder: '{file_path.folder}', Name: '{file_path.name}'")

                log.info(f"Downloading {file_path.name} from {file_path.folder}...")
                camera_file = self.camera.file_get(file_path.folder, file_path.name, gp.GP_FILE_TYPE_NORMAL)
                log.info("Image data downloaded from camera.")
                camera_file.save(save_path)
                log.info(f"Image successfully saved to {save_path}")

                try:
                    log.info(f"Attempting to delete '{file_path.name}' from camera folder '{file_path.folder}'...")
                    self.camera.file_delete(file_path.folder, file_path.name)
                    log.info(f"Successfully deleted '{file_path.name}' from camera.")
                except gp.GPhoto2Error as del_ex:
                    log.warning(f"Could not delete image from camera: {del_ex.code} - {del_ex.string}")
                except Exception as del_e:
                    log.warning(f"Unexpected error deleting image from camera: {del_e}", exc_info=True)

                # Fully disconnect the camera after the capture
                self._release_camera()

                return True, save_path

            except gp.GPhoto2Error as ex:
                log.error(f"gphoto2 error during image capture/download: {ex.code} - {ex.string}")
                if ex.code in [gp.GP_ERROR_IO, gp.GP_ERROR_CAMERA_ERROR, gp.GP_ERROR_TIMEOUT, gp.GP_ERROR_CAMERA_BUSY]:
                    log.warning("Potential connection issue during capture. Releasing camera handle.")
                    self._release_camera()
                return False, None
            except Exception as e:
                log.error(f"Unexpected error capturing image: {e}", exc_info=True)
                self._release_camera()
                return False, None

    def __del__(self):
        """Ensure camera is released when the object is destroyed."""
        # This function remains the same
        print("CameraHandler being destroyed. Releasing camera...")
        if self.lock.acquire(blocking=False):
            try:
                if self.camera:
                    print(f"Releasing camera object {id(self.camera)} in __del__")
                    self._release_camera()
            finally:
                self.lock.release()
        else:
             print("Could not acquire lock in __del__ to release camera. Might be held by another thread.")
