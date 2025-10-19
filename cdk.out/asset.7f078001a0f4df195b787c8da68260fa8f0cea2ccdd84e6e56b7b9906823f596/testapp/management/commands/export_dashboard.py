from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.template.loader import render_to_string


class Command(BaseCommand):
    help = "Render the salary dashboard template to a static HTML file."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir",
            type=str,
            default=None,
            help="Directory where the rendered dashboard will be written (defaults to dist/dashboard).",
        )
        parser.add_argument(
            "--filename",
            type=str,
            default="index.html",
            help="Filename for the rendered dashboard.",
        )

    def handle(self, *args, **options):
        if options["output_dir"]:
            output_dir = Path(options["output_dir"])
        else:
            output_dir = Path(settings.BASE_DIR).parent / "dist" / "dashboard"

        output_dir.mkdir(parents=True, exist_ok=True)
        filename = options["filename"]
        output_path = output_dir / filename

        try:
            html = render_to_string("dashboard.html", {})
        except Exception as exc:  # pragma: no cover - re-raised as CommandError
            raise CommandError(f"Failed to render dashboard: {exc}") from exc

        output_path.write_text(html, encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"Dashboard exported to {output_path}"))
