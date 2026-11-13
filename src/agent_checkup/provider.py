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
        self.url = "https://api.openai.com/v1/chat/completions"
        self.village = False

    def complete(self, messages: list[dict], tools: list[dict], timeout: float) -> dict:
        payload = {"model": self.model, "messages": messages, "max_completion_tokens": 400, "store": False}
        if self.village:
            payload.pop("max_completion_tokens")
            payload.pop("store")
            payload.update(max_tokens=400, reasoning_effort="none")
        if tools:
            payload["tools"] = tools
        request = Request(self.url, data=json.dumps(payload).encode(),
                          headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json",
                                   "User-Agent": "AgentCheckup/0.1 (+https://demolari.vercel.app)", "Accept": "application/json"})
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
        except HTTPError as error:
            raise ProviderError(f"Model gateway returned HTTP {error.code}") from error
        except (URLError, TimeoutError, OSError, ValueError, KeyError, IndexError, TypeError) as error:
            raise ProviderError("Model request failed; check server credentials, model access, or timeout") from error


class VillageProvider(OpenAIProvider):
    def __init__(self):
        self.key = os.environ.get("AMBASADA_API_KEY", "")
        self.model = "deepseek-v4.1-flash"
        self.url = "https://hackaton.ambasada.id/v1/llm/chat"
        self.village = True
        if not self.key:
            raise ProviderError("Village model access is not configured")


def model_configured() -> bool:
    return bool(os.environ.get("AMBASADA_API_KEY") or os.environ.get("OPENAI_API_KEY"))


def create_provider():
    return VillageProvider() if os.environ.get("AMBASADA_API_KEY") else OpenAIProvider()
