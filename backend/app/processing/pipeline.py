import io
import logging
import time
from collections.abc import Iterator

import cv2
import numpy as np
import pymupdf
from PIL import Image, ImageOps

from app.processing.binarizer import binarize
from app.processing.denoiser import denoise
from app.processing.deskew import deskew
from app.processing.ocr_engine import extract_text
from app.processing.pdf_generator import generate_pdf_from_image, merge_pdf_pages
from app.processing.perspective import correct_perspective

logger = logging.getLogger(__name__)

MAX_DIMENSION_PX = 3000
PDF_RENDER_DPI = 300


def _resize_if_needed(pil_image: Image.Image) -> Image.Image:
    largest_side = max(pil_image.width, pil_image.height)
    if largest_side <= MAX_DIMENSION_PX:
        return pil_image
    scale = MAX_DIMENSION_PX / largest_side
    new_size = (int(pil_image.width * scale), int(pil_image.height * scale))
    return pil_image.resize(new_size, Image.LANCZOS)


def _pil_to_cv2(pil_image: Image.Image) -> np.ndarray:
    resized = _resize_if_needed(pil_image.convert("RGB"))
    return cv2.cvtColor(np.array(resized), cv2.COLOR_RGB2BGR)


def _iter_pdf_pages(pdf_bytes: bytes) -> Iterator[np.ndarray]:
    with pymupdf.open(stream=pdf_bytes, filetype="pdf") as pdf:
        for page in pdf:
            pixmap = page.get_pixmap(dpi=PDF_RENDER_DPI)
            mode = "RGBA" if pixmap.alpha else "RGB"
            pil_image = Image.frombytes(mode, (pixmap.width, pixmap.height), pixmap.samples)
            yield _pil_to_cv2(pil_image)
            del pixmap, pil_image


def _iter_pages(file_bytes: bytes, file_format: str) -> Iterator[np.ndarray]:
    if file_format == "pdf":
        yield from _iter_pdf_pages(file_bytes)
        return

    with Image.open(io.BytesIO(file_bytes)) as opened:
        pil_image = ImageOps.exif_transpose(opened)
        yield _pil_to_cv2(pil_image)


def _count_pages(file_bytes: bytes, file_format: str) -> int:
    if file_format != "pdf":
        return 1
    with pymupdf.open(stream=file_bytes, filetype="pdf") as pdf:
        return pdf.page_count


def _step(name: str, fn, *args):
    start = time.monotonic()
    result = fn(*args)
    logger.info("pipeline step=%s took=%.2fs", name, time.monotonic() - start)
    return result


def _process_page(
    image: np.ndarray,
    page_number: int,
    perspective_config: dict,
    denoise_config: dict,
    binarize_config: dict,
    deskew_config: dict,
) -> dict:
    image, perspective_meta = _step(
        f"perspective_p{page_number}", correct_perspective, image, perspective_config
    )
    image, denoise_meta = _step(f"denoise_p{page_number}", denoise, image, denoise_config)
    image, binarize_meta = _step(f"binarize_p{page_number}", binarize, image, binarize_config)
    image, deskew_meta = _step(f"deskew_p{page_number}", deskew, image, deskew_config)

    ocr_result = _step(f"ocr_p{page_number}", extract_text, image)
    pdf_bytes = _step(f"pdf_generate_p{page_number}", generate_pdf_from_image, image)

    return {
        "ocr_result": ocr_result,
        "pdf_bytes": pdf_bytes,
        "metadata": {
            "perspective": perspective_meta,
            "denoise": denoise_meta,
            "binarize": binarize_meta,
            "deskew": deskew_meta,
        },
    }


def process_image_bytes(file_bytes: bytes, file_format: str = "png") -> dict:
    pages_in_source = _count_pages(file_bytes, file_format)
    # los PDFs son renders digitales limpios, nunca fotografiados en angulo
    # ni con ruido de sensor de camara -- estos pasos solo aplican a fotos reales
    photo_only_config = {"enabled": file_format != "pdf"}

    page_results = []
    for index, page_image in enumerate(_iter_pages(file_bytes, file_format)):
        page_results.append(
            _process_page(
                page_image,
                index + 1,
                photo_only_config,
                photo_only_config,
                photo_only_config,
                photo_only_config,
            )
        )
        del page_image

    pdf_bytes = merge_pdf_pages([result["pdf_bytes"] for result in page_results])

    texts = [result["ocr_result"]["raw_text"] for result in page_results]
    confidences = [result["ocr_result"]["ocr_confidence"] for result in page_results]
    engines = {result["ocr_result"]["ocr_engine"] for result in page_results}
    combined_text = "\n\n".join(text for text in texts if text)

    ocr_result = {
        "raw_text": combined_text,
        "ocr_confidence": sum(confidences) / len(confidences) if confidences else 0.0,
        "ocr_engine": "+".join(sorted(engines)) if engines else "tesseract",
        "word_count": len([w for w in combined_text.split() if w.strip()]),
    }

    return {
        "pdf_bytes": pdf_bytes,
        "ocr_result": ocr_result,
        "pipeline_metadata": {
            "source_format": file_format,
            "pages_in_source": pages_in_source,
            "pages_processed": len(page_results),
            "pages": [result["metadata"] for result in page_results],
        },
    }
