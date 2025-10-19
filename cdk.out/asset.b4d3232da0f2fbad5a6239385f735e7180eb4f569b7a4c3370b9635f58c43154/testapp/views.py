from typing import List

from django.http import HttpResponse, JsonResponse
from django.shortcuts import render

from .salary_data import compare_roles, role_insights, summarize_salaries


def hello_world(request):
    return HttpResponse('Hello World', status=200)


def health_check(request):
    return HttpResponse('OK', status=200)


def salary_summary(request):
    role = request.GET.get("role")
    if not role:
        return JsonResponse({"error": "role query parameter is required"}, status=400)

    try:
        summary = summarize_salaries(
            role=role,
            location=request.GET.get("location"),
            country=request.GET.get("country"),
            state=request.GET.get("state"),
            level=request.GET.get("level"),
            currency=request.GET.get("currency"),
            work_model=request.GET.get("work_model"),
        )
    except FileNotFoundError as exc:
        return JsonResponse({"error": str(exc)}, status=500)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse(summary, status=200)


def salary_comparison(request):
    roles: List[str] = []

    roles_param = request.GET.get("roles")
    if roles_param:
        roles.extend([item.strip() for item in roles_param.split(",") if item.strip()])

    extra_roles = request.GET.getlist("role")
    if extra_roles:
        roles.extend([item.strip() for item in extra_roles if item.strip()])

    if not roles:
        return JsonResponse({"error": "roles query parameter is required"}, status=400)

    try:
        summary = compare_roles(
            roles=roles,
            location=request.GET.get("location"),
            country=request.GET.get("country"),
            state=request.GET.get("state"),
            level=request.GET.get("level"),
            currency=request.GET.get("currency"),
            work_model=request.GET.get("work_model"),
        )
    except FileNotFoundError as exc:
        return JsonResponse({"error": str(exc)}, status=500)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse(summary, status=200)


def salary_insights(request):
    role = request.GET.get("role")
    if not role:
        return JsonResponse({"error": "role query parameter is required"}, status=400)

    try:
        insights = role_insights(
            role=role,
            location=request.GET.get("location"),
            country=request.GET.get("country"),
            state=request.GET.get("state"),
            level=request.GET.get("level"),
            currency=request.GET.get("currency"),
            work_model=request.GET.get("work_model"),
        )
    except FileNotFoundError as exc:
        return JsonResponse({"error": str(exc)}, status=500)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse(insights, status=200)


def dashboard(request):
    return render(request, "dashboard.html")
