import csv
from collections import OrderedDict
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


CANONICAL_FIELDS = [
    "source",
    "role",
    "level",
    "location",
    "state",
    "country",
    "currency",
    "work_model",
    "base_salary_min",
    "base_salary_max",
    "total_compensation",
]


FIELD_ALIASES: Dict[str, Tuple[str, ...]] = {
    "source": ("source", "origem", "provider"),
    "role": ("role", "job_title", "cargo"),
    "level": ("level", "experience_level", "seniority", "nivel"),
    "location": ("location", "city", "cidade"),
    "state": ("state", "uf", "state_code"),
    "country": ("country", "country_code", "pais"),
    "currency": ("currency", "salary_currency", "moeda"),
    "work_model": ("work_model", "workmode", "remote_type", "employment_type"),
    "base_salary_min": ("base_salary_min", "salary_min", "min_salary"),
    "base_salary_max": ("base_salary_max", "salary_max", "max_salary"),
    "total_compensation": (
        "total_compensation",
        "salary_total",
        "total_salary",
        "compensation",
        "salary",
    ),
}

REMOTE_KEYWORDS = {
    "remoto",
    "remote",
    "fully remote",
    "100% remote",
    "home office",
}
ONSITE_KEYWORDS = {
    "onsite",
    "presencial",
    "in-person",
    "office",
}
HYBRID_KEYWORDS = {
    "hibrido",
    "hybrid",
    "mixed",
}


def _find_value(row: Dict[str, str], aliases: Iterable[str]) -> Optional[str]:
    normalized = {key.lower(): value for key, value in row.items()}
    for alias in aliases:
        if alias.lower() in normalized and normalized[alias.lower()]:
            return normalized[alias.lower()]
    return None


def _parse_decimal(value: Optional[str]) -> Optional[Decimal]:
    if value is None:
        return None
    stripped = value.replace(",", "").strip()
    if not stripped:
        return None
    try:
        return Decimal(stripped)
    except InvalidOperation:
        return None


