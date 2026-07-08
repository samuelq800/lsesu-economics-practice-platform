import json
import re
import shutil
from pathlib import Path

import pdfplumber
from PIL import Image


ROOT = Path(__file__).resolve().parent
PDF_PATH = Path("/Users/samuel/Desktop/竞赛/LSESU/LSE经济学竞赛.pdf")
RUNTIME_BIN = Path("/Users/samuel/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin")
ASSET_DIR = ROOT / "assets" / "problem-images"
TMP_DIR = ROOT / ".tmp-pages"

TOPICS = {
    "Macro": "Macroeconomics",
    "Micro": "Microeconomics",
    "Quantitative": "Quantitative Foundations",
    "Sample Test": "Sample Test",
}

SECTION_ORDER = {
    "Macro": 1,
    "Micro": 2,
    "Quantitative": 3,
    "Sample Test": 4,
}

IMAGE_PROBLEMS = {
    ("Macro", 8),
    ("Macro", 20),
    ("Macro", 25),
    ("Micro", 10),
    ("Micro", 17),
    ("Micro", 20),
    ("Micro", 24),
    ("Micro", 26),
    ("Micro", 30),
    ("Quantitative", 4),
    ("Quantitative", 7),
    ("Quantitative", 12),
    ("Quantitative", 13),
    ("Sample Test", 1),
    ("Sample Test", 2),
    ("Sample Test", 6),
    ("Sample Test", 10),
    ("Sample Test", 12),
    ("Sample Test", 21),
    ("Sample Test", 25),
}

QUESTION_PAGES = {
    ("Macro", 8): 16,
    ("Macro", 20): 18,
    ("Macro", 25): 19,
    ("Micro", 10): 22,
    ("Micro", 17): 23,
    ("Micro", 20): 24,
    ("Micro", 24): 25,
    ("Micro", 26): 25,
    ("Micro", 30): 26,
    ("Quantitative", 4): 27,
    ("Quantitative", 7): 28,
    ("Quantitative", 12): 29,
    ("Quantitative", 13): 29,
    ("Sample Test", 1): 37,
    ("Sample Test", 2): 37,
    ("Sample Test", 6): 38,
    ("Sample Test", 10): 39,
    ("Sample Test", 12): 39,
    ("Sample Test", 21): 41,
    ("Sample Test", 25): 42,
}

SPECIAL_CROP_TOP = {
    ("Micro", 20): 210,
    ("Quantitative", 12): 82,
    ("Quantitative", 13): 82,
    ("Sample Test", 10): 105,
}

MANUAL_CHOICE_FIXES = {
    ("Macro", 8): {
        "A": "Nominal GDP per capita falls.",
        "B": "Real GDP per capita falls.",
        "C": "Real GDP falls.",
        "D": "Real GDP per capita increases.",
    },
    ("Sample Test", 2): {
        "A": "Change in V: (-) 5%; Change in Q: (-) 3%.",
        "B": "Change in V: (-) 2%; Change in Q: (-) 4%.",
        "C": "Change in V: (+) 2%; Change in Q: (+) 2%.",
        "D": "Change in V: (+) 3%; Change in Q: (-) 3%.",
    },
    ("Sample Test", 21): {
        "A": "Marginal cost intersects average variable cost and average total cost at their maximum points.",
        "B": "Average total cost and average variable cost intersect marginal cost at its maximum point.",
        "C": "Marginal cost intersects average variable cost and average total cost at their minimum points.",
        "D": "Average total cost and average variable cost intersect marginal cost at its minimum point.",
    },
    ("Sample Test", 25): {
        "A": "0.05.",
        "B": "0.60.",
        "C": "0.95.",
        "D": "0.98.",
    },
}

SOURCE = {
    "pdf": "LSE经济学竞赛.pdf",
    "local_path": str(PDF_PATH),
}


def clean_text(text):
    text = (text or "").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def page_text(pdf, start, end):
    chunks = []
    for page_number in range(start, end + 1):
        chunks.append(pdf.pages[page_number - 1].extract_text() or "")
    return clean_text("\n".join(chunks))


def section_between(text, start_marker, end_marker=None):
    start = text.index(start_marker) + len(start_marker)
    end = text.index(end_marker, start) if end_marker else len(text)
    return clean_text(text[start:end])


def split_questions(section_text):
    starts = list(re.finditer(r"(?m)(?:^|\n)([1-9]\d?)\.\s*", section_text))
    questions = []
    for idx, match in enumerate(starts):
        number = int(match.group(1))
        start = match.start()
        end = starts[idx + 1].start() if idx + 1 < len(starts) else len(section_text)
        raw = clean_text(section_text[start:end])
        questions.append((number, raw))
    return questions


