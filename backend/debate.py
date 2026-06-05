"""
辩论编排器 - 管理辩论流程的各个阶段（三裁判并行合议制）
"""

import asyncio
from typing import AsyncGenerator
from api_client import APIClient

# ─── System Prompts ───

PROMPT_OPENING = """你是一位资深辩手，现在正在进行一场正式辩论赛的【立论陈词】阶段。
请针对辩题 "{topic}"，以{side}的身份发表开篇立论。
要求：逻辑清晰、论点明确、有理有据，字数在 200-300 字之间。
注意：这是第一轮发言，不要反驳对方（对方还未发言），只需要阐述自己的核心观点。"""

PROMPT_FREE_DEBATE = """你是一位资深辩手，现在正在进行一场正式辩论赛的【自由辩论】阶段。
辩题是 "{topic}"，你是{side}。

你的任务是：
1. 针对对方刚才的发言进行有力反驳
2. 进一步强化自己的论点
3. 可以提出新的论据

要求：言辞犀利但不失风度，抓住对方逻辑漏洞进行攻击，字数在 150-250 字之间。

以下是辩论历史：
{history}"""

PROMPT_CLOSING = """你是一位资深辩手，现在正在进行一场正式辩论赛的【总结陈词】阶段。
辩题是 "{topic}"，你是{side}。

裁判将从以下五个维度进行打分，你的总结应重点覆盖：
- 逻辑严密性：梳理我方论证链条，指出对方逻辑漏洞
- 论据充分性：回顾我方最有力的论据，削弱对方论据的可信度
- 反驳能力：总结你成功反击对方的关键点
- 表达能力：用精炼有力的语言升华主题
- 辩论风度：保持理性尊重，展现辩手风范

你的任务：
1. 回顾自己方的核心论点
2. 指出对方论证中的关键漏洞
3. 升华主题，给裁判留下深刻印象

要求：简洁有力，字数在 200-300 字之间。

以下是完整的辩论历史：
{history}"""

PROMPT_JUDGE = """你是一位公正严明的辩论裁判，你的代号是 {judge_name}。现在需要你对一场辩论赛进行评分。

辩题：{topic}
正方（{model_pro}）vs 反方（{model_con}）

以下是完整的辩论记录：
{history}

请从以下维度对双方进行评分（每项 1-10 分）：
1. 逻辑严密性 - 论证是否严谨、是否有逻辑漏洞
2. 论据充分性 - 是否有足够的事实和数据支撑
3. 反驳能力 - 是否有效回应了对方的攻击
4. 表达能力 - 语言是否清晰、有力、有感染力
5. 辩论风度 - 是否保持理性和尊重

评分完成后，你必须只输出一行合法的 JSON，不要加任何前缀、后缀、解释或 markdown 代码块标记（如 ```json ```）。如果输出不是纯 JSON 格式，评分将被视为无效。

严格按照以下 JSON 格式输出（把 <分数> <简要评价> <正方/反方/平局> <综合点评> 替换为实际内容）：
{{
  "judge_name": "{judge_name}",
  "pro_score": {{
    "逻辑严密性": <分数>,
    "论据充分性": <分数>,
    "反驳能力": <分数>,
    "表达能力": <分数>,
    "辩论风度": <分数>,
    "总评": "<简要评价>"
  }},
  "con_score": {{
    "逻辑严密性": <分数>,
    "论据充分性": <分数>,
    "反驳能力": <分数>,
    "表达能力": <分数>,
    "辩论风度": <分数>,
    "总评": "<简要评价>"
  }},
  "winner": "<正方/反方/平局>",
  "overall_comment": "<综合点评>"
}}"""


def _safe_format(template: str, **kwargs) -> str:
    """安全的字符串格式化 —— 自动转义 values 中的花括号，避免 KeyError"""
    escaped = {k: v.replace("{", "{{").replace("}", "}}") for k, v in kwargs.items()}
    return template.format(**escaped)


