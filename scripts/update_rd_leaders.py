with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', encoding='utf-8') as f:
    content = f.read()

# 1. Update CFT select box in renderNewCaseView
new_cft_box = '''            <!-- CFT Leadership Assignment Card (실장 / 센터장 / 임원급 전용) -->
            <div class="card" style="border: 1px solid #3b82f6; background: rgba(13, 21, 39, 0.7);">
              <div class="card-header" style="border-bottom: 1px solid rgba(59, 130, 246, 0.2);">
                <div class="card-title" style="color: #60a5fa;">
                  <i data-lucide="shield-check" style="color:#38bdf8; width:16px; height:16px;"></i> 초동 CFT 핵심 리더십 지정 (연구소·센터장·임원급)
                </div>
                <span class="badge-pill badge-purple" style="font-size:0.68rem;">연구소 / 센터장 / 임원급</span>
              </div>

              <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:14px;">
                부적합 문제 해결을 주관할 <b>연구소 개발실장/팀장</b> 및 전사 의사결정 권한을 가진 <b>센터장/임원급</b>을 지정합니다. (품질 실무: <b>김성중 S.Pro</b> 기본 배속)
              </p>

              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">
                    <span>👑 8D 챔피언 (Champion / 총괄 승인권자) <span class="required">*</span></span>
                    <span style="font-size:0.68rem; color:#60a5fa;">상무/전무/부사장급</span>
                  </label>
                  <select id="formChampion" name="cftChampion" class="form-control" required>
                    <option value="황승안 팀장_상무|품질혁신팀|sahwang@ramostek.com" selected>황승안 팀장_상무 (품질혁신팀) — sahwang@ramostek.com</option>
                    <option value="손동우 실장_부사장|전략 마케팅실|bigsohn@ramostek.com">손동우 실장_부사장 (전략 마케팅실) — bigsohn@ramostek.com</option>
                    <option value="윤석재 COO_부사장|COO 직속|sjyun@ramostek.com">윤석재 COO_부사장 (COO 직속) — sjyun@ramostek.com</option>
                    <option value="박정훈 부문장_전무|알앤디부문|gh8229@ramostek.com">박정훈 부문장_전무 (알앤디부문 / 연구소장) — gh8229@ramostek.com</option>
                    <option value="이제현 부문장_전무|전략경영부문|jaylee@ramostek.com">이제현 부문장_전무 (전략경영부문) — jaylee@ramostek.com</option>
                    <option value="조장호 대표이사|경영진|jh.choue66@ramostek.com">조장호 대표이사 (경영진) — jh.choue66@ramostek.com</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    <span>🎖️ 8D 리더 (8D Leader / 연구소·개발 주관) <span class="required">*</span></span>
                    <span style="font-size:0.68rem; color:#34d399;">연구소 실장/팀장/본부장급</span>
                  </label>
                  <select id="formLeader" name="cftLeader" class="form-control" required>
                    <option value="김현수 실장_상무|Flash 개발실|hskim@ramostek.com" selected>김현수 실장_상무 (Flash 개발실장) — hskim@ramostek.com</option>
                    <option value="박철홍 실장_상무|DRAM 개발실|chpark@ramostek.com">박철홍 실장_상무 (DRAM 개발실장) — chpark@ramostek.com</option>
                    <option value="정현석 팀장_S.Pro|Flash 개발1팀|hsjeong@ramostek.com">정현석 팀장_S.Pro (Flash 개발1팀장) — hsjeong@ramostek.com</option>
                    <option value="박재환 팀장_S.Pro|Flash 개발2팀|jhpark@ramostek.com">박재환 팀장_S.Pro (Flash 개발2팀장) — jhpark@ramostek.com</option>
                    <option value="이성우 팀장_P.Pro|Flash 개발3팀|fog1007@ramostek.com">이성우 팀장_P.Pro (Flash 개발3팀장) — fog1007@ramostek.com</option>
                    <option value="신덕용 팀장_P.Pro|DRAM 개발2팀|satiou@ramostek.com">신덕용 팀장_P.Pro (DRAM 개발2팀장) — satiou@ramostek.com</option>
                    <option value="이민호 담당_이사|DRAM 개발실|aden@ramostek.com">이민호 담당_이사 (DRAM 개발실) — aden@ramostek.com</option>
                    <option value="박정훈 부문장_전무|알앤디부문|gh8229@ramostek.com">박정훈 부문장_전무 (알앤디부문장 / 연구소장) — gh8229@ramostek.com</option>
                  </select>
                </div>
              </div>

              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">
                    <span>🔬 불량 분석 리더 (FA / Technical Lead) <span class="required">*</span></span>
                    <span style="font-size:0.68rem; color:#a78bfa;">개발/분석 팀장급</span>
                  </label>
                  <select id="formFaLead" name="cftFaLead" class="form-control" required>
                    <option value="박재환 팀장_S.Pro|Flash 개발2팀 (FA신뢰성)|jhpark@ramostek.com" selected>박재환 팀장_S.Pro (Flash 개발2팀 / FA신뢰성) — jhpark@ramostek.com</option>
                    <option value="정현석 팀장_S.Pro|Flash 개발1팀|hsjeong@ramostek.com">정현석 팀장_S.Pro (Flash 개발1팀장) — hsjeong@ramostek.com</option>
                    <option value="신덕용 팀장_P.Pro|DRAM 개발2팀|satiou@ramostek.com">신덕용 팀장_P.Pro (DRAM 개발2팀장) — satiou@ramostek.com</option>
                    <option value="김현수 실장_상무|Flash 개발실|hskim@ramostek.com">김현수 실장_상무 (Flash 개발실장) — hskim@ramostek.com</option>
                    <option value="박철홍 실장_상무|DRAM 개발실|chpark@ramostek.com">박철홍 실장_상무 (DRAM 개발실장) — chpark@ramostek.com</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    <span>📦 물류/자재 격리 관리자 (Material Containment Lead) <span class="required">*</span></span>
                    <span style="font-size:0.68rem; color:#fbbf24;">센터장 / 부문장급</span>
                  </label>
                  <select id="formContainmentLead" name="cftContainmentLead" class="form-control" required>
                    <option value="이은산 센터장_상무|제조기획센터|eunsan.lee@ramostek.com" selected>이은산 센터장_상무 (제조기획센터장) — eunsan.lee@ramostek.com</option>
                    <option value="윤석재 COO_부사장|COO 직속|sjyun@ramostek.com">윤석재 COO_부사장 (COO 총괄) — sjyun@ramostek.com</option>
                    <option value="John_Woo_우준수 팀장_이사|전략소싱팀|johnwoo@ramostek.com">John_Woo_우준수 팀장_이사 (전략소싱팀장 / 원자재 총괄) — johnwoo@ramostek.com</option>
                    <option value="Robin_Myung_명노광 부문장_전무|영업부문|rkmyung@ramostek.com">Robin_Myung_명노광 부문장_전무 (영업부문장 / 고객재고 총괄) — rkmyung@ramostek.com</option>
                  </select>
                </div>
              </div>

              <!-- Fixed Quality Facilitator Info Box -->
              <div style="background:rgba(59,130,246,0.06); border:1px dashed #3b82f6; border-radius:6px; padding:10px 14px; margin-top:10px; display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <i data-lucide="clipboard-check" style="width:16px; height:16px; color:#60a5fa;"></i>
                  <div>
                    <span style="font-size:0.8rem; font-weight:700; color:#f8fafc;">8D 품질 실무 간사 (Quality QA / Facilitator):</span>
                    <span style="font-size:0.8rem; color:#93c5fd; font-weight:600; margin-left:6px;">김성중 S.Pro (품질혁신팀)</span>
                  </div>
                </div>
                <span style="font-size:0.7rem; color:#34d399; font-weight:700;">● CFT 품질 실무 배속 완료</span>
              </div>
            </div>'''