def parse_question(raw):
    raw = re.sub(r"^\d{1,2}\.\s*", "", raw).strip()
    option_match = re.search(r"\n?A\.\s*", raw)
    if not option_match:
        return clean_text(raw), {}
    statement = clean_text(raw[: option_match.start()])
    option_text = raw[option_match.start() :]
    option_starts = list(re.finditer(r"(?m)([A-D])\.\s*", option_text))
    choices = {}
    for idx, match in enumerate(option_starts):
        letter = match.group(1)
        start = match.end()
        end = option_starts[idx + 1].start() if idx + 1 < len(option_starts) else len(option_text)
        choices[letter] = clean_text(option_text[start:end])
    return statement, choices


def parse_answer_sections(text):
    result = {}
    markers = [
        ("Macro", "1、Macro", "2、Micro"),
        ("Micro", "2、Micro", "3、Quantitative"),
        ("Quantitative", "3、Quantitative", None),
    ]
    for topic, start, end in markers:
        section = section_between(text, start, end)
        starts = list(re.finditer(r"(?m)(?:^|\n)(\d{1,2})\.\s*[^A-D\n]*([A-D])", section))
        for idx, match in enumerate(starts):
            number = int(match.group(1))
            answer = match.group(2)
            block_end = starts[idx + 1].start() if idx + 1 < len(starts) else len(section)
            block = clean_text(section[match.end() : block_end])
            block = re.sub(r"^Explanation:\s*", "", block, flags=re.I)
            result[(topic, number)] = {
                "answer_choice": answer,
                "solution_text": clean_text(block),
            }
    return result


def parse_sample_answers(text):
    answers = {}
    starts = list(re.finditer(r"(?m)(?:^|\n)(\d{1,2})\.\s*([A-D])（([^）]+)）", text))
    for idx, match in enumerate(starts):
        number = int(match.group(1))
        answer = match.group(2)
        topic = match.group(3)
        block_end = starts[idx + 1].start() if idx + 1 < len(starts) else len(text)
        block = clean_text(text[match.end() : block_end])
        block = re.sub(r"^Explanation:\s*", "", block, flags=re.I)
        answers[number] = {
            "topic": topic,
            "answer_choice": answer,
            "solution_text": clean_text(block),
        }
    return answers


def stages(solution):
    solution = clean_text(solution)
    first_sentence = re.split(r"(?<=[.!?。])\s+", solution, maxsplit=1)[0] if solution else ""
    steps = [part.strip() for part in re.split(r"(?<=[.!?。])\s+", solution) if part.strip()]
    return {
        "idea": first_sentence or solution or "暂无解析 / Not available.",
        "key_steps": "\n".join(f"{idx + 1}. {step}" for idx, step in enumerate(steps[:5])) or solution,
        "full_calculation": solution or "暂无解析 / Not available.",
    }


def build_problem(topic, number, raw, answers, page_hint=None, sample_topic=None):
    statement, choices = parse_question(raw)
    if (topic, number) in MANUAL_CHOICE_FIXES:
        choices = MANUAL_CHOICE_FIXES[(topic, number)]
    answer = answers.get((topic, number), {}) if topic != "Sample Test" else answers.get(number, {})
    display_topic = sample_topic or TOPICS.get(topic, topic)
    pid = f"lsesu-{topic.lower().replace(' ', '-')}-{number:02d}"
    image_name = f"{pid}.png" if (topic, number) in IMAGE_PROBLEMS else None
    solution = answer.get("solution_text", "")
    return {
        "id": pid,
        "type": "LSESU",
        "section": topic,
        "section_order": SECTION_ORDER.get(topic, 99),
        "topic": display_topic,
        "number": number,
        "display_name": f"LSESU Economics Challenge - {display_topic}",
        "statement": statement,
        "choices": choices,
        "answer_choice": answer.get("answer_choice", ""),
        "answer_choices_accepted": [answer["answer_choice"]] if answer.get("answer_choice") else [],
        "answer_value": choices.get(answer.get("answer_choice", ""), ""),
        "solution_text": solution,
        "solution_stages": stages(solution),
        "image": f"./assets/problem-images/{image_name}" if image_name else "",
        "source": {**SOURCE, "page": page_hint},
    }


