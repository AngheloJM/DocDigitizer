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
from app.processing.pdf_generator import generate_pdf_from_image
from app.processing.perspective import correct_perspective

logger = logging.getLogger(__name__)

MAX_DIMENSION_PX = 3000
PDF_RENDER_DPI = 300


def _pdf_first_page_to_pil_image(pdf_bytes: bytes) -> tuple[Image.Image, int]:
    with pymupdf.open(stream=pdf_bytes, filetype="pdf") as pdf:
        page_count = pdf.page_count
        pixmap = pdf[0].get_pixmap(dpi=PDF_RENDER_DPI)
        mode = "RGBA" if pixmap.alpha else "RGB"
        pil_image = Image.frombytes(mode, (pixmap.width, pixmap.height), pixmap.samples)
        return pil_image, page_count


def _normalize(file_bytes: bytes, file_format: str) -> tuple[np.ndarray, int]:
    pages_in_source = 1

    if file_format == "pdf":
        pil_image, pages_in_source = _pdf_first_page_to_pil_image(file_bytes)
        pil_image = pil_image.convert("RGB")
    else:
        with Image.open(io.BytesIO(file_bytes)) as opened:
            pil_image = ImageOps.exif_transpose(opened)
            pil_image = pil_image.convert("RGB")

    largest_side = max(pil_image.width, pil_image.height)
    if largest_side > MAX_DIMENSION_PX:
        scale = MAX_DIMENSION_PX / largest_side
        new_size = (int(pil_image.width * scale), int(pil_image.height * scale))
        pil_image = pil_image.resize(new_size, Image.LANCZOS)

    image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    return image, pages_in_source


def _step(name: str, fn, *args):
    start = time.monotonic()
    result = fn(*args)
    logger.info("pipeline step=%s took=%.2fs", name, time.monotonic() - start)
    return result


def process_image_bytes(file_bytes: bytes, file_format: str = "png") -> dict:
    image, pages_in_source = _normalize(file_bytes, file_format)

    perspective_config = {"enabled": file_format != "pdf"}
    image, perspective_meta = _step("perspective", correct_perspective, image, perspective_config)
    image, denoise_meta = _step("denoise", denoise, image)
    image, binarize_meta = _step("binarize", binarize, image)
    image, deskew_meta = _step("deskew", deskew, image)

    ocr_result = _step("ocr", extract_text, image)
    pdf_bytes = _step("pdf_generate", generate_pdf_from_image, image)

    return {
        "processed_image": image,
        "pdf_bytes": pdf_bytes,
        "ocr_result": ocr_result,
        "pipeline_metadata": {
            "source_format": file_format,
            "pages_in_source": pages_in_source,
            "pages_processed": 1,
            "perspective": perspective_meta,
            "denoise": denoise_meta,
            "binarize": binarize_meta,
            "deskew": deskew_meta,
        },
    }
