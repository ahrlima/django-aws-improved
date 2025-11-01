import logging

from django.apps import AppConfig
from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from django.db import OperationalError, ProgrammingError
from django.db.models.signals import post_migrate

LOGGER = logging.getLogger(__name__)
_CACHE_FLAG_KEY = "testapp.dataset.autoloaded"


class TestappConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "testapp"

    def ready(self):
        post_migrate.connect(self._ensure_dataset_loaded, sender=self)
        self._ensure_dataset_loaded()

    def _ensure_dataset_loaded(self, **kwargs):
        if not getattr(settings, "AUTOLOAD_SALARY_DATASET", False):
            return

        if cache.get(_CACHE_FLAG_KEY):
            return

        from django.apps import apps

        SalaryObservation = apps.get_model("testapp", "SalaryObservation")
        try:
            if SalaryObservation.objects.exists():
                cache.set(_CACHE_FLAG_KEY, True, timeout=300)
                return
        except (OperationalError, ProgrammingError):
            return

        command_kwargs = {}
        dataset_path = getattr(settings, "AUTOLOAD_SALARY_DATASET_PATH", None)
        if dataset_path:
            command_kwargs["input"] = dataset_path

        try:
            call_command("load_salary_dataset", **command_kwargs)
            cache.set(_CACHE_FLAG_KEY, True, timeout=300)
        except Exception as exc:  # pragma: no cover - logged for visibility only
            LOGGER.warning("Automatic salary dataset load failed: %s", exc, exc_info=True)
