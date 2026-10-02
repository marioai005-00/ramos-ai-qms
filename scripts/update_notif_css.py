import os

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

# 1. Append Notification & User Task Styles to css/styles.css
notif_css = """
/* User Switcher & Notification Alert System */
.user-task-banner {
  background: linear-gradient(135deg, rgba(30, 58, 138, 0.4), rgba(15, 23, 42, 0.8));
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-left: 4px solid #38bdf8;
  border-radius: var(--radius-md);
  padding: 12px 18px;
  margin-bottom: 18px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  animation: fadeInDown 0.25s ease-out;
}

.user-task-card {
  background: rgba(13, 21, 39, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
  transition: all 0.15s ease;
}

.user-task-card:hover {
  border-color: #3b82f6;
  background: rgba(30, 41, 59, 0.8);
}

.notif-bell-btn {
  position: relative;
  background: #1e293b;
  border: 1px solid var(--border);
  color: #cbd5e1;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.notif-bell-btn:hover {
  background: #334155;
  color: #fff;
  border-color: #3b82f6;
}

.notif-badge-count {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ef4444;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 800;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
}

.user-selector-select {
  background: #1e293b;
  border: 1px solid var(--border);
  color: #f8fafc;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  outline: none;
}

.user-selector-select:focus {
  border-color: #3b82f6;
}
"""

with open(os.path.join(base_dir, 'css', 'styles.css'), 'a', encoding='utf-8') as f:
    f.write('\n' + notif_css)
print('Added notification styles to css/styles.css')
