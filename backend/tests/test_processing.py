import cv2
import numpy as np

from app.processing.binarizer import binarize
from app.processing.denoiser import denoise
from app.processing.deskew import deskew
from app.processing.perspective import correct_perspective


def test_denoise_reduces_noise_variance():
    rng = np.random.default_rng(42)
    clean = np.full((100, 100, 3), 200, dtype=np.uint8)
    noisy = clean.astype(np.int16) + rng.normal(0, 25, clean.shape).astype(np.int16)
    noisy = np.clip(noisy, 0, 255).astype(np.uint8)

    denoised, _ = denoise(noisy)

    assert np.var(denoised.astype(float)) < np.var(noisy.astype(float))


def test_binarize_produces_pure_black_and_white():
    gray_gradient = np.tile(np.linspace(0, 255, 100), (100, 1)).astype(np.uint8)

    binary, _ = binarize(gray_gradient)

    assert set(np.unique(binary).tolist()).issubset({0, 255})


def test_deskew_detects_and_corrects_tilted_lines():
    img = np.full((300, 300, 3), 255, dtype=np.uint8)
    cv2.line(img, (30, 100), (270, 100), (0, 0, 0), 3)
    cv2.line(img, (30, 200), (270, 200), (0, 0, 0), 3)
    matrix = cv2.getRotationMatrix2D((150, 150), 8, 1.0)
    tilted = cv2.warpAffine(img, matrix, (300, 300), borderValue=(255, 255, 255))

    _, metadata = deskew(tilted)

    assert metadata["deskewed"] is True
    assert abs(abs(metadata["angle"]) - 8) < 2


def test_deskew_skips_already_straight_image():
    img = np.full((300, 300, 3), 255, dtype=np.uint8)
    cv2.line(img, (30, 150), (270, 150), (0, 0, 0), 3)

    _, metadata = deskew(img)

    assert metadata["deskewed"] is False


def test_correct_perspective_skips_image_without_quadrilateral():
    flat = np.full((100, 100, 3), 255, dtype=np.uint8)

    result, metadata = correct_perspective(flat)

    assert metadata["perspective_corrected"] is False
    assert result.shape == flat.shape


def test_correct_perspective_warps_quadrilateral():
    quad_img = np.full((300, 300, 3), 255, dtype=np.uint8)
    points = np.array([[80, 40], [260, 80], [220, 260], [40, 220]], dtype=np.int32)
    cv2.fillPoly(quad_img, [points], (0, 0, 0))
    cv2.rectangle(quad_img, (110, 110), (190, 190), (255, 255, 255), -1)

    result, metadata = correct_perspective(quad_img)

    assert metadata["perspective_corrected"] is True
    assert result.shape[0] > 0 and result.shape[1] > 0
