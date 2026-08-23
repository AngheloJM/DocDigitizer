import cv2
import numpy as np


def _detect_skew_angle(image: np.ndarray) -> float | None:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=100, maxLineGap=10)

    if lines is None:
        return None

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line.reshape(-1)
        if x2 == x1:
            continue
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if -45 <= angle <= 45:
            angles.append(angle)

    if not angles:
        return None

    return float(np.median(angles))


def deskew(image: np.ndarray, config: dict | None = None) -> tuple[np.ndarray, dict]:
    config = config or {}
    min_angle_threshold = config.get("min_angle_threshold", 0.5)

    angle = _detect_skew_angle(image)
    if angle is None or abs(angle) < min_angle_threshold:
        return image, {"deskewed": False, "angle": angle or 0.0}

    height, width = image.shape[:2]
    center = (width / 2, height / 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(
        image, matrix, (width, height), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255)
    )

    return rotated, {"deskewed": True, "angle": angle}
