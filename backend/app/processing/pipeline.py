import io
import logging
import time

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


def _pdf_pages_to_pil_images(pdf_bytes: bytes) -> list[Image.Image]:
    images = []
    with pymupdf.open(stream=pdf_bytes, filetype="pdf") as pdf:
        for page in pdf:
            pixmap = page.get_pixmap(dpi=PDF_RENDER_DPI)
            mode = "RGBA" if pixmap.alpha else "RGB"
            pil_image = Image.frombytes(mode, (pixmap.width, pixmap.height), pixmap.samples)
            images.append(pil_image.convert("RGB"))
    return images


def _load_pages(file_bytes: bytes, file_format: str) -> list[np.ndarray]:
    if file_format == "pdf":
        pil_images = _pdf_pages_to_pil_images(file_bytes)
    else:
        with Image.open(io.BytesIO(file_bytes)) as opened:
            pil_images = [ImageOps.exif_transpose(opened).convert("RGB")]

    pages = []
    for pil_image in pil_images:
        resized = _resize_if_needed(pil_image)
        pages.append(cv2.cvtColor(np.array(resized), cv2.COLOR_RGB2BGR))
    return pages


def _step(name: str, fn, *args):
    start = time.monotonic()
    result = fn(*args)
    logger.info("pipeline step=%s took=%.2fs", name, time.monotonic() - start)
    return result


def _process_page(image: np.ndarray, page_number: int, perspective_config: dict) -> dict:
    image, perspective_meta = _step(
        f"perspective_p{page_number}", correct_perspective, image, perspective_config
    )
    image, denoise_meta = _step(f"denoise_p{page_number}", denoise, image)
    image, binarize_meta = _step(f"binarize_p{page_number}", binarize, image)
    image, deskew_meta = _step(f"deskew_p{page_number}", deskew, image)

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
    pages = _load_pages(file_bytes, file_format)
    perspective_config = {"enabled": file_format != "pdf"}

    page_results = [
        _process_page(page_image, index + 1, perspective_config)
        for index, page_image in enumerate(pages)
    ]

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
            "pages_in_source": len(pages),
            "pages_processed": len(pages),
            "pages": [result["metadata"] for result in page_results],
        },
    }
