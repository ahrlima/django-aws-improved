from django.urls import path
from .views import (
    hello_world,
    health_check,
    salary_summary,
    salary_comparison,
    salary_insights,
    dashboard,
)


urlpatterns = [
    path("", hello_world),
    path("dashboard/", dashboard),
    path("api/salaries/comparison/", salary_comparison),
    path("api/salaries/", salary_summary),
    path("api/salaries/insights/", salary_insights),
    path("health/", health_check),
    path("healthz", health_check),
    path("healthz/", health_check),
]
