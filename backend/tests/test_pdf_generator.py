import shutil

import cv2
import numpy as np
import pytest
from PIL import Image, ImageDraw
from pdfminer.high_level import extract_text as pdf_extract_text

from app.processing.pdf_generator import generate_pdf_from_image

GHOSTSCRIPT_AVAILABLE = any(shutil.which(name) for name in ("gs", "gswin64c", "gswin32c"))

pytestmark = pytest.mark.skipif(
    not GHOSTSCRIPT_AVAILABLE,
    reason="Ghostscript no esta instalado en este entorno (requerido por ocrmypdf para PDF/A)",
)


def _make_text_image(text: str) -> np.ndarray:
    img = Image.new("RGB", (400, 200), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((20, 80), text, fill="black")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def test_generate_pdf_from_image_embeds_searchable_text():
    image = _make_text_image("Hola Mundo Prueba OCR")

    pdf_bytes = generate_pdf_from_image(image)

    assert pdf_bytes.startswith(b"%PDF")

    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp.flush()
        text = pdf_extract_text(tmp.name)

    assert "Hola" in text
