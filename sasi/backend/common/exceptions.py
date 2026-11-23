import logging

from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def _stringify(value):
    if isinstance(value, list):
        return [_stringify(item) for item in value]
    if isinstance(value, dict):
        return {key: _stringify(item) for key, item in value.items()}
    return str(value)


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API exception", extra={"view": context.get("view")})
        return None

    code = getattr(exc, "default_code", "error")
    data = response.data
    if isinstance(data, dict) and set(data.keys()) == {"detail"}:
        detail = data["detail"]
        if isinstance(detail, list):
            detail = detail[0] if detail else "Request failed."
        response.data = {"code": str(code), "detail": str(detail)}
        return response

    if isinstance(data, dict):
        response.data = {
            "code": "invalid",
            "detail": "Check the submitted fields.",
            "fields": _stringify(data),
        }
        return response

    response.data = {"code": str(code), "detail": str(data)}
    return response
