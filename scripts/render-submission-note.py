"""Render the two-page submission note from its Markdown source (ReportLab)."""
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/pdf/soup-submission-note.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
styles = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=23, leading=26, spaceAfter=10, textColor=colors.HexColor("#171717")),
    "heading": ParagraphStyle("heading", fontName="Helvetica-Bold", fontSize=11.3, leading=14, spaceBefore=12, spaceAfter=5),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10, leading=13.5, spaceAfter=7),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=9.2, leading=12),
}


def inline(text):
    text = escape(text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<link href="\2" color="#a33413"><u>\1</u></link>', text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return re.sub(r"`([^`]+)`", r'<font name="Courier" size="8.2">\1</font>', text)


story = []
blocks = (ROOT / "docs/submission/SUBMISSION.md").read_text().strip().split("\n\n")
for block in blocks:
    if block == "<!-- PAGE BREAK -->":
        story.append(PageBreak())
    elif block.startswith("# "):
        story.append(Paragraph(inline(block[2:]), styles["title"]))
    elif block.startswith("## "):
        story.append(Paragraph(inline(block[3:]), styles["heading"]))
    elif block.startswith("|"):
        rows = [[Paragraph(inline(cell.strip()), styles["cell"]) for cell in line.strip("|").split("|")]
                for line in block.splitlines() if not re.fullmatch(r"[|\s:\-]+", line)]
        table = Table(rows, colWidths=[254, 121, 132], hAlign="LEFT", repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0e6d6")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LINEBELOW", (0, 0), (-1, 0), .7, colors.HexColor("#b5a38b")),
            ("LINEBELOW", (0, 1), (-1, -1), .35, colors.HexColor("#dedede")),
        ]))
        story.extend([table, Spacer(1, 9)])
    else:
        story.append(Paragraph(inline(block.replace("\n", " ")), styles["body"]))


def page_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d4c9b7"))
    canvas.line(44, 33, A4[0] - 44, 33)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#555555"))
    canvas.drawString(44, 21, "Soup training monitor  |  Submission note  |  10 Nov 2026")
    canvas.drawRightString(A4[0] - 44, 21, str(doc.page))
    canvas.restoreState()


doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=44, leftMargin=44,
                        topMargin=35, bottomMargin=44,
                        title="Soup training monitor - submission note", author="vlat247",
                        subject="Frontend take-home: verdict, measured evidence, reflection and AI disclosure")
doc.build(story, onFirstPage=page_footer, onLaterPages=page_footer)
print(OUTPUT)
