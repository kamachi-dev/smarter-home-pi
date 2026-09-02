import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

DOCS_DIR = r"C:\Documents\Development\Documents\Smarter home"
os.makedirs(DOCS_DIR, exist_ok=True)

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, doc_title="SMARTER HOME PLATFORM", doc_code="DOC-ENG-2026", **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self.doc_title = doc_title
        self.doc_code = doc_code

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            return  # Suppress headers/footers on cover page
        self.saveState()
        self.setFont('Helvetica-Bold', 7)
        self.setFillColor(colors.HexColor('#475569'))
        
        # Top Header
        self.drawString(54, 752, "SMARTER HOME ECOSYSTEM")
        self.setFont('Helvetica', 7)
        self.setFillColor(colors.HexColor('#64748b'))
        self.drawRightString(612 - 54, 752, f"{self.doc_title.upper()} | {self.doc_code}")
        self.setStrokeColor(colors.HexColor('#cbd5e1'))
        self.setLineWidth(0.75)
        self.line(54, 744, 612 - 54, 744)
        
        # Bottom Footer
        self.setStrokeColor(colors.HexColor('#e2e8f0'))
        self.line(54, 45, 612 - 54, 45)
        self.setFont('Helvetica-Bold', 7)
        self.setFillColor(colors.HexColor('#94a3b8'))
        self.drawString(54, 32, "CONFIDENTIAL & PROPRIETARY — SYSTEM SPECIFICATION")
        self.setFont('Helvetica', 7)
        self.drawRightString(612 - 54, 32, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()

def get_base_styles():
    base = getSampleStyleSheet()
    
    styles = {
        'CoverTitle': ParagraphStyle('CoverTitle', parent=base['Title'], fontName='Helvetica-Bold', fontSize=24, leading=28, textColor=colors.HexColor('#0f172a'), alignment=0),
        'CoverSubtitle': ParagraphStyle('CoverSubtitle', parent=base['Normal'], fontName='Helvetica', fontSize=11, leading=15, textColor=colors.HexColor('#475569'), alignment=0),
        'CoverMeta': ParagraphStyle('CoverMeta', parent=base['Normal'], fontName='Helvetica', fontSize=8.5, leading=13, textColor=colors.HexColor('#334155')),
        'CoverMetaBold': ParagraphStyle('CoverMetaBold', parent=base['Normal'], fontName='Helvetica-Bold', fontSize=8.5, leading=13, textColor=colors.HexColor('#0f172a')),
        
        'H1': ParagraphStyle('DocH1', parent=base['Heading1'], fontName='Helvetica-Bold', fontSize=14, leading=17, textColor=colors.HexColor('#0f172a'), spaceBefore=12, spaceAfter=5, keepWithNext=True),
        'H2': ParagraphStyle('DocH2', parent=base['Heading2'], fontName='Helvetica-Bold', fontSize=10.5, leading=13.5, textColor=colors.HexColor('#1e293b'), spaceBefore=9, spaceAfter=4, keepWithNext=True),
        'H3': ParagraphStyle('DocH3', parent=base['Heading3'], fontName='Helvetica-Bold', fontSize=9, leading=11.5, textColor=colors.HexColor('#334155'), spaceBefore=6, spaceAfter=3, keepWithNext=True),
        
        'Body': ParagraphStyle('DocBody', parent=base['Normal'], fontName='Helvetica', fontSize=8, leading=11.5, textColor=colors.HexColor('#1e293b'), spaceAfter=4),
        'BodyBold': ParagraphStyle('DocBodyBold', parent=base['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=11.5, textColor=colors.HexColor('#0f172a')),
        'Bullet': ParagraphStyle('DocBullet', parent=base['Normal'], fontName='Helvetica', fontSize=8, leading=11.5, textColor=colors.HexColor('#1e293b'), leftIndent=12, firstLineIndent=-8, spaceAfter=2),
        'Code': ParagraphStyle('DocCode', parent=base['Normal'], fontName='Courier', fontSize=7, leading=9.5, textColor=colors.HexColor('#0f172a')),
        'Callout': ParagraphStyle('DocCallout', parent=base['Normal'], fontName='Helvetica', fontSize=7.5, leading=11, textColor=colors.HexColor('#1e293b')),
        'TableHead': ParagraphStyle('DocTableHead', parent=base['Normal'], fontName='Helvetica-Bold', fontSize=7.5, leading=9.5, textColor=colors.white),
        'TableCell': ParagraphStyle('DocTableCell', parent=base['Normal'], fontName='Helvetica', fontSize=7, leading=9.5, textColor=colors.HexColor('#1e293b')),
        'TableCellBold': ParagraphStyle('DocTableCellBold', parent=base['Normal'], fontName='Helvetica-Bold', fontSize=7, leading=9.5, textColor=colors.HexColor('#0f172a')),
        'TableCellCode': ParagraphStyle('DocTableCellCode', parent=base['Normal'], fontName='Courier', fontSize=6.5, leading=8.5, textColor=colors.HexColor('#0f172a')),
    }
    return styles

def create_callout(text, title="NOTE / ARCHITECTURE DIRECTIVE", alert_type="info", styles=None):
    if styles is None:
        styles = get_base_styles()
    
    bg_map = {
        'info': colors.HexColor('#f0fdf4'),
        'warn': colors.HexColor('#fffbeb'),
        'danger': colors.HexColor('#fef2f2'),
        'primary': colors.HexColor('#f8fafc')
    }
    border_map = {
        'info': colors.HexColor('#16a34a'),
        'warn': colors.HexColor('#d97706'),
        'danger': colors.HexColor('#dc2626'),
        'primary': colors.HexColor('#0284c7')
    }
    
    bg_col = bg_map.get(alert_type, bg_map['primary'])
    border_col = border_map.get(alert_type, border_map['primary'])
    
    content = [
        Paragraph(f"<b>{title}</b>", ParagraphStyle('CalloutHead', parent=styles['Callout'], fontName='Helvetica-Bold', fontSize=7.5, textColor=border_col)),
        Spacer(1, 2),
        Paragraph(text, styles['Callout'])
    ]
    
    t = Table([[content]], colWidths=[504])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg_col),
        ('BOX', (0, 0), (-1, -1), 0.75, border_col),
        ('PADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return t

def make_cover(title, subtitle, doc_code, version, author, date, category):
    styles = get_base_styles()
    elements = []
    
    elements.append(Spacer(1, 25))
    cat_table = Table([[Paragraph(f"<b>{category.upper()}</b>", ParagraphStyle('CatBadge', fontName='Helvetica-Bold', fontSize=7.5, textColor=colors.HexColor('#0284c7')))]], colWidths=[180])
    cat_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#e0f2fe')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#38bdf8')),
        ('PADDING', (0,0), (-1,-1), 3.5),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    elements.append(cat_table)
    elements.append(Spacer(1, 12))
    
    elements.append(Paragraph(title, styles['CoverTitle']))
    elements.append(Spacer(1, 6))
    elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0f172a'), spaceBefore=4, spaceAfter=10))
    elements.append(Paragraph(subtitle, styles['CoverSubtitle']))
    elements.append(Spacer(1, 140))
    
    meta_data = [
        [Paragraph("Document ID:", styles['CoverMetaBold']), Paragraph(doc_code, styles['CoverMeta'])],
        [Paragraph("System Version:", styles['CoverMetaBold']), Paragraph(version, styles['CoverMeta'])],
        [Paragraph("Target Platforms:", styles['CoverMetaBold']), Paragraph("Next.js 16 (Web/SPA), Android 15/16 (Capacitor 8), Raspberry Pi (IoT / Linux)", styles['CoverMeta'])],
        [Paragraph("Author / Engineering Group:", styles['CoverMetaBold']), Paragraph(author, styles['CoverMeta'])],
        [Paragraph("Publication Date:", styles['CoverMetaBold']), Paragraph(date, styles['CoverMeta'])],
        [Paragraph("Security Classification:", styles['CoverMetaBold']), Paragraph("Confidential & Proprietary / Technical Specification", styles['CoverMeta'])],
    ]
    meta_table = Table(meta_data, colWidths=[140, 364])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 4),
        ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor('#f1f5f9')),
    ]))
    elements.append(meta_table)
    elements.append(PageBreak())
    return elements