start_marker = '            <!-- CFT Leadership Assignment Card'
end_marker = '            <div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:40px;">'

s_idx = content.find(start_marker)
e_idx = content.find(end_marker)

if s_idx != -1 and e_idx != -1:
    content = content[:s_idx] + new_cft_box + '\n\n' + content[e_idx:]
    print('Updated CFT leadership card successfully!')

# 2. Update handleCreateCase to include Kim Seong-jung as Quality Facilitator
old_handle_team = '''        team: [
          {
            role: '8D Champion',
            name: form.cftChampion.value.split('|')[0],
            dept: form.cftChampion.value.split('|')[1],
            contact: form.cftChampion.value.split('|')[2],
            status: 'Active'
          },
          {
            role: '8D Leader',
            name: form.cftLeader.value.split('|')[0],
            dept: form.cftLeader.value.split('|')[1],
            contact: form.cftLeader.value.split('|')[2],
            status: 'Active'
          },
          {
            role: 'Technical / FA Lead',
            name: form.cftFaLead.value.split('|')[0],
            dept: form.cftFaLead.value.split('|')[1],
            contact: form.cftFaLead.value.split('|')[2],
            status: 'Active'
          },
          {
            role: 'Material Containment Lead',
            name: form.cftContainmentLead.value.split('|')[0],
            dept: form.cftContainmentLead.value.split('|')[1],
            contact: form.cftContainmentLead.value.split('|')[2],
            status: 'Active'
          }
        ],'''