def _normalize_country(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().upper()
    if cleaned in {"BR", "BRA"}:
        return "Brazil"
    if cleaned.lower() == "brasil":
        return "Brazil"
    return value.strip()


def _normalize_state(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.strip().upper()


def _normalize_role(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.strip().lower().replace(" ", "_")


def _normalize_level(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    mapping = {
        "jr": "junior",
        "jr.": "junior",
        "jr ": "junior",
        "jr": "junior",
        "mid": "pleno",
        "md": "pleno",
        "mid-level": "pleno",
        "sr": "senior",
        "sr.": "senior",
        "sr ": "senior",
        "staff": "staff",
        "principal": "principal",
        "especialista": "especialista",
    }
    cleaned = value.strip().lower()
    return mapping.get(cleaned, cleaned)


def _normalize_work_model(value: Optional[str], remote_ratio: Optional[str] = None) -> str:
    if remote_ratio:
        try:
            ratio = int(remote_ratio)
        except ValueError:
            ratio = None
        if ratio is not None:
            if ratio >= 80:
                return "remoto"
            if ratio <= 20:
                return "presencial"
            return "hibrido"

    if value is None:
        return "hibrido"

    cleaned = value.strip().lower()
    if cleaned in REMOTE_KEYWORDS:
        return "remoto"
    if cleaned in ONSITE_KEYWORDS:
        return "presencial"
    if cleaned in HYBRID_KEYWORDS:
        return "hibrido"

    if cleaned in {"remote", "remoto", "r"}:
        return "remoto"
    if cleaned in {"onsite", "presencial", "o"}:
        return "presencial"
    if cleaned in {"hybrid", "hibrido", "h"}:
        return "hibrido"

    return "hibrido"


@dataclass
class NormalizedRow:
    source: str
    role: str
    level: str
    location: str
    state: str
    country: str
    currency: str
    work_model: str
    base_salary_min: Decimal
    base_salary_max: Decimal
    total_compensation: Decimal

    def as_dict(self) -> Dict[str, str]:
        return {
            "source": self.source,
            "role": self.role,
            "level": self.level,
            "location": self.location,
            "state": self.state,
            "country": self.country,
            "currency": self.currency,
            "work_model": self.work_model,
            "base_salary_min": f"{self.base_salary_min.normalize()}",
            "base_salary_max": f"{self.base_salary_max.normalize()}",
            "total_compensation": f"{self.total_compensation.normalize()}",
        }


class Command(BaseCommand):
    help = "Normalize raw salary datasets into the canonical CSV consumed by the API."

    def add_arguments(self, parser):
        parser.add_argument(
            "--input-dir",
            type=str,
            default=None,
            help="Directory containing raw CSV files to ingest.",
        )
        parser.add_argument(
            "--output",
            type=str,
            default=None,
            help="Path to the canonical CSV that will be generated.",
        )
        parser.add_argument(
            "--country",
            type=str,
            default="Brazil",
            help="Limit rows to this country (case-insensitive).",
        )

    def handle(self, *args, **options):
        if options["input_dir"]:
            input_dir = Path(options["input_dir"])
        else:
            input_dir = Path(settings.BASE_DIR).parent / "data" / "raw"

        if options["output"]:
            output_path = Path(options["output"])
        else:
            output_path = Path(settings.BASE_DIR) / "data" / "tech_salaries_sample.csv"
        country_filter = options["country"].lower()

        if not input_dir.exists():
            raise CommandError(f"Input directory {input_dir} does not exist")

        rows = list(self._collect_rows(input_dir, country_filter))
        if not rows:
            self.stdout.write(
                self.style.WARNING("No rows matched the provided filters; nothing to write.")
            )
            return

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=CANONICAL_FIELDS)
            writer.writeheader()
            for row in rows:
                writer.writerow(row.as_dict())

        self.stdout.write(
            self.style.SUCCESS(
                f"Generated {len(rows)} rows in {output_path} using data from {input_dir}"
            )
        )

    def _collect_rows(
        self, input_dir: Path, country_filter: str
    ) -> Iterable[NormalizedRow]:
        seen: Dict[Tuple[str, ...], NormalizedRow] = OrderedDict()

        for csv_path in sorted(input_dir.glob("*.csv")):
            with csv_path.open(newline="", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                for raw_row in reader:
                    normalized = self._normalize_row(raw_row)
                    if normalized is None:
                        continue
                    if normalized.country.lower() != country_filter:
                        continue
                    key = (
                        normalized.source,
                        normalized.role,
                        normalized.level,
                        normalized.location,
                        normalized.state,
                        normalized.work_model,
                        str(normalized.base_salary_min),
                        str(normalized.base_salary_max),
                        str(normalized.total_compensation),
                    )
                    if key not in seen:
                        seen[key] = normalized
        return seen.values()

    def _normalize_row(self, row: Dict[str, str]) -> Optional[NormalizedRow]:
        source = _find_value(row, FIELD_ALIASES["source"]) or "unknown"
        role_raw = _find_value(row, FIELD_ALIASES["role"])
        if not role_raw:
            return None
        level_raw = _find_value(row, FIELD_ALIASES["level"]) or "pleno"
        location = (_find_value(row, FIELD_ALIASES["location"]) or "Remoto").strip()
        state = _normalize_state(_find_value(row, FIELD_ALIASES["state"]) or "Remote")
        country = _normalize_country(_find_value(row, FIELD_ALIASES["country"]) or "Brazil")
        currency = (_find_value(row, FIELD_ALIASES["currency"]) or "BRL").strip().upper()
        work_model = _normalize_work_model(
            _find_value(row, FIELD_ALIASES["work_model"]),
            row.get("remote_ratio"),
        )

        min_salary = _parse_decimal(_find_value(row, FIELD_ALIASES["base_salary_min"]))
        max_salary = _parse_decimal(_find_value(row, FIELD_ALIASES["base_salary_max"]))
        total_salary = _parse_decimal(_find_value(row, FIELD_ALIASES["total_compensation"]))

        if total_salary is None:
            total_salary = max_salary or min_salary

        if min_salary is None and max_salary is not None:
            min_salary = max_salary
        if max_salary is None and min_salary is not None:
            max_salary = min_salary
        if min_salary is None:
            min_salary = total_salary
        if max_salary is None:
            max_salary = total_salary

        if min_salary is None or max_salary is None or total_salary is None:
            return None

        normalized_role = _normalize_role(role_raw)
        normalized_level = _normalize_level(level_raw) or "pleno"

        return NormalizedRow(
            source=source.strip(),
            role=normalized_role,
            level=normalized_level,
            location=location.strip(),
            state=state or "REMOTE",
            country=country,
            currency=currency,
            work_model=work_model,
            base_salary_min=min_salary,
            base_salary_max=max_salary,
            total_compensation=total_salary,
        )
