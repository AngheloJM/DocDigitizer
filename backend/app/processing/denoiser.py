import cv2
import numpy as np

DEFAULT_SEARCH_WINDOW_SIZE = 11


def denoise(image: np.ndarray, config: dict | None = None) -> tuple[np.ndarray, dict]:
    config = config or {}

    if not config.get("enabled", True):
        return image, {"denoised": False, "reason": "disabled_for_source"}

    h = config.get("h", 10)
    template_window_size = config.get("template_window_size", 7)
    search_window_size = config.get("search_window_size", DEFAULT_SEARCH_WINDOW_SIZE)

    if image.ndim == 3:
        denoised = cv2.fastNlMeansDenoisingColored(
            image, None, h, h, template_window_size, search_window_size
        )
    else:
        denoised = cv2.fastNlMeansDenoising(
            image, None, h, template_window_size, search_window_size
        )

    return denoised, {"denoised": True, "h": h, "search_window_size": search_window_size}