class DebateOrchestrator:
    """辩论编排器 - 管理完整的辩论生命周期"""

    # ── 配置常量 ──
    MIN_SPEAKER_CHARS = 15   # 辩手最少有效字数
    MIN_JUDGE_CHARS = 30     # 裁判最少有效字数
    MAX_RETRIES = 2          # 最大重试次数（含首次）
    RETRY_DELAY = 2          # 重试间隔（秒）

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model_pro: str,
        model_con: str,
        judge_models: list[str],
        topic: str,
        free_rounds: int = 3,
        temperature: float = 0.8,
    ):
        self.client = APIClient(base_url, api_key)
        self.model_pro = model_pro
        self.model_con = model_con
        self.judge_models = judge_models
        self.topic = topic
        self.free_rounds = free_rounds
        self.temperature = temperature
        self.history: list[dict] = []
        # 用模型名作为辩手/裁判名称
        self.pro_name = model_pro
        self.con_name = model_con

    def _add_to_history(self, role: str, content: str, speaker: str = ""):
        entry = {"role": role, "content": content}
        if speaker:
            entry["speaker"] = speaker
        self.history.append(entry)

    def _format_history(self) -> str:
        lines = []
        for entry in self.history:
            speaker = entry.get("speaker", entry.get("role", "unknown"))
            lines.append(f"【{speaker}】: {entry['content']}")
        return "\n\n".join(lines)

    async def _stream_debater(self, model: str, system_prompt: str, speaker_label: str) -> AsyncGenerator[str, None]:
        messages = [{"role": "user", "content": "请发言"}]
        full_text = ""
        print(f"[DEBUG] 开始调用 {model} — {speaker_label}", flush=True)
        async for token in self.client.chat_stream(
            model=model, messages=messages, system_prompt=system_prompt, temperature=self.temperature,
        ):
            full_text += token
            yield token
        # 检查回复是否有实质内容，空回复/极短回复触发重试
        stripped = full_text.strip()
        print(f"[DEBUG] {model} 返回 {len(full_text)} 字符 (有效 {len(stripped)}): {stripped[:100]}...", flush=True)
        if len(stripped) < self.MIN_SPEAKER_CHARS:
            raise RuntimeError(f"模型返回内容过短（{len(stripped)}字符），自动触发重试")
        self._add_to_history("assistant", full_text, speaker_label)

    async def _run_single_judge(self, idx: int, model: str, queue: asyncio.Queue):
        """单个裁判运行（含自动重试），结果写入 queue"""
        judge_name = model
        system_prompt = _safe_format(PROMPT_JUDGE,
            judge_name=judge_name, topic=self.topic,
            model_pro=self.model_pro, model_con=self.model_con,
            history=self._format_history(),
        )
        messages = [{"role": "user", "content": f"作为裁判 {judge_name}，请给出你的评分"}]
        last_error = None
        for attempt in range(self.MAX_RETRIES):
            full_text = ""
            try:
                async for token in self.client.chat_stream(
                    model=model, messages=messages, system_prompt=system_prompt, temperature=0.5,
                ):
                    full_text += token
                    await queue.put({"type": "judge_token", "judge_idx": idx, "text": token})
                # 检查裁判回复是否有实质内容
                stripped = full_text.strip()
                if len(stripped) < self.MIN_JUDGE_CHARS:
                    raise RuntimeError(f"裁判回复过短（{len(stripped)}字符），自动触发重试")
                await queue.put({"type": "judge_done", "judge_idx": idx, "full_text": full_text})
                last_error = None
                return
            except Exception as e:
                last_error = str(e)
                if attempt < self.MAX_RETRIES - 1:
                    # 通知前端清空该裁判的缓冲区，避免重复内容
                    await queue.put({"type": "judge_retry", "judge_idx": idx,
                                     "message": f"⏳ 首次失败，重试中...（{last_error[:60]}）"})
                    await asyncio.sleep(self.RETRY_DELAY)
        await queue.put({"type": "judge_error", "judge_idx": idx, "message": last_error})

    async def _safe_speaker(self, model: str, system_prompt: str, speaker_label: str,
                           debater: str, label: str) -> AsyncGenerator[dict, None]:
        """安全调用辩手——出错时自动重试1次，不中断辩论"""
        yield {"type": "speaker", "debater": debater, "label": label, "model": model}
        last_error = None
        total_chars = 0
        for attempt in range(self.MAX_RETRIES):
            total_chars = 0
            try:
                async for token in self._stream_debater(model, system_prompt, speaker_label):
                    yield {"type": "token", "debater": debater, "text": token}
                    total_chars += len(token)
                last_error = None
                break  # 成功，退出重试循环
            except Exception as e:
                last_error = str(e)
                if attempt < self.MAX_RETRIES - 1:
                    # 通知前端清空当前发言的缓冲区，避免重复内容
                    yield {"type": "retry", "debater": debater,
                           "message": f"⏳ 首次调用失败，正在重试...（{last_error[:80]}）"}
                    await asyncio.sleep(self.RETRY_DELAY)
        if last_error:
            yield {"type": "speaker_failed", "debater": debater,
                   "message": f"⚠️ API 调用失败（{model}）：{last_error}",
                   "char_count": total_chars}
        else:
            yield {"type": "speaker_done", "debater": debater, "char_count": total_chars}

    async def run(self) -> AsyncGenerator[dict, None]:
        """运行完整辩论流程 —— 任一方发言失败则终止辩论"""

        # ── Phase 1: 立论陈词 ──
        yield {"type": "phase", "phase": "opening", "label": "立论陈词"}

        failed = False
        async for ev in self._safe_speaker(self.model_pro,
                _safe_format(PROMPT_OPENING, topic=self.topic, side=f"正方（{self.model_pro}）"),
                f"正方（{self.model_pro}）", "pro", "正方立论"):
            yield ev
            if ev.get("type") == "speaker_failed":
                failed = True
        if failed:
            yield {"type": "error", "message": "正方立论失败，辩论终止"}
            return

        failed = False
        async for ev in self._safe_speaker(self.model_con,
                _safe_format(PROMPT_OPENING, topic=self.topic, side=f"反方（{self.model_con}）"),
                f"反方（{self.model_con}）", "con", "反方立论"):
            yield ev
            if ev.get("type") == "speaker_failed":
                failed = True
        if failed:
            yield {"type": "error", "message": "反方立论失败，辩论终止"}
            return

        # ── Phase 2: 自由辩论 ──
        yield {"type": "phase", "phase": "free_debate", "label": "自由辩论"}

        for rnd in range(1, self.free_rounds + 1):
            yield {"type": "round", "round": rnd, "total": self.free_rounds}

            failed = False
            async for ev in self._safe_speaker(self.model_pro,
                    _safe_format(PROMPT_FREE_DEBATE,
                        topic=self.topic, side=f"正方（{self.model_pro}）", history=self._format_history()),
                    f"正方 第{rnd}轮（{self.model_pro}）", "pro", f"正方 第{rnd}轮"):
                yield ev
                if ev.get("type") == "speaker_failed":
                    failed = True
            if failed:
                yield {"type": "error", "message": f"正方第{rnd}轮自由辩论失败，辩论终止"}
                return

            failed = False
            async for ev in self._safe_speaker(self.model_con,
                    _safe_format(PROMPT_FREE_DEBATE,
                        topic=self.topic, side=f"反方（{self.model_con}）", history=self._format_history()),
                    f"反方 第{rnd}轮（{self.model_con}）", "con", f"反方 第{rnd}轮"):
                yield ev
                if ev.get("type") == "speaker_failed":
                    failed = True
            if failed:
                yield {"type": "error", "message": f"反方第{rnd}轮自由辩论失败，辩论终止"}
                return

        # ── Phase 3: 总结陈词 ──
        yield {"type": "phase", "phase": "closing", "label": "总结陈词"}

        failed = False
        async for ev in self._safe_speaker(self.model_pro,
                _safe_format(PROMPT_CLOSING, topic=self.topic, side=f"正方（{self.model_pro}）", history=self._format_history()),
                f"正方总结（{self.model_pro}）", "pro", "正方总结"):
            yield ev
            if ev.get("type") == "speaker_failed":
                failed = True
        if failed:
            yield {"type": "error", "message": "正方总结失败，辩论终止"}
            return

        failed = False
        async for ev in self._safe_speaker(self.model_con,
                _safe_format(PROMPT_CLOSING, topic=self.topic, side=f"反方（{self.model_con}）", history=self._format_history()),
                f"反方总结（{self.model_con}）", "con", "反方总结"):
            yield ev
            if ev.get("type") == "speaker_failed":
                failed = True
        if failed:
            yield {"type": "error", "message": "反方总结失败，辩论终止"}
            return

        # ── Phase 4: 三位裁判并行评分 ──
        yield {"type": "phase", "phase": "judge", "label": "裁判评分"}

        for idx, model in enumerate(self.judge_models):
            yield {"type": "judge_start", "judge_idx": idx, "judge_name": model, "judge_model": model}

        # 并行运行三位裁判，通过 queue 汇总输出
        queue: asyncio.Queue = asyncio.Queue()
        tasks = [
            asyncio.create_task(self._run_single_judge(idx, model, queue))
            for idx, model in enumerate(self.judge_models)
        ]

        done_count = 0
        while done_count < 3:
            event = await queue.get()
            if event["type"] in ("judge_done", "judge_error"):
                done_count += 1
            yield event

        await asyncio.gather(*tasks, return_exceptions=True)

        yield {"type": "done"}

    async def close(self):
        await self.client.close()
