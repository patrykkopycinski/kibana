# soc-simulation/bridge/tests/test_bridge.py
"""Unit tests for Caldera Bridge — tests core logic without live ES/Caldera."""

import json
from unittest.mock import MagicMock, patch

import pytest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import caldera_bridge


def test_load_profiles_from_directory(tmp_path):
    profile = {
        "difficulty_level": 1,
        "name": "script-kiddie-profile",
        "adversary_id": "abc-123",
        "group": "all-endpoints",
    }
    (tmp_path / "level1.json").write_text(json.dumps(profile))

    profiles = caldera_bridge.load_profiles(str(tmp_path))

    assert 1 in profiles
    assert profiles[1]["adversary_id"] == "abc-123"
    assert profiles[1]["name"] == "script-kiddie-profile"


def test_load_profiles_empty_directory(tmp_path):
    profiles = caldera_bridge.load_profiles(str(tmp_path))
    assert profiles == {}


def test_load_profiles_nonexistent_directory():
    profiles = caldera_bridge.load_profiles("/nonexistent/path")
    assert profiles == {}


def test_load_profiles_skips_invalid_json(tmp_path):
    (tmp_path / "bad.json").write_text("not json")
    profiles = caldera_bridge.load_profiles(str(tmp_path))
    assert profiles == {}


def test_claim_pending_command_returns_none_when_empty():
    es = MagicMock()
    es.search.return_value = {"hits": {"hits": []}}
    result = caldera_bridge.claim_pending_command(es)
    assert result is None


def test_claim_pending_command_claims_document():
    es = MagicMock()
    es.search.return_value = {
        "hits": {
            "hits": [{
                "_id": "doc-1",
                "_seq_no": 5,
                "_primary_term": 1,
                "_source": {
                    "status": "pending",
                    "difficulty": 2,
                    "profile": "opportunistic-profile",
                },
            }]
        }
    }
    es.update.return_value = {}

    result = caldera_bridge.claim_pending_command(es)

    assert result is not None
    assert result["_id"] == "doc-1"
    assert result["status"] == "running"
    es.update.assert_called_once()
    call_kwargs = es.update.call_args
    assert call_kwargs.kwargs["if_seq_no"] == 5
    assert call_kwargs.kwargs["if_primary_term"] == 1


def test_claim_pending_command_handles_conflict():
    from elasticsearch import ConflictError

    es = MagicMock()
    es.search.return_value = {
        "hits": {
            "hits": [{
                "_id": "doc-1",
                "_seq_no": 5,
                "_primary_term": 1,
                "_source": {"status": "pending", "difficulty": 1},
            }]
        }
    }
    es.update.side_effect = ConflictError(message="conflict", meta=None, body=None)

    result = caldera_bridge.claim_pending_command(es)
    assert result is None


def test_process_command_fails_without_profile():
    es = MagicMock()
    command = {"_id": "doc-1", "difficulty": 99}
    caldera_bridge.process_command(es, command, {}, "http://cal:8888", "KEY")
    es.update.assert_called_once()
    update_body = es.update.call_args.kwargs["body"]["doc"]
    assert update_body["status"] == "failed"
    assert "No profile for difficulty 99" in update_body["error"]


@patch("caldera_bridge.create_caldera_operation", return_value=None)
def test_process_command_fails_when_operation_creation_fails(mock_create):
    es = MagicMock()
    command = {"_id": "doc-1", "difficulty": 1}
    profiles = {1: {"adversary_id": "adv-1", "group": "all-endpoints"}}
    caldera_bridge.process_command(es, command, profiles, "http://cal:8888", "KEY")
    update_body = es.update.call_args.kwargs["body"]["doc"]
    assert update_body["status"] == "failed"


@patch("caldera_bridge.wait_for_operation", return_value={"state": "finished", "techniques_executed": ["T1059.004"]})
@patch("caldera_bridge.create_caldera_operation", return_value="op-123")
def test_process_command_succeeds(mock_create, mock_wait):
    es = MagicMock()
    command = {"_id": "doc-1", "difficulty": 1}
    profiles = {1: {"adversary_id": "adv-1", "group": "all-endpoints"}}
    caldera_bridge.process_command(es, command, profiles, "http://cal:8888", "KEY")
    update_body = es.update.call_args.kwargs["body"]["doc"]
    assert update_body["status"] == "completed"
    assert update_body["operation_id"] == "op-123"
    assert update_body["techniques_executed"] == ["T1059.004"]
