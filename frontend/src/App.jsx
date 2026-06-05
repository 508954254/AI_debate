import { useState, useRef, useCallback } from 'react';
import ConfigPanel from './components/ConfigPanel';
import DebateView from './components/DebateView';
import JudgeResult from './components/JudgeResult';
import HistoryPanel from './components/HistoryPanel';
import parseJudgeJSON from './utils/parseJudgeJSON';
import './App.css';

const WS_URL = `ws://${window.location.host}/ws`;

const ALL_PHASES = [
  { key: 'opening', icon: '🎤', label: '立论陈词' },
  { key: 'free_debate', icon: '⚔️', label: '自由辩论' },
  { key: 'closing', icon: '📢', label: '总结陈词' },
  { key: 'judge', icon: '⚖️', label: '裁判评分' },
];

export default function App() {
  const [status, setStatus] = useState('idle');
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('');
  const [round, setRound] = useState(null);
  const [judges, setJudges] = useState([]);
  const [error, setError] = useState('');
  const [completedPhases, setCompletedPhases] = useState([]);
  const [modelPro, setModelPro] = useState('');
  const [modelCon, setModelCon] = useState('');
  const [debateTopic, setDebateTopic] = useState('');
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('debate_history') || '[]'); } catch { return []; }
  });

  // 统一时间线: [{ side: 'pro'|'con', text, label, model }]
  const [timeline, setTimeline] = useState([]);
  const [judgeTexts, setJudgeTexts] = useState(['', '', '']);
  const wsRef = useRef(null);
  const modelProRef = useRef('');
  const modelConRef = useRef('');
  const currentPhaseRef = useRef('');
  const debateTopicRef = useRef('');
  const judgesRef = useRef([]);
  const judgeTextsRef = useRef(['', '', '']);

  const idCounterRef = useRef(0);
  const bufferRef = useRef('');
  const flushTimerRef = useRef(null);
  const currentLabelRef = useRef('');

  const flushTimeline = useCallback(() => {
    flushTimerRef.current = null;
    const label = currentLabelRef.current;
    if (bufferRef.current) {
      setTimeline(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, text: bufferRef.current, label: label || last.label };
        return next;
      });
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!flushTimerRef.current) {
      flushTimerRef.current = requestAnimationFrame(flushTimeline);
    }
  }, [flushTimeline]);

  const reset = useCallback(() => {
    setTimeline([]); setJudgeTexts(['', '', '']);
    setCurrentSpeaker(null); setCurrentPhase(''); setRound(null);
    setJudges([]); setError(''); setCompletedPhases([]);
    bufferRef.current = ''; currentLabelRef.current = '';
    currentPhaseRef.current = ''; judgesRef.current = [];
    judgeTextsRef.current = ['', '', ''];
  }, []);

  const connectAndStart = useCallback((config) => {
    reset();
    setStatus('debating');
    setModelPro(config.model_pro || '');
    setModelCon(config.model_con || '');
    modelProRef.current = config.model_pro || '';
    modelConRef.current = config.model_con || '';
    debateTopicRef.current = config.topic || '';
    setDebateTopic(config.topic || '');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'start', config }));

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'phase':
          if (currentPhaseRef.current) setCompletedPhases(prev => prev.includes(currentPhaseRef.current) ? prev : [...prev, currentPhaseRef.current]);
          currentPhaseRef.current = data.phase;
          setCurrentPhase(data.phase);
          break;

        case 'round':
          setRound({ current: data.round, total: data.total });
          break;

        case 'speaker': {
          setCurrentSpeaker(data.debater);
          currentLabelRef.current = data.label || '';
          bufferRef.current = '';
          const model = data.debater === 'pro' ? modelProRef.current : modelConRef.current;
          const id = ++idCounterRef.current;
          setTimeline(prev => [...prev, { id, side: data.debater, text: '', label: data.label || '', model }]);
          break;
        }

        case 'token':
          bufferRef.current += data.text;
          scheduleFlush();
          break;

        case 'retry':
          // 重试时清空缓冲区，避免新旧内容混杂
          console.log(`[retry] ${data.debater} message=${data.message}`);
          bufferRef.current = '';
          if (flushTimerRef.current) { cancelAnimationFrame(flushTimerRef.current); flushTimerRef.current = null; }
          setTimeline(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last) {
              next[next.length - 1] = { ...last, text: data.message || '⏳ 正在重试...' };
            }
            return next;
          });
          break;

        case 'speaker_done': {
          console.log(`[speaker_done] ${data.debater} char_count=${data.char_count} buffer=${bufferRef.current.length}`);
          // 取消待处理的 rAF，直接同步捕获最终文本
          if (flushTimerRef.current) { cancelAnimationFrame(flushTimerRef.current); flushTimerRef.current = null; }
          const finalText = bufferRef.current;
          const finalLabel = currentLabelRef.current;
          setTimeline(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && finalText) {
              next[next.length - 1] = { ...last, text: finalText, label: finalLabel || last.label };
            } else if (last && !last.text) {
              next[next.length - 1] = { ...last, text: `（API 未返回内容，后端收到 ${data.char_count || 0} 字符）` };
            }
            return next;
          });
          setCurrentSpeaker(null);
          break;
        }

        case 'speaker_failed': {
          console.log(`[speaker_failed] ${data.debater} message=${data.message}`);
          if (flushTimerRef.current) { cancelAnimationFrame(flushTimerRef.current); flushTimerRef.current = null; }
          const finalText = bufferRef.current;
          setTimeline(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last) {
              next[next.length - 1] = { ...last, text: (finalText || '') + '\n\n' + (data.message || '发言失败') };
            }
            return next;
          });
          setCurrentSpeaker(null);
          break;
        }

        case 'judge_start':
          setJudges(prev => { const n = [...prev]; n[data.judge_idx] = { name: data.judge_name, model: data.judge_model, active: true }; judgesRef.current = n; return n; });
          setJudgeTexts(prev => { const n = [...prev]; n[data.judge_idx] = ''; return n; });
          judgeTextsRef.current[data.judge_idx] = '';
          break;

        case 'judge_token':
          setJudgeTexts(prev => { const n = [...prev]; n[data.judge_idx] += data.text; return n; });
          judgeTextsRef.current[data.judge_idx] += data.text;
          break;

        case 'judge_retry':
          // 重试时清空该裁判的缓冲区，避免新旧内容混杂
          setJudgeTexts(prev => { const n = [...prev]; n[data.judge_idx] = data.message || '⏳ 正在重试...'; return n; });
          judgeTextsRef.current[data.judge_idx] = data.message || '⏳ 正在重试...';
          break;

        case 'judge_done':
          setJudges(prev => { const n = [...prev]; if (n[data.judge_idx]) n[data.judge_idx] = { ...n[data.judge_idx], active: false, error: false }; judgesRef.current = n; return n; });
          break;

        case 'judge_error':
          setJudges(prev => { const n = [...prev]; if (n[data.judge_idx]) n[data.judge_idx] = { ...n[data.judge_idx], active: false, error: true }; judgesRef.current = n; return n; });
          setJudgeTexts(prev => { const n = [...prev]; n[data.judge_idx] = `⚠️ 评分出错：${data.message}`; judgeTextsRef.current[data.judge_idx] = n[data.judge_idx]; return n; });
          break;

        case 'done':
          setCompletedPhases(prev => prev.includes(currentPhaseRef.current) ? prev : [...prev, currentPhaseRef.current]);
          setStatus('finished');
          setCurrentSpeaker(null); setCurrentPhase(''); setRound(null);
          setHistory(prev => {
            // 解析三个裁判的评分，提取结果摘要
            const judgeResults = judgeTextsRef.current.map(text => parseJudgeJSON(text));
            const validResults = judgeResults.filter(Boolean);
            // 根据实际分数统计票数，不信任模型输出的 winner 字段
            const dims = ['逻辑严密性','论据充分性','反驳能力','表达能力','辩论风度'];
            const votes = { '正方': 0, '反方': 0, '平局': 0 };
            validResults.forEach(r => {
              let p = 0, c = 0;
              dims.forEach(d => { p += r.pro_score?.[d] || 0; c += r.con_score?.[d] || 0; });
              if (p > c) votes['正方']++;
              else if (c > p) votes['反方']++;
              else votes['平局']++;
            });
            const winner = votes['正方'] > votes['反方'] ? '正方'
              : votes['反方'] > votes['正方'] ? '反方' : '平局';
            // 总分（三位裁判分数累加）
            const sumPro = {}, sumCon = {};
            dims.forEach(d => {
              sumPro[d] = validResults.reduce((s,r) => s + (r.pro_score?.[d]||0), 0);
              sumCon[d] = validResults.reduce((s,r) => s + (r.con_score?.[d]||0), 0);
            });
            const record = {
              id: Date.now(), topic: debateTopicRef.current,
              modelPro: modelProRef.current, modelCon: modelConRef.current,
              judges: judgesRef.current.map(j => j?.model || ''),
              time: new Date().toLocaleString(),
              winner, votes,
              proTotal: Object.values(sumPro).reduce((s,v) => s+v, 0),
              conTotal: Object.values(sumCon).reduce((s,v) => s+v, 0),
              validJudgeCount: validResults.length,
              judgeResults: validResults,
            };
            console.log('📜 保存对战记录:', record);
            const updated = [record, ...prev].slice(0, 20);
            localStorage.setItem('debate_history', JSON.stringify(updated));
            return updated;
          });
          break;

        case 'error':
          setError(data.message);
          setStatus('idle');
          // 如果最后一条是空的，替换为错误提示
          setTimeline(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && !last.text) {
              next[next.length - 1] = { ...last, text: `⚠️ 发言出错：${data.message}` };
            }
            return next;
          });
          break;

        case 'stopped':
          setStatus('idle'); setCurrentSpeaker(null);
          break;
      }
    };

    ws.onerror = () => { setError('WebSocket 连接失败，请确认后端已启动'); setStatus('idle'); };
  }, [reset, flushTimeline, scheduleFlush]);

  const handleStop = useCallback(() => {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'stop' }));
        wsRef.current.close();
      }
    } catch { /* WS 可能在检查后、send 前断开 */ }
    setStatus('idle'); setCurrentSpeaker(null);
    // 清理辩论状态
    setCurrentPhase(''); setRound(null); setJudges([]); setError('');
  }, []);

  const handleReturn = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    setStatus('idle');
    setCurrentSpeaker(null);
  }, []);

  // ── 首页视图 ──
  if (status === 'idle') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>🤖 AI 辩论赛</h1>
          <p className="subtitle">两大 AI 模型，正面交锋 · 三位裁判公平裁决</p>
        </header>

        <ConfigPanel onStart={connectAndStart} onStop={handleStop} running={false} />

        {error && <div className="error-banner">❌ {error}<button onClick={() => setError('')}>✕</button></div>}

        {!error && (
          <div className="welcome">
            <p>👆 配置辩论参数，点击「开始辩论」</p>
          </div>
        )}

        <HistoryPanel
          history={history}
          onDelete={(id) => {
            setHistory(prev => {
              const updated = prev.filter(h => h.id !== id);
              localStorage.setItem('debate_history', JSON.stringify(updated));
              return updated;
            });
          }}
          onClear={() => {
            setHistory([]);
            localStorage.removeItem('debate_history');
          }}
        />
      </div>
    );
  }

  // ── 辩论页视图 ──
  return (
    <div className="app debate-page">
      <div className="debate-topbar">
        <div className="debate-topbar-left">
          <span className="debate-topbar-icon">⚡</span>
          <span className="debate-topbar-title">{debateTopic || 'AI 辩论赛'}</span>
        </div>
        <div className="debate-topbar-models">
          <span className="dtm-pro">🔵 {modelPro}</span>
          <span className="dtm-vs">VS</span>
          <span className="dtm-con">🔴 {modelCon}</span>
        </div>
        <div className="debate-topbar-actions">
          {status === 'debating' && (
            <button className="btn-stop-debate" onClick={handleStop}>
              ⏹️ 停止辩论
            </button>
          )}
          {status === 'finished' && (
            <button className="btn-return-home" onClick={handleReturn}>
              🏠 返回首页
            </button>
          )}
        </div>
      </div>

      <div className="debate-content">
        <DebateView
          timeline={timeline} currentSpeaker={currentSpeaker}
          currentPhase={currentPhase} completedPhases={completedPhases}
          allPhases={ALL_PHASES} round={round}
          judges={judges} judgeTexts={judgeTexts}
          modelPro={modelPro} modelCon={modelCon}
          topic={debateTopic}
        />

        {status === 'finished' && judgeTexts.some(t => t) && <JudgeResult judgeTexts={judgeTexts} />}

        {status === 'finished' && (
          <div className="debate-return-bottom">
            <button className="btn-return-home large" onClick={handleReturn}>
              🏠 返回首页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
