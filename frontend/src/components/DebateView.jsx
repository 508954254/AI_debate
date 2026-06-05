import { useEffect, useRef, memo } from 'react';
import parseJudgeJSON from '../utils/parseJudgeJSON';

// ── 阶段时间线 ──
const PhaseTimeline = memo(({ allPhases, currentPhase, completedPhases, round }) => (
  <div className="phase-timeline">
    {allPhases.map((p, i) => {
      const isActive = p.key === currentPhase;
      const isDone = completedPhases.includes(p.key);
      const isFuture = !isActive && !isDone;
      let extra = '';
      if (p.key === 'free_debate' && isActive && round) extra = ` · ${round.current}/${round.total}轮`;

      return (
        <div key={p.key} className={`phase-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${isFuture ? 'future' : ''}`}>
          <div className="phase-dot">{isDone ? '✓' : isActive ? p.icon : (i + 1)}</div>
          <div className="phase-label">{p.label}{extra}</div>
          {i < allPhases.length - 1 && <div className={`phase-line ${isDone ? 'done' : ''}`} />}
        </div>
      );
    })}
  </div>
));
PhaseTimeline.displayName = 'PhaseTimeline';

// ── 单条消息 ──
const TimelineMsg = memo(({ entry }) => {
  const isPro = entry.side === 'pro';
  return (
    <div className={`tl-msg ${isPro ? 'tl-pro' : 'tl-con'}`}>
      <div className="tl-msg-head">
        <span className="tl-speaker">{isPro ? '🔵 正方' : '反方 🔴'}</span>
        {entry.model && <span className="tl-model">{entry.model}</span>}
        <span className="tl-label">{entry.label}</span>
      </div>
      <div className={`tl-bubble ${isPro ? 'pro-bubble' : 'con-bubble'}`}>
        {entry.text || '...'}
      </div>
    </div>
  );
});
TimelineMsg.displayName = 'TimelineMsg';

// ── 根据分数决定胜负（不信任模型输出的 winner 字段）──
function scoreWinner(parsed) {
  const dims = ['逻辑严密性', '论据充分性', '反驳能力', '表达能力', '辩论风度'];
  let proTotal = 0, conTotal = 0;
  dims.forEach(d => {
    proTotal += parsed.pro_score?.[d] || 0;
    conTotal += parsed.con_score?.[d] || 0;
  });
  if (proTotal > conTotal) return '正方';
  if (conTotal > proTotal) return '反方';
  return '平局';
}

// ── 裁判卡片 ──
const JudgeCard = memo(({ judge, idx, text, cardRef }) => {
  const tiers = ['judge-gold', 'judge-silver', 'judge-bronze'];
  const medals = ['🥇', '🥈', '🥉'];
  const ranks = ['首席裁判', '裁判', '裁判'];
  const isDone = !judge.active && text;
  const parsed = isDone ? parseJudgeJSON(text) : null;
  const dims = ['逻辑严密性', '论据充分性', '反驳能力', '表达能力', '辩论风度'];

  return (
    <div className={`judge-card ${tiers[idx]} ${judge.active ? 'active' : ''} ${parsed ? 'parsed' : ''} ${judge.error ? 'error' : ''}`}>
      <div className="judge-card-top">
        <div className="judge-medal">{medals[idx]}</div>
        <div className="judge-info">
          <div className="judge-rank">{ranks[idx]}</div>
          <div className="judge-name">{judge.name}</div>
          <span className="judge-model-tag">{judge.model}</span>
        </div>
        {judge.active && <span className="typing-dots"><span /><span /><span /></span>}
        {isDone && !parsed && !judge.error && <span className="judge-status-badge warn">解析中</span>}
        {judge.error && <span className="judge-status-badge err">出错</span>}
      </div>

      <div className="judge-card-body" ref={cardRef}>
        {!text && !judge.error && <div className="waiting-text">等待评分...</div>}

        {parsed && (
          <div className="judge-visual">
            <div className="jv-verdict">
              🏆 判定：<strong>{scoreWinner(parsed)}</strong>
            </div>
            <div className="jv-cols">
              <div className="jv-col pro">
                <div className="jv-col-head">🔵 正方</div>
                {dims.map(d => (
                  <div key={d} className="jv-dim">
                    <span className="jv-dim-name">{d}</span>
                    <div className="jv-bar"><div className="jv-fill pro" style={{ width: `${(parsed.pro_score?.[d] || 0) * 10}%` }} /></div>
                    <span className="jv-dim-val">{parsed.pro_score?.[d] || '-'}/10</span>
                  </div>
                ))}
                {parsed.pro_score?.总评 && <div className="jv-comment">📝 {parsed.pro_score.总评}</div>}
              </div>
              <div className="jv-col con">
                <div className="jv-col-head">🔴 反方</div>
                {dims.map(d => (
                  <div key={d} className="jv-dim">
                    <span className="jv-dim-name">{d}</span>
                    <div className="jv-bar"><div className="jv-fill con" style={{ width: `${(parsed.con_score?.[d] || 0) * 10}%` }} /></div>
                    <span className="jv-dim-val">{parsed.con_score?.[d] || '-'}/10</span>
                  </div>
                ))}
                {parsed.con_score?.总评 && <div className="jv-comment">📝 {parsed.con_score.总评}</div>}
              </div>
            </div>
            {parsed.overall_comment && <div className="jv-overall">💬 {parsed.overall_comment}</div>}
          </div>
        )}

        {judge.active && text && <pre className="judge-text streaming">{text}</pre>}
        {isDone && !parsed && <pre className="judge-text">{text}</pre>}
      </div>
    </div>
  );
});
JudgeCard.displayName = 'JudgeCard';

