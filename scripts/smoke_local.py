"""Verify the running local server over HTTP and the Streamlit session protocol.

This checks server-side page execution, not browser layout or visual rendering.
Run after starting Streamlit: python scripts/smoke_local.py
"""
import asyncio
import json
import urllib.request

from websockets.asyncio.client import connect
from streamlit.proto.BackMsg_pb2 import BackMsg
from streamlit.proto.ForwardMsg_pb2 import ForwardMsg

ORIGIN = "http://127.0.0.1:8501"


async def check_page(page):
    path = "/" + page
    with urllib.request.urlopen(ORIGIN + path, timeout=10) as response:
        assert response.status == 200, path
    async with connect("ws://127.0.0.1:8501/_stcore/stream", origin=ORIGIN,
                       subprotocols=["streamlit"], open_timeout=10) as socket:
        message = BackMsg()
        message.rerun_script.page_name = page
        await socket.send(message.SerializeToString())
        errors = []
        elements = 0
        async with asyncio.timeout(30):
            while True:
                message = ForwardMsg.FromString(await socket.recv())
                kind = message.WhichOneof("type")
                if kind == "delta" and message.delta.HasField("new_element"):
                    elements += 1
                    element = message.delta.new_element
                    if element.WhichOneof("type") == "exception":
                        errors.append(element.exception.message)
                if kind == "script_finished":
                    if message.script_finished == ForwardMsg.FINISHED_EARLY_FOR_RERUN:
                        continue
                    assert not errors, f"{path}: {errors}"
                    assert message.script_finished == ForwardMsg.FINISHED_SUCCESSFULLY, path
                    assert elements > 5, f"{path}: page did not render content"
                    return {"path": path, "http": 200, "script": "success", "elements": elements}


async def main():
    with urllib.request.urlopen(ORIGIN + "/_stcore/health", timeout=10) as response:
        assert response.read().decode() == "ok"
    results = [await check_page(page) for page in ("", "plan", "record", "bookings", "budget")]
    print(json.dumps({"health": "ok", "pages": results}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
