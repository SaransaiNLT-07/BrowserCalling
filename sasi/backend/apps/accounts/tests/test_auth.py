import pytest
from rest_framework_simplejwt.tokens import RefreshToken


@pytest.mark.django_db
def test_register_login_me_and_logout(api, password):
    registered = api.post(
        "/api/auth/register/",
        {
            "email": "Avery@Saran.dev",
            "username": "Avery",
            "display_name": "  Avery   Chen ",
            "password": password,
        },
        format="json",
    )
    assert registered.status_code == 201
    assert registered.data["user"]["email"] == "avery@Saran.dev"
    assert registered.data["user"]["username"] == "avery"
    assert registered.data["user"]["display_name"] == "Avery Chen"
    assert "access" in registered.data

    me = api.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {registered.data['access']}")
    assert me.status_code == 200
    assert me.data["email"] == "avery@Saran.dev"

    logged_in = api.post(
        "/api/auth/token/",
        {"email": "avery@Saran.dev", "password": password},
        format="json",
    )
    assert logged_in.status_code == 200
    assert logged_in.data["user"]["username"] == "avery"

    logout = api.post(
        "/api/auth/logout/",
        {"refresh": logged_in.data["refresh"]},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {logged_in.data['access']}",
    )
    assert logout.status_code == 204

    refreshed = api.post("/api/auth/token/refresh/", {"refresh": logged_in.data["refresh"]}, format="json")
    assert refreshed.status_code == 401


@pytest.mark.django_db
def test_short_password_is_rejected(api):
    response = api.post(
        "/api/auth/register/",
        {
            "email": "short@Saran.dev",
            "username": "shortname",
            "display_name": "Short Name",
            "password": "tiny",
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.data["code"] == "invalid"
    assert "password" in response.data["fields"]


@pytest.mark.django_db
def test_directory_hides_email_and_self(api, make_user, password):
    viewer = make_user()
    make_user(email="jordan@Saran.dev", username="jordan", display_name="Jordan Hale")
    token = str(RefreshToken.for_user(viewer).access_token)
    response = api.get("/api/users/", HTTP_AUTHORIZATION=f"Bearer {token}")
    assert response.status_code == 200
    assert response.data["count"] == 1
    person = response.data["results"][0]
    assert person["username"] == "jordan"
    assert "email" not in person
    assert person["presence"]["status"] == "offline"

    detail = api.get(f"/api/users/{viewer.id}/", HTTP_AUTHORIZATION=f"Bearer {token}")
    assert detail.status_code == 404


@pytest.mark.django_db
def test_display_name_update(api, make_user):
    user = make_user()
    token = str(RefreshToken.for_user(user).access_token)
    response = api.patch(
        "/api/auth/me/",
        {"display_name": "Avery C."},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )
    assert response.status_code == 200
    assert response.data["display_name"] == "Avery C."


@pytest.mark.django_db
def test_health(api):
    response = api.get("/api/health/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
