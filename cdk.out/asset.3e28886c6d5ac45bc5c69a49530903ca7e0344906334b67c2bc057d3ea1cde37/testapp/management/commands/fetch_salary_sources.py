import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


@dataclass(frozen=True)
class SalarySource:
    name: str
    url: str
    destination: Path
    headers: Optional[dict]


def _resolve_sources(config_path: Path, output_dir: Path) -> Iterable[SalarySource]:
    with config_path.open(encoding="utf-8") as handle:
        config = json.load(handle)

    for entry in config.get("sources", []):
        name = entry.get("name")
        url = entry.get("url")
        if not name or not url:
            continue

        destination_raw = entry.get("dest") or entry.get("destination") or f"{name}.csv"
        destination_path = Path(destination_raw)
        if not destination_path.is_absolute():
            destination_path = output_dir / destination_path

        headers = entry.get("headers")
        yield SalarySource(
            name=name,
            url=url,
            destination=destination_path,
            headers=headers if isinstance(headers, dict) else None,
        )


class Command(BaseCommand):
    help = (
        "Download raw salary datasets defined in a JSON config file "
        "and store them under the raw data directory."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--config",
            type=str,
            default=None,
            help="Path to the JSON file describing the remote salary sources.",
        )
        parser.add_argument(
            "--output-dir",
            type=str,
            default=None,
            help="Directory where downloaded files will be stored (default: data/raw).",
        )
        parser.add_argument(
            "--timeout",
            type=int,
            default=60,
            help="Timeout in seconds for each download request.",
        )

    def handle(self, *args, **options):
        if options["config"]:
            config_path = Path(options["config"])
        else:
            config_path = Path(settings.BASE_DIR).parent / "config" / "salary_sources.json"
        if not config_path.exists():
            raise CommandError(f"Config file {config_path} does not exist.")

        if options["output_dir"]:
            output_dir = Path(options["output_dir"])
        else:
            output_dir = Path(settings.BASE_DIR).parent / "data" / "raw"
        output_dir.mkdir(parents=True, exist_ok=True)

        timeout = options["timeout"]
        downloaded = 0

        for source in _resolve_sources(config_path, output_dir):
            source.destination.parent.mkdir(parents=True, exist_ok=True)
            request = Request(source.url, headers=source.headers or {})

            try:
                with urlopen(request, timeout=timeout) as response:
                    data = response.read()
            except URLError as exc:
                self.stderr.write(
                    self.style.ERROR(f"[{source.name}] failed to download: {exc}")
                )
                continue

            with source.destination.open("wb") as handle:
                handle.write(data)
            downloaded += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"[{source.name}] downloaded {len(data)} bytes -> {source.destination}"
                )
            )

        if downloaded == 0:
            raise CommandError(
                "No sources were downloaded. Check the configuration or network access."
            )

        self.stdout.write(self.style.SUCCESS(f"Fetched {downloaded} dataset(s)."))
