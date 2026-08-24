# Smarter Home Pi - Controller Server

A high-performance Node.js TypeScript controller designed to run inside Docker on a Raspberry Pi. It monitors hardware sensors via GPIO, runs a continuous background facial recognition pipeline on the camera feed, and provides an interactive web dashboard for pin-to-sensor assignment while syncing bidirectionally with the `smarter-home` repository.

---

## Features

- **Interactive 40-Pin GPIO Dashboard**: Web UI displaying the full 40-pin Raspberry Pi header. Easily attach and reassign sensors to GPIO pins in real time.
- **Continuous Facial Recognition**: Runs continuously in the background alongside the Pi. Reports detection status to the API (`detected: boolean`, `status: "recognized" | "unknown" | "none"`, `person: string | null`, `confidence: number`, `timestamp: string`).
- **Extensible Sensor Drivers**: Out-of-the-box support for Temperature/Humidity (`DHT11`, `DHT22`, `DS18B20`) and Camera (`V4L2`/`libcamera`), with modular interfaces for future sensors (PIR motion, magnetic door switches, MQ2 gas sensors, relays).
- **Graceful Hardware Abstraction**: Automatically detects real Raspberry Pi hardware (`/sys/class/gpio`, `/dev/gpiomem`, `/dev/video*`) with seamless simulation fallback for local development or non-RPi Docker hosts.
- **Bidirectional Smarter-Home Sync**: Automatically pushes sensor telemetry and security detection events to `smarter-home`'s `/api/pi/telemetry` endpoint and Supabase.
- **Docker Ready**: Multi-stage Dockerfile and Docker Compose configuration supporting ARMv7/ARM64 Raspberry Pi boards and AMD64.

---

## Quick Start

### 1. Local Development (without Docker)
```bash
# Install dependencies
npm install

# Run in development mode with hot reload
npm run dev

# Or build and start production
npm run build
npm start
```
Dashboard available at: `http://localhost:4000`

### 2. Run with Docker Compose
```bash
# Build and start container
docker-compose up -d --build

# View logs
docker-compose logs -f
```

---

## API Endpoints

- `GET /` - Web UI dashboard with interactive 40-pin GPIO visualizer.
- `GET /api/status` - Controller health, uptime, hardware mode, and sync status.
- `GET /api/pins` - 40-pin header layout and active sensor pin mappings.
- `GET /api/sensors` - List all registered sensors and recent readings.
- `POST /api/sensors` - Register or update a sensor pin assignment.
- `DELETE /api/sensors/:id` - Detach and remove a sensor.
- `GET /api/sensors/readings` - Real-time readings from all sensors.
- `GET /api/faces` - List enrolled household face profiles.
- `POST /api/faces` - Enroll a new person with name and profile notes.
- `DELETE /api/faces/:id` - Delete an enrolled face profile.
- `POST /api/sync/trigger` - Trigger immediate telemetry synchronization with `smarter-home`.
- `WS /ws/telemetry` - Live WebSocket stream for instant sensor and facial recognition telemetry.
