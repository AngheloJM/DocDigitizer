import cv2
import numpy as np
from skimage.filters import threshold_sauvola


def binarize(image: np.ndarray, config: dict | None = None) -> tuple[np.ndarray, dict]:
    config = config or {}
    window_size = config.get("window_size", 25)
    k = config.get("k", 0.2)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image

    threshold = threshold_sauvola(gray, window_size=window_size, k=k)
    binary = (gray > threshold).astype(np.uint8) * 255

    return binary, {"window_size": window_size, "k": k}
