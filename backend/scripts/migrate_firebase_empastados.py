import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from sqlalchemy import select

from app.auth.models import User
from app.database import SessionLocal, engine
from app.documents.models import Document

FIREBASE_URL = "https://organizador-3f2cd-default-rtdb.firebaseio.com/.json"

MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}

TIPO_MAP = {
    "titulos entregados": "Títulos profesionales entregados",
    "titulos profecionales entregados": "Títulos profesionales entregados",
    "titulos profecinales entregados": "Títulos profesionales entregados",
    "t�tulos profesionales entregados": "Títulos profesionales entregados",
    "títulos profesionales entregados": "Títulos profesionales entregados",
    "diplomas academicos": "Diplomas académicos",
    "diploma academico de maestria": "Diploma académico de maestría",
    "cartas y solucitudes": "Cartas y solicitudes",
    "cartas de solucitud evaluadores externos": "Cartas de solicitud - evaluadores externos",
    "resoluciones rectorales de graduacion por exelencia": "Resoluciones rectorales de graduación por excelencia",
    "resoluciones rectorales de diplomas academicos": "Resoluciones rectorales de diplomas académicos",
    "actas de defensas externas": "Actas de defensas externas",
}

INVALID_YEAR_FIXES = {"205": 2015}


def normalize_tipo(raw: str) -> str:
    key = raw.strip().lower()
    return TIPO_MAP.get(key, raw.strip())


def parse_mes(raw: str) -> tuple[int | None, int | None]:
    raw = raw.strip()
    parts = re.split(r"\s+a\s+", raw, maxsplit=1, flags=re.IGNORECASE)
    start = MONTHS.get(parts[0].strip().lower())
    if len(parts) == 2:
        end = MONTHS.get(parts[1].strip().lower())
        return start, end
    return start, None


def parse_anio(raw: str) -> tuple[int | None, str | None]:
    raw = raw.strip()
    if raw in INVALID_YEAR_FIXES:
        fixed = INVALID_YEAR_FIXES[raw]
        return fixed, f"anio invalido '{raw}' corregido a {fixed}"
    if not raw.isdigit() or not (1900 <= int(raw) <= 2100):
        return None, f"anio invalido '{raw}' omitido"
    return int(raw), None


def build_document_kwargs(record: dict, owner_id) -> tuple[dict | None, str | None]:
    tipo = normalize_tipo(record.get("tipo", ""))
    anio, warning = parse_anio(str(record.get("anio", "")))
    if anio is None:
        return None, warning

    month_start, month_end = parse_mes(str(record.get("mes", "")))

    kwargs = {
        "title": f"{tipo} - {record.get('mes', '')} {anio}".strip(),
        "doc_type": tipo,
        "physical_shelf": str(record.get("estante") or "") or None,
        "physical_division": str(record.get("division") or "") or None,
        "physical_column": str(record.get("columna") or "") or None,
        "physical_volume": str(record.get("tomos") or "") or None,
        "archived_year": anio,
        "archived_month_start": month_start,
        "archived_month_end": month_end,
        "user_id": owner_id,
        "status": "pending",
    }
    return kwargs, warning


async def run(source_path: str | None, owner_email: str, commit: bool) -> None:
    try:
        await _run(source_path, owner_email, commit)
    finally:
        await engine.dispose()


async def _run(source_path: str | None, owner_email: str, commit: bool) -> None:
    if source_path:
        data = json.loads(Path(source_path).read_text(encoding="utf-8"))
    else:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(FIREBASE_URL)
            response.raise_for_status()
            data = response.json()

    records = data.get("empastados", {})
    print(f"Registros encontrados en Firebase: {len(records)}")

    async with SessionLocal() as db:
        owner = (
            await db.execute(select(User).where(User.email == owner_email))
        ).scalar_one_or_none()
        if owner is None:
            print(f"Error: no existe un usuario con email '{owner_email}'.")
            raise SystemExit(1)

        to_insert = []
        skipped = []
        for key, record in records.items():
            kwargs, warning = build_document_kwargs(record, owner.id)
            if kwargs is None:
                skipped.append((key, warning))
                continue
            if warning:
                print(f"[aviso] {key}: {warning}")
            to_insert.append(kwargs)

        print(f"Se migrarian: {len(to_insert)}")
        print(f"Se omitirian: {len(skipped)}")
        for key, warning in skipped:
            print(f"  omitido {key}: {warning}")

        if not commit:
            print("\nModo simulacion (dry-run). No se escribio nada en la base de datos.")
            print("Ejecuta con --commit para aplicar los cambios de verdad.")
            return

        for kwargs in to_insert:
            db.add(Document(**kwargs))
        await db.commit()
        print(f"\n{len(to_insert)} documentos insertados en la base de datos.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migra los registros de 'empastados' de Firebase Realtime Database a Postgres."
    )
    parser.add_argument(
        "--source",
        default=None,
        help="Ruta a un JSON local ya descargado (si no se pasa, se descarga en vivo de Firebase)",
    )
    parser.add_argument(
        "--owner-email",
        required=True,
        help="Email del usuario al que se le asignaran estos documentos",
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Escribe de verdad en la base de datos. Sin este flag, solo simula (dry-run).",
    )
    args = parser.parse_args()

    asyncio.run(run(args.source, args.owner_email, args.commit))


if __name__ == "__main__":
    main()