def render_pages():
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(exist_ok=True)
    for old in ASSET_DIR.glob("*.png"):
        old.unlink()
    pages = sorted(set(QUESTION_PAGES.values()))
    for page in pages:
        prefix = TMP_DIR / f"page-{page}"
        command = f'"{RUNTIME_BIN / "pdftoppm"}" -r 180 -png -f {page} -l {page} "{PDF_PATH}" "{prefix}"'
        if not (TMP_DIR / f"page-{page}-{page}.png").exists():
            import subprocess

            subprocess.run(command, shell=True, check=True)


def question_y_bounds(words, number):
    patterns = [f"{number}.", f"{number}."]
    starts = [w for w in words if any(w["text"].startswith(p) for p in patterns)]
    if not starts:
        starts = [w for w in words if w["text"] == str(number)]
    if not starts:
        return None
    start = min(w["top"] for w in starts)
    next_candidates = []
    for next_number in range(number + 1, number + 4):
        next_candidates.extend(w for w in words if w["text"].startswith(f"{next_number}."))
    next_after = [w["top"] for w in next_candidates if w["top"] > start + 12]
    end = min(next_after) if next_after else None
    return start, end


def crop_images(pdf):
    render_pages()
    for topic, number in IMAGE_PROBLEMS:
        page_no = QUESTION_PAGES[(topic, number)]
        page = pdf.pages[page_no - 1]
        words = page.extract_words(x_tolerance=2, y_tolerance=3)
        bounds = question_y_bounds(words, number)
        if not bounds:
            if (topic, number) not in SPECIAL_CROP_TOP:
                continue
            next_bounds = question_y_bounds(words, number + 1)
            bounds = (SPECIAL_CROP_TOP[(topic, number)], next_bounds[0] if next_bounds else None)
        y0, y1 = bounds
        y0 = SPECIAL_CROP_TOP.get((topic, number), max(0, y0 - 16))
        y1 = min(page.height, (y1 if y1 else y0 + 260) + 12)
        if y1 - y0 < 115:
            y1 = min(page.height, y0 + 210)
        image_path = TMP_DIR / f"page-{page_no}-{page_no}.png"
        img = Image.open(image_path)
        scale_x = img.width / page.width
        scale_y = img.height / page.height
        left = int(24 * scale_x)
        right = int((page.width - 24) * scale_x)
        top = int(y0 * scale_y)
        bottom = int(y1 * scale_y)
        crop = img.crop((left, top, right, bottom))
        out = ASSET_DIR / f"lsesu-{topic.lower().replace(' ', '-')}-{number:02d}.png"
        crop.save(out, optimize=True)


def build_bank():
    with pdfplumber.open(PDF_PATH) as pdf:
        bank_text = page_text(pdf, 15, 29)
        answer_text = page_text(pdf, 30, 36)
        sample_text = page_text(pdf, 37, 42)
        sample_answer_text = page_text(pdf, 43, 45)
        answers = parse_answer_sections(answer_text)
        sample_answers = parse_sample_answers(sample_answer_text)
        crop_images(pdf)

    macro = section_between(bank_text, "1、Macro", "2、Micro")
    micro = section_between(bank_text, "2、Micro", "3、Quantitative")
    quant = section_between(bank_text, "3、Quantitative")
    problems = []
    for topic, section in [("Macro", macro), ("Micro", micro), ("Quantitative", quant)]:
        for number, raw in split_questions(section):
            problems.append(build_problem(topic, number, raw, answers, QUESTION_PAGES.get((topic, number))))
    sample_section = section_between(sample_text, "Sample Test")
    for number, raw in split_questions(sample_section):
        answer_meta = sample_answers.get(number, {})
        problems.append(
            build_problem(
                "Sample Test",
                number,
                raw,
                sample_answers,
                QUESTION_PAGES.get(("Sample Test", number)),
                sample_topic=f"Sample Test - {answer_meta.get('topic', 'Mixed')}",
            )
        )
    return {
        "generated_at": "2026-07-08",
        "title": "LSESU Economics Practice",
        "problems": problems,
        "topics": sorted(set(p["topic"] for p in problems)),
        "summary": {
            "problem_count": len(problems),
            "section_count": len(set(p["section"] for p in problems)),
            "topic_count": len(set(p["topic"] for p in problems)),
            "with_answer": sum(1 for p in problems if p["answer_choice"]),
            "with_solution": sum(1 for p in problems if p["solution_text"]),
            "with_image": sum(1 for p in problems if p["image"]),
        },
    }


def write_site(data):
    (ROOT / "lsesu_question_bank.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "lsesu_question_bank.js").write_text(
        "window.LSESU_QUESTION_BANK = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    if not PDF_PATH.exists():
        raise SystemExit(f"Missing PDF: {PDF_PATH}")
    write_site(build_bank())
    shutil.rmtree(TMP_DIR, ignore_errors=True)
