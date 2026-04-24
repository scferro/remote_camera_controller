#!/usr/bin/env bash
# Run once from the project directory on a Raspberry Pi to configure
# autostart on boot with Chromium kiosk mode.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER="$USER"
PORT=5000

echo "==> Installing camera-controller systemd service..."
sudo tee /etc/systemd/system/camera-controller.service > /dev/null <<EOF
[Unit]
Description=Remote Camera Controller
After=network.target

[Service]
User=${SERVICE_USER}
WorkingDirectory=${SCRIPT_DIR}
ExecStart=/usr/bin/python3 ${SCRIPT_DIR}/run.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now camera-controller
echo "    Service enabled and started."

echo "==> Creating Chromium kiosk autostart entry..."
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/camera-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Camera Kiosk
Exec=bash -c 'sleep 5 && chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-pinch --no-first-run http://localhost:${PORT}'
X-GNOME-Autostart-enabled=true
EOF
echo "    Autostart entry written to ~/.config/autostart/camera-kiosk.desktop"

echo ""
echo "==> Done. One manual step remaining:"
echo "    Enable desktop autologin so Chromium can open on boot:"
echo "    sudo raspi-config  ->  System Options -> Boot / Auto Login -> Desktop Autologin"
echo ""
echo "    Then reboot:  sudo reboot"
