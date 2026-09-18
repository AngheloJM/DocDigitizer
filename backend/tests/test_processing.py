import cv2
import numpy as np
import pymupdf

from app.processing.binarizer import binarize
from app.processing.denoiser import denoise
from app.processing.deskew import deskew
from app.processing.perspective import correct_perspective
from app.processing.pipeline import (
    MAX_DIMENSION_PX,
    PDF_RENDER_DPI,
    PDF_RENDER_DPI_FLOOR,
    _dpi_for_pdf_page,
    _looks_born_digital,
)


def test_denoise_reduces_noise_variance():
    rng = np.random.default_rng(42)
    clean = np.full((100, 100, 3), 200, dtype=np.uint8)
    noisy = clean.astype(np.int16) + rng.normal(0, 25, clean.shape).astype(np.int16)
    noisy = np.clip(noisy, 0, 255).astype(np.uint8)

    denoised, _ = denoise(noisy)

    assert np.var(denoised.astype(float)) < np.var(noisy.astype(float))


def test_denoise_disabled_for_pdf_source():
    image = np.full((100, 100, 3), 200, dtype=np.uint8)

    result, metadata = denoise(image, {"enabled": False})

    assert metadata["denoised"] is False
    assert metadata["reason"] == "disabled_for_source"
    assert result is image


def test_binarize_produces_pure_black_and_white():
    gray_gradient = np.tile(np.linspace(0, 255, 100), (100, 1)).astype(np.uint8)

    binary, _ = binarize(gray_gradient)

    assert set(np.unique(binary).tolist()).issubset({0, 255})


def test_binarize_disabled_for_pdf_source():
    image = np.full((100, 100, 3), 200, dtype=np.uint8)

    result, metadata = binarize(image, {"enabled": False})

    assert metadata["binarized"] is False
    assert metadata["reason"] == "disabled_for_source"
    assert result is image


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


def test_deskew_disabled_for_pdf_source():
    image = np.full((100, 100, 3), 200, dtype=np.uint8)

    result, metadata = deskew(image, {"enabled": False})

    assert metadata["deskewed"] is False
    assert metadata["reason"] == "disabled_for_source"
    assert result is image


def test_correct_perspective_skips_image_without_quadrilateral():
    flat = np.full((100, 100, 3), 255, dtype=np.uint8)

    result, metadata = correct_perspective(flat)

    assert metadata["perspective_corrected"] is False
    assert result.shape == flat.shape


def test_correct_perspective_warps_quadrilateral():
    quad_img = np.full((300, 300, 3), 255, dtype=np.uint8)
    points = np.array([[10, 5], [295, 15], [285, 295], [5, 285]], dtype=np.int32)
    cv2.fillPoly(quad_img, [points], (0, 0, 0))
    cv2.rectangle(quad_img, (110, 110), (190, 190), (255, 255, 255), -1)

    result, metadata = correct_perspective(quad_img)

    assert metadata["perspective_corrected"] is True
    assert result.shape[0] > 0 and result.shape[1] > 0


def test_correct_perspective_rejects_small_quadrilateral():
    quad_img = np.full((300, 300, 3), 255, dtype=np.uint8)
    points = np.array([[80, 40], [260, 80], [220, 260], [40, 220]], dtype=np.int32)
    cv2.fillPoly(quad_img, [points], (0, 0, 0))
    cv2.rectangle(quad_img, (110, 110), (190, 190), (255, 255, 255), -1)

    result, metadata = correct_perspective(quad_img)

    assert metadata["perspective_corrected"] is False
    assert metadata["reason"] == "quadrilateral_too_small"
    assert result.shape == quad_img.shape


def test_looks_born_digital_false_for_scanned_paper_style_image():
    # papel real: fondo casi blanco, texto negro, sin color saturado
    scanned = np.full((200, 200, 3), 245, dtype=np.uint8)
    cv2.putText(scanned, "ACTA", (30, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (10, 10, 10), 2)

    assert _looks_born_digital(scanned) is False


def test_looks_born_digital_true_for_colorful_screenshot_style_image():
    # screenshot/diseno: bloques grandes de color saturado
    screenshot = np.zeros((200, 200, 3), dtype=np.uint8)
    screenshot[:100, :] = (180, 60, 20)  # BGR: bloque naranja/azul saturado
    screenshot[100:, :] = (200, 20, 180)  # BGR: bloque rosado/violeta saturado

    assert _looks_born_digital(screenshot) is True


def _make_pdf_page(width_pt: float, height_pt: float):
    doc = pymupdf.open()
    return doc, doc.new_page(width=width_pt, height=height_pt)


def test_dpi_for_pdf_page_targets_max_dimension_for_letter_sized_page():
    # carta (8.5x11in): a 300 DPI el lado largo (11in) da 3300px, ya por encima de
    # MAX_DIMENSION_PX -- incluso el caso tipico se beneficia de apuntar directo al
    # tamano final en vez de renderizar de mas y despues volver a achicar.
    doc, page = _make_pdf_page(8.5 * 72, 11 * 72)
    try:
        dpi = _dpi_for_pdf_page(page)
        assert PDF_RENDER_DPI_FLOOR <= dpi < PDF_RENDER_DPI
        assert abs(dpi * 11 - MAX_DIMENSION_PX) < 11
    finally:
        doc.close()


def test_dpi_for_pdf_page_uses_ceiling_for_small_page():
    # una pagina chica (ej. una foto tipo carnet) no debe forzarse a mas de la DPI techo
    doc, page = _make_pdf_page(2 * 72, 3 * 72)
    try:
        assert _dpi_for_pdf_page(page) == PDF_RENDER_DPI
    finally:
        doc.close()


def test_dpi_for_pdf_page_scales_down_for_oversized_page():
    # pagina "nacida digital": grande en pulgadas asumiendo baja resolucion (72 DPI),
    # como un screenshot ancho exportado a PDF -- la DPI techo la agrandaria de mas
    doc, page = _make_pdf_page(1345, 896)
    try:
        dpi = _dpi_for_pdf_page(page)
        assert dpi < PDF_RENDER_DPI
        assert dpi >= PDF_RENDER_DPI_FLOOR
        longest_side_in = 1345 / 72
        assert abs(dpi * longest_side_in - MAX_DIMENSION_PX) < longest_side_in
    finally:
        doc.close()


def test_dpi_for_pdf_page_never_goes_below_floor():
    doc, page = _make_pdf_page(200 * 72, 150 * 72)
    try:
        assert _dpi_for_pdf_page(page) == PDF_RENDER_DPI_FLOOR
    finally:
        doc.close()


def test_correct_perspective_disabled_for_pdf_source():
    quad_img = np.full((300, 300, 3), 255, dtype=np.uint8)
    points = np.array([[10, 5], [295, 15], [285, 295], [5, 285]], dtype=np.int32)
    cv2.fillPoly(quad_img, [points], (0, 0, 0))

    result, metadata = correct_perspective(quad_img, {"enabled": False})

    assert metadata["perspective_corrected"] is False
    assert metadata["reason"] == "disabled_for_source"
    assert result is quad_img
