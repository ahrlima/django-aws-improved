import copy
import math
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Sequence, Tuple

from django.db.models import Avg, Count, Min, Max, QuerySet

from .models import SalaryObservation, SalaryRoleAggregate

ROUNDING_STEP = Decimal("0.01")


def _normalize(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.strip().lower()


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _format_decimal(value: Optional[Decimal]) -> Optional[float]:
    if value is None:
        return None
    return float(value.quantize(ROUNDING_STEP, rounding=ROUND_HALF_UP))


def _filtered_queryset(
    role: str,
    location: Optional[str] = None,
    country: Optional[str] = None,
    state: Optional[str] = None,
    level: Optional[str] = None,
    currency: Optional[str] = None,
    work_model: Optional[str] = None,
) -> Tuple[QuerySet[SalaryObservation], Dict[str, Optional[str]]]:
    if not role:
        raise ValueError("role is required")

    role_clean = _clean(role)
    if role_clean is None:
        raise ValueError("role is required")

    qs = SalaryObservation.objects.filter(role__iexact=role_clean)

    location_clean = _clean(location)
    if location_clean:
        qs = qs.filter(location__iexact=location_clean)
    country_clean = _clean(country)
    if country_clean:
        qs = qs.filter(country__iexact=country_clean)
    state_clean = _clean(state)
    if state_clean:
        qs = qs.filter(state__iexact=state_clean)
    level_clean = _clean(level)
    if level_clean:
        qs = qs.filter(level__iexact=level_clean)
    currency_clean = _clean(currency)
    if currency_clean:
        qs = qs.filter(currency__iexact=currency_clean)
    work_model_clean = _clean(work_model)
    if work_model_clean:
        qs = qs.filter(work_model__iexact=work_model_clean)

    qs = qs.order_by()

    filters = {
        "role": _normalize(role_clean),
        "location": _normalize(location_clean),
        "country": _normalize(country_clean),
        "state": _normalize(state_clean),
        "level": _normalize(level_clean),
        "currency": _normalize(currency_clean),
        "work_model": _normalize(work_model_clean),
    }

    return qs, filters


def _only_role_filter(filters: Dict[str, Optional[str]]) -> bool:
    return filters["role"] is not None and all(
        filters[key] is None
        for key in ("location", "country", "state", "level", "currency", "work_model")
    )


def _build_summary(qs: QuerySet[SalaryObservation], filters: Dict[str, Optional[str]]) -> Dict:
    total_observations = qs.count()

    currency_breakdown = _summarize_by_currency(qs)
    level_breakdown = _summarize_by_level(qs)
    state_breakdown = _summarize_by_state(qs)
    work_model_breakdown = _summarize_by_work_model(qs)

    return {
        "role": filters["role"],
        "filters": filters,
        "total_observations": total_observations,
        "currencies": currency_breakdown,
        "levels": level_breakdown,
        "states": state_breakdown,
        "work_models": work_model_breakdown,
    }


def summarize_salaries(
    role: str,
    *,
    location: Optional[str] = None,
    country: Optional[str] = None,
    state: Optional[str] = None,
    level: Optional[str] = None,
    currency: Optional[str] = None,
    work_model: Optional[str] = None,
    use_cache: bool = True,
) -> Dict:
    qs, filters = _filtered_queryset(
        role,
        location=location,
        country=country,
        state=state,
        level=level,
        currency=currency,
        work_model=work_model,
    )

    if use_cache and _only_role_filter(filters):
        aggregate = SalaryRoleAggregate.objects.filter(role=filters["role"]).first()
        if aggregate:
            return copy.deepcopy(aggregate.summary)

    return _build_summary(qs, filters)


def _summarize_by_currency(qs: QuerySet[SalaryObservation]) -> List[Dict]:
    aggregated = (
        qs.values("currency")
        .annotate(
            observations=Count("id"),
            min_base=Min("base_salary_min"),
            max_base=Max("base_salary_max"),
            min_total=Min("total_compensation"),
            max_total=Max("total_compensation"),
            avg_min=Avg("base_salary_min"),
            avg_max=Avg("base_salary_max"),
            avg_total=Avg("total_compensation"),
        )
    )

    results: List[Dict] = []
    for entry in aggregated:
        currency = entry["currency"]
        currency_qs = qs.filter(currency__iexact=currency).order_by()

        sources = (
            currency_qs.values("source")
            .annotate(
                observations=Count("id"),
                average_total_compensation=Avg("total_compensation"),
            )
            .order_by("source")
        )
        source_breakdown = [
            {
                "name": source_entry["source"],
                "observations": source_entry["observations"],
                "average_total_compensation": _format_decimal(
                    source_entry["average_total_compensation"]
                ),
            }
            for source_entry in sources
        ]

        results.append(
            {
                "currency": currency,
                "observations": entry["observations"],
                "base_salary": {
                    "min": _format_decimal(entry["min_base"]),
                    "max": _format_decimal(entry["max_base"]),
                    "average_min": _format_decimal(entry["avg_min"]),
                    "average_max": _format_decimal(entry["avg_max"]),
                },
                "total_compensation": {
                    "min": _format_decimal(entry["min_total"]),
                    "max": _format_decimal(entry["max_total"]),
                    "average": _format_decimal(entry["avg_total"]),
                },
                "sources": source_breakdown,
            }
        )

    return sorted(results, key=lambda item: item["currency"])


def _summarize_group(
    qs: QuerySet[SalaryObservation],
    field: str,
    label: str,
) -> List[Dict]:
    values = qs.order_by().values_list(field, flat=True).distinct()
    breakdown: List[Dict] = []
    for value in sorted(filter(None, values)):
        scoped_qs = qs.filter(**{f"{field}__iexact": value}).order_by()
        breakdown.append(
            {
                label: value,
                "observations": scoped_qs.count(),
                "currencies": _summarize_by_currency(scoped_qs),
            }
        )
    return breakdown


def _summarize_by_level(qs: QuerySet[SalaryObservation]) -> List[Dict]:
    return _summarize_group(qs, "level", "level")


def _summarize_by_state(qs: QuerySet[SalaryObservation]) -> List[Dict]:
    return _summarize_group(qs, "state", "state")


def _summarize_by_work_model(qs: QuerySet[SalaryObservation]) -> List[Dict]:
    return _summarize_group(qs, "work_model", "work_model")


def _percentile(sorted_values: Sequence[Decimal], percentile: float) -> Optional[Decimal]:
    if not sorted_values:
        return None
    if percentile <= 0:
        return sorted_values[0]
    if percentile >= 1:
        return sorted_values[-1]
    k = (len(sorted_values) - 1) * percentile
    lower_index = int(math.floor(k))
    upper_index = int(math.ceil(k))
    if lower_index == upper_index:
        return sorted_values[lower_index]
    lower = sorted_values[lower_index]
    upper = sorted_values[upper_index]
    fraction = Decimal(str(k - lower_index))
    return lower + (upper - lower) * fraction


def _total_comp_values(qs: QuerySet[SalaryObservation]) -> List[Decimal]:
    values = list(qs.values_list("total_compensation", flat=True))
    return sorted(values)


def _top_groups(
    qs: QuerySet[SalaryObservation],
    group_field: str,
    label: str,
    limit: int = 5,
) -> List[Dict]:
    grouped = (
        qs.values(group_field)
        .annotate(
            observations=Count("id"),
            average_total=Avg("total_compensation"),
        )
        .order_by("-average_total", group_field)[:limit]
    )
    results: List[Dict] = []
    for entry in grouped:
        value = entry[group_field]
        if not value:
            continue
        results.append(
            {
                label: value,
                "observations": entry["observations"],
                "average_total_compensation": _format_decimal(entry["average_total"]),
            }
        )
    return results


def _build_insights(qs: QuerySet[SalaryObservation], filters: Dict[str, Optional[str]]) -> Dict:
    values = _total_comp_values(qs)
    percentiles = {
        "p25": _format_decimal(_percentile(values, Decimal("0.25"))) if values else None,
        "median": _format_decimal(_percentile(values, Decimal("0.50"))) if values else None,
        "p75": _format_decimal(_percentile(values, Decimal("0.75"))) if values else None,
    }

    top_states = _top_groups(qs, "state", "state")
    top_locations = _top_groups(qs, "location", "location")
    top_work_models = _top_groups(qs, "work_model", "work_model")
    top_sources = _top_groups(qs, "source", "source")

    return {
        "role": filters["role"],
        "filters": filters,
        "total_observations": qs.count(),
        "percentiles": percentiles,
        "top_states": top_states,
        "top_locations": top_locations,
        "top_work_models": top_work_models,
        "top_sources": top_sources,
    }


def role_insights(
    role: str,
    *,
    location: Optional[str] = None,
    country: Optional[str] = None,
    state: Optional[str] = None,
    level: Optional[str] = None,
    currency: Optional[str] = None,
    work_model: Optional[str] = None,
    use_cache: bool = True,
) -> Dict:
    qs, filters = _filtered_queryset(
        role,
        location=location,
        country=country,
        state=state,
        level=level,
        currency=currency,
        work_model=work_model,
    )

    if use_cache and _only_role_filter(filters):
        aggregate = SalaryRoleAggregate.objects.filter(role=filters["role"]).first()
        if aggregate:
            return copy.deepcopy(aggregate.insights)

    return _build_insights(qs, filters)


def compare_roles(
    roles: Sequence[str],
    *,
    location: Optional[str] = None,
    country: Optional[str] = None,
    state: Optional[str] = None,
    level: Optional[str] = None,
    currency: Optional[str] = None,
    work_model: Optional[str] = None,
) -> Dict:
    normalized_roles = sorted({_normalize(role) for role in roles if _clean(role)})
    if not normalized_roles:
        raise ValueError("at least one role is required")

    summaries: List[Dict] = []
    for role_name in normalized_roles:
        summary = summarize_salaries(
            role=role_name,
            location=location,
            country=country,
            state=state,
            level=level,
            currency=currency,
            work_model=work_model,
        )
        summaries.append(summary)

    return {
        "filters": {
            "roles": normalized_roles,
            "location": _normalize(_clean(location)),
            "country": _normalize(_clean(country)),
            "state": _normalize(_clean(state)),
            "level": _normalize(_clean(level)),
            "currency": _normalize(_clean(currency)),
            "work_model": _normalize(_clean(work_model)),
        },
        "roles": summaries,
    }


def rebuild_role_aggregate(role: str) -> SalaryRoleAggregate:
    summary = summarize_salaries(role, use_cache=False)
    insights = role_insights(role, use_cache=False)
    aggregate, _created = SalaryRoleAggregate.objects.update_or_create(
        role=summary["role"],
        defaults={
            "summary": summary,
            "insights": insights,
        },
    )
    return aggregate


def refresh_all_role_aggregates() -> int:
    roles = (
        SalaryObservation.objects.order_by()
        .values_list("role", flat=True)
        .distinct()
    )
    count = 0
    for role in roles:
        rebuild_role_aggregate(role)
        count += 1
    return count
