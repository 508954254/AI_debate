"""
FastAPI WebSocket 服务 - 辩论赛后端入口
启动: python main.py  或  uvicorn main:app --host 0.0.0.0 --port 8000
"""

import json
import re
import asyncio
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from debate import DebateOrchestrator
from config import (
    API_BASE_URL,
    API_KEY,
    DEFAULT_MODEL_PRO,
    DEFAULT_MODEL_CON,
    DEFAULT_MODEL_JUDGES,
    DEFAULT_FREE_ROUNDS,
)

app = FastAPI(title="AI Debate Arena")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"service": "AI Debate Arena", "status": "running"}


@app.get("/api/config")
async def get_defaults():
    """返回服务器端预设的默认配置（不含敏感信息）"""
    return {
        "model_pro": DEFAULT_MODEL_PRO,
        "model_con": DEFAULT_MODEL_CON,
        "judge_models": DEFAULT_MODEL_JUDGES,
        "free_rounds": DEFAULT_FREE_ROUNDS,
    }


@app.get("/api/models")
async def list_models():
    """获取中转站可用模型列表"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{API_BASE_URL}/v1/models",
                headers={"Authorization": f"Bearer {API_KEY}"},
            )
            if r.status_code == 200:
                data = r.json()
                models = [m["id"] for m in data.get("data", [])]
                skip = ["embedding", "image", "ocr", "tts", "whisper", "dall-e", "moderation",
                        "thinking", "realtime", "nano", "instruct", "preview", "submodel"]
                result = []
                for m in models:
                    ml = m.lower()
                    if any(k in ml for k in skip): continue
                    if re.search(r'\d{4}-\d{2}-\d{2}', m): continue  # 日期版本
                    if m.endswith('-c'): continue  # 自定义版本
                    if re.search(r'-\d{4,}$', m): continue  # 带数字后缀
                    result.append(m)
                return {"models": sorted(result)}
            else:
                return {"models": [], "error": f"API returned {r.status_code}"}
    except Exception as e:
        return {"models": [], "error": str(e)}


@app.get("/api/random-topic")
async def random_topic():
    """用 deepseek-v4-pro 生成一个国辩风格的随机辩题"""
    try:
        prompt = """你是国际大专辩论赛（新国辩）的资深命题专家。请随机生成一个辩论题目。

经典国辩题参考（仅作风格参照，不要照抄）：
- 人性本善 / 人性本恶
- 钱是万恶之源 / 钱不是万恶之源
- 知易行难 / 知难行易
- 美是客观存在 / 美是主观感受
- 现代社会更需要通才 / 现代社会更需要专才
- 网络使人更亲近 / 网络使人更疏远
- 成大事者不拘小节 / 成大事者也拘小节
- 顺境更有利于人成长 / 逆境更有利于人成长
- 相爱容易相处难 / 相处容易相爱难
- 青春偶像崇拜利大于弊 / 青春偶像崇拜弊大于利

命题要求：
1. 必须是正反双方立场鲜明、势均力敌的经典辩题
2. 涵盖哲理思辨、社会议题、伦理价值、文化教育等领域
3. 题目精炼，12-25字，朗朗上口适合辩论
4. 风格要像上面的经典题目一样有"辩味"
5. 适当出一些当代社会新现象相关的题目

只输出一行辩题文字，不要引号、编号、解释。"""

        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"{API_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-v4-pro",
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 1.3,
                    "max_tokens": 100,
                },
            )
            if r.status_code == 200:
                data = r.json()
                topic = data["choices"][0]["message"]["content"].strip()
                # 清理可能的引号和多余字符
                topic = topic.strip('"\'').replace('\n', '')
                return {"topic": topic}
            else:
                return {"topic": "", "error": f"API error {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"topic": "", "error": str(e)}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    orchestrator: DebateOrchestrator | None = None
    debate_task: asyncio.Task | None = None

    async def run_debate(config: dict):
        nonlocal orchestrator
        try:
            judge_models = config.get("judge_models", DEFAULT_MODEL_JUDGES)
            # 确保有 3 个裁判模型
            while len(judge_models) < 3:
                judge_models.append(DEFAULT_MODEL_JUDGES[len(judge_models) % len(DEFAULT_MODEL_JUDGES)])

            orchestrator = DebateOrchestrator(
                base_url=API_BASE_URL,
                api_key=API_KEY,
                model_pro=config.get("model_pro", DEFAULT_MODEL_PRO),
                model_con=config.get("model_con", DEFAULT_MODEL_CON),
                judge_models=judge_models[:3],
                topic=config["topic"],
                free_rounds=int(config.get("free_rounds", DEFAULT_FREE_ROUNDS)),
                temperature=float(config.get("temperature", 0.8)),
            )

            async for event in orchestrator.run():
                if not ws.client_state.name == "CONNECTED":
                    break
                await ws.send_json(event)

        except Exception as e:
            if ws.client_state.name == "CONNECTED":
                await ws.send_json({"type": "error", "message": str(e)})
        finally:
            if orchestrator:
                await orchestrator.close()

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "start":
                if debate_task and not debate_task.done():
                    debate_task.cancel()
                debate_task = asyncio.create_task(run_debate(msg.get("config", {})))

            elif msg.get("type") == "stop":
                if debate_task and not debate_task.done():
                    debate_task.cancel()
                await ws.send_json({"type": "stopped"})

    except WebSocketDisconnect:
        pass
    finally:
        if debate_task and not debate_task.done():
            debate_task.cancel()
        if orchestrator:
            await orchestrator.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
