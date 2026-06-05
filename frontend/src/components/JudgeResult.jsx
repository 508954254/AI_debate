import { useEffect, useRef } from 'react';
import parseJudgeJSON from '../utils/parseJudgeJSON';

export default function JudgeResult({ judgeTexts }) {
  const bannerRef = useRef(null);

  // 撒花效果
  useEffect(() => {
    const colors = ['#3b82f6', '#ef4444', '#fbbf24', '#22c55e', '#a855f7', '#ec4899', '#06b6d4'];
    const particles = [];

    for (let i = 0; i < 60; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.style.left = Math.random() * 100 + '%';
      el.style.top = -(Math.random() * 40) + 'px';
      el.style.animationDelay = Math.random() * 1.5 + 's';
      el.style.animationDuration = (2 + Math.random() * 3) + 's';
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.width = (4 + Math.random() * 8) + 'px';
      el.style.height = (4 + Math.random() * 8) + 'px';
      document.body.appendChild(el);
      particles.push(el);
    }

    return () => {
      particles.forEach(el => el.remove());
    };
  }, []);

  const judges = judgeTexts.map((text, idx) => ({
    idx, text,
    data: parseJudgeJSON(text),
  }));

  const calcTotal = () => {
    const validJudges = judges.filter(j => j.data);
    const totalJudges = judges.length;  // 始终是3
    if (validJudges.length === 0) return null;

    const sumPro = {};
    const sumCon = {};
    const dimensions = ['逻辑严密性', '论据充分性', '反驳能力', '表达能力', '辩论风度'];

    dimensions.forEach(dim => {
      let proSum = 0, conSum = 0;
      validJudges.forEach(j => {
        proSum += (j.data.pro_score?.[dim] || 0);
        conSum += (j.data.con_score?.[dim] || 0);
      });
      sumPro[dim] = proSum;
      sumCon[dim] = conSum;
    });

    // 根据实际总分判定每位裁判的投票
    const votes = { '正方': 0, '反方': 0, '平局': 0 };
    validJudges.forEach(j => {
      let p = 0, c = 0;
      dimensions.forEach(d => {
        p += j.data.pro_score?.[d] || 0;
        c += j.data.con_score?.[d] || 0;
      });
      if (p > c) votes['正方']++;
      else if (c > p) votes['反方']++;
      else votes['平局']++;
    });

    const invalidCount = totalJudges - validJudges.length;

    const winner = votes['正方'] > votes['反方'] ? '正方'
      : votes['反方'] > votes['正方'] ? '反方' : '平局';

    const proTotal = Object.values(sumPro).reduce((s, v) => s + v, 0);
    const conTotal = Object.values(sumCon).reduce((s, v) => s + v, 0);
    // 满分: 5维度 × 10分 × 裁判数
    const maxScore = 5 * 10 * validJudges.length;

    return { sumPro, sumCon, winner, votes, proTotal, conTotal, maxScore, validJudges, invalidCount };
  };

  const result = calcTotal();

  const renderScoreCard = (label, side, scores, total, maxScore) => (
    <div className={`score-card ${side}`}>
      <h3>{label}</h3>
      <table className="score-table">
        <tbody>
          {Object.entries(scores).map(([key, val]) => (
            <tr key={key}>
              <td className="dimension">{key}</td>
              <td className="score-bar-cell">
                <div className="score-bar">
                  <div className="score-fill" style={{ width: `${(val / (maxScore / 5)) * 100}%` }} />
                </div>
              </td>
              <td className="score-value">{val}<span className="score-max">/{(maxScore / 5).toFixed(0)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="score-total">总分: <strong>{total}/{maxScore}</strong></div>
    </div>
  );

  return (
    <div className="judge-result">
      <h2>🏆 三人合议裁判结果</h2>

      {result && (
        <>
          <div className="winner-banner" ref={bannerRef}>
            <div>
              {result.winner === '正方'
                ? '🔵 正方获胜！'
                : result.winner === '反方'
                  ? '🔴 反方获胜！'
                  : '🤝 平局！'}
            </div>
            <div className="vote-detail">
              投票结果（{result.validJudges.length}/{judges.length}位裁判有效）：
              正方 {result.votes['正方']} : 反方 {result.votes['反方']} : 平局 {result.votes['平局']}
              {result.invalidCount > 0 && <span className="invalid-note">（{result.invalidCount}位裁判评分解析失败）</span>}
            </div>
          </div>

          <div className="score-cards">
            {renderScoreCard('🔵 正方（总分）', 'pro', result.sumPro, result.proTotal, result.maxScore)}
            {renderScoreCard('🔴 反方（总分）', 'con', result.sumCon, result.conTotal, result.maxScore)}
          </div>
        </>
      )}

      {!result && (
        <div className="judge-result-fallback">
          <p>裁判评分格式解析失败，请查看上方各裁判原始输出</p>
        </div>
      )}
    </div>
  );
}
