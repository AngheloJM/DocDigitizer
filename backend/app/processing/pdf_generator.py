import io
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
import pymupdf


class PdfGenerationError(Exception):
    pass


def merge_pdf_pages(pdf_pages: list[bytes]) -> bytes:
    if len(pdf_pages) == 1:
        return pdf_pages[0]

    merged = pymupdf.open()
    try:
        for page_bytes in pdf_pages:
            with pymupdf.open(stream=page_bytes, filetype="pdf") as page_doc:
                merged.insert_pdf(page_doc)
        return merged.tobytes()
    finally:
        merged.close()


def generate_pdf_from_image(image: np.ndarray, dpi: int = 300) -> bytes:
    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = Path(tmp_dir) / "input.png"
        output_path = Path(tmp_dir) / "output.pdf"

        success, encoded = cv2.imencode(".png", image)
        if not success:
            raise PdfGenerationError("No se pudo codificar la imagen a PNG")
        input_path.write_bytes(encoded.tobytes())

        result = subprocess.run(
            [
                "ocrmypdf",
                "--force-ocr",
                "--image-dpi",
                str(dpi),
                "--output-type",
                "pdfa",
                str(input_path),
                str(output_path),
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise PdfGenerationError(
                f"ocrmypdf fallo (codigo {result.returncode}): {result.stderr[-2000:]}"
            )

        return output_path.read_bytes()
