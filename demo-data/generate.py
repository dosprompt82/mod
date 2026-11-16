"""Generate the fictional demonstration files (all names, companies and figures are invented).

Run: backend/.venv/bin/python demo-data/generate.py
Creates demo-data/files/:
  email-thread-1..3.png       Example 1: email thread screenshots (overlapping) asking for a technical recommendation
  credit-agreement.pdf        Example 2: financial agreement with provisions needing interpretation (+ one image-only page)
  impairment-memo.docx        Example 3: memo with deliberately weak reasoning for the Critical Reviewer
  writing-sample.txt          Example 4: writing sample for a writing profile
  services-agreement-v1/v2.docx  Example 5: multi-document comparison
"""
from __future__ import annotations

import io
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent / "files"
FONTS = Path(__file__).resolve().parents[1] / "backend" / "app" / "assets" / "fonts"


def font(size: int, bold: bool = False):
    return ImageFont.truetype(str(FONTS / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")), size)


def email_png(path: Path, messages: list[dict], title: str) -> None:
    W = 1100
    body_font, small, bold = font(17), font(15), font(17, True)
    lines: list[tuple[str, object, str]] = []
    for m in messages:
        lines.append((m["from"], bold, "#111827"))
        lines.append((f"To: {m['to']}" + (f"   Cc: {m['cc']}" if m.get("cc") else ""), small, "#4b5563"))
        lines.append((m["date"], small, "#6b7280"))
        lines.append(("", small, "#000"))
        for para in m["body"].split("\n"):
            wrapped = textwrap.wrap(para, 92) or [""]
            for w in wrapped:
                lines.append((w, body_font, "#1f2937" if not m.get("quoted") else "#6b7280"))
        lines.append(("", small, "#000"))
        lines.append(("—" * 60, small, "#d1d5db"))
    H = 140 + 28 * len(lines)
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 52], fill="#f3f4f6")
    d.text((24, 15), "Inbox  ›  " + title[:70], font=font(18, True), fill="#111827")
    d.text((24, 70), title, font=font(22, True), fill="#111827")
    y = 112
    for text, f, color in lines:
        d.text((24, y), text, font=f, fill=color)
        y += 28
    im.save(path, optimize=True)


MSG1 = {"from": "Marcus Okafor <m.okafor@larkspur-analytics.example>", "to": "Jordan Ellis", "cc": "Dana Whitfield",
        "date": "Mon, Mar 2, 2026, 4:12 PM",
        "body": "Jordan,\nSales closed the Brightline Logistics deal on Friday: a three-year subscription to our platform ($540,000 total), a $60,000 implementation fee, and a 'premium onboarding' package billed at $15,000.\nCan we recognize the full $60,000 implementation fee in Q1? Dana is finalizing the board deck and would like to show it.\nMarcus"}
MSG2 = {"from": "Dana Whitfield <d.whitfield@larkspur-analytics.example>", "to": "Jordan Ellis", "cc": "Marcus Okafor",
        "date": "Tue, Mar 3, 2026, 9:05 AM",
        "body": "Jordan, adding context. The implementation is performed by our own team over roughly six weeks and involves configuring our proprietary data connectors; no other vendor could do it. The customer cannot use the platform until it is complete.\nThe contract also lets Brightline terminate for convenience after the first year with 90 days' notice and no penalty.\nI need your view by Wednesday end of day so I can finalize the deck. Can you also tell me whether the termination clause changes the contract term we should use?\nThanks, Dana"}
MSG1_QUOTED = {**MSG1, "quoted": True, "from": "On Mon, Mar 2, Marcus Okafor wrote:", "body": MSG1["body"].split("\n")[1]}
MSG3 = {"from": "Marcus Okafor <m.okafor@larkspur-analytics.example>", "to": "Jordan Ellis", "cc": "Dana Whitfield",
        "date": "Tue, Mar 3, 2026, 11:40 AM",
        "body": "Jordan, to be clear, I'd prefer we land on upfront recognition if there is any reasonable basis for it. The CFO is already expecting the number.\nMarcus"}


def make_emails() -> None:
    subject = "Brightline contract: revenue timing question"
    email_png(OUT / "email-thread-1.png", [MSG1], subject)
    email_png(OUT / "email-thread-2.png", [MSG2, MSG1_QUOTED], "RE: " + subject)
    email_png(OUT / "email-thread-3.png", [MSG3], "RE: " + subject)


