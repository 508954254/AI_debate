"""
OpenAI 兼容 API 客户端
支持流式 (stream=true) SSE 解析
"""

import json
import httpx
from typing import AsyncGenerator


class APIClient:
    """封装 OpenAI 兼容 API 的调用"""

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(120.0))
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def chat_stream(
        self,
        model: str,
        messages: list[dict],
        system_prompt: str = "",
        temperature: float = 0.8,
    ) -> AsyncGenerator[str, None]:
        """
        流式调用 chat completions API
        - model: 模型名称
        - messages: 对话历史 [{"role": "...", "content": "..."}]
        - system_prompt: system 角色的提示词
        - temperature: 温度参数 (0-2)
        """
        client = await self._get_client()

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": temperature,
            "max_tokens": 4096,
        }

        # 如果有 system_prompt，插入到 messages 最前面
        if system_prompt:
            payload["messages"] = [
                {"role": "system", "content": system_prompt}
            ] + payload["messages"]

        url = f"{self.base_url}/v1/chat/completions"

        async with client.stream("POST", url, json=payload, headers={
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise RuntimeError(
                    f"API error {response.status_code}: {body.decode()[:500]}"
                )

            async for line in response.aiter_lines():
                if not line:
                    continue
                # 跳过 SSE 注释（以 : 开头但不是 data:）
                if line.startswith(":") and not line.startswith("data:"):
                    continue

                # 兼容 "data: " 和 "data:" 两种格式
                data_str = None
                if line.startswith("data: "):
                    data_str = line[6:]
                elif line.startswith("data:"):
                    data_str = line[5:]
                else:
                    continue

                data_str = data_str.strip()
                if not data_str:
                    continue
                if data_str == "[DONE]":
                    return

                try:
                    data = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                # 多种路径提取 content 文本
                choices = data.get("choices", [])
                if not choices:
                    continue

                choice = choices[0]
                content = ""

                # 路径1: delta.content（标准流式）
                delta = choice.get("delta")
                if isinstance(delta, dict):
                    content = delta.get("content", "")

                # 路径2: message.content（非流式/末帧回退）
                if not content:
                    msg = choice.get("message")
                    if isinstance(msg, dict):
                        content = msg.get("content", "")

                # 路径3: text 字段（部分代理用此格式）
                if not content:
                    content = choice.get("text", "")

                # 路径4: 顶层 content
                if not content:
                    content = data.get("content", "")

                if content:
                    yield content
