import cv2
import numpy as np


def _order_corners(points: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    total = points.sum(axis=1)
    rect[0] = points[np.argmin(total)]
    rect[2] = points[np.argmax(total)]

    diff = np.diff(points, axis=1)
    rect[1] = points[np.argmin(diff)]
    rect[3] = points[np.argmax(diff)]
    return rect


def correct_perspective(image: np.ndarray, config: dict | None = None) -> tuple[np.ndarray, dict]:
    config = config or {}
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    edges = cv2.Canny(gray, config.get("canny_low", 50), config.get("canny_high", 150))
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return image, {"perspective_corrected": False, "reason": "no_contours"}

    largest = max(contours, key=cv2.contourArea)
    perimeter = cv2.arcLength(largest, True)
    approx = cv2.approxPolyDP(largest, 0.02 * perimeter, True)

    if len(approx) != 4:
        return image, {"perspective_corrected": False, "reason": "no_quadrilateral"}

    corners = _order_corners(approx.reshape(4, 2).astype("float32"))
    (top_left, top_right, bottom_right, bottom_left) = corners

    width_top = np.linalg.norm(top_right - top_left)
    width_bottom = np.linalg.norm(bottom_right - bottom_left)
    height_left = np.linalg.norm(bottom_left - top_left)
    height_right = np.linalg.norm(bottom_right - top_right)

    max_width = int(max(width_top, width_bottom))
    max_height = int(max(height_left, height_right))

    if max_width <= 0 or max_height <= 0:
        return image, {"perspective_corrected": False, "reason": "degenerate_quadrilateral"}

    destination = np.array(
        [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(corners, destination)
    warped = cv2.warpPerspective(image, matrix, (max_width, max_height))

    return warped, {"perspective_corrected": True}