AGREEMENT = [
    ("REVOLVING CREDIT AGREEMENT", "dated as of January 15, 2026, between LARKSPUR ANALYTICS, INC. (the \"Borrower\") and GRANITE HARBOR BANK, N.A. (the \"Lender\"). All parties and terms are fictional and for demonstration only."),
    ("ARTICLE 1 DEFINITIONS", "\"Consolidated EBITDA\" means net income plus interest expense, income taxes, depreciation and amortization, plus non-cash stock compensation, plus non-recurring restructuring charges not to exceed $750,000 in any fiscal year.\n\n\"Total Leverage Ratio\" means the ratio of Total Funded Debt to Consolidated EBITDA for the most recent four fiscal quarters.\n\n\"Material Adverse Effect\" means a material adverse effect on the business, operations or condition of the Borrower, as determined by the Lender in its reasonable discretion.\n\n\"Permitted Acquisition\" means an acquisition where, after giving pro forma effect, the Total Leverage Ratio does not exceed 3.75 to 1.00."),
    ("ARTICLE 2 THE CREDIT FACILITY", "2.1 Commitment. The Lender agrees to make revolving loans to the Borrower in an aggregate principal amount not to exceed $25,000,000 at any time outstanding.\n\n2.2 Interest. Loans bear interest at Term SOFR plus the Applicable Margin of 2.25% per annum, increasing to 2.75% per annum if the Total Leverage Ratio exceeds 3.00 to 1.00.\n\n2.3 Commitment Fee. The Borrower shall pay a commitment fee of 0.35% per annum on the average daily unused portion of the Commitment, payable quarterly in arrears.\n\n2.4 Prepayment. Loans may be prepaid at any time. Any reduction of the Commitment in full before the second anniversary of the Closing Date requires a prepayment premium of 1.00% of the Commitment."),
    ("ARTICLE 6 FINANCIAL COVENANTS", "6.1 Maximum Total Leverage Ratio. The Borrower shall maintain a Total Leverage Ratio of not more than 3.50 to 1.00 as of the last day of each fiscal quarter.\n\n6.2 Minimum Fixed Charge Coverage. The Borrower shall maintain a Fixed Charge Coverage Ratio of not less than 1.25 to 1.00 as of the last day of each fiscal quarter.\n\n6.3 Equity Cure. If the Borrower fails to comply with Section 6.1 or 6.2, it may cure such failure by receiving cash equity contributions within 10 Business Days after the date financial statements are required to be delivered; the cure right may be exercised no more than twice during the term of this Agreement."),
    ("ARTICLE 7 REPORTING", "7.1 Quarterly Financial Statements. Within 45 days after the end of each of the first three fiscal quarters, the Borrower shall deliver unaudited consolidated financial statements and a Compliance Certificate.\n\n7.2 Annual Financial Statements. Within 120 days after fiscal year end, audited consolidated financial statements.\n\n7.3 Compliance Certificate. Each Compliance Certificate shall be delivered within 60 days after the end of the applicable fiscal quarter and shall demonstrate compliance with Article 6."),
    ("ARTICLE 8 EVENTS OF DEFAULT", "8.1 Events of Default include: (a) failure to pay principal when due; (b) failure to pay interest within 3 Business Days of the due date; (c) breach of Article 6, subject to Section 6.3; (d) a Change of Control; and (e) the occurrence of any event that has had, or could reasonably be expected to have, a Material Adverse Effect.\n\n8.2 \"Change of Control\" means any person acquiring more than 35% of the voting equity of the Borrower, other than the Permitted Holders. \"Permitted Holders\" is not otherwise defined in this Agreement.\n\n8.3 Remedies. Upon an Event of Default the Lender may terminate the Commitment and declare all Loans immediately due and payable."),
]


def make_pdf() -> None:
    from fpdf import FPDF

    pdf = FPDF(format="Letter")
    pdf.add_font("DejaVu", "", str(FONTS / "DejaVuSans.ttf"))
    pdf.add_font("DejaVu", "B", str(FONTS / "DejaVuSans-Bold.ttf"))
    pdf.set_margins(25, 25, 25)
    for i, (heading, body) in enumerate(AGREEMENT):
        if i in (0, 2, 3, 5):
            pdf.add_page()
        pdf.set_font("DejaVu", "B", 13 if i else 16)
        pdf.multi_cell(0, 8, heading)
        pdf.ln(2)
        pdf.set_font("DejaVu", "", 10.5)
        pdf.multi_cell(0, 5.8, body)
        pdf.ln(5)
    # Image-only page (simulates a scanned schedule) to exercise vision detection.
    im = Image.new("RGB", (1275, 1650), "white")
    d = ImageDraw.Draw(im)
    d.text((110, 120), "SCHEDULE 1 - LENDER COMMITMENTS (scanned)", font=font(30, True), fill="black")
    d.text((110, 200), "Granite Harbor Bank, N.A.     Commitment: $25,000,000     Pro rata share: 100%", font=font(24), fill="black")
    d.text((110, 260), "Signed: ____________________   Date: January 15, 2026", font=font(24), fill="black")
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    pdf.add_page()
    pdf.image(buf, x=0, y=0, w=pdf.w, h=pdf.h)
    pdf.output(str(OUT / "credit-agreement.pdf"))


