# Remote Camera Controller v0.1.0

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

2.  Run the Flask application:
    ```bash
    python3 app.py
    ```

3.  The server will start, typically listening on `http://0.0.0.0:5000`.

## Usage

1.  Open a web browser on a device connected to the same network as the computer running the application.
2.  Navigate to `http://<ip_address_of_computer>:5000` (e.g., `http://192.168.1.100:5000`).
3.  Use the web interface:
    * **Live Control Tab:** View status, start/stop preview, change settings, capture single images, and control timelapse sequences.
    * **Timelapse Processing Tab:** View completed timelapse folders and (planned) process them into videos.
    * **Single Image Processing Tab:** (Planned) Process individual captured images.

## License

This project is licensed under the MIT License.
