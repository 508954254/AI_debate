/**
 * 从裁判文本中解析 JSON 评分结果
 * 统一处理：纯 JSON、markdown 代码块、包裹在文本中的 JSON
 */
export default function parseJudgeJSON(text) {
  if (!text) return null;

  // 1. 直接解析纯 JSON
  try { return JSON.parse(text); } catch {}

  // 2. 从 markdown 代码块中提取
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1].trim()); } catch {}
  }

  // 3. 从文本中提取 JSON 对象（贪婪匹配最外层花括号）
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {
      // LLM 有时会在最后一个元素后加逗号，修复后再试
      try {
        return JSON.parse(jsonMatch[0].replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']'));
      } catch {}
    }
  }

  return null;
}
