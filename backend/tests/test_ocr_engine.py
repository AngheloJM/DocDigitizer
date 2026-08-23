from unittest.mock import patch

import cv2
import numpy as np
from PIL import Image, ImageDraw

from app.processing import ocr_engine
from app.processing.ocr_engine import extract_text


def _make_text_image(text: str) -> np.ndarray:
    img = Image.new("RGB", (400, 200), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((20, 80), text, fill="black")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def test_extract_text_uses_tesseract_when_confidence_is_high():
    image = _make_text_image("Hola Mundo Prueba OCR")

    result = extract_text(image)

    assert result["ocr_engine"] == "tesseract"
    assert "Hola" in result["raw_text"]
    assert result["ocr_confidence"] > 0


def test_extract_text_falls_back_to_easyocr_when_confidence_is_low():
    blank_image = np.full((50, 50, 3), 255, dtype=np.uint8)

    with patch.object(ocr_engine, "_tesseract_extract", return_value=("", 0.0)):
        with patch.object(
            ocr_engine, "_easyocr_extract", return_value=("texto de respaldo", 80.0)
        ) as mock_easyocr:
            result = extract_text(blank_image)

    mock_easyocr.assert_called_once()
    assert result["ocr_engine"] == "easyocr"
    assert result["raw_text"] == "texto de respaldo"


def test_extract_text_keeps_tesseract_if_fallback_is_not_better():
    with patch.object(ocr_engine, "_tesseract_extract", return_value=("texto original", 70.0)):
        with patch.object(ocr_engine, "_easyocr_extract", return_value=("texto peor", 40.0)):
            result = extract_text(np.full((50, 50, 3), 255, dtype=np.uint8))

    assert result["ocr_engine"] == "tesseract"
    assert result["raw_text"] == "texto original"