// ── 主组件 ──
export default function DebateView({
  timeline, currentSpeaker, currentPhase, completedPhases, allPhases,
  round, judges, judgeTexts, modelPro, modelCon, topic,
}) {
  const tlRef = useRef(null);
  const judgeRefs = [useRef(null), useRef(null), useRef(null)];

  useEffect(() => {
    if (tlRef.current) tlRef.current.scrollTop = tlRef.current.scrollHeight;
  }, [timeline]);

  useEffect(() => { const r = judgeRefs[0]?.current; if (r) r.scrollTop = r.scrollHeight; }, [judgeTexts[0]]);
  useEffect(() => { const r = judgeRefs[1]?.current; if (r) r.scrollTop = r.scrollHeight; }, [judgeTexts[1]]);
  useEffect(() => { const r = judgeRefs[2]?.current; if (r) r.scrollTop = r.scrollHeight; }, [judgeTexts[2]]);

  return (
    <div className="debate-view">
      {topic && (
        <div className="topic-banner">
          <span className="topic-icon">🏛️</span>
          <span className="topic-text">{topic}</span>
        </div>
      )}

      <PhaseTimeline allPhases={allPhases} currentPhase={currentPhase}
        completedPhases={completedPhases} round={round} />

      <div className="debater-bar">
        <div className={`debater-badge pro ${currentSpeaker === 'pro' ? 'speaking' : ''}`}>
          🔵 正方 — {modelPro || '...'}
          {currentSpeaker === 'pro' && <span className="typing-dots"><span /><span /><span /></span>}
        </div>
        <div className="debater-bar-vs">⚡ VS ⚡</div>
        <div className={`debater-badge con ${currentSpeaker === 'con' ? 'speaking' : ''}`}>
          {currentSpeaker === 'con' && <span className="typing-dots"><span /><span /><span /></span>}
          反方 — {modelCon || '...'} 🔴
        </div>
      </div>

      <div className="timeline-box" ref={tlRef}>
        {timeline.map((entry) => (
          <TimelineMsg key={entry.id} entry={entry} />
        ))}
        {timeline.length === 0 && (
          <div className="waiting-text">等待辩论开始...</div>
        )}
      </div>

      {/* 三位裁判实时卡片 */}
      {judges && judges.length > 0 && (
        <div className="judges-row">
          {judges.map((judge, idx) => (
            <JudgeCard key={judge.model || `judge-${idx}`} judge={judge} idx={idx} text={judgeTexts[idx] || ''} cardRef={judgeRefs[idx]} />
          ))}
        </div>
      )}
    </div>
  );
}
