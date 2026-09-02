import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from doc_utils import NumberedCanvas, get_base_styles, make_cover, create_callout, DOCS_DIR

def build_pdf():
    pdf_filename = os.path.join(DOCS_DIR, "05_Product_Requirements_and_Functional_PRD.pdf")
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
        title="Product Requirements Document (PRD) & Subsystems",
        subtitle="Functional & Non-Functional Specifications for Smart Living, Spatial Management, Security Citadel, and AI Orchestration",
        doc_code="SH-PRD-05",
        version="v4.0.0",
        author="Smarter Home Product Management & Engineering",
        date="August 2026",
        category="Product Requirements Document"
    ))
    
    # 2. Product Vision & Goals
    story.append(Paragraph("1. Product Vision & Core Objectives", styles['H1']))
    story.append(Paragraph(
        "<b>Smarter Home</b> delivers a unified, luxury-grade domestic operating system that seamlessly connects smart appliances, environmental climate systems, adaptive lighting zones, perimeter security, facial presence tracking, and conversational AI into an intuitive, responsive interface accessible across web, mobile, and voice.",
        styles['Body']
    ))
    story.append(Spacer(1, 4))

    # 3. Functional Subsystem Matrix
    story.append(Paragraph("2. Functional Subsystems & Feature Requirements", styles['H1']))
    
    prd_matrix = [
        [Paragraph("Subsystem Area", styles['TableHead']), Paragraph("Key Feature Set", styles['TableHead']), Paragraph("User Story & Functional Requirement", styles['TableHead'])],
        [
            Paragraph("<b>Rooms Citadel</b>", styles['TableCellBold']),
            Paragraph("Spatial Zone Management, Cover Photos, Live Aggregates, RTSP stream links.", styles['TableCell']),
            Paragraph("Users can create, edit, and organize domestic rooms (e.g. Nursery, Living Room), assign high-res photos via Supabase Storage, and bind local IP camera streams.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Climate Center</b>", styles['TableCellBold']),
            Paragraph("Nest-Style Radial Dial, Weekly HVAC Schedules, Eco Target Optimization, Filter Diagnostics.", styles['TableCell']),
            Paragraph("Homeowners can adjust target temperatures, switch HVAC modes (Cool, Warm, Eco, Fan), and configure granular 7-day hourly temperature schedules.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Lighting Studio</b>", styles['TableCellBold']),
            Paragraph("Bulb-by-bulb sliders, Kelvin Color Temp, Preset & Custom Scenes, Lifespan Analytics.", styles['TableCell']),
            Paragraph("Users can activate ambient lighting presets (Sunset, Focus, Movie, Blackout) and fine-tune individual bulb brightness with real-time UI glow feedback.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Security Citadel</b>", styles['TableCellBold']),
            Paragraph("10-Zone CCTV Feed, Auto-Arm Guard Schedules, Sensor Bypasses, Real-time Alarm Logs.", styles['TableCell']),
            Paragraph("Guards household perimeter with multi-zone camera surveillance, automated guard timetables, acoustic chimes, and instant incident timeline replay.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Citadel Occupants</b>", styles['TableCellBold']),
            Paragraph("Family Presence Tracking, Real-time Room Locations, Avatar Indicators, Neural Matching.", styles['TableCell']),
            Paragraph("Tracks presence ('Home', 'Away', 'At Work') and current room locations of enrolled family members via camera AI and door contact sensors.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Homer AI Assistant</b>", styles['TableCellBold']),
            Paragraph("Multi-Agent Orchestrator, SSE Activity Terminal, Tool Calling, 0-Token Voice Mode.", styles['TableCell']),
            Paragraph("Users interact via natural text or spoken voice. Homer delegates tasks to specialized agents (Climate, Lighting, Security) with full conversation memory.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Multi-Channel Alerts</b>", styles['TableCellBold']),
            Paragraph("Notification Center, Resend Email Dispatch, Facebook Messenger Bot, Web Audio Chimes.", styles['TableCell']),
            Paragraph("Broadcasts critical domestic warnings (water leaks, smoke triggers, stranger intrusions) simultaneously across UI toasts, emails, Messenger, and synthesized chimes.", styles['TableCell'])
        ]
    ]
    t_prd = Table(prd_matrix, colWidths=[110, 160, 234])
    t_prd.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 3.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(t_prd)
    story.append(Spacer(1, 10))

    # 4. Non-Functional Requirements
    story.append(Paragraph("3. Non-Functional System Requirements (NFR)", styles['H1']))
    story.append(Paragraph("• <b>Performance:</b> Client dashboard initial paint under 1.2s; telemetry sync latency under 100ms over WebSocket.", styles['Bullet']))
    story.append(Paragraph("• <b>Reliability:</b> Raspberry Pi controller maintains autonomous offline operation if cloud connection drops.", styles['Bullet']))
    story.append(Paragraph("• <b>Security:</b> 100% data access governed by PostgreSQL Row-Level Security (RLS) policies and cryptographically random tokens.", styles['Bullet']))
    story.append(Paragraph("• <b>Maintainability:</b> Strict modular architecture with zero source code files exceeding 500 lines of code.", styles['Bullet']))
    story.append(Spacer(1, 8))

    doc.build(story, canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, doc_title="Product Requirements Document (PRD)", doc_code="SH-PRD-05", **kwargs))
    print(f"[SUCCESS] Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
