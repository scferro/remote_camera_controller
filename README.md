# Remote Camera Controller v0.2.0

A web-based application to remotely control and manage USB-connected cameras (primarily tested with Sony Alpha series) using Python, Flask, and gphoto2.

## Features

* **Web Interface:** Control your camera from any web browser on your network.
* **Live Preview:** View a live feed from the camera (configurable frame rate).
* **Camera Status:** See connection status and camera model.
* **Settings Display:** View camera settings (ISO, Aperture, Shutter Speed, etc.) dynamically based on camera capabilities.
* **Single Capture:** Trigger single image captures (RAW or JPEG based on camera setting). Images are downloaded to the server.
* **Timelapse Control:** Start and stop timelapse sequences with configurable interval and image count. Images are saved in dedicated folders.
* **(Planned) Image Processing:**
    * RAW processing controls for single images (using rawpy).
    * Batch RAW processing for timelapse sequences.
    * Timelapse video assembly (using ffmpeg) with configurable resolution, frame rate, and cropping.

## Prerequisites

1.  **Hardware:**
    * A Raspberry Pi (or other Linux-based computer).
    * A supported camera, tested with Sony A7ii (ILCE-7M2). Check [gphoto2 camera support list](http://gphoto.org/proj/libgphoto2/support.php).
    * USB cable to connect the camera.

2.  **System Dependencies (Debian/Raspberry Pi OS):**
    ```bash
    sudo apt-get update
    sudo apt-get install -y libgphoto2-dev libraw-dev ffmpeg python3 python3-pip git
    ```
    * `libgphoto2-dev`: Required for the `python-gphoto2` library.
    * `libraw-dev`: Required for the `rawpy` library (RAW image processing).
    * `ffmpeg`: Required for timelapse video assembly.
    * `python3`, `python3-pip`: For running the application and installing packages.
    * `git`: For cloning the repository.

3.  **Python:** Python 3.7 or higher recommended.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url> # Or download the source code
    cd remote_camera_controller
    ```

2.  **Install Python packages:**
    ```bash
    pip3 install -r requirements.txt
    ```

## Camera Setup

* **Connect:** Connect your camera to the Raspberry Pi/computer via USB.
* **Power On:** Turn the camera on.
* **CRITICAL: Set USB Mode:** On your camera menu, navigate to Setup -> USB Connection and set it to **`PC Remote`**. If it's set to `Mass Storage` or `MTP`, gphoto2 control will likely fail.

## Running the Application

1.  Navigate to the project directory:
    ```bash
    cd path/to/remote_camera_controller
    ```

2.  Run the application:
    ```bash
    python3 run.py
    ```

3.  The server will start, typically listening on `http://0.0.0.0:5000`.

## Raspberry Pi Kiosk Setup (Boot Directly to Fullscreen Browser)

This configures the Pi to boot straight into Chromium without loading the full desktop environment — significantly faster on a Pi 3B. The app runs as a background service and Chromium opens automatically once it's ready.

**Prerequisites:**
- Raspberry Pi OS **with Desktop** installed (not Lite — X server must be present)
- Run the script once from the project directory:

```bash
bash setup_pi.sh
```

**What the script does:**
1. Installs system dependencies (`chromium-browser`, `xinit`, `libgphoto2-dev`, `ffmpeg`, etc.)
2. Installs Python requirements from `requirements.txt`
3. Creates and enables a systemd service that starts Flask on every boot
4. Configures the Pi to **autologin to console** (skips the desktop entirely)
5. Writes `~/.bash_profile` to start the X server automatically on login
6. Writes `~/.xinitrc` to launch Chromium in kiosk mode, waiting until Flask is ready before opening

**Reboot to apply:**
```bash
sudo reboot
```

After reboot, the Pi will boot to console, start the Flask service, start X, and open Chromium fullscreen — no desktop UI involved.

**Notes for Pi 3B:**
- Skipping the desktop saves ~20–40 seconds of boot time compared to loading LXDE.
- Chromium opens exactly when Flask is ready (polls `http://127.0.0.1:5000`) — no fixed sleep delay.
- The script is safe to re-run; it replaces any previous installation.

**To remove kiosk mode:**
```bash
sudo systemctl disable --now camera-controller
sudo rm /etc/systemd/system/camera-controller.service
rm ~/.xinitrc ~/.bash_profile
# To restore desktop boot:
sudo raspi-config nonint do_boot_behaviour B4
```

---

## Usage

1.  Open a web browser on a device connected to the same network as the computer running the application.
2.  Navigate to `http://<ip_address_of_computer>:5000` (e.g., `http://192.168.1.100:5000`).
3.  Use the web interface:
    * **Live Control Tab:** View status, start/stop preview, change settings, capture single images, and control timelapse sequences.
    * **Timelapse Processing Tab:** View completed timelapse folders and (planned) process them into videos.
    * **Single Image Processing Tab:** (Planned) Process individual captured images.

## License

This project is licensed under the MIT License.
