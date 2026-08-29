import io
import shutil

import pytest
from PIL import Image, ImageDraw

from app.processing.pipeline import process_image_bytes

GHOSTSCRIPT_AVAILABLE = any(shutil.which(name) for name in ("gs", "gswin64c", "gswin32c"))

pytestmark = pytest.mark.skipif(
    not GHOSTSCRIPT_AVAILABLE,
    reason="Ghostscript no esta instalado en este entorno (requerido por ocrmypdf para PDF/A)",
)


def _make_text_image_bytes(text: str) -> bytes:
    img = Image.new("RGB", (400, 200), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((20, 80), text, fill="black")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def test_process_image_bytes_runs_full_pipeline():
    image_bytes = _make_text_image_bytes("Hola Mundo Prueba OCR")

    result = process_image_bytes(image_bytes)

    assert "Hola" in result["ocr_result"]["raw_text"]
    assert result["ocr_result"]["ocr_confidence"] > 0
    assert result["pdf_bytes"].startswith(b"%PDF")
    assert result["pipeline_metadata"]["source_format"] == "png"
    assert result["pipeline_metadata"]["pages_in_source"] == 1
    assert result["pipeline_metadata"]["pages_processed"] == 1
    assert set(result["pipeline_metadata"].keys()) == {
        "source_format",
        "pages_in_source",
        "pages_processed",
        "pages",
    }
    assert len(result["pipeline_metadata"]["pages"]) == 1
    assert set(result["pipeline_metadata"]["pages"][0].keys()) == {
        "perspective",
        "denoise",
        "binarize",
        "deskew",
    }


def _make_pdf_bytes(texts: list[str]) -> bytes:
    pages = []
    for text in texts:
        img = Image.new("RGB", (400, 200), color="white")
        draw = ImageDraw.Draw(img)
        draw.text((20, 80), text, fill="black")
        pages.append(img)

    buffer = io.BytesIO()
    pages[0].save(buffer, format="PDF", save_all=True, append_images=pages[1:])
    return buffer.getvalue()


def test_process_image_bytes_accepts_pdf_input():
    pdf_bytes = _make_pdf_bytes(["Hola Mundo Prueba PDF"])

    result = process_image_bytes(pdf_bytes, file_format="pdf")

    assert "Hola" in result["ocr_result"]["raw_text"] or "Mundo" in result["ocr_result"]["raw_text"]
    assert result["pdf_bytes"].startswith(b"%PDF")
    assert result["pipeline_metadata"]["source_format"] == "pdf"
    assert result["pipeline_metadata"]["pages_in_source"] == 1


def test_process_image_bytes_processes_all_pages_of_multipage_pdf():
    pdf_bytes = _make_pdf_bytes(["Pagina Uno", "Pagina Dos", "Pagina Tres"])

    result = process_image_bytes(pdf_bytes, file_format="pdf")

    assert "Uno" in result["ocr_result"]["raw_text"]
    assert "Dos" in result["ocr_result"]["raw_text"]
    assert "Tres" in result["ocr_result"]["raw_text"]
    assert result["pipeline_metadata"]["pages_in_source"] == 3
    assert result["pipeline_metadata"]["pages_processed"] == 3
    assert len(result["pipeline_metadata"]["pages"]) == 3
