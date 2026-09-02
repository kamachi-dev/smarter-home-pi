import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from doc_utils import NumberedCanvas, get_base_styles, make_cover, create_callout, DOCS_DIR

def build_pdf():
    pdf_filename = os.path.join(DOCS_DIR, "08_Operations_and_Deployment_Guide.pdf")
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
        title="Operations, Deployment & CI/CD Engineering Guide",
        subtitle="Vercel Cloud Hosting, Capacitor Android APK Compilation, Capgo OTA Updates, and Raspberry Pi Systemd Daemonization",
        doc_code="SH-OPS-08",
        version="v3.0.0",
        author="Smarter Home DevOps & Infrastructure Operations Group",
        date="August 2026",
        category="Operations & Deployment Manual"
    ))
    
    # 2. Deployment Topology
    story.append(Paragraph("1. Infrastructure Topology & Deployment Architecture", styles['H1']))
    story.append(Paragraph(
        "Smarter Home maintains a multi-target deployment pipeline: the web and API tier deploy continuously to <b>Vercel Edge & Serverless</b>, native mobile bundles compile to signed Android APKs with <b>Capgo OTA</b> channels, and edge controllers run as resilient <b>Linux systemd</b> background daemons.",
        styles['Body']
    ))
    story.append(Spacer(1, 4))

    # 3. Deployment Matrix Table
    story.append(Paragraph("2. Deployment Pipeline & Build Toolchain Matrix", styles['H1']))
    
    ops_matrix = [
        [Paragraph("Target Component", styles['TableHead']), Paragraph("Build Toolchain / Runtime", styles['TableHead']), Paragraph("Primary Commands & Scripts", styles['TableHead']), Paragraph("Output Artifacts & Environment", styles['TableHead'])],
        [
            Paragraph("<b>Next.js Cloud Tier</b>", styles['TableCellBold']),
            Paragraph("Next.js 16, Node.js 20, Vercel Build Engine", styles['TableCell']),
            Paragraph("<code>npm run build</code><br/><code>npm run typecheck</code>", styles['TableCellCode']),
            Paragraph("Vercel Serverless Functions & Edge Network Distribution.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Capacitor Android APK</b>", styles['TableCellBold']),
            Paragraph("Android Gradle 8.x, JDK 21, Android SDK 36", styles['TableCell']),
            Paragraph("<code>npm run cap:build:android</code><br/><code>npm run cap:build:all</code>", styles['TableCellCode']),
            Paragraph("<code>app-debug.apk</code> & <code>app-release.apk</code> (Self-signed with JKS).", styles['TableCell'])
        ],
        [
            Paragraph("<b>Capgo Live OTA</b>", styles['TableCellBold']),
            Paragraph("@capgo/cli, Capgo Production Channel", styles['TableCell']),
            Paragraph("<code>capgo bundle upload smarter.home.mmcl --channel production</code>", styles['TableCellCode']),
            Paragraph("Instant over-the-air binary web bundle pushed to active mobile devices.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Raspberry Pi Controller</b>", styles['TableCellBold']),
            Paragraph("Fastify, TypeScript 5.5, Node 20 / Linux", styles['TableCell']),
            Paragraph("<code>npm run build</code> (tsc)<br/><code>npm start</code> (node dist/index.js)", styles['TableCellCode']),
            Paragraph("Single-binary compiled JavaScript bundle running on port 8080.", styles['TableCell'])
        ]
    ]
    t_ops = Table(ops_matrix, colWidths=[110, 120, 140, 134])
    t_ops.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(t_ops)
    story.append(Spacer(1, 10))

    # 4. Raspberry Pi Systemd Service Configuration
    story.append(Paragraph("3. Raspberry Pi Edge Systemd Daemon Configuration", styles['H1']))
    story.append(Paragraph(
        "To ensure uninterrupted 24/7 edge operation, sensor monitoring, and automated restart on power failure, configure the controller as a systemd service:",
        styles['Body']
    ))
    
    systemd_unit = """[Unit]
Description=Smarter Home Raspberry Pi Edge Controller Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/smarter-home-pi
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=SMARTER_HOME_API_URL=https://smarter-home-app.vercel.app

[Install]
WantedBy=multi-user.target"""
    
    unit_table = Table([[Paragraph(f"<pre>{systemd_unit}</pre>", styles['TableCellCode'])]], colWidths=[504])
    unit_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#38bdf8')),
        ('PADDING', (0,0), (-1,-1), 5),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#1e293b')),
    ]))
    story.append(unit_table)
    story.append(Spacer(1, 8))

    doc.build(story, canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, doc_title="Operations & Deployment Guide", doc_code="SH-OPS-08", **kwargs))
    print(f"[SUCCESS] Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
