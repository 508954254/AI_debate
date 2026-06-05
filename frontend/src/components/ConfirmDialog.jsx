import './ConfirmDialog.css';

export default function ConfirmDialog({ message, onConfirm, onCancel, mode = 'confirm' }) {
  const isAlert = mode === 'alert';

  return (
    <div className="confirm-overlay" onClick={isAlert ? onConfirm : onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon">{isAlert ? '💡' : '⚠️'}</div>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          {!isAlert && (
            <button className="confirm-btn confirm-cancel" onClick={onCancel}>取消</button>
          )}
          <button className="confirm-btn confirm-ok" onClick={onConfirm}>
            {isAlert ? '知道了' : '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}
