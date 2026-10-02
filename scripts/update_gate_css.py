import os

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

# 1. Update css/styles.css with sign-off stamp and gate navigation styles
signoff_css = """
/* 3-Gate Approval System Styles */
.gate-nav-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.gate-nav-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.gate-nav-card:hover {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}

.gate-nav-card.active {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.25);
}

.gate-nav-card.approved {
  border-left: 4px solid #10b981;
}

.gate-nav-card.in-progress {
  border-left: 4px solid #f59e0b;
}

.gate-nav-card.locked {
  border-left: 4px solid #64748b;
  opacity: 0.7;
}

.signoff-stamp-box {
  border: 2px solid #059669;
  color: #059669;
  border-radius: 4px;
  padding: 4px 8px;
  font-weight: 900;
  font-size: 11px;
  letter-spacing: 0.05em;
  display: inline-block;
  transform: rotate(-5deg);
  background: rgba(16, 185, 129, 0.08);
}

.signoff-pending-box {
  border: 1px dashed #94a3b8;
  color: #94a3b8;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  display: inline-block;
}

.approval-flow-card {
  background: #09101d;
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  margin-bottom: 20px;
}
"""

with open(os.path.join(base_dir, 'css', 'styles.css'), 'a', encoding='utf-8') as f:
    f.write('\n' + signoff_css)
print('Added 3-gate styles to css/styles.css')
