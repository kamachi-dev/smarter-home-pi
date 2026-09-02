import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from doc_utils import NumberedCanvas, get_base_styles, make_cover, create_callout, DOCS_DIR

def build_pdf():
    pdf_filename = os.path.join(DOCS_DIR, "03_REST_and_WebSocket_API_Documentation.pdf")
    doc = SimpleDocTemplate(
        pdf_filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = get_base_styles()
    story = []
    
    # 1. Cover Page
    story.extend(make_cover(
        title="REST & WebSocket API Engineering Specification",
        subtitle="Complete Interface Specifications for Cloud Edge Routes, SSE AI Streams, WebSocket Telemetry, and Raspberry Pi Controller Endpoints",
        doc_code="SH-API-03",
        version="v3.1.0",
        author="Smarter Home Core API & Protocol Engineering Group",
        date="August 2026",
        category="API & Protocol Reference"
    ))
    
    # 2. API Overview
    story.append(Paragraph("1. API Architecture & Protocol Foundations", styles['H1']))
    story.append(Paragraph(
        "The Smarter Home Platform exposes a hybrid communication matrix combining <b>RESTful HTTP/JSON</b> endpoints, <b>Server-Sent Events (SSE)</b> for AI streaming logs, <b>Full-Duplex WebSockets</b> for low-latency hardware telemetry, and <b>Multipart MJPEG</b> streams for real-time annotated camera video.",
        styles['Body']
    ))
    story.append(Spacer(1, 4))

    # 3. Next.js Cloud Endpoints
    story.append(Paragraph("2. Next.js Cloud & AI Route Handlers", styles['H1']))
    
    cloud_endpoints = [
        [Paragraph("HTTP Method & Route", styles['TableHead']), Paragraph("Auth & Headers", styles['TableHead']), Paragraph("Payload / Parameters", styles['TableHead']), Paragraph("Response & Status", styles['TableHead'])],
        [
            Paragraph("<code>POST /api/assistant</code>", styles['TableCellBold']),
            Paragraph("Bearer Session Token", styles['TableCell']),
            Paragraph("<code>{ message: string, conversationId?: string, stream: boolean }</code>", styles['TableCellCode']),
            Paragraph("200 OK — JSON or SSE Stream: <code>{ text, toolCalls, logs }</code>", styles['TableCell'])
        ],
        [
            Paragraph("<code>GET /api/homes</code>", styles['TableCellBold']),
            Paragraph("Bearer Session Token", styles['TableCell']),
            Paragraph("None (reads authenticated user context)", styles['TableCell']),
            Paragraph("200 OK — <code>{ homes: Home[] }</code>", styles['TableCell'])
        ],
        [
            Paragraph("<code>POST /api/homes</code>", styles['TableCellBold']),
            Paragraph("Bearer Session Token", styles['TableCell']),
            Paragraph("<code>{ name: string }</code>", styles['TableCellCode']),
            Paragraph("201 Created — <code>{ home: Home, invite_code: string }</code>", styles['TableCell'])
        ],
        [
            Paragraph("<code>GET /api/homes/join</code>", styles['TableCellBold']),
            Paragraph("Public / Optional Token", styles['TableCell']),
            Paragraph("Query: <code>?code=48_hex_string</code>", styles['TableCellCode']),
            Paragraph("200 OK — Preview <code>{ id, name, memberCount }</code>", styles['TableCell'])
        ],
        [
            Paragraph("<code>POST /api/homes/join</code>", styles['TableCellBold']),
            Paragraph("Bearer Session Token", styles['TableCell']),
            Paragraph("<code>{ code: string }</code>", styles['TableCellCode']),
            Paragraph("200 OK — <code>{ success: true, homeId }</code>", styles['TableCell'])
        ],
        [
            Paragraph("<code>GET /api/rooms</code>", styles['TableCellBold']),
            Paragraph("Bearer Session Token", styles['TableCell']),
            Paragraph("Query: <code>?home_id=uuid</code>", styles['TableCellCode']),
            Paragraph("200 OK — <code>{ rooms: Room[] }</code>", styles['TableCell'])
        ],
        [
            Paragraph("<code>POST /api/rooms</code>", styles['TableCellBold']),
            Paragraph("Bearer Session Token", styles['TableCell']),
            Paragraph("<code>{ name, icon, image_url, camera_ip... }</code>", styles['TableCellCode']),
            Paragraph("201 Created — <code>{ room: Room }</code>", styles['TableCell'])
        ],
        [
            Paragraph("<code>POST /api/pi/camera/live</code>", styles['TableCellBold']),
            Paragraph("<code>x-pi-token: smp_live_...</code>", styles['TableCellCode']),
            Paragraph("<code>{ frameBase64: string, detection: Object }</code>", styles['TableCellCode']),
            Paragraph("200 OK — Ingests live frame & updates home buffer", styles['TableCell'])
        ],
        [
            Paragraph("<code>POST /api/notifications/email</code>", styles['TableCellBold']),
            Paragraph("Internal / Session", styles['TableCell']),
            Paragraph("<code>{ title, message, type, system, time }</code>", styles['TableCellCode']),
            Paragraph("200 OK — Dispatches email via Resend API", styles['TableCell'])
        ],
        [
            Paragraph("<code>POST /api/notifications/facebook</code>", styles['TableCellBold']),
            Paragraph("Internal / PSID Secret", styles['TableCell']),
            Paragraph("<code>{ recipientPsid, title, message, severity }</code>", styles['TableCellCode']),
            Paragraph("200 OK — Dispatches alert via Meta Graph API", styles['TableCell'])
        ]
    ]
    t_cloud = Table(cloud_endpoints, colWidths=[120, 95, 150, 139])
    t_cloud.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(t_cloud)
    story.append(Spacer(1, 10))

    # 4. Raspberry Pi Fastify Server Endpoints
    story.append(Paragraph("3. Raspberry Pi IoT Controller Server API", styles['H1']))
    
    pi_endpoints = [
        [Paragraph("HTTP Method & Route", styles['TableHead']), Paragraph("Purpose & Subsystem", styles['TableHead']), Paragraph("Request Parameters", styles['TableHead']), Paragraph("Sample Output Schema", styles['TableHead'])],
        [
            Paragraph("<code>GET /api/status</code>", styles['TableCellBold']),
            Paragraph("Controller health, uptime, hardware status, cloud target.", styles['TableCell']),
            Paragraph("None", styles['TableCell']),
            Paragraph("<code>{ status: 'running', isHardware: true, uptimeSeconds: 4200... }</code>", styles['TableCellCode'])
        ],
        [
            Paragraph("<code>GET /api/pins</code>", styles['TableCellBold']),
            Paragraph("40-pin header mapping with active sensor bindings.", styles['TableCell']),
            Paragraph("None", styles['TableCell']),
            Paragraph("<code>{ pins: [ { pinNumber: 7, bcmGpio: 4, name: 'GPIO 4'... } ] }</code>", styles['TableCellCode'])
        ],
        [
            Paragraph("<code>GET /api/sensors</code>", styles['TableCellBold']),
            Paragraph("Lists registered sensors and latest readings.", styles['TableCell']),
            Paragraph("None", styles['TableCell']),
            Paragraph("<code>{ sensors: SensorConfig[], readings: Record<string, Reading> }</code>", styles['TableCellCode'])
        ],
        [
            Paragraph("<code>POST /api/sensors</code>", styles['TableCellBold']),
            Paragraph("Dynamically attaches sensor to physical GPIO pin.", styles['TableCell']),
            Paragraph("<code>{ name, type, pinNumber, pollIntervalMs }</code>", styles['TableCellCode']),
            Paragraph("<code>{ success: true, sensor: SensorConfig }</code>", styles['TableCellCode'])
        ],
        [
            Paragraph("<code>GET /api/camera/stream</code>", styles['TableCellBold']),
            Paragraph("Live multipart MJPEG annotated camera stream.", styles['TableCell']),
            Paragraph("Query: <code>?room=roomId</code>", styles['TableCellCode']),
            Paragraph("HTTP 200 — <code>multipart/x-mixed-replace; boundary=frame</code>", styles['TableCellCode'])
        ],
        [
            Paragraph("<code>POST /api/faces/train</code>", styles['TableCellBold']),
            Paragraph("Trains AI recognition library with 10+ photos.", styles['TableCell']),
            Paragraph("<code>{ name: string, photos: string[], notes?: string }</code>", styles['TableCellCode']),
            Paragraph("<code>{ success: true, person: EnrolledPerson, message: string }</code>", styles['TableCellCode'])
        ],
        [
            Paragraph("<code>POST /api/config/token</code>", styles['TableCellBold']),
            Paragraph("Saves permanent cloud bridge token and tests sync.", styles['TableCell']),
            Paragraph("<code>{ token: 'smp_live_...', apiUrl?: string }</code>", styles['TableCellCode']),
            Paragraph("<code>{ success: true, linked: true, syncSuccess: true }</code>", styles['TableCellCode'])
        ]
    ]
    t_pi = Table(pi_endpoints, colWidths=[120, 115, 135, 134])
    t_pi.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(t_pi)
    story.append(Spacer(1, 10))

    # 5. WebSocket & Real-Time Events
    story.append(Paragraph("4. WebSocket Real-Time Telemetry Protocol (<code>ws://.../ws</code>)", styles['H1']))
    story.append(Paragraph(
        "For sub-millisecond local telemetry and bi-directional hardware control, the Raspberry Pi controller exposes a dedicated WebSocket endpoint:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>Telemetry Broadcast (Edge → Client):</b> Emits continuous payloads <code>{ type: 'telemetry', sensorId, temperatureC, humidityPct, timestamp }</code>.", styles['Bullet']))
    story.append(Paragraph("• <b>Face Recognition Alert (Edge → Client):</b> Broadcasts <code>{ type: 'face_detection', status: 'recognized'|'unknown', person, confidence, box }</code>.", styles['Bullet']))
    story.append(Paragraph("• <b>Hardware Actuation (Client → Edge):</b> Accepts commands <code>{ type: 'gpio_write', pinNumber: 12, value: 1 }</code>.", styles['Bullet']))
    story.append(Spacer(1, 8))

    doc.build(story, canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, doc_title="REST & WebSocket API Specification", doc_code="SH-API-03", **kwargs))
    print(f"[SUCCESS] Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
