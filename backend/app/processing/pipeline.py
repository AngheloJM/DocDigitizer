import io

import cv2
import numpy as np
from PIL import Image, ImageOps

from app.processing.binarizer import binarize
from app.processing.denoiser import denoise
from app.processing.deskew import deskew
from app.processing.ocr_engine import extract_text
from app.processing.pdf_generator import generate_pdf_from_image
from app.processing.perspective import correct_perspective

MAX_DIMENSION_PX = 3000


def _normalize(image_bytes: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(image_bytes)) as pil_image:
        pil_image = ImageOps.exif_transpose(pil_image)
        pil_image = pil_image.convert("RGB")

        largest_side = max(pil_image.width, pil_image.height)
        if largest_side > MAX_DIMENSION_PX:
            scale = MAX_DIMENSION_PX / largest_side
            new_size = (int(pil_image.width * scale), int(pil_image.height * scale))
            pil_image = pil_image.resize(new_size, Image.LANCZOS)

        return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)


def process_image_bytes(image_bytes: bytes) -> dict:
    image = _normalize(image_bytes)

    image, perspective_meta = correct_perspective(image)
    image, denoise_meta = denoise(image)
    image, binarize_meta = binarize(image)
    image, deskew_meta = deskew(image)

    ocr_result = extract_text(image)
    pdf_bytes = generate_pdf_from_image(image)

    return {
        "processed_image": image,
        "pdf_bytes": pdf_bytes,
        "ocr_result": ocr_result,
        "pipeline_metadata": {
            "perspective": perspective_meta,
            "denoise": denoise_meta,
            "binarize": binarize_meta,
            "deskew": deskew_meta,
        },
    }
