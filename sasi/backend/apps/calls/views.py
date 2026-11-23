from rest_framework import generics, status
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.calls.exceptions import CallServiceError
from apps.calls.models import Call
from apps.calls.notifications import notify_call_state_sync, notify_calls_sync
from apps.calls.serializers import CallSerializer, CreateCallSerializer, FailCallSerializer
from apps.calls.services import CallService


def raise_service(exc: CallServiceError) -> None:
    error = APIException(detail=exc.detail)
    error.status_code = exc.status
    error.default_code = exc.code
    raise error


class CallListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CallSerializer

    def get_queryset(self):
        changed = CallService.expire_stale_calls()
        notify_calls_sync(changed)
        queryset = CallService.for_user(self.request.user)
        if self.request.query_params.get("active") == "true":
            queryset = queryset.filter(state__in=Call.ACTIVE_STATES)
        return queryset

    def create(self, request, *args, **kwargs):
        notify_calls_sync(CallService.expire_stale_calls())
        serializer = CreateCallSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            call = CallService.initiate(
                request.user,
                serializer.validated_data["callee_id"],
                serializer.validated_data["call_type"],
            )
        except CallServiceError as exc:
            raise_service(exc)
        notify_call_state_sync(call)
        return Response(CallSerializer(call).data, status=status.HTTP_201_CREATED)


class CallDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CallSerializer
    lookup_url_kwarg = "call_id"

    def get_queryset(self):
        return CallService.for_user(self.request.user)


class CallActionView(APIView):
    permission_classes = [IsAuthenticated]
    action_name = ""

    def post(self, request, call_id):
        try:
            call = self.perform(request, call_id)
        except CallServiceError as exc:
            raise_service(exc)
        notify_call_state_sync(call)
        return Response(CallSerializer(call).data)

    def perform(self, request, call_id) -> Call:
        raise NotImplementedError


class AcceptCallView(CallActionView):
    def perform(self, request, call_id):
        return CallService.accept(call_id, request.user)


class RejectCallView(CallActionView):
    def perform(self, request, call_id):
        return CallService.reject(call_id, request.user)


class CancelCallView(CallActionView):
    def perform(self, request, call_id):
        return CallService.cancel(call_id, request.user)


class EndCallView(CallActionView):
    def perform(self, request, call_id):
        return CallService.end(call_id, request.user)


class FailCallView(CallActionView):
    def perform(self, request, call_id):
        serializer = FailCallSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return CallService.fail(call_id, request.user, serializer.validated_data["reason"])
