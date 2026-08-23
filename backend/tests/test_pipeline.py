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
    assert set(result["pipeline_metadata"].keys()) == {
        "perspective",
        "denoise",
        "binarize",
        "deskew",
    }
