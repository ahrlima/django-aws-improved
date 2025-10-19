from django.urls import path
from .views import (
    hello_world,
    health_check,
    salary_summary,
    salary_comparison,
    salary_insights,
    dashboard,
    available_filters,
)


urlpatterns = [
    path("", dashboard),
    path("dashboard/", dashboard),
    path("hello/", hello_world),
    path("api/salaries/comparison/", salary_comparison),
    path("api/salaries/", salary_summary),
    path("api/salaries/insights/", salary_insights),
    path("api/filters/", available_filters),
    path("health/", health_check),
    path("healthz", health_check),
    path("healthz/", health_check),
]
