import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from doc_utils import NumberedCanvas, get_base_styles, make_cover, create_callout, DOCS_DIR

def build_pdf():
    pdf_filename = os.path.join(DOCS_DIR, "06_Hardware_Integration_and_Pinout_Manual.pdf")
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
        title="Hardware Integration & GPIO Pinout Engineering Manual",
        subtitle="Raspberry Pi 40-Pin Header Configuration, Sensor Calibration, Neural Camera Rigging, and VirtualDevice Simulation Architecture",
        doc_code="SH-HW-06",
        version="v2.1.0",
        author="Smarter Home Embedded Systems & Hardware Engineering Group",
        date="August 2026",
        category="Hardware & Embedded Manual"
    ))
    
    # 2. Hardware Overview
    story.append(Paragraph("1. Edge Hardware Architecture & Controller Overview", styles['H1']))
    story.append(Paragraph(
        "The Smarter Home Pi controller runs on Raspberry Pi 3B+, 4B, or 5 hardware platforms running Raspberry Pi OS (64-bit). It provides physical sensor interfacing, 1-wire digital bus decoding, hardware PWM modulation, and edge AI video inferencing.",
        styles['Body']
    ))
    story.append(Spacer(1, 4))

    # 3. 40-Pin Header Physical Reference Table
    story.append(Paragraph("2. Complete Raspberry Pi 40-Pin Header Reference", styles['H1']))
    
    pinout_table = [
        [Paragraph("Left Header Pin (Odd)", styles['TableHead']), Paragraph("Signal / Bus", styles['TableHead']), Paragraph("Right Header Pin (Even)", styles['TableHead']), Paragraph("Signal / Bus", styles['TableHead'])],
        [Paragraph("<b>Pin 1</b>: 3.3V Power", styles['TableCell']), Paragraph("Power Rail (DC)", styles['TableCell']), Paragraph("<b>Pin 2</b>: 5.0V Power", styles['TableCell']), Paragraph("Power Rail (DC)", styles['TableCell'])],
        [Paragraph("<b>Pin 3</b>: GPIO 2 (SDA1)", styles['TableCell']), Paragraph("I2C Data Bus", styles['TableCell']), Paragraph("<b>Pin 4</b>: 5.0V Power", styles['TableCell']), Paragraph("Power Rail (DC)", styles['TableCell'])],
        [Paragraph("<b>Pin 5</b>: GPIO 3 (SCL1)", styles['TableCell']), Paragraph("I2C Clock Bus", styles['TableCell']), Paragraph("<b>Pin 6</b>: Ground (GND)", styles['TableCell']), Paragraph("System Ground", styles['TableCell'])],
        [Paragraph("<b>Pin 7</b>: GPIO 4 (GPCLK0)", styles['TableCell']), Paragraph("1-Wire DS18B20", styles['TableCell']), Paragraph("<b>Pin 8</b>: GPIO 14 (TXD)", styles['TableCell']), Paragraph("UART Transmit", styles['TableCell'])],
        [Paragraph("<b>Pin 9</b>: Ground (GND)", styles['TableCell']), Paragraph("System Ground", styles['TableCell']), Paragraph("<b>Pin 10</b>: GPIO 15 (RXD)", styles['TableCell']), Paragraph("UART Receive", styles['TableCell'])],
        [Paragraph("<b>Pin 11</b>: GPIO 17", styles['TableCell']), Paragraph("Motion PIR Zone 1", styles['TableCell']), Paragraph("<b>Pin 12</b>: GPIO 18 (PWM0)", styles['TableCell']), Paragraph("PWM Fan Speed", styles['TableCell'])],
        [Paragraph("<b>Pin 13</b>: GPIO 27", styles['TableCell']), Paragraph("Door Magnetic Contact", styles['TableCell']), Paragraph("<b>Pin 14</b>: Ground (GND)", styles['TableCell']), Paragraph("System Ground", styles['TableCell'])],
        [Paragraph("<b>Pin 15</b>: GPIO 22", styles['TableCell']), Paragraph("Gas / Smoke Sensor", styles['TableCell']), Paragraph("<b>Pin 16</b>: GPIO 23", styles['TableCell']), Paragraph("Relay Output 1", styles['TableCell'])],
        [Paragraph("<b>Pin 17</b>: 3.3V Power", styles['TableCell']), Paragraph("Power Rail (DC)", styles['TableCell']), Paragraph("<b>Pin 18</b>: GPIO 24", styles['TableCell']), Paragraph("Relay Output 2", styles['TableCell'])],
        [Paragraph("<b>Pin 19</b>: GPIO 10 (MOSI)", styles['TableCell']), Paragraph("SPI0 MOSI Bus", styles['TableCell']), Paragraph("<b>Pin 20</b>: Ground (GND)", styles['TableCell']), Paragraph("System Ground", styles['TableCell'])],
        [Paragraph("<b>Pin 21</b>: GPIO 9 (MISO)", styles['TableCell']), Paragraph("SPI0 MISO Bus", styles['TableCell']), Paragraph("<b>Pin 22</b>: GPIO 25", styles['TableCell']), Paragraph("Status LED Indicator", styles['TableCell'])],
        [Paragraph("<b>Pin 23</b>: GPIO 11 (SCLK)", styles['TableCell']), Paragraph("SPI0 Clock Bus", styles['TableCell']), Paragraph("<b>Pin 24</b>: GPIO 8 (CE0)", styles['TableCell']), Paragraph("SPI0 Chip Enable 0", styles['TableCell'])],
        [Paragraph("<b>Pin 25</b>: Ground (GND)", styles['TableCell']), Paragraph("System Ground", styles['TableCell']), Paragraph("<b>Pin 26</b>: GPIO 7 (CE1)", styles['TableCell']), Paragraph("SPI0 Chip Enable 1", styles['TableCell'])],
        [Paragraph("<b>Pin 27</b>: ID_SD", styles['TableCell']), Paragraph("I2C EEPROM Data", styles['TableCell']), Paragraph("<b>Pin 28</b>: ID_SC", styles['TableCell']), Paragraph("I2C EEPROM Clock", styles['TableCell'])],
        [Paragraph("<b>Pin 29</b>: GPIO 5", styles['TableCell']), Paragraph("Auxiliary Input 1", styles['TableCell']), Paragraph("<b>Pin 30</b>: Ground (GND)", styles['TableCell']), Paragraph("System Ground", styles['TableCell'])],
        [Paragraph("<b>Pin 31</b>: GPIO 6", styles['TableCell']), Paragraph("Auxiliary Input 2", styles['TableCell']), Paragraph("<b>Pin 32</b>: GPIO 12 (PWM0)", styles['TableCell']), Paragraph("Light Dimmer PWM", styles['TableCell'])],
        [Paragraph("<b>Pin 33</b>: GPIO 13 (PWM1)", styles['TableCell']), Paragraph("Hardware PWM 1", styles['TableCell']), Paragraph("<b>Pin 34</b>: Ground (GND)", styles['TableCell']), Paragraph("System Ground", styles['TableCell'])],
        [Paragraph("<b>Pin 35</b>: GPIO 19 (MISO)", styles['TableCell']), Paragraph("SPI1 MISO Bus", styles['TableCell']), Paragraph("<b>Pin 36</b>: GPIO 16", styles['TableCell']), Paragraph("Alarm Siren Relay", styles['TableCell'])],
        [Paragraph("<b>Pin 37</b>: GPIO 26", styles['TableCell']), Paragraph("Moisture Sensor", styles['TableCell']), Paragraph("<b>Pin 38</b>: GPIO 20 (MOSI)", styles['TableCell']), Paragraph("SPI1 MOSI Bus", styles['TableCell'])],
        [Paragraph("<b>Pin 39</b>: Ground (GND)", styles['TableCell']), Paragraph("System Ground", styles['TableCell']), Paragraph("<b>Pin 40</b>: GPIO 21 (SCLK)", styles['TableCell']), Paragraph("SPI1 Clock Bus", styles['TableCell'])]
    ]
    t_pins = Table(pinout_table, colWidths=[130, 122, 130, 122])
    t_pins.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 2.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')])
    ]))
    story.append(t_pins)
    story.append(Spacer(1, 8))

    # 4. Sensor Wiring Schematics & Calibration
    story.append(Paragraph("3. Sensor Wiring Schematics & Protocols", styles['H1']))
    story.append(Paragraph("• <b>DS18B20 Temperature Sensor:</b> VCC to Pin 1 (3.3V), GND to Pin 6 (GND), DATA to Pin 7 (GPIO 4) with a 4.7kΩ pull-up resistor between 3.3V and DATA line. Requires <code>dtoverlay=w1-gpio</code> in <code>/boot/config.txt</code>.", styles['Bullet']))
    story.append(Paragraph("• <b>DHT22 Humidity/Temperature:</b> VCC to Pin 2 (5.0V), GND to Pin 9 (GND), DATA to Pin 11 (GPIO 17) with 10kΩ pull-up.", styles['Bullet']))
    story.append(Paragraph("• <b>HC-SR501 PIR Motion Sensor:</b> VCC to Pin 4 (5.0V), GND to Pin 14 (GND), OUT to Pin 13 (GPIO 27). Sensitivity tuned to 3-7m range.", styles['Bullet']))
    story.append(Paragraph("• <b>VirtualDevice Simulation Fallback:</b> When executing on non-ARM/Windows/macOS platforms, <code>virtualDev.ts</code> generates sinusoidal temperature shifts, stochastic humidity fluctuations, and realistic motion events automatically.", styles['Bullet']))
    story.append(Spacer(1, 8))

    doc.build(story, canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, doc_title="Hardware Integration & Pinout Manual", doc_code="SH-HW-06", **kwargs))
    print(f"[SUCCESS] Generated: {pdf_filename}")

if __name__ == '__main__':
    build_pdf()
