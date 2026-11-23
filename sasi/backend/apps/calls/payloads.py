import uuid

from apps.calls.exceptions import CallServiceError

MAX_SDP_LENGTH = 65_536
MAX_CANDIDATE_LENGTH = 4_096
FAIL_REASONS = {"media_denied", "ice_failed", "connection_lost"}


def parse_uuid(value, field: str = "call_id") -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError) as exc:
        raise CallServiceError("invalid_payload", f"{field} must be a UUID.") from exc


def parse_sdp(value, expected_type: str) -> dict:
    if not isinstance(value, dict):
        raise CallServiceError("invalid_payload", "sdp must be an object.")
    sdp_type = value.get("type")
    sdp = value.get("sdp")
    if sdp_type != expected_type or not isinstance(sdp, str) or not sdp.strip() or len(sdp) > MAX_SDP_LENGTH:
        raise CallServiceError("invalid_payload", "sdp is invalid.")
    return {"type": sdp_type, "sdp": sdp}


def parse_candidate(value) -> dict:
    if not isinstance(value, dict):
        raise CallServiceError("invalid_payload", "candidate must be an object.")
    candidate = value.get("candidate")
    if not isinstance(candidate, str) or not candidate.strip() or len(candidate) > MAX_CANDIDATE_LENGTH:
        raise CallServiceError("invalid_payload", "candidate is invalid.")
    sdp_mid = value.get("sdpMid")
    line = value.get("sdpMLineIndex")
    if sdp_mid is not None and not isinstance(sdp_mid, str):
        raise CallServiceError("invalid_payload", "sdpMid is invalid.")
    if line is not None and not isinstance(line, int):
        raise CallServiceError("invalid_payload", "sdpMLineIndex is invalid.")
    return {"candidate": candidate, "sdpMid": sdp_mid, "sdpMLineIndex": line}


def parse_fail_reason(value) -> str:
    if value not in FAIL_REASONS:
        raise CallServiceError("invalid_payload", "That failure reason is not recognized.")
    return value