def make_memo() -> None:
    import docx

    d = docx.Document()
    d.add_heading("MEMORANDUM: Goodwill impairment assessment, Q4 2025", 0)
    d.add_paragraph("To: Audit Committee   From: Finance   Date: January 20, 2026   (Fictional demonstration document)")
    d.add_heading("Conclusion", 1)
    d.add_paragraph("No impairment of the $18.0 million of goodwill allocated to the Field Services reporting unit is required. The reporting unit's fair value clearly exceeds its carrying amount, so no further analysis is necessary.")
    d.add_heading("Background", 1)
    d.add_paragraph("Field Services revenue declined 22% in 2025 after the loss of its two largest customers, and the unit reported an operating loss for the first time. Management's budget assumes revenue returns to 2024 levels in 2026.")
    d.add_heading("Analysis", 1)
    d.add_paragraph("Fair value was estimated using a market multiple of 9.0x applied to 2026 budgeted EBITDA of $3.1 million, giving a fair value of $31.9 million. The carrying amount of the reporting unit is $26.4 million, so fair value exceeds carrying amount by a comfortable margin.")
    d.add_paragraph("The 9.0x multiple is consistent with industry practice as confirmed in Section 4.2 of the industry guide. Because the customer losses are temporary, the 2025 results are not representative and were excluded.")
    d.add_paragraph("A qualitative assessment also supports this conclusion because the overall company share price increased during the year.")
    d.add_heading("Recommendation", 1)
    d.add_paragraph("Record no impairment and do not disclose the Field Services decline in the notes, since it is not material.")
    d.save(str(OUT / "impairment-memo.docx"))


WRITING = """I've read the draft and I think the conclusion is right, but the reasoning gets there by a longer road than it needs to. The contract has one performance obligation that matters here. Everything else follows from that.

Two things would make it stronger. First, say plainly why the implementation isn't distinct: the customer can't benefit from it on its own, and nobody else could perform it. Second, deal with the termination clause up front, because it changes the contract term and the reader will ask about it.

I'd cut the history section. It's accurate, but nobody reading this needs it to make the decision.

Happy to talk it through tomorrow if that's easier. Otherwise send me the next version and I'll turn it around the same day."""


def make_services() -> None:
    import docx

    def build(path: Path, v: dict) -> None:
        d = docx.Document()
        d.add_heading(f"MASTER SERVICES AGREEMENT (Version {v['ver']})", 0)
        d.add_paragraph("Between Larkspur Analytics, Inc. (\"Provider\") and Brightline Logistics LLC (\"Customer\"). Fictional demonstration document.")
        d.add_heading("1. Fees and Payment", 1)
        d.add_paragraph(f"Customer shall pay all undisputed invoices within {v['days']} days of the invoice date. Late amounts bear interest at {v['late']} per month.")
        d.add_heading("2. Term and Termination", 1)
        d.add_paragraph(f"The initial term is three years. {v['term']}")
        d.add_heading("3. Limitation of Liability", 1)
        d.add_paragraph(f"Each party's aggregate liability shall not exceed {v['cap']}. {v['carve']}")
        d.add_heading("4. Data Protection", 1)
        d.add_paragraph(v["data"])
        t = d.add_table(rows=3, cols=2)
        t.style = "Table Grid"
        for i, (a, b) in enumerate([("Service", "Monthly fee"), ("Platform subscription", "$15,000"), ("Premium support", v["support"])]):
            t.cell(i, 0).text, t.cell(i, 1).text = a, b
        d.save(str(path))

    build(OUT / "services-agreement-v1.docx", {"ver": 1, "days": 30, "late": "1.0%", "cap": "the fees paid in the twelve months preceding the claim",
          "carve": "The cap does not apply to breaches of confidentiality or indemnification obligations.",
          "term": "Either party may terminate for material breach not cured within 30 days of notice.",
          "data": "Provider shall notify Customer of any security incident affecting Customer data within 72 hours.", "support": "$2,500"})
    build(OUT / "services-agreement-v2.docx", {"ver": 2, "days": 45, "late": "1.5%", "cap": "the fees paid in the six months preceding the claim",
          "carve": "The cap does not apply to breaches of confidentiality obligations.",
          "term": "Either party may terminate for material breach not cured within 30 days of notice. Customer may terminate for convenience after the first year on 90 days' notice.",
          "data": "Provider shall notify Customer of any security incident affecting Customer data without undue delay.", "support": "$3,000"})


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make_emails()
    make_pdf()
    make_memo()
    (OUT / "writing-sample.txt").write_text(WRITING)
    make_services()
    for f in sorted(OUT.iterdir()):
        print(f"{f.name:32s} {f.stat().st_size:>8,} bytes")
