"""
后端配置文件 — 在此处填写中转站信息
"""

# 中转站 API 地址（OpenAI 兼容格式）
API_BASE_URL = ""

# 中转站 API Key
API_KEY = ""

# 默认模型配置（前端可覆盖）
DEFAULT_MODEL_PRO = "gpt-5.5"              # 正方默认模型
DEFAULT_MODEL_CON = "claude-opus-4-8"     # 反方默认模型
DEFAULT_MODEL_JUDGES = [                # 默认三位裁判模型（最强大模型）
    "gpt-5.5",
    "claude-opus-4-8",
    "deepseek-v4-pro",
]
DEFAULT_FREE_ROUNDS = 3                  # 默认自由辩论轮数
