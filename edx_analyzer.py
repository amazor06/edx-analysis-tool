from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    HRFlowable
)

M_FE = 55.845
M_NB = 92.906
STANDARD_RUNS = 3


def calculate_x(w_fe, w_nb):
    return (w_fe / M_FE) * (M_NB / w_nb)


def get_yes_no(prompt):
    while True:
        choice = input(prompt).strip().lower()
        if choice in ["yes", "y"]:
            return True
        if choice in ["no", "n"]:
            return False
        print("Please enter yes or no.")


def get_sample_number():
    while True:
        sample_number = input("Enter sample number: ").strip()
        if sample_number:
            return sample_number
        print("Sample number cannot be empty.")


def build_formula_paragraph(x_value, style):
    return Paragraph(
        f"Composition: Fe<sub>{x_value:.4f}</sub>NbS<sub>2</sub>",
        style
    )


def generate_pdf_report(samples, filename="edx_sample_report.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        rightMargin=50,
        leftMargin=50,
        topMargin=50,
        bottomMargin=50
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=28,
        alignment=TA_CENTER,
        spaceAfter=18
    )

    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        textColor=colors.grey,
        alignment=TA_CENTER,
        spaceAfter=18
    )

    sample_heading_style = ParagraphStyle(
        "SampleHeading",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        spaceAfter=8
    )

    body_style = ParagraphStyle(
        "CleanBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        spaceAfter=6
    )

    elements = []

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    title = Paragraph(
        "EDX Fe Concentration Report for Fe<sub>x</sub>NbS<sub>2</sub> Samples",
        title_style
    )
    elements.append(title)

    subtitle = Paragraph(f"Generated on {timestamp}", subtitle_style)
    elements.append(subtitle)
    elements.append(Spacer(1, 8))

    for sample in samples:
        if sample["sample_name"]:
            sample_label = f"Sample {sample['sample_number']} — {sample['sample_name']}"
        else:
            sample_label = f"Sample {sample['sample_number']}"

        elements.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
        elements.append(Spacer(1, 10))

        heading = Paragraph(sample_label, sample_heading_style)
        elements.append(heading)
        elements.append(Spacer(1, 6))

        table_data = [["Point #", "Fe wt%", "Nb wt%", "x value", "Running Average"]]

        for point in sample["points"]:
            table_data.append([
                str(point["point_number"]),
                f'{point["w_fe"]:.4f}',
                f'{point["w_nb"]:.4f}',
                f'{point["x"]:.4f}',
                f'{point["running_avg"]:.4f}'
            ])

        table = Table(
            table_data,
            hAlign="LEFT",
            colWidths=[70, 85, 85, 80, 140]
        )

        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4F81BD")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 11),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F9FC")]),
            ("GRID", (0, 0), (-1, -1), 0.75, colors.black),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
            ("TOPPADDING", (0, 1), (-1, -1), 6),
        ]))

        elements.append(table)
        elements.append(Spacer(1, 12))

        total_points_paragraph = Paragraph(
            f"<b>Total points:</b> {sample['total_points']}",
            body_style
        )
        avg_paragraph = Paragraph(
            f"<b>Final average x:</b> {sample['final_avg']:.4f}",
            body_style
        )
        comp_paragraph = build_formula_paragraph(sample["final_avg"], body_style)

        elements.append(total_points_paragraph)
        elements.append(avg_paragraph)
        elements.append(comp_paragraph)
        elements.append(Spacer(1, 16))

    doc.build(elements)
    print(f"\nPDF report saved as: {filename}")


def main():
    print("EDX Fe_xNbS2 Sample Calculator")
    print("Each sample can contain multiple points.")
    print(f"Standard target: {STANDARD_RUNS} runs per sample.\n")

    all_samples = []

    while True:
        print("--- Starting New Sample ---")
        sample_number = get_sample_number()
        sample_name = input(
            "Enter optional sample name (or press Enter to skip): "
        ).strip()

        sample_points = []
        x_values = []
        point_count = 0

        while True:
            try:
                w_fe = float(input("Enter Fe weight %: "))
                w_nb = float(input("Enter Nb weight %: "))

                if w_fe <= 0 or w_nb <= 0:
                    print("Weight percentages must be positive.\n")
                    continue

                x = calculate_x(w_fe, w_nb)
                x_values.append(x)
                point_count += 1
                running_avg = sum(x_values) / len(x_values)

                sample_points.append({
                    "point_number": point_count,
                    "w_fe": w_fe,
                    "w_nb": w_nb,
                    "x": x,
                    "running_avg": running_avg
                })

                print(f"\nSample {sample_number}, Point {point_count} completed.")
                print(f"x for this point = {x:.4f}")
                print(f"Current average for Sample {sample_number} = {running_avg:.4f}")
                print(f"Points completed so far: {point_count}")

                if point_count < STANDARD_RUNS:
                    print(f"You are below the standard target of {STANDARD_RUNS} runs for this sample.\n")
                elif point_count == STANDARD_RUNS:
                    print(f"You have reached the standard target of {STANDARD_RUNS} runs for this sample.\n")
                else:
                    print(f"You are above the standard target of {STANDARD_RUNS} runs for this sample.\n")

                continue_sample = get_yes_no("Do you want to continue this sample? (yes/no): ")
                print()

                if not continue_sample:
                    break

            except ValueError:
                print("Please enter valid numeric values.\n")

        if point_count == 0:
            print("No points entered for this sample. Skipping.\n")
        else:
            final_avg = sum(x_values) / len(x_values)

            all_samples.append({
                "sample_number": sample_number,
                "sample_name": sample_name,
                "points": sample_points,
                "total_points": point_count,
                "final_avg": final_avg
            })

            print(f"Sample {sample_number} complete.")
            print(f"Final average x = {final_avg:.4f}")
            print(f"Composition = Fe_{final_avg:.4f}NbS2\n")

        new_sample = get_yes_no("Do you want to start a new sample? (yes/no): ")
        print()

        if not new_sample:
            break

    if all_samples:
        generate_pdf_report(all_samples)
    else:
        print("No samples were entered.")


if __name__ == "__main__":
    main()