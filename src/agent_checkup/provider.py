"""Server-owned OpenAI model access with bounded requests and no URL input."""

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class ProviderError(RuntimeError):
    pass


class OpenAIProvider:
    def __init__(self):
        self.key = os.environ.get("OPENAI_API_KEY", "")
        self.model = os.environ.get("ASSESSMENT_MODEL", "gpt-4.1-mini")
        if not self.key:
            raise ProviderError("Real-model assessment is not configured on this server")

    def complete(self, messages: list[dict], tools: list[dict], timeout: float) -> dict:
        payload = {"model": self.model, "messages": messages, "max_completion_tokens": 400, "store": False}
        if tools:
            payload["tools"] = tools
        request = Request("https://api.openai.com/v1/chat/completions", data=json.dumps(payload).encode(),
                          headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=max(0.1, min(timeout, 12))) as response:
                body = json.loads(response.read(131072))
            message = body["choices"][0]["message"]
            if not isinstance(message, dict) or not isinstance(message.get("tool_calls", []), list):
                raise ValueError()
            if not isinstance(message.get("content") or "", str) or len(message.get("tool_calls", [])) > 8:
                raise ValueError()
            for call in message.get("tool_calls", []):
                if not isinstance(call, dict) or not isinstance(call.get("id"), str):
                    raise ValueError()
                function = call.get("function")
                if not isinstance(function, dict) or not all(isinstance(function.get(k), str) for k in ("name", "arguments")):
                    raise ValueError()
            return {"role": "assistant", "content": message.get("content") or "",
                    **({"tool_calls": message["tool_calls"]} if message.get("tool_calls") else {})}
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, IndexError, TypeError) as error:
            raise ProviderError("Model request failed; check server credentials, model access, or timeout") from error
