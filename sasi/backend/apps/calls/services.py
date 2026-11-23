import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import User
from apps.calls.exceptions import CallServiceError
from apps.calls.models import Call, CallEvent
from apps.presence.services import PresenceService

logger = logging.getLogger(__name__)


def with_relations(call_id):
    return Call.objects.select_related(
        "caller",
        "caller__presence",
        "callee",
        "callee__presence",
        "ended_by",
    ).get(id=call_id)


class CallService:
    @staticmethod
    def _lock_users(user_ids: list) -> None:
        list(User.objects.select_for_update().filter(id__in=user_ids).order_by("id"))

    @staticmethod
    def _active_calls(user_id):
        return Call.objects.select_for_update().filter(
            Q(caller_id=user_id) | Q(callee_id=user_id),
            state__in=Call.ACTIVE_STATES,
        )

    @classmethod
    def initiate(cls, caller: User, callee_id, call_type: str) -> Call:
        if call_type not in {Call.Type.AUDIO, Call.Type.VIDEO}:
            raise CallServiceError("invalid_payload", "Choose an audio or video call.")
        try:
            callee = User.objects.get(id=callee_id, is_active=True)
        except User.DoesNotExist as exc:
            raise CallServiceError("not_found", "That person does not exist.", 404) from exc
        if callee.id == caller.id:
            raise CallServiceError("self_call", "You cannot call yourself.")

        with transaction.atomic():
            cls._lock_users(sorted([caller.id, callee.id], key=lambda value: str(value)))
            if cls._active_calls(caller.id).exists():
                raise CallServiceError("user_busy", "Finish your current call before starting another.", 409)
            if cls._active_calls(callee.id).exists():
                raise CallServiceError("user_busy", "That person is already on a call.", 409)
            call = Call.objects.create(caller=caller, callee=callee, call_type=call_type, state=Call.State.RINGING)
            CallEvent.objects.create(call=call, actor=caller, event_type=CallEvent.Type.CREATED)
        logger.info("call created id=%s caller=%s callee=%s type=%s", call.id, caller.id, callee.id, call_type)
        return with_relations(call.id)

    @classmethod
    def accept(cls, call_id, actor: User) -> Call:
        return cls._transition(call_id, actor, "accept")

    @classmethod
    def reject(cls, call_id, actor: User) -> Call:
        return cls._transition(call_id, actor, "reject")

    @classmethod
    def cancel(cls, call_id, actor: User) -> Call:
        return cls._transition(call_id, actor, "cancel")

    @classmethod
    def end(cls, call_id, actor: User) -> Call:
        return cls._transition(call_id, actor, "end")

    @classmethod
    def fail(cls, call_id, actor: User, reason: str) -> Call:
        return cls._transition(call_id, actor, "fail", reason=reason)

    @classmethod
    def _transition(cls, call_id, actor: User, action: str, reason: str = "") -> Call:
        with transaction.atomic():
            try:
                call = Call.objects.select_for_update().get(id=call_id)
            except Call.DoesNotExist as exc:
                raise CallServiceError("not_found", "That call does not exist.", 404) from exc
            if actor.id not in {call.caller_id, call.callee_id}:
                raise CallServiceError("forbidden", "You are not part of this call.", 403)

            if action == "accept":
                cls._accept(call, actor)
            elif action == "reject":
                cls._reject(call, actor)
            elif action == "cancel":
                cls._cancel(call, actor)
            elif action == "end":
                cls._end(call, actor)
            elif action == "fail":
                cls._fail(call, actor, reason)
            else:
                raise CallServiceError("invalid_payload", "Unknown call action.")
        return with_relations(call_id)

    @staticmethod
    def _accept(call: Call, actor: User) -> None:
        if call.callee_id != actor.id:
            raise CallServiceError("forbidden", "Only the person being called can accept.", 403)
        if call.state == Call.State.ACCEPTED:
            return
        if call.state != Call.State.RINGING:
            raise CallServiceError("invalid_state", "This call can no longer be accepted.", 409)
        call.state = Call.State.ACCEPTED
        call.accepted_at = timezone.now()
        call.save(update_fields=["state", "accepted_at"])
        CallEvent.objects.create(call=call, actor=actor, event_type=CallEvent.Type.ACCEPTED)
        logger.info("call accepted id=%s", call.id)

    @staticmethod
    def _reject(call: Call, actor: User) -> None:
        if call.callee_id != actor.id:
            raise CallServiceError("forbidden", "Only the person being called can decline.", 403)
        if call.state == Call.State.REJECTED:
            return
        if call.state != Call.State.RINGING:
            raise CallServiceError("invalid_state", "This call can no longer be declined.", 409)
        call.state = Call.State.REJECTED
        call.ended_at = timezone.now()
        call.end_reason = "rejected"
        call.ended_by = actor
        call.save(update_fields=["state", "ended_at", "end_reason", "ended_by"])
        CallEvent.objects.create(call=call, actor=actor, event_type=CallEvent.Type.REJECTED)

    @staticmethod
    def _cancel(call: Call, actor: User) -> None:
        if call.caller_id != actor.id:
            raise CallServiceError("forbidden", "Only the caller can cancel.", 403)
        if call.state == Call.State.CANCELLED:
            return
        if call.state != Call.State.RINGING:
            raise CallServiceError("invalid_state", "This call can no longer be cancelled.", 409)
        call.state = Call.State.CANCELLED
        call.ended_at = timezone.now()
        call.end_reason = "caller_cancelled"
        call.ended_by = actor
        call.save(update_fields=["state", "ended_at", "end_reason", "ended_by"])
        CallEvent.objects.create(call=call, actor=actor, event_type=CallEvent.Type.CANCELLED)

    @classmethod
    def _end(cls, call: Call, actor: User) -> None:
        if call.state == Call.State.ENDED:
            return
        if call.state == Call.State.RINGING:
            if actor.id == call.caller_id:
                cls._cancel(call, actor)
            else:
                cls._reject(call, actor)
            return
        if call.state != Call.State.ACCEPTED:
            raise CallServiceError("invalid_state", "This call has already finished.", 409)
        call.state = Call.State.ENDED
        call.ended_at = timezone.now()
        call.end_reason = "hung_up"
        call.ended_by = actor
        call.save(update_fields=["state", "ended_at", "end_reason", "ended_by"])
        CallEvent.objects.create(call=call, actor=actor, event_type=CallEvent.Type.ENDED)
        logger.info("call ended id=%s by=%s", call.id, actor.id)

    @staticmethod
    def _fail(call: Call, actor: User, reason: str) -> None:
        if call.state == Call.State.FAILED and call.end_reason == reason:
            return
        if call.state not in Call.ACTIVE_STATES:
            raise CallServiceError("invalid_state", "This call has already finished.", 409)
        call.state = Call.State.FAILED
        call.ended_at = timezone.now()
        call.end_reason = reason
        call.ended_by = actor
        call.save(update_fields=["state", "ended_at", "end_reason", "ended_by"])
        CallEvent.objects.create(call=call, actor=actor, event_type=CallEvent.Type.FAILED)
        logger.info("call failed id=%s reason=%s", call.id, reason)

    @classmethod
    def mark_missed_if_ringing(cls, call_id) -> Call | None:
        cutoff = timezone.now() - timedelta(seconds=settings.CALL_RING_TIMEOUT_SECONDS)
        with transaction.atomic():
            try:
                call = Call.objects.select_for_update().get(id=call_id)
            except Call.DoesNotExist:
                return None
            if call.state != Call.State.RINGING or call.created_at >= cutoff:
                return None
            call.state = Call.State.MISSED
            call.ended_at = timezone.now()
            call.end_reason = "ring_timeout"
            call.save(update_fields=["state", "ended_at", "end_reason"])
            CallEvent.objects.create(call=call, actor=None, event_type=CallEvent.Type.MISSED)
        logger.info("call missed id=%s", call_id)
        return with_relations(call_id)

    @classmethod
    def mark_connection_lost(cls, call_id) -> Call | None:
        with transaction.atomic():
            try:
                call = Call.objects.select_for_update().get(id=call_id)
            except Call.DoesNotExist:
                return None
            if call.state != Call.State.ACCEPTED:
                return None
            caller_gone = PresenceService.is_offline_past_grace(call.caller_id)
            callee_gone = PresenceService.is_offline_past_grace(call.callee_id)
            if not caller_gone and not callee_gone:
                return None
            call.state = Call.State.FAILED
            call.ended_at = timezone.now()
            call.end_reason = "connection_lost"
            call.save(update_fields=["state", "ended_at", "end_reason"])
            CallEvent.objects.create(call=call, actor=None, event_type=CallEvent.Type.FAILED)
        logger.info("call connection lost id=%s", call_id)
        return with_relations(call_id)

    @classmethod
    def expire_stale_calls(cls) -> list[Call]:
        cutoff = timezone.now() - timedelta(seconds=settings.CALL_RING_TIMEOUT_SECONDS)
        ringing_ids = list(
            Call.objects.filter(state=Call.State.RINGING, created_at__lt=cutoff).values_list("id", flat=True)[:100]
        )
        accepted_ids = list(Call.objects.filter(state=Call.State.ACCEPTED).values_list("id", flat=True)[:100])
        changed: list[Call] = []
        for call_id in ringing_ids:
            call = cls.mark_missed_if_ringing(call_id)
            if call is not None:
                changed.append(call)
        for call_id in accepted_ids:
            call = cls.mark_connection_lost(call_id)
            if call is not None:
                changed.append(call)
        return changed

    @staticmethod
    def peer_id(call: Call, user_id):
        if call.caller_id == user_id:
            return call.callee_id
        if call.callee_id == user_id:
            return call.caller_id
        raise CallServiceError("forbidden", "You are not part of this call.", 403)

    @staticmethod
    def get_for_participant(call_id, user) -> Call:
        try:
            call = with_relations(call_id)
        except Call.DoesNotExist as exc:
            raise CallServiceError("not_found", "That call does not exist.", 404) from exc
        if user.id not in {call.caller_id, call.callee_id}:
            raise CallServiceError("forbidden", "You are not part of this call.", 403)
        return call

    @staticmethod
    def for_user(user):
        return (
            Call.objects.filter(Q(caller=user) | Q(callee=user))
            .select_related("caller", "caller__presence", "callee", "callee__presence", "ended_by")
            .order_by("-created_at")
        )