new_handle_team = '''        team: [
          {
            role: '8D Champion',
            name: form.cftChampion.value.split('|')[0],
            dept: form.cftChampion.value.split('|')[1],
            contact: form.cftChampion.value.split('|')[2],
            status: 'Active'
          },
          {
            role: '8D Leader (연구소/개발 주관)',
            name: form.cftLeader.value.split('|')[0],
            dept: form.cftLeader.value.split('|')[1],
            contact: form.cftLeader.value.split('|')[2],
            status: 'Active'
          },
          {
            role: 'Technical / FA Lead',
            name: form.cftFaLead.value.split('|')[0],
            dept: form.cftFaLead.value.split('|')[1],
            contact: form.cftFaLead.value.split('|')[2],
            status: 'Active'
          },
          {
            role: 'Material Containment Lead',
            name: form.cftContainmentLead.value.split('|')[0],
            dept: form.cftContainmentLead.value.split('|')[1],
            contact: form.cftContainmentLead.value.split('|')[2],
            status: 'Active'
          },
          {
            role: '8D Quality Facilitator / 실무',
            name: '김성중 S.Pro',
            dept: '품질혁신팀',
            contact: 'sjkim@ramostek.com',
            status: 'Active'
          }
        ],'''

if old_handle_team in content:
    content = content.replace(old_handle_team, new_handle_team, 1)
    print('Updated handleCreateCase team assignment successfully!')

# 3. Update INITIAL_CASES[0].team
old_initial_team = '''        team: [
          { role: '8D Champion', name: '이창민 상무', dept: '품질총괄본부', contact: 'cm.lee@ramos.com', status: 'Active' },
          { role: '8D Leader', name: '김성중 S.Pro', dept: '품질혁신팀 (CFT 리드)', contact: 'sj.kim@ramos.com', status: 'Active' },
          { role: 'Technical / FA Lead', name: '박재환 책임', dept: 'FA 신뢰성분석실', contact: 'jh.park@ramos.com', status: 'Active' },
          { role: 'Process Engineer', name: '서태웅 수석', dept: 'SMT 제조기술팀', contact: 'tw.seo@ramos.com', status: 'Active' },
          { role: 'Development Lead', name: '정동진 수석', dept: 'eMMC FW 개발팀', contact: 'dj.jung@ramos.com', status: 'Active' },
          { role: 'Customer Quality', name: '장민호 책임', dept: 'CQE 1팀 (LGE 전담)', contact: 'mh.jang@ramos.com', status: 'Active' },
          { role: 'Quality Engineer', name: '공아름 선임', dept: '고객품질팀', contact: 'ar.kong@ramos.com', status: 'Active' }
        ],'''

new_initial_team = '''        team: [
          { role: '8D Champion', name: '황승안 팀장_상무', dept: '품질혁신팀', contact: 'sahwang@ramostek.com', status: 'Active' },
          { role: '8D Leader (연구소 주관)', name: '김현수 실장_상무', dept: 'Flash 개발실', contact: 'hskim@ramostek.com', status: 'Active' },
          { role: 'Technical / FA Lead', name: '박재환 팀장_S.Pro', dept: 'Flash 개발2팀 (FA신뢰성)', contact: 'jhpark@ramostek.com', status: 'Active' },
          { role: 'Material Containment Lead', name: '이은산 센터장_상무', dept: '제조기획센터', contact: 'eunsan.lee@ramostek.com', status: 'Active' },
          { role: '8D Quality Facilitator / 실무', name: '김성중 S.Pro', dept: '품질혁신팀', contact: 'sjkim@ramostek.com', status: 'Active' }
        ],'''

if old_initial_team in content:
    content = content.replace(old_initial_team, new_initial_team, 1)
    print('Updated INITIAL_CASES team successfully!')

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('All changes saved to index.html!')
