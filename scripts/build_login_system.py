import os
import re

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

# 1. Append Login Screen Styles to css/styles.css
login_css = """
/* ========================================================================= */
/* ENTERPRISE LOGIN SCREEN STYLES                                            */
/* ========================================================================= */
#loginScreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: radial-gradient(circle at 50% 30%, #0f1f42 0%, #060b17 100%);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 460px;
  background: rgba(13, 21, 39, 0.85);
  border: 1px solid rgba(59, 130, 246, 0.4);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 25px rgba(59, 130, 246, 0.2);
  border-radius: var(--radius-lg);
  padding: 36px 32px;
  backdrop-filter: blur(16px);
  animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.login-brand-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
  box-shadow: 0 0 20px rgba(37, 99, 235, 0.5);
}

.quick-persona-chip {
  background: #1e293b;
  border: 1px solid var(--border);
  color: #cbd5e1;
  font-size: 0.73rem;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.quick-persona-chip:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
  color: #93c5fd;
  transform: translateY(-1px);
}
"""

with open(os.path.join(base_dir, 'css', 'styles.css'), 'a', encoding='utf-8') as f:
    f.write('\n' + login_css)
print('Added login styles to css/styles.css')

# 2. Update js/data.js to include all 62 user accounts & authentication
with open(os.path.join(base_dir, 'js', 'data.js'), 'r', encoding='utf-8') as f:
    data_js_content = f.read()

auth_helper_code = """
    // =========================================================================
    // 62-PERSON AUTHENTICATION & LOGIN ACCOUNT RESOLVER
    // =========================================================================
    function getAllUserAccounts() {
      const accounts = [];
      function traverse(node, currentDept = '') {
        const deptName = node.name || currentDept;
        if (node.members && Array.isArray(node.members)) {
          node.members.forEach(m => {
            if (m.email && m.email.includes('@')) {
              const username = m.email.split('@')[0].toLowerCase();
              accounts.push({
                username: username,
                password: '1', // Default password for all 62 employees
                name: m.name,
                position: m.position || 'Pro',
                dept: m.dept || deptName,
                email: m.email,
                isMe: m.isMe || false,
                roleDesc: determineUserDefaultRoleDesc(m.name, m.position, m.dept || deptName)
              });
            }
          });
        }
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(c => traverse(c, deptName));
        }
      }

      RAMOS_TREE.forEach(root => traverse(root));
      return accounts;
    }

    function determineUserDefaultRoleDesc(name, position, dept) {
      if (name.includes('김성중')) return '8D 품질 실무 간사 / Facilitator';
      if (name.includes('황승안')) return '8D Champion (품질총괄)';
      if (name.includes('김현수')) return '8D Leader (Flash 개발실장)';
      if (name.includes('신덕용')) return '8D Leader (DRAM 개발2팀장)';
      if (name.includes('박재환')) return '불량 분석 리더 (FA / Technical Lead)';
      if (name.includes('이은산')) return '물류/자재 격리 책임자 (제조기획센터장)';
      if (name.includes('공아름')) return '물류 격리 그룹장 (계획운영)';
      if (name.includes('조철민')) return '원자재 격리 그룹장 (자원운영)';
      if (name.includes('박정훈')) return '연구소장 / R&D 부문장';
      if (name.includes('조장호')) return '대표이사 / CEO';
      if (dept.includes('개발')) return 'D1 CFT 개발 엔지니어';
      if (dept.includes('품질')) return '품질혁신 엔지니어';
      return 'CFT 유관부서 담당자';
    }

    const ALL_USER_ACCOUNTS = getAllUserAccounts();

    function authenticateUser(username, password) {
      if (!username) return null;
      const cleanUser = username.trim().toLowerCase();
      const cleanPw = (password || '').trim();

      const account = ALL_USER_ACCOUNTS.find(a => a.username === cleanUser || a.email.toLowerCase() === cleanUser || a.name === cleanUser);
      if (account) {
        if (cleanPw === '1' || cleanPw === account.password) {
          return account;
        }
      }
      return null;
    }
"""

with open(os.path.join(base_dir, 'js', 'data.js'), 'a', encoding='utf-8') as f:
    f.write('\n' + auth_helper_code)
print('Added 62 user accounts resolver and authenticateUser to js/data.js')
