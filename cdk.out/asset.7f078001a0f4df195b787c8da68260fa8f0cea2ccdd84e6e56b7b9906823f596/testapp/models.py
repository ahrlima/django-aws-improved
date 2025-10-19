from django.db import models


class SalaryObservation(models.Model):
    source = models.CharField(max_length=100)
    role = models.CharField(max_length=150, db_index=True)
    level = models.CharField(max_length=100, db_index=True)
    location = models.CharField(max_length=150, db_index=True)
    state = models.CharField(max_length=30, db_index=True)
    country = models.CharField(max_length=100, db_index=True)
    currency = models.CharField(max_length=10, db_index=True)
    work_model = models.CharField(max_length=50, db_index=True)
    base_salary_min = models.DecimalField(max_digits=12, decimal_places=2)
    base_salary_max = models.DecimalField(max_digits=12, decimal_places=2)
    total_compensation = models.DecimalField(max_digits=12, decimal_places=2)
    observed_at = models.DateField(null=True, blank=True)
    ingested_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["role", "level", "state", "work_model"]
        indexes = [
            models.Index(fields=["role", "country", "state", "work_model"]),
            models.Index(fields=["role", "level", "currency"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=[
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
                    "observed_at",
                ],
                name="unique_salary_observation",
            )
        ]

    def __str__(self) -> str:
        return (
            f"{self.role} ({self.level}) {self.currency} "
            f"{self.base_salary_min}-{self.base_salary_max}"
        )


class SalaryRoleAggregate(models.Model):
    role = models.CharField(max_length=150, unique=True)
    summary = models.JSONField()
    insights = models.JSONField()
    generated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["role"]

    def __str__(self) -> str:
        return f"Aggregate<{self.role}>"
