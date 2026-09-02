import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from doc_utils import NumberedCanvas, get_base_styles, make_cover, create_callout, DOCS_DIR

def build_pdf():
    pdf_filename = os.path.join(DOCS_DIR, "07_Security_and_Identity_Architecture.pdf")
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
        title="Security, Authentication & Identity Architecture",
        subtitle="Zero-Trust Multi-Tenancy, Android Native PKCE OAuth Handshake, Permanent Cryptographic Tokens, and Edge Biometric Privacy",
        doc_code="SH-SEC-07",
        version="v3.0.0",
        author="Smarter Home Information Security & Cryptography Group",
        date="August 2026",
        category="Security & Identity Architecture"
    ))
    
    # 2. Security Philosophy
    story.append(Paragraph("1. Security Philosophy & Threat Model", styles['H1']))
    story.append(Paragraph(
        "Smarter Home applies a <b>Defense-in-Depth and Zero-Trust</b> posture across cloud, edge, and mobile domains. User telemetry, biometric face descriptors, and actuator control channels are cryptographically segmented to prevent unauthorized lateral traversal or data exfiltration.",
        styles['Body']
    ))
    story.append(Spacer(1, 4))

    # 3. Security Domains Matrix
    story.append(Paragraph("2. Threat Mitigation & Cryptographic Architecture", styles['H1']))
    
    sec_matrix = [
        [Paragraph("Security Domain", styles['TableHead']), Paragraph("Threat Vector / Risk", styles['TableHead']), Paragraph("Cryptographic & Architectural Mitigation", styles['TableHead'])],
        [
            Paragraph("<b>Mobile OAuth & PKCE</b>", styles['TableCellBold']),
            Paragraph("Authorization code interception or CSRF on mobile devices.", styles['TableCell']),
            Paragraph("Proof Key for Code Exchange (RFC 7636) with SHA256 code challenge. PKCE verifier written to hybrid <code>localStorage</code> surviving Android app backgrounding.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Multi-Tenant Isolation</b>", styles['TableCellBold']),
            Paragraph("Cross-tenant household telemetry leakage or tampering.", styles['TableCell']),
            Paragraph("PostgreSQL Row Level Security (RLS) policies evaluated via non-recursive <code>SECURITY DEFINER</code> functions, locking all rows strictly to verified home members.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Permanent Hub Tokens</b>", styles['TableCellBold']),
            Paragraph("Compromised edge device gaining arbitrary database access.", styles['TableCell']),
            Paragraph("Permanent tokens (<code>smp_live_...</code>) are hashed with SHA256 and mapped to single <code>home_id</code> scopes, granting ingest-only privileges.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Biometric Privacy</b>", styles['TableCellBold']),
            Paragraph("Storage of raw facial photos on edge controllers or cloud servers.", styles['TableCell']),
            Paragraph("Edge Face-API converts raw camera frames to 128-dimensional floating point embedding vectors in RAM. Raw frames are discarded immediately after inference.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Webhooks & Bots</b>", styles['TableCellBold']),
            Paragraph("Spoofed webhook requests from unauthorized third parties.", styles['TableCell']),
            Paragraph("Meta Graph API webhooks require SHA256 HMAC signature verification (<code>x-hub-signature-256</code>) with shared app secrets before payload ingestion.", styles['TableCell'])
        ],
        [
            Paragraph("<b>Live Live Updates (OTA)</b>", styles['TableCellBold']),
            Paragraph("Malicious binary or asset injection via over-the-air updates.", styles['TableCell']),
            Paragraph("Capgo production channels enforce bundle checksum validation, TLS pinning, and automatic rollback if bundle initialization fails to handshake.", styles['TableCell'])
        ]
    ]
    t_sec = Table(sec_matrix, colWidths=[110, 150, 244])
    t_sec.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 3.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(t_sec)
    story.append(Spacer(1, 10))

    # 4. Mobile Deep Link Authentication Sequence
    story.append(Paragraph("3. Mobile OAuth PKCE Sequence Breakdown", styles['H1']))
    story.append(Paragraph("1. User initiates 'Continue with Google' inside Capacitor WebView.", styles['Bullet']))
    story.append(Paragraph("2. App creates cryptographic <code>code_verifier</code> in localStorage and launches Chrome Custom Tabs via <code>Browser.open()</code>.", styles['Bullet']))
    story.append(Paragraph("3. Google validates credentials and redirects to <code>/api/auth/callback?code=123</code>.", styles['Bullet']))
    story.append(Paragraph("4. Server detects mobile client and dispatches custom URI <code>com.smarterhome.app://auth/callback?code=123</code>.", styles['Bullet']))
    story.append(Paragraph("5. Android OS routes intent to <code>MainActivity</code>; Capacitor app captures code via <code>appUrlOpen</code>.", styles['Bullet']))
    story.append(Paragraph("6. Client issues <code>exchangeCodeForSession(code)</code> using local verifier, obtaining signed JWT session.", styles['Bullet']))
    story.append(Spacer(1, 8))

    doc.build(story, canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, doc_title="Security & Identity Architecture", doc_code="SH-SEC-07", **kwargs))
    print(f"[SUCCESS] Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
