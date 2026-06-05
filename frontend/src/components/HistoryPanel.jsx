import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

const WINNER_COLORS = {
  '正方': { bg: 'rgba(59,130,246,0.12)', border: '#3b82f6', icon: '🔵', label: '正方获胜' },
  '反方': { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', icon: '🔴', label: '反方获胜' },
  '平局': { bg: 'rgba(251,191,36,0.12)', border: '#fbbf24', icon: '🤝', label: '平局' },
};

export default function HistoryPanel({ history, onDelete, onClear }) {
  const [expandedId, setExpandedId] = useState(null);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  if (!history || history.length === 0) return null;

  const toggle = (id) => setExpandedId(prev => prev === id ? null : id);

  const askDelete = (e, id) => {
    e.stopPropagation();
    setConfirmMsg('确定删除这条对战记录？');
    setConfirmAction(() => () => { onDelete?.(id); setConfirmMsg(''); });
  };

  const askClear = () => {
    setConfirmMsg(`确定清空全部 ${history.length} 条对战记录？`);
    setConfirmAction(() => () => { onClear?.(); setConfirmMsg(''); });
  };

  return (
    <div className="history-panel">
      {confirmMsg && (
        <ConfirmDialog
          message={confirmMsg}
          onConfirm={confirmAction}
          onCancel={() => setConfirmMsg('')}
        />
      )}

      <div className="history-panel-header">
        <span className="history-panel-icon">📜</span>
        <h3>对战记录</h3>
        <span className="history-count">{history.length} 场</span>
        {history.length > 0 && (
          <button className="history-clear-btn" onClick={askClear} title="清空全部">🗑️ 清空</button>
        )}
      </div>

      <div className="history-cards">
        {history.map((h, i) => {
          const wc = WINNER_COLORS[h.winner] || WINNER_COLORS['平局'];
          const isExpanded = expandedId === h.id;
          const isLatest = i === 0;

          return (
            <div
              key={h.id || i}
              className={`history-card ${isExpanded ? 'expanded' : ''} ${isLatest ? 'latest' : ''}`}
              style={{ borderLeftColor: wc.border }}
            >
              <div className="history-card-main" onClick={() => toggle(h.id)}>
                <div className="history-card-left">
                  <div className="history-card-topic">{h.topic || '(无主题)'}</div>
                  <div className="history-card-meta">
                    <span className="history-models-badge">{h.modelPro} 🆚 {h.modelCon}</span>
                    <span className="history-time-badge">{h.time}</span>
                  </div>
                </div>
                <div className="history-card-right">
                  {h.winner && (
                    <div className="history-winner-tag" style={{ background: wc.bg, color: wc.border }}>
                      {wc.icon} {wc.label}
                    </div>
                  )}
                  <div className="history-scores-mini">
                    <span className="pro-score-mini">{h.proTotal || '?'}</span>
                    <span className="vs-mini">:</span>
                    <span className="con-score-mini">{h.conTotal || '?'}</span>
                  </div>
                  <span className="history-expand-icon">{isExpanded ? '▾' : '▸'}</span>
                  <button className="history-delete-btn" onClick={(e) => askDelete(e, h.id)} title="删除此记录">✕</button>
                </div>
              </div>

              {isExpanded && (
                <div className="history-card-detail">
                  {h.votes && (
                    <div className="history-votes">
                      <span>🗳️ 投票：</span>
                      <span className="vote-pro">正方 {h.votes['正方'] || 0}</span>
                      <span className="vote-divider">|</span>
                      <span className="vote-con">反方 {h.votes['反方'] || 0}</span>
                      <span className="vote-divider">|</span>
                      <span className="vote-draw">平局 {h.votes['平局'] || 0}</span>
                    </div>
                  )}

                  {h.judgeResults && h.judgeResults.length > 0 && (
                    <div className="history-judges-detail">
                      {h.judgeResults.map((jr, idx) => (
                        <details key={idx} className="history-judge-item">
                          <summary>⚖️ 裁判 {idx + 1} — {jr.judge_name || `裁判${idx + 1}`} → {jr.winner || '?'}</summary>
                          <div className="history-judge-scores">
                            <div className="history-judge-col">
                              <span className="hj-label">🔵 正方</span>
                              {Object.entries(jr.pro_score || {}).filter(([k]) => k !== '总评').map(([k, v]) => (
                                <div key={k} className="hj-dim"><span>{k}</span><span>{v}/10</span></div>
                              ))}
                            </div>
                            <div className="history-judge-col">
                              <span className="hj-label">🔴 反方</span>
                              {Object.entries(jr.con_score || {}).filter(([k]) => k !== '总评').map(([k, v]) => (
                                <div key={k} className="hj-dim"><span>{k}</span><span>{v}/10</span></div>
                              ))}
                            </div>
                          </div>
                          {jr.overall_comment && <p className="hj-comment">💬 {jr.overall_comment}</p>}
                        </details>
                      ))}
                    </div>
                  )}

                  {h.judges && h.judges.length > 0 && (
                    <div className="history-judges-tags">
                      {h.judges.map((j, idx) => (
                        <span key={idx} className="history-judge-tag">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} {j}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
