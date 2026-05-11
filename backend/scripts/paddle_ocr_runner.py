#!/usr/bin/env python3
import base64
import json
import os
import sys
import tempfile
from typing import Any, Iterable, List, Tuple


def _emit(payload: dict, exit_code: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=True))
    sys.stdout.flush()
    raise SystemExit(exit_code)


def _walk_ocr_nodes(node: Any) -> Iterable[Tuple[str, float]]:
    if isinstance(node, (list, tuple)):
        if (
            len(node) >= 2
            and isinstance(node[1], (list, tuple))
            and len(node[1]) >= 2
            and isinstance(node[1][0], str)
        ):
            text = node[1][0].strip()
            score = float(node[1][1]) if node[1][1] is not None else 0.0
            if text:
                yield (text, score)
            return

        for item in node:
            yield from _walk_ocr_nodes(item)


def _run_health_check() -> None:
    try:
        from paddleocr import PaddleOCR  # noqa: F401
    except Exception as exc:
        _emit({"ok": False, "error": f"PaddleOCR import failed: {exc}"}, 2)

    _emit({"ok": True, "message": "PaddleOCR import successful."})


def _read_request() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        _emit({"ok": False, "error": "No input payload provided."}, 2)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        _emit({"ok": False, "error": f"Invalid JSON payload: {exc}"}, 2)

    if not isinstance(payload, dict):
        _emit({"ok": False, "error": "Payload must be a JSON object."}, 2)

    return payload


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--health":
        _run_health_check()

    payload = _read_request()
    encoded = str(payload.get("imageBase64") or "").strip()
    lang = str(payload.get("lang") or "en").strip() or "en"

    if not encoded:
        _emit({"ok": False, "error": "imageBase64 is required."}, 2)

    try:
        image_bytes = base64.b64decode(encoded)
    except Exception as exc:
        _emit({"ok": False, "error": f"Failed to decode imageBase64: {exc}"}, 2)

    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        _emit({"ok": False, "error": f"PaddleOCR import failed: {exc}"}, 2)

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_file:
            temp_file.write(image_bytes)
            temp_path = temp_file.name

        ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
        raw_result = ocr.ocr(temp_path, cls=True)

        words: List[dict] = []
        for text, score in _walk_ocr_nodes(raw_result):
            words.append(
                {
                    "text": text,
                    "confidence": round(float(score) * 100.0, 2),
                }
            )

        lines = [item["text"] for item in words if item["text"]]
        if words:
            avg_conf = sum(item["confidence"] for item in words) / len(words)
        else:
            avg_conf = 0.0

        _emit(
            {
                "ok": True,
                "text": "\n".join(lines),
                "lines": lines,
                "confidence": round(avg_conf, 2),
                "words": words,
                "engine": "paddleocr",
                "lang": lang,
            }
        )
    except Exception as exc:
        _emit({"ok": False, "error": f"PaddleOCR execution failed: {exc}"}, 2)
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass


if __name__ == "__main__":
    main()
