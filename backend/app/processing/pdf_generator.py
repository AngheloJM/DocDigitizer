import io
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np


class PdfGenerationError(Exception):
    pass


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
