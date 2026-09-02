import os
import sys
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Group, Polygon
from reportlab.lib import colors

def draw_crows_foot_erd():
    d = Drawing(504, 260)
    
    # Background Canvas Box
    d.add(Rect(0, 0, 504, 260, fillColor=colors.HexColor('#090d16'), strokeColor=colors.HexColor('#1e293b'), strokeWidth=1, rx=6, ry=6))
    
    # Header Label
    d.add(String(14, 244, "RELATIONAL ENTITY RELATIONSHIP DIAGRAM (CROW'S FOOT NOTATION)", fontName='Helvetica-Bold', fontSize=8, fillColor=colors.HexColor('#38bdf8')))
    d.add(Line(14, 238, 490, 238, strokeColor=colors.HexColor('#1e293b'), strokeWidth=0.75))
    
    def draw_entity(x, y, w, h, title, pk_fields, fk_fields, other_fields):
        g = Group()
        # Card Body
        g.add(Rect(x, y, w, h, fillColor=colors.HexColor('#0f172a'), strokeColor=colors.HexColor('#334155'), strokeWidth=0.75, rx=3, ry=3))
        # Card Header
        g.add(Rect(x, y + h - 16, w, 16, fillColor=colors.HexColor('#1e293b'), strokeColor=colors.HexColor('#334155'), strokeWidth=0.75, rx=3, ry=3))
        g.add(String(x + 6, y + h - 12, title, fontName='Helvetica-Bold', fontSize=7.5, fillColor=colors.HexColor('#f8fafc')))
        
        curr_y = y + h - 26
        for f in pk_fields:
            g.add(String(x + 6, curr_y, "PK", fontName='Helvetica-Bold', fontSize=6.5, fillColor=colors.HexColor('#f59e0b')))
            g.add(String(x + 22, curr_y, f, fontName='Helvetica', fontSize=6.5, fillColor=colors.HexColor('#e2e8f0')))
            curr_y -= 9
        for f in fk_fields:
            g.add(String(x + 6, curr_y, "FK", fontName='Helvetica-Bold', fontSize=6.5, fillColor=colors.HexColor('#38bdf8')))
            g.add(String(x + 22, curr_y, f, fontName='Helvetica', fontSize=6.5, fillColor=colors.HexColor('#cbd5e1')))
            curr_y -= 9
        for f in other_fields:
            g.add(String(x + 6, curr_y, "•", fontName='Helvetica-Bold', fontSize=6.5, fillColor=colors.HexColor('#64748b')))
            g.add(String(x + 22, curr_y, f, fontName='Helvetica', fontSize=6.5, fillColor=colors.HexColor('#94a3b8')))
            curr_y -= 9
        return g

    # Draw Entities
    # 1. auth.users (Top Left)
    d.add(draw_entity(16, 140, 105, 85, "auth.users", ["id: UUID"], [], ["email: TEXT", "created_at: TS"]))
    
    # 2. public.homes (Top Center)
    d.add(draw_entity(155, 130, 115, 95, "public.homes", ["id: UUID"], ["created_by: UUID"], ["name: TEXT", "invite_code: TEXT", "created_at: TS"]))
    
    # 3. public.home_members (Bottom Left)
    d.add(draw_entity(16, 15, 115, 95, "public.home_members", ["id: UUID"], ["home_id: UUID", "user_id: UUID"], ["role: TEXT", "joined_at: TS"]))
    
    # 4. public.home_tokens (Top Right)
    d.add(draw_entity(365, 140, 120, 85, "public.home_tokens", ["id: UUID"], ["home_id: UUID"], ["token: TEXT", "label: TEXT", "last_seen: TS"]))
    
    # 5. public.rooms (Bottom Center-Left)
    d.add(draw_entity(150, 15, 115, 95, "public.rooms", ["id: UUID"], ["home_id: UUID"], ["name: TEXT", "image_url: TEXT", "camera_ip: TEXT", "camera_stream: TEXT"]))
    
    # 6. public.home_states (Bottom Center-Right)
    d.add(draw_entity(275, 15, 105, 95, "public.home_states", ["id: UUID"], ["home_id: UUID"], ["key: TEXT", "value: JSONB", "updated_at: TS"]))
    
    # 7. public.conversations (Bottom Right)
    d.add(draw_entity(390, 15, 100, 95, "public.conversations", ["id: UUID"], ["home_id: UUID", "user_id: UUID"], ["title: TEXT", "updated_at: TS"]))

    # Draw Connectors & Crow's Feet
    # ----------------------------------------------------
    # Helper to draw Crow's Foot End (pointing to Many)
    def draw_crows_foot_vertical(x, y, direction="down"):
        # direction 'down': crow expands downward from (x, y)
        # direction 'up': crow expands upward from (x, y)
        g = Group()
        if direction == "down":
            g.add(Line(x, y, x - 5, y - 8, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x, y, x + 5, y - 8, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x, y, x, y - 8, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            # Optional bar for 0/1/many
            g.add(Line(x - 5, y - 4, x + 5, y - 4, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
        elif direction == "up":
            g.add(Line(x, y, x - 5, y + 8, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x, y, x + 5, y + 8, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x, y, x, y + 8, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x - 5, y + 4, x + 5, y + 4, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
        return g

    def draw_crows_foot_horizontal(x, y, direction="right"):
        g = Group()
        if direction == "right":
            g.add(Line(x, y, x + 8, y - 5, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x, y, x + 8, y + 5, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x, y, x + 8, y, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x + 4, y - 5, x + 4, y + 5, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
        elif direction == "left":
            g.add(Line(x, y, x - 8, y - 5, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x, y, x - 8, y + 5, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x, y, x - 8, y, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
            g.add(Line(x - 4, y - 5, x - 4, y + 5, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
        return g

    def draw_one_bar_horizontal(x, y):
        g = Group()
        g.add(Line(x, y - 5, x, y + 5, strokeColor=colors.HexColor('#f59e0b'), strokeWidth=1.5))
        g.add(Line(x - 3, y - 5, x - 3, y + 5, strokeColor=colors.HexColor('#f59e0b'), strokeWidth=1.5))
        return g

    def draw_one_bar_vertical(x, y):
        g = Group()
        g.add(Line(x - 5, y, x + 5, y, strokeColor=colors.HexColor('#f59e0b'), strokeWidth=1.5))
        g.add(Line(x - 5, y + 3, x + 5, y + 3, strokeColor=colors.HexColor('#f59e0b'), strokeWidth=1.5))
        return g

    # Connector 1: auth.users (1) ───< public.home_members (N)
    d.add(Line(68, 140, 68, 110, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(draw_one_bar_vertical(68, 133))
    d.add(draw_crows_foot_vertical(68, 118, "down"))
    
    # Connector 2: auth.users (1) ───< public.homes (N - created_by)
    d.add(Line(121, 180, 155, 180, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(draw_one_bar_horizontal(128, 180))
    d.add(draw_crows_foot_horizontal(147, 180, "right"))

    # Connector 3: public.homes (1) ───< public.home_members (N)
    d.add(Line(170, 130, 170, 118, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(Line(170, 118, 110, 118, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(Line(110, 118, 110, 110, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(draw_one_bar_vertical(170, 125))
    d.add(draw_crows_foot_vertical(110, 118, "down"))

    # Connector 4: public.homes (1) ───< public.home_tokens (N)
    d.add(Line(270, 180, 365, 180, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(draw_one_bar_horizontal(278, 180))
    d.add(draw_crows_foot_horizontal(357, 180, "right"))

    # Connector 5: public.homes (1) ───< public.rooms (N)
    d.add(Line(205, 130, 205, 110, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(draw_one_bar_vertical(205, 124))
    d.add(draw_crows_foot_vertical(205, 118, "down"))

    # Connector 6: public.homes (1) ───< public.home_states (N)
    d.add(Line(225, 130, 225, 118, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(Line(225, 118, 325, 118, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(Line(325, 118, 325, 110, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(draw_one_bar_vertical(225, 124))
    d.add(draw_crows_foot_vertical(325, 118, "down"))

    # Connector 7: public.homes (1) ───< public.conversations (N)
    d.add(Line(245, 130, 245, 122, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(Line(245, 122, 440, 122, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(Line(440, 122, 440, 110, strokeColor=colors.HexColor('#64748b'), strokeWidth=1))
    d.add(draw_one_bar_vertical(245, 125))
    d.add(draw_crows_foot_vertical(440, 118, "down"))

    # Legend at bottom
    d.add(Rect(14, 4, 476, 8, fillColor=colors.HexColor('#0b1120'), strokeColor=colors.transparent))
    d.add(String(18, 4, "NOTATION LEGEND:", fontName='Helvetica-Bold', fontSize=6, fillColor=colors.HexColor('#64748b')))
    d.add(String(85, 4, "|| = Exactly One (Parent PK)", fontName='Helvetica', fontSize=6, fillColor=colors.HexColor('#f59e0b')))
    d.add(String(185, 4, ">| = Zero, One, or Many (Crow's Foot FK)", fontName='Helvetica', fontSize=6, fillColor=colors.HexColor('#38bdf8')))
    d.add(String(325, 4, "Cascading Deletion Enforced on all FKs", fontName='Helvetica-Oblique', fontSize=6, fillColor=colors.HexColor('#94a3b8')))

    return d

def draw_system_topology_graph():
    d = Drawing(504, 180)
    d.add(Rect(0, 0, 504, 180, fillColor=colors.HexColor('#090d16'), strokeColor=colors.HexColor('#1e293b'), strokeWidth=1, rx=6, ry=6))
    d.add(String(14, 166, "SMARTER HOME MULTI-TIER SYSTEM ARCHITECTURE TOPOLOGY", fontName='Helvetica-Bold', fontSize=8, fillColor=colors.HexColor('#38bdf8')))
    d.add(Line(14, 160, 490, 160, strokeColor=colors.HexColor('#1e293b'), strokeWidth=0.75))

    def box(x, y, w, h, title, sub, color_hex):
        g = Group()
        g.add(Rect(x, y, w, h, fillColor=colors.HexColor('#0f172a'), strokeColor=colors.HexColor(color_hex), strokeWidth=1, rx=4, ry=4))
        g.add(Rect(x, y + h - 14, w, 14, fillColor=colors.HexColor(color_hex), strokeColor=colors.transparent, rx=4, ry=4))
        g.add(String(x + 4, y + h - 10, title, fontName='Helvetica-Bold', fontSize=6.5, fillColor=colors.white))
        g.add(String(x + 4, y + 4, sub, fontName='Helvetica', fontSize=6, fillColor=colors.HexColor('#94a3b8')))
        return g

    # Presentation Tier
    d.add(box(14, 90, 105, 55, "CLIENT / MOBILE", "Next.js 16 / React 19\nCapacitor 8 Android", '#0284c7'))
    
    # Application / AI Tier
    d.add(box(145, 90, 115, 55, "CLOUD APP & AI", "Gemini 2.5 Multi-Agent\nEdge Route Handlers", '#6366f1'))
    
    # Backend Persistence Tier
    d.add(box(285, 90, 105, 55, "SUPABASE CLOUD", "PostgreSQL 15 / RLS\nRealtime & Storage", '#10b981'))

    # Dispatch & Alerts
    d.add(box(405, 90, 85, 55, "DISPATCH APIS", "Resend Email REST\nMeta Messenger", '#f59e0b'))

    # Edge IoT Tier
    d.add(box(145, 12, 245, 55, "RASPBERRY PI EDGE CONTROLLER (smarter-home-pi)", "Fastify 4.28 Micro-Server • TensorFlow.js WASM Face-API • 40-Pin GPIO HAL • RTSP Stream", '#ec4899'))

    # Connections
    d.add(Line(119, 118, 145, 118, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
    d.add(Line(260, 118, 285, 118, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
    d.add(Line(390, 118, 405, 118, strokeColor=colors.HexColor('#38bdf8'), strokeWidth=1))
    
    # Vertical to Edge Controller
    d.add(Line(202, 90, 202, 67, strokeColor=colors.HexColor('#f43f5e'), strokeWidth=1))
    d.add(Line(337, 90, 337, 67, strokeColor=colors.HexColor('#10b981'), strokeWidth=1))

    return d
