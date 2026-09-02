import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas
from doc_utils import NumberedCanvas, get_base_styles, make_cover, create_callout, DOCS_DIR
from doc_charts import draw_system_topology_graph

def build_pdf():
    pdf_filename = os.path.join(DOCS_DIR, "01_System_Digital_Architecture.pdf")
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
        title="System Digital Architecture Specification",
        subtitle="End-to-End Microservices, Edge IoT Controller, Native Mobile Hybrid & Cloud Telemetry Pipeline",
        doc_code="SH-ARCH-01",
        version="v3.3.0-Enterprise",
        author="Smarter Home Architecture & Core Engineering Group",
        date="August 2026",
        category="Architecture Specification"
    ))
    
    # 2. Executive Summary & Topology Graph
    story.append(Paragraph("1. Executive Summary & System Architecture Topology", styles['H1']))
    story.append(Paragraph(
        "The <b>Smarter Home Ecosystem</b> is a distributed, hybrid-edge IoT domestic intelligence platform designed for high-availability home automation, real-time spatial surveillance, AI-driven contextual assistance, and multi-tenant telemetry management.",
        styles['Body']
    ))
    story.append(Spacer(1, 4))
    
    # Embed the vector system topology graph
    story.append(draw_system_topology_graph())
    story.append(Spacer(1, 8))
    
    story.append(create_callout(
        "<b>Core Architecture Tenet:</b> Zero single-point-of-failure at the domestic perimeter. If external cloud or WAN connectivity is interrupted, the Raspberry Pi edge controller maintains autonomous local security loops, local face recognition, and GPIO sensor polling while buffering telemetry for deferred replication.",
        title="CRITICAL ARCHITECTURE DIRECTIVE", alert_type="info", styles=styles
    ))
    story.append(Spacer(1, 8))
    
    # 3. Microservices & Component Architecture
    story.append(Paragraph("2. Layered Microservices & Subsystem Breakdown", styles['H1']))
    story.append(Paragraph(
        "The architecture is partitioned into four distinct tiers, each fulfilling strict boundary constraints:",
        styles['Body']
    ))
    
    tiers_data = [
        [Paragraph("Tier Layer", styles['TableHead']), Paragraph("Core Responsibilities", styles['TableHead']), Paragraph("Key Protocols & Formats", styles['TableHead'])],
        [
            Paragraph("<b>Presentation & Client</b>", styles['TableCellBold']),
            Paragraph("Responsive Bento Grid dashboard, subpage Citadels (Climate, Lighting, Rooms, Security, Settings), real-time floorplans, voice waveform synthesis.", styles['TableCell']),
            Paragraph("React 19, Next.js 16 App Router, Tailwind CSS 4, Radix Themes, Lucide Icons", styles['TableCell'])
        ],
        [
            Paragraph("<b>Cloud Application & AI</b>", styles['TableCellBold']),
            Paragraph("Multi-agent query routing (Gemini 2.5 Flash), SSE streaming logs, permanent token ingestion, multi-tenant home gating, email/messenger dispatch.", styles['TableCell']),
            Paragraph("Next.js Route Handlers, SSE (Server-Sent Events), HTTPS REST, Resend API, Meta Graph API", styles['TableCell'])
        ],
        [
            Paragraph("<b>State & Data Persistence</b>", styles['TableCellBold']),
            Paragraph("PostgreSQL database, Row Level Security (RLS), multi-home memberships, state key-values, user sessions, cryptographic token storage, binary asset buckets.", styles['TableCell']),
            Paragraph("Postgres RLS, pg_crypto, Supabase Realtime Channels, Supabase Storage S3 API", styles['TableCell'])
        ],
        [
            Paragraph("<b>Edge IoT Controller</b>", styles['TableCellBold']),
            Paragraph("Hardware GPIO management, 1-wire DS18B20 & DHT22 reading, Face-API inference, RTSP frame decoding, MJPEG streaming, permanent cloud bridging.", styles['TableCell']),
            Paragraph("Fastify 4.28, WebSocket (ws), MJPEG multipart, TensorFlow WASM/CPU, 1-Wire, GPIO", styles['TableCell'])
        ]
    ]
    t_tiers = Table(tiers_data, colWidths=[110, 244, 150])
    t_tiers.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 4),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(t_tiers)
    story.append(Spacer(1, 8))
    
    # 4. Multi-Tenant Homes & Data Isolation Architecture
    story.append(Paragraph("3. Multi-Tenant Homes & Data Isolation Model", styles['H1']))
    story.append(Paragraph(
        "All application telemetry, spatial rooms, appliance states, security alarms, and chat histories are architecturally isolated behind <b>Homes</b> (households). A single user may belong to multiple homes, but telemetry cannot cross home boundaries.",
        styles['Body']
    ))
    story.append(Paragraph("• <b>Cryptographic Invite System:</b> Each home generates a 48-character high-entropy hexadecimal invite token (<code>crypto.randomBytes(24).toString('hex')</code>) for seamless onboarding via deep link or manual entry.", styles['Bullet']))
    story.append(Paragraph("• <b>Non-Recursive Postgres RLS:</b> To avoid recursive query locks, RLS queries execute via <code>SECURITY DEFINER</code> functions (<code>is_home_member</code> and <code>is_home_admin_or_owner</code>) with explicit indexed joins.", styles['Bullet']))
    story.append(Paragraph("• <b>Cascade Integrity:</b> Removing a home or membership automatically purges dependent states without leaving orphaned rows.", styles['Bullet']))
    story.append(Spacer(1, 8))
    
    # 5. Live Edge-to-Cloud Video & Face Recognition Pipeline
    story.append(Paragraph("4. Edge-to-Cloud Video Stream & Neural Face Pipeline", styles['H1']))
    story.append(Paragraph(
        "The video subsystem marries IP cameras (Tapo C200 / C210) with local neural inference on the Raspberry Pi before streaming telemetry to the cloud:",
        styles['Body']
    ))
    
    flow_steps = [
        [Paragraph("Step", styles['TableHead']), Paragraph("Subsystem Execution", styles['TableHead']), Paragraph("Latency / Throughput", styles['TableHead'])],
        [Paragraph("<b>1. Ingestion</b>", styles['TableCellBold']), Paragraph("RTSP client captures 1080p H.264 streams or generates synthetic Cyber HUD standby frames in virtual environments.", styles['TableCell']), Paragraph("15-30 FPS native", styles['TableCell'])],
        [Paragraph("<b>2. AI Inference</b>", styles['TableCellBold']), Paragraph("TensorFlow.js WASM / SSD MobileNet extracts 128-dimensional facial embedding vectors and computes Euclidean distance against enrolled profiles.", styles['TableCell']), Paragraph("~120ms - 220ms inference", styles['TableCell'])],
        [Paragraph("<b>3. Annotation</b>", styles['TableCellBold']), Paragraph("Frame annotator paints bounding boxes (Emerald Green for family, Amber for strangers, Red for unauthorized), confidence labels, and Cyber HUD telemetry.", styles['TableCell']), Paragraph("< 15ms rasterization", styles['TableCell'])],
        [Paragraph("<b>4. Cloud Push</b>", styles['TableCellBold']), Paragraph("Controller dispatches JPEG multipart frames via <code>POST /api/pi/camera/live</code> authenticated with <code>x-pi-token: smp_live_...</code>.", styles['TableCell']), Paragraph("3-5 FPS HTTP / WSS", styles['TableCell'])],
        [Paragraph("<b>5. Client Playback</b>", styles['TableCellBold']), Paragraph("Dashboard dynamically switches from static CCTV placeholders to live multipart MJPEG streams, rendering HUD telemetry in real-time.", styles['TableCell']), Paragraph("< 200ms glass-to-glass", styles['TableCell'])]
    ]
    t_flow = Table(flow_steps, colWidths=[70, 314, 120])
    t_flow.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 4),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(t_flow)
    story.append(Spacer(1, 8))
    
    # 6. Web & Industry Citations
    story.append(Paragraph("5. Architectural References & Web Citations", styles['H1']))
    story.append(Paragraph("• <b>Next.js App Router Architecture:</b> Next.js Server Components & Route Handlers (<a href='https://nextjs.org/docs/app'>nextjs.org/docs/app</a>).", styles['Bullet']))
    story.append(Paragraph("• <b>Fastify Micro-Server Framework:</b> Asynchronous Node.js micro-services (<a href='https://fastify.dev/'>fastify.dev</a>).", styles['Bullet']))
    story.append(Paragraph("• <b>W3C Web Speech API:</b> Client Speech Recognition & Synthesis Specification (<a href='https://www.w3.org/TR/speech-api/'>w3.org/TR/speech-api</a>).", styles['Bullet']))
    story.append(Paragraph("• <b>TensorFlow.js & Face-API:</b> Neural facial detection in JavaScript/WASM (<a href='https://www.tensorflow.org/js'>tensorflow.org/js</a>).", styles['Bullet']))
    story.append(Spacer(1, 8))

    doc.build(story, canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, doc_title="System Digital Architecture", doc_code="SH-ARCH-01", **kwargs))
    print(f"[SUCCESS] Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
