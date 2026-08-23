import numpy as np
import pytesseract

MIN_CONFIDENCE_THRESHOLD = 60.0


def _tesseract_extract(image: np.ndarray, lang: str = "spa") -> tuple[str, float]:
    data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
    confidences = [float(c) for c in data["conf"] if c not in ("-1", -1)]
    average_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    text = pytesseract.image_to_string(image, lang=lang)
    return text, average_confidence


def _easyocr_extract(image: np.ndarray, lang: str = "es") -> tuple[str, float]:
    import easyocr

    reader = easyocr.Reader([lang], gpu=False)
    results = reader.readtext(image, detail=1)

    if not results:
        return "", 0.0

    texts = [text for _, text, _ in results]
    confidences = [confidence * 100 for _, _, confidence in results]
    return "\n".join(texts), sum(confidences) / len(confidences)


def extract_text(
    image: np.ndarray, lang: str = "spa", min_confidence: float = MIN_CONFIDENCE_THRESHOLD
) -> dict:
    text, confidence = _tesseract_extract(image, lang=lang)
    engine = "tesseract"

    if confidence < min_confidence:
        fallback_text, fallback_confidence = _easyocr_extract(image)
        if fallback_confidence > confidence:
            text, confidence, engine = fallback_text, fallback_confidence, "easyocr"

    word_count = len([w for w in text.split() if w.strip()])

    return {
        "raw_text": text,
        "ocr_confidence": confidence,
        "ocr_engine": engine,
        "word_count": word_count,
    }
