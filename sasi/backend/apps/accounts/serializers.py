import re

from rest_framework import serializers

from apps.accounts.models import User
from apps.presence.serializers import PresenceSerializer


class MeSerializer(serializers.ModelSerializer):
    presence = PresenceSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "username", "display_name", "presence"]
        read_only_fields = ["id", "email", "username", "presence"]


class PublicUserSerializer(serializers.ModelSerializer):
    presence = PresenceSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "display_name", "presence"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=10, trim_whitespace=False)

    class Meta:
        model = User
        fields = ["email", "username", "display_name", "password"]

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_username(self, value: str) -> str:
        cleaned = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9_]{3,30}", cleaned):
            raise serializers.ValidationError("Use 3–30 letters, numbers, or underscores.")
        if User.objects.filter(username__iexact=cleaned).exists():
            raise serializers.ValidationError("That username is taken.")
        return cleaned.lower()

    def validate_display_name(self, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise serializers.ValidationError("Add a display name.")
        return cleaned

    def validate_password(self, value: str) -> str:
        from django.contrib.auth.password_validation import validate_password

        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class DisplayNameSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["display_name"]

    def validate_display_name(self, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise serializers.ValidationError("Add a display name.")
        return cleaned
