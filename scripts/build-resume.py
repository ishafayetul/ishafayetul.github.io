"""Regenerate the English public résumé from reviewed portfolio data."""
import json
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "content" / "data"
OUTPUT = ROOT / "public" / "documents" / "shafayetul-islam-resume.pdf"
INK = colors.HexColor("#172637")
MUTED = colors.HexColor("#364b5e")
TEAL = colors.HexColor("#00695e")


def load(name):
    return json.loads((DATA / f"{name}.json").read_text())


def english(record, key):
    return record.get(key, {}).get("en", "")


def month(value):
    return date.fromisoformat(value + "-01").strftime("%b %Y") if value else "Present"


styles = {
    "name": ParagraphStyle("Name", fontName="Helvetica-Bold", fontSize=26, leading=29, textColor=INK),
    "role": ParagraphStyle("Role", fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=TEAL),
    "head": ParagraphStyle("Head", fontName="Helvetica-Bold", fontSize=10.5, leading=14.5, textColor=TEAL, spaceBefore=10, spaceAfter=4),
    "body": ParagraphStyle("Body", fontName="Helvetica", fontSize=10, leading=13.7, textColor=MUTED, spaceAfter=3),
    "entry": ParagraphStyle("Entry", fontName="Helvetica", fontSize=10.3, leading=14, textColor=INK),
}


def paragraph(text, style="body"):
    return Paragraph(text, styles[style])


def entry(title, details, description=""):
    heading = paragraph(f"<b>{escape(title)}</b> | {escape(details)}", "entry")
    lines = [heading]
    if description:
        lines.append(paragraph(escape(description)))
    lines.append(Spacer(1, 2))
    return KeepTogether(lines)


def header(label):
    return paragraph(escape(label.upper()), "head")


def link(label, address):
    return f'<link href="{escape(address)}" color="#00695e">{escape(label)}</link>'


def main():
    profile = load("profile")
    job_links = [
        link(profile["email"], f"mailto:{profile['email']}"),
        link("LinkedIn", profile["linkedin"]),
        link("GitHub", profile["github"]),
        link("Google Scholar", profile["scholar"]),
    ]
    story = [
        paragraph(escape(profile["name"]), "name"),
        paragraph("Robotics Software Engineer", "role"),
        paragraph("Dhaka, Bangladesh &nbsp;|&nbsp; " + " &nbsp;|&nbsp; ".join(job_links)),
        header("Profile"),
        paragraph("Robotics software engineer specializing in ROS and ROS 2, autonomous navigation, UAV systems, computer vision and applied AI. Experience across industry and robotics research, with three IEEE publications."),
        header("Professional experience"),
    ]
    for role in load("experience"):
        period = f"{month(role['start'])} - {month(role.get('end'))}"
        story.append(entry(english(role, "title"), f"{english(role, 'organization')} | {period}", english(role, "description")))
    story.append(header("Selected engineering work"))
    projects = {project["id"]: project for project in load("projects")}
    highlights = {
        "aeromed": "Project lead on an ICT Innovation Fund-supported drone and ground rover system for remote medical support.",
        "uav-safe-landing": "M.Sc. research using semantic segmentation, hazard clearance and footprint validation to rank image-space candidates.",
        "phoenix-rover": "Electrical team lead for MIST Mongol Barota’s Phoenix rover and co-author of the IEEE Access paper.",
    }
    for project_id, description in highlights.items():
        project = projects.get(project_id)
        if project is None:
            continue
        story.append(paragraph(f"<b>{escape(english(project, 'title'))}.</b> {escape(description)}"))
    story.append(header("Education"))
    for education in load("education"):
        story.append(entry(english(education, "title"), f"{english(education, 'organization')} | {english(education, 'period')}",
                           english(education, "description") if english(education, "title").startswith("M.Sc.") else ""))
    story.append(header("Selected publications"))
    for publication in load("publications"):
        if publication["type"] == "journal":
            story.append(paragraph(link(publication["title"], f"https://doi.org/{publication['doi']}") + " | IEEE Access, 2022"))
    story.extend([
        header("Technologies and languages"),
        paragraph("Python, C++, ROS 2, Nav2, SLAM, AMCL, Gazebo, RViz, LiDAR, IMU, PX4, OpenCV, PyTorch, Linux and Git."),
        paragraph("Bengali (native) | English (IELTS overall 6.5) | Japanese (JLPT N4 passed)"),
    ])
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=44, rightMargin=44, topMargin=34, bottomMargin=32,
                      title="Shafayetul Islam | Robotics Software Engineer", author=profile["name"]).build(story)


if __name__ == "__main__":
    main()
