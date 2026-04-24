#!/usr/bin/env bash
# Run from the project directory on a Raspberry Pi to install and configure
# the camera controller to start automatically on boot, launching Chromium
# directly in kiosk mode without loading the full desktop environment.
# Safe to re-run — replaces any existing installation.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=5000

echo "==> Installing system dependencies..."
sudo apt-get update -q
sudo apt-get install -y --no-install-recommends \
    chromium-browser xinit xserver-xorg xserver-xorg-video-all \
    libgphoto2-dev libraw-dev ffmpeg python3 python3-pip curl

echo "==> Upgrading pip (required on Bullseye — system pip is too old to parse Flask's pyproject.toml)..."
pip3 install --upgrade pip --timeout 60

echo "==> Installing Python requirements..."
python3 -m pip install --timeout 60 -r "$SCRIPT_DIR/requirements.txt"

echo "==> Stopping existing service if running..."
sudo systemctl stop camera-controller 2>/dev/null || true

echo "==> Installing camera-controller systemd service..."
sudo tee /etc/systemd/system/camera-controller.service > /dev/null <<EOF
[Unit]
Description=Remote Camera Controller
After=network.target

[Service]
User=$USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=/usr/bin/python3 $SCRIPT_DIR/run.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable camera-controller
echo "    Service installed and enabled."

echo "==> Configuring boot to console autologin (skips desktop)..."
sudo raspi-config nonint do_boot_behaviour B2
echo "    Boot mode set to console autologin."

echo "==> Writing ~/.bash_profile to start X automatically on tty1..."
cat > "$HOME/.bash_profile" <<'BASHPROFILE'
[[ -f ~/.bashrc ]] && source ~/.bashrc
if [[ -z "$DISPLAY" ]] && [[ "$(tty)" == "/dev/tty1" ]]; then
    exec startx
fi
BASHPROFILE

echo "==> Writing ~/.xinitrc for kiosk session..."
cat > "$HOME/.xinitrc" <<XINITRC
#!/bin/bash
xset -dpms       # disable power management
xset s off       # disable screensaver
xset s noblank   # prevent screen blanking

# Wait until Flask is ready before opening the browser
until curl -s http://127.0.0.1:${PORT} > /dev/null 2>&1; do
    sleep 1
done

exec chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-pinch --no-first-run --disable-translate --overscroll-history-navigation=0 http://127.0.0.1:${PORT}
XINITRC
chmod +x "$HOME/.xinitrc"
echo "    Kiosk session configured."

echo ""
echo "==> Setup complete. Run 'sudo reboot' to apply."
