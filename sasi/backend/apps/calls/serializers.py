from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer
from apps.calls.models import Call


class CreateCallSerializer(serializers.Serializer):
    callee_id = serializers.UUIDField()
    call_type = serializers.ChoiceField(choices=Call.Type.choices)


class FailCallSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=["media_denied", "ice_failed", "connection_lost"])


class CallSerializer(serializers.ModelSerializer):
    caller = PublicUserSerializer()
    callee = PublicUserSerializer()
    ended_by = serializers.UUIDField(source="ended_by_id", allow_null=True)

    class Meta:
        model = Call
        fields = [
            "id",
            "caller",
            "callee",
            "call_type",
            "state",
            "end_reason",
            "ended_by",
            "created_at",
            "accepted_at",
            "ended_at",
        ]
