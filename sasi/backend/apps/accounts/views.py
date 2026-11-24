from django.db.models import Case, IntegerField, Q, Value, When
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.models import User
from apps.accounts.serializers import (
    DisplayNameSerializer,
    MeSerializer,
    PublicUserSerializer,
    RegisterSerializer,
)
from apps.presence.services import PresenceService


class AuthRateThrottle(AnonRateThrottle):
    scope = "auth"


class TokenPairSerializerMixin:
    def validate(self, attrs):
        # Emails are stored lowercase; match that so "Avery@x.dev" can log in.
        field = self.username_field
        if isinstance(attrs.get(field), str):
            attrs[field] = attrs[field].strip().lower()
        data = super().validate(attrs)
        data["user"] = MeSerializer(self.user).data
        return data


from rest_framework_simplejwt.serializers import TokenObtainPairSerializer  # noqa: E402


class TokenPairSerializer(TokenPairSerializerMixin, TokenObtainPairSerializer):
    pass


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": MeSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = TokenPairSerializer
    throttle_classes = [AuthRateThrottle]


class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]


class LogoutView(APIView):
    def post(self, request):
        raw = request.data.get("refresh")
        if not raw or not isinstance(raw, str):
            return Response(
                {"code": "invalid", "detail": "A refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(raw)
        except TokenError:
            return Response(
                {"code": "invalid", "detail": "That refresh token is not valid."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if str(token.get("user_id")) != str(request.user.id):
            return Response(
                {"code": "forbidden", "detail": "That refresh token belongs to someone else."},
                status=status.HTTP_403_FORBIDDEN,
            )
        token.blacklist()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        serializer = DisplayNameSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MeSerializer(request.user).data)


class DirectoryView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = PublicUserSerializer

    def get_queryset(self):
        for snapshot in PresenceService.reconcile_offline():
            PresenceService.broadcast_sync(snapshot)
        queryset = (
            User.objects.filter(is_active=True)
            .exclude(pk=self.request.user.pk)
            .select_related("presence")
            .annotate(
                online_rank=Case(
                    When(presence__status="online", then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                )
            )
            .order_by("online_rank", "display_name")
        )
        query = self.request.query_params.get("q", "").strip()
        if query:
            queryset = queryset.filter(Q(display_name__icontains=query) | Q(username__icontains=query))
        return queryset


class PublicUserDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = PublicUserSerializer
    lookup_url_kwarg = "user_id"

    def get_queryset(self):
        return User.objects.filter(is_active=True).exclude(pk=self.request.user.pk).select_related("presence")
