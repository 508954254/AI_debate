import { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';

export default function ConfigPanel({ onStart, onStop, running }) {
  const [models, setModels] = useState([]);
  const [modelPro, setModelPro] = useState('gpt-5.5');
  const [modelCon, setModelCon] = useState('claude-opus-4-8');
  const [judgeModels, setJudgeModels] = useState(['gpt-5.5', 'claude-opus-4-8', 'deepseek-v4-pro']);
  const [topic, setTopic] = useState('');
  const [freeRounds, setFreeRounds] = useState(3);
  const [temperature, setTemperature] = useState(0.8);
  const [loaded, setLoaded] = useState(false);
  const [matching, setMatching] = useState(false);  // 正在随机匹配
  const [alertMsg, setAlertMsg] = useState('');        // 自定义提示弹窗

  // 加载后端配置和模型列表
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/models');
        const data = await r.json();
        if (data.models && data.models.length > 0) {
          setModels(data.models);
        }
      } catch { /* 后端未启动时用缓存 */ }

      try {
        const r = await fetch('/api/config');
        const data = await r.json();
        setModelPro(data.model_pro || 'gpt-5.5');
        setModelCon(data.model_con || 'claude-opus-4-8');
        if (data.judge_models && data.judge_models.length >= 3) {
          setJudgeModels(data.judge_models.slice(0, 3));
        }
        setFreeRounds(data.free_rounds || 3);
      } catch {
        setModelPro(localStorage.getItem('debate_model_pro') || 'gpt-5.5');
        setModelCon(localStorage.getItem('debate_model_con') || 'claude-opus-4-8');
        try {
          const cached = JSON.parse(localStorage.getItem('debate_judge_models'));
          if (cached && cached.length >= 3) setJudgeModels(cached.slice(0, 3));
        } catch {}
        setFreeRounds(parseInt(localStorage.getItem('debate_free_rounds')) || 3);
        setTemperature(parseFloat(localStorage.getItem('debate_temperature')) || 0.8);
      }
      setLoaded(true);
    };
    load();
  }, []);

  const pickRandom = (arr, exclude = []) => {
    const available = arr.filter(x => !exclude.includes(x));
    if (available.length === 0) return arr[0] || '';
    return available[Math.floor(Math.random() * available.length)];
  };

  const handleRandomMatch = async () => {
    if (models.length < 5) {
      setAlertMsg('可用模型不足，至少需要5个辩论模型');
      return;
    }

    setMatching(true);

    // 随机选正方和反方（不同模型）
    const pro = pickRandom(models);
    const con = pickRandom(models, [pro]);

    setModelPro(pro);
    setModelCon(con);
    // 裁判模型保持不变，不随机更改

    // 从后端获取随机辩题
    try {
      const r = await fetch('/api/random-topic');
      const data = await r.json();
      if (data.topic) {
        setTopic(data.topic);
      }
    } catch {
      // 生成失败不影响匹配
    }

    setMatching(false);
  };

  const handleStart = () => {
    if (!topic.trim()) { setAlertMsg('请输入辩论主题'); return; }

    localStorage.setItem('debate_model_pro', modelPro);
    localStorage.setItem('debate_model_con', modelCon);
    localStorage.setItem('debate_judge_models', JSON.stringify(judgeModels));
    localStorage.setItem('debate_free_rounds', freeRounds);
    localStorage.setItem('debate_temperature', temperature);

    onStart({
      model_pro: modelPro,
      model_con: modelCon,
      judge_models: judgeModels,
      topic: topic.trim(),
      free_rounds: freeRounds,
      temperature: temperature,
    });
  };

  if (!loaded) {
    return <div className="config-panel"><p>加载配置中...</p></div>;
  }

  const ModelSelect = ({ label, value, onChange }) => (
    <div className="config-item">
      <label>{label}</label>
      {models.length > 0 ? (
        <select value={value} onChange={e => onChange(e.target.value)} disabled={running}>
          {models.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="输入模型名"
          disabled={running}
        />
      )}
    </div>
  );

  return (
    <>
      {alertMsg && (
        <ConfirmDialog
          mode="alert"
          message={alertMsg}
          onConfirm={() => setAlertMsg('')}
        />
      )}
      <div className="config-panel">
      <h2>⚙️ 辩论配置</h2>

      <div className="config-grid">
        <ModelSelect label="正方模型" value={modelPro} onChange={setModelPro} />
        <ModelSelect label="反方模型" value={modelCon} onChange={setModelCon} />

        <div className="config-judges-row">
          <ModelSelect label="🥇 裁判一（首席）" value={judgeModels[0]} onChange={v => setJudgeModels([v, judgeModels[1], judgeModels[2]])} />
          <ModelSelect label="🥈 裁判二" value={judgeModels[1]} onChange={v => setJudgeModels([judgeModels[0], v, judgeModels[2]])} />
          <ModelSelect label="🥉 裁判三" value={judgeModels[2]} onChange={v => setJudgeModels([judgeModels[0], judgeModels[1], v])} />
        </div>

        <div className="config-item full-width">
          <label>辩论主题</label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="手动输入辩题，或点击 🎲 随机生成"
            disabled={running}
            className="topic-input"
            rows={2}
          />
        </div>

        <div className="config-item">
          <label>自由辩论轮数</label>
          <div className={`stepper ${running ? 'disabled' : ''}`}>
            <button className="stepper-btn" onClick={() => setFreeRounds(Math.max(1, freeRounds - 1))} disabled={running || freeRounds <= 1}>−</button>
            <span className="stepper-value">{freeRounds}</span>
            <button className="stepper-btn" onClick={() => setFreeRounds(Math.min(10, freeRounds + 1))} disabled={running || freeRounds >= 10}>+</button>
          </div>
        </div>

        <div className="config-item">
          <label>🌡️ 辩论温度 ({temperature.toFixed(1)})</label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={e => setTemperature(parseFloat(e.target.value))}
            disabled={running}
            className="temp-slider"
          />
          <div className="temp-labels">
            <span>谨慎 0</span>
            <span>平衡 1</span>
            <span>狂野 2</span>
          </div>
        </div>
      </div>

      <div className="config-actions">
        {!running ? (
          <>
            <button className="btn-random" onClick={handleRandomMatch} disabled={matching}>
              {matching ? '⏳ 匹配中...' : '🎲 随机匹配'}
            </button>
            <button className="btn-start" onClick={handleStart}>
              🚀 开始辩论
            </button>
          </>
        ) : (
          <button className="btn-stop" onClick={onStop}>
            ⏹️ 停止辩论
          </button>
        )}
      </div>
    </div>
    </>
  );
}
