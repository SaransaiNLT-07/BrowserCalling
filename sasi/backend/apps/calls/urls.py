from django.urls import path

from apps.calls.views import (
    AcceptCallView,
    CallDetailView,
    CallListCreateView,
    CancelCallView,
    EndCallView,
    FailCallView,
    IceServersView,
    RejectCallView,
)

urlpatterns = [
    path("ice-servers/", IceServersView.as_view(), name="call-ice-servers"),
    path("", CallListCreateView.as_view(), name="call-list"),
    path("<uuid:call_id>/", CallDetailView.as_view(), name="call-detail"),
    path("<uuid:call_id>/accept/", AcceptCallView.as_view(), name="call-accept"),
    path("<uuid:call_id>/reject/", RejectCallView.as_view(), name="call-reject"),
    path("<uuid:call_id>/cancel/", CancelCallView.as_view(), name="call-cancel"),
    path("<uuid:call_id>/end/", EndCallView.as_view(), name="call-end"),
    path("<uuid:call_id>/fail/", FailCallView.as_view(), name="call-fail"),
]
