import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from doc_utils import NumberedCanvas, get_base_styles, make_cover, create_callout, DOCS_DIR

def build_pdf():
    pdf_filename = os.path.join(DOCS_DIR, "04_Technology_Stack_and_Component_Inventory.pdf")
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
        title="Technology Stack & Component Inventory",
        subtitle="Complete Multi-Tier Hardware, Software, Native Mobile, Machine Learning, and Cloud Infrastructure Catalog",
        doc_code="SH-TECH-04",
        version="v3.3.0",
        author="Smarter Home Architecture & Core Engineering Group",
        date="August 2026",
        category="Tech Stack & Inventory"
    ))
    
    # 2. Technology Overview
    story.append(Paragraph("1. Technology Architecture Summary", styles['H1']))
    story.append(Paragraph(
        "The Smarter Home Platform integrates cutting-edge web frameworks, native mobile compilation toolchains, serverless cloud databases, edge micro-servers, and embedded machine learning neural backends. Every dependency is selected for strict memory isolation, sub-second execution, and platform portability.",
        styles['Body']
    ))
    story.append(Spacer(1, 6))

    # 3. Stack Component Breakdown
    story.append(Paragraph("2. Comprehensive Technology Matrix", styles['H1']))
    
    tech_matrix = [
        [Paragraph("Subsystem Layer", styles['TableHead']), Paragraph("Technology / Framework", styles['TableHead']), Paragraph("Exact Version", styles['TableHead']), Paragraph("Architectural Purpose & Justification", styles['TableHead'])],
        [
            Paragraph("<b>Frontend Framework</b>", styles['TableCellBold']),
            Paragraph("Next.js App Router (React)", styles['TableCell']),
            Paragraph("Next 16.2.7 / React 19.2.4", styles['TableCellCode']),
            Paragraph("High-performance server/client hybrid rendering, static SPA export, and fast route handling.", styles['TableCell'])
        ],
        [
            Paragraph("<b>UI Design System</b>", styles['TableCellBold']),
            Paragraph("Tailwind CSS v4 & Radix UI", styles['TableCell']),
            Paragraph("Tailwind 4.x / Radix 3.3.0", styles['TableCellCode']),
            Paragraph("Modern CSS glassmorphism, responsive Bento Grid layouts, accessible primitives, and fluid animations.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Icons & Typography</b>", styles['TableCellBold']),
            Paragraph("Lucide React & Outfit Font", styles['TableCell']),
            Paragraph("Lucide 1.17.0 / Google Fonts", styles['TableCellCode']),
            Paragraph("Crisp domestic iconography and clean geometric styling across all responsive viewports.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Mobile Runtime</b>", styles['TableCellBold']),
            Paragraph("Capacitor & Android SDK", styles['TableCell']),
            Paragraph("Capacitor 8.5.0 / Android 36", styles['TableCellCode']),
            Paragraph("Wraps web app into native Android APK with direct access to Chrome Custom Tabs, Deep Links, and JKS keys.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Live App Updates (OTA)</b>", styles['TableCellBold']),
            Paragraph("Capgo Capacitor Updater", styles['TableCell']),
            Paragraph("Capgo 8.51.14", styles['TableCellCode']),
            Paragraph("Instant over-the-air binary asset synchronization to production mobile devices without full APK rebuild.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Database & Storage</b>", styles['TableCellBold']),
            Paragraph("Supabase PostgreSQL & S3", styles['TableCell']),
            Paragraph("PostgreSQL 15+ / @supabase 2.108+", styles['TableCellCode']),
            Paragraph("Multi-tenant relational persistence, non-recursive RLS security policies, realtime replication, and zone media storage.", styles['TableCell'])
        ],
        [
            Paragraph("<b>AI Assistant Engine</b>", styles['TableCellBold']),
            Paragraph("Google Gemini Multi-Agent", styles['TableCell']),
            Paragraph("gemini-2.5-flash", styles['TableCellCode']),
            Paragraph("Natural language reasoning, tool calling for climate/lighting/security, and conversation memory retention.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Client Voice Engine</b>", styles['TableCellBold']),
            Paragraph("Web Speech API (TTS/STT)", styles['TableCell']),
            Paragraph("Native Browser Spec", styles['TableCellCode']),
            Paragraph("Zero-token Speech-to-Text and Text-to-Speech audio processing directly on the client without API cost.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Edge Micro-Server</b>", styles['TableCellBold']),
            Paragraph("Fastify & TypeScript (Node)", styles['TableCell']),
            Paragraph("Fastify 4.28.1 / TS 5.5.2", styles['TableCellCode']),
            Paragraph("Low-overhead, ultra-fast asynchronous IoT server running on Raspberry Pi OS / Linux.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Edge AI Inference</b>", styles['TableCellBold']),
            Paragraph("TensorFlow.js & Face-API", styles['TableCell']),
            Paragraph("TFJS 4.22.0 / Face-API 1.7.12", styles['TableCellCode']),
            Paragraph("WASM-accelerated facial detection, 128-d descriptor extraction, and real-time family enrollment.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Hardware Integration</b>", styles['TableCellBold']),
            Paragraph("Raspberry Pi GPIO & 1-Wire", styles['TableCell']),
            Paragraph("DS18B20 / DHT22 / rpi-gpio", styles['TableCellCode']),
            Paragraph("Hardware Abstraction Layer (HAL) with graceful virtual simulation fallback for non-RPi environments.", styles['TableCell'])
        ],
        [
            Paragraph("<b>IP Camera Driver</b>", styles['TableCellBold']),
            Paragraph("Tapo Camera Client & RTSP", styles['TableCell']),
            Paragraph("tapo-camera-client 1.0.0", styles['TableCellCode']),
            Paragraph("Decodes live RTSP video feeds from TP-Link Tapo C200 / C210 cameras for neural face processing.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Email Dispatch</b>", styles['TableCellBold']),
            Paragraph("Resend REST API", styles['TableCell']),
            Paragraph("Resend v2 REST Protocol", styles['TableCellCode']),
            Paragraph("Automated real-time critical notification emails with rich dark-mode HTML templates and status badges.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Messenger Bot</b>", styles['TableCellBold']),
            Paragraph("Meta Graph API (Facebook)", styles['TableCell']),
            Paragraph("Graph API v20.0", styles['TableCellCode']),
            Paragraph("Direct Facebook Messenger alert broadcast adhering to 'Engage with customers on Messenger' standards.", styles['TableCell'])
        ]
    ]
    t_tech = Table(tech_matrix, colWidths=[105, 120, 105, 174])
    t_tech.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(t_tech)
    story.append(Spacer(1, 10))

    # 4. Hardware Pinout Specification
    story.append(Paragraph("3. Raspberry Pi 40-Pin Header Physical Pinout Specification", styles['H1']))
    story.append(Paragraph(
        "The edge controller defines a standardized hardware map across the standard Raspberry Pi 40-pin GPIO expansion header:",
        styles['Body']
    ))
    
    pin_matrix = [
        [Paragraph("Physical Pin", styles['TableHead']), Paragraph("BCM GPIO", styles['TableHead']), Paragraph("Signal Type / Bus", styles['TableHead']), Paragraph("Assigned Sensor / Hardware Role", styles['TableHead'])],
        [Paragraph("Pin 1 & 17", styles['TableCellBold']), Paragraph("—", styles['TableCell']), Paragraph("3.3V DC Power", styles['TableCell']), Paragraph("Power rail for DS18B20 and digital logic sensors.", styles['TableCell'])],
        [Paragraph("Pin 2 & 4", styles['TableCellBold']), Paragraph("—", styles['TableCell']), Paragraph("5.0V DC Power", styles['TableCell']), Paragraph("Power rail for relay boards, cooling fans, and actuators.", styles['TableCell'])],
        [Paragraph("Pin 3 & 5", styles['TableCellBold']), Paragraph("GPIO 2 / 3", styles['TableCell']), Paragraph("I2C (SDA1 / SCL1)", styles['TableCell']), Paragraph("Environmental multi-sensor bus (BMP280, OLED displays).", styles['TableCell'])],
        [Paragraph("Pin 7", styles['TableCellBold']), Paragraph("GPIO 4", styles['TableCell']), Paragraph("1-Wire (W1-GPIO)", styles['TableCell']), Paragraph("Dedicated DS18B20 digital temperature sensor bus.", styles['TableCell'])],
        [Paragraph("Pin 8 & 10", styles['TableCellBold']), Paragraph("GPIO 14 / 15", styles['TableCell']), Paragraph("UART (TXD / RXD)", styles['TableCell']), Paragraph("Serial debugging or external microcontroller communication.", styles['TableCell'])],
        [Paragraph("Pin 11 & 13", styles['TableCellBold']), Paragraph("GPIO 17 / 27", styles['TableCell']), Paragraph("Digital GPIO", styles['TableCell']), Paragraph("PIR Motion detectors and door magnetic contact sensors.", styles['TableCell'])],
        [Paragraph("Pin 12 & 32", styles['TableCellBold']), Paragraph("GPIO 18 / 12", styles['TableCell']), Paragraph("Hardware PWM", styles['TableCell']), Paragraph("HVAC variable fan speed controls and LED dimmers.", styles['TableCell'])],
        [Paragraph("Pin 6, 9, 14, 20...", styles['TableCellBold']), Paragraph("—", styles['TableCell']), Paragraph("Common Ground (GND)", styles['TableCell']), Paragraph("Ground reference across all connected sensors.", styles['TableCell'])]
    ]
    t_pins = Table(pin_matrix, colWidths=[80, 75, 115, 234])
    t_pins.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(t_pins)
    story.append(Spacer(1, 10))

    doc.build(story, canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, doc_title="Technology Stack & Component Inventory", doc_code="SH-TECH-04", **kwargs))
    print(f"[SUCCESS] Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
