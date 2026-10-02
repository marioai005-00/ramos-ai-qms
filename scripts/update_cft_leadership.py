with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', encoding='utf-8') as f:
    content = f.read()

# Locate the insertion point right before the submit buttons in form
# We will insert the "초동 CFT 핵심 담당자 지정 (팀장 이상)" card

cft_card_html = '''            <!-- CFT Leadership Assignment Card (팀장 이상 전용) -->
            <div class="card" style="border: 1px solid #3b82f6; background: rgba(13, 21, 39, 0.7);">
              <div class="card-header" style="border-bottom: 1px solid rgba(59, 130, 246, 0.2);">
                <div class="card-title" style="color: #60a5fa;">
                  <i data-lucide="users" style="color:#38bdf8; width:16px; height:16px;"></i> 초동 CFT 핵심 담당자 지정 (Team Leader & Executives)
                </div>
                <span class="badge-pill badge-purple" style="font-size:0.68rem;">팀장 / 임원급 지정 필수</span>
              </div>

              <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:14px;">
                부적합 발생 시 즉각 대응 및 D3 긴급 봉쇄를 총괄할 <b>팀장 및 임원급 이상의 핵심 CFT 담당자</b>를 지정합니다.
              </p>

              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">
                    <span>👑 8D 챔피언 (Champion / 임원·승인권자) <span class="required">*</span></span>
                    <span style="font-size:0.68rem; color:#60a5fa;">상무/전무/부사장급</span>
                  </label>
                  <select id="formChampion" name="cftChampion" class="form-control" required>
                    <option value="황승안 팀장_상무|품질혁신팀|sahwang@ramostek.com" selected>황승안 팀장_상무 (품질혁신팀) — sahwang@ramostek.com</option>
                    <option value="손동우 실장_부사장|전략 마케팅실|bigsohn@ramostek.com">손동우 실장_부사장 (전략 마케팅실) — bigsohn@ramostek.com</option>
                    <option value="윤석재 COO_부사장|COO 직속|sjyun@ramostek.com">윤석재 COO_부사장 (COO 직속) — sjyun@ramostek.com</option>
                    <option value="이은산 센터장_상무|제조기획센터|eunsan.lee@ramostek.com">이은산 센터장_상무 (제조기획센터) — eunsan.lee@ramostek.com</option>
                    <option value="박정훈 부문장_전무|알앤디부문|gh8229@ramostek.com">박정훈 부문장_전무 (알앤디부문) — gh8229@ramostek.com</option>
                    <option value="이제현 부문장_전무|전략경영부문|jaylee@ramostek.com">이제현 부문장_전무 (전략경영부문) — jaylee@ramostek.com</option>
                    <option value="조장호 대표이사|경영진|jh.choue66@ramostek.com">조장호 대표이사 (경영진) — jh.choue66@ramostek.com</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    <span>🎖️ 8D 리더 (8D Leader / 실무 총괄) <span class="required">*</span></span>
                    <span style="font-size:0.68rem; color:#34d399;">품질혁신 주관</span>
                  </label>
                  <select id="formLeader" name="cftLeader" class="form-control" required>
                    <option value="김성중 Senior Pro|품질혁신팀|sjkim@ramostek.com" selected>⭐ 김성중 Senior Pro (품질혁신팀) [나 / 8D Champion & Leader] — sjkim@ramostek.com</option>
                    <option value="황승안 팀장_상무|품질혁신팀|sahwang@ramostek.com">황승안 팀장_상무 (품질혁신팀) — sahwang@ramostek.com</option>
                    <option value="정현석 팀장_S.Pro|Flash 개발1팀|hsjeong@ramostek.com">정현석 팀장_S.Pro (Flash 개발1팀) — hsjeong@ramostek.com</option>
                    <option value="박재환 팀장_S.Pro|Flash 개발2팀|jhpark@ramostek.com">박재환 팀장_S.Pro (Flash 개발2팀) — jhpark@ramostek.com</option>
                  </select>
                </div>
              </div>

              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">
                    <span>🔬 불량 분석 리더 (FA / Root Cause Lead) <span class="required">*</span></span>
                    <span style="font-size:0.68rem; color:#a78bfa;">개발/분석 팀장급</span>
                  </label>
                  <select id="formFaLead" name="cftFaLead" class="form-control" required>
                    <option value="박재환 팀장_S.Pro|Flash 개발2팀 (FA신뢰성)|jhpark@ramostek.com" selected>박재환 팀장_S.Pro (Flash 개발2팀 / FA신뢰성) — jhpark@ramostek.com</option>
                    <option value="정현석 팀장_S.Pro|Flash 개발1팀|hsjeong@ramostek.com">정현석 팀장_S.Pro (Flash 개발1팀) — hsjeong@ramostek.com</option>
                    <option value="이성우 팀장_P.Pro|Flash 개발3팀|fog1007@ramostek.com">이성우 팀장_P.Pro (Flash 개발3팀) — fog1007@ramostek.com</option>
                    <option value="신덕용 팀장_P.Pro|DRAM 개발2팀|satiou@ramostek.com">신덕용 팀장_P.Pro (DRAM 개발2팀) — satiou@ramostek.com</option>
                    <option value="김현수 실장_상무|Flash 개발실|hskim@ramostek.com">김현수 실장_상무 (Flash 개발실) — hskim@ramostek.com</option>
                    <option value="박철홍 실장_상무|DRAM 개발실|chpark@ramostek.com">박철홍 실장_상무 (DRAM 개발실) — chpark@ramostek.com</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    <span>📦 물류/자재 격리 관리자 (Material Containment Lead) <span class="required">*</span></span>
                    <span style="font-size:0.68rem; color:#fbbf24;">운영/그룹장급</span>
                  </label>
                  <select id="formContainmentLead" name="cftContainmentLead" class="form-control" required>
                    <option value="공아름 그룹장_P.Pro|계획운영그룹 (물류/출하 격리)|loveskr@ramostek.com" selected>공아름 그룹장_P.Pro (계획운영그룹 / 출하·완제품 격리) — loveskr@ramostek.com</option>
                    <option value="조철민 그룹장_P.Pro|자원운영그룹 (원부자재 격리)|nrjcm@ramostek.com">조철민 그룹장_P.Pro (자원운영그룹 / 원부자재 격리) — nrjcm@ramostek.com</option>
                    <option value="이우진 팀장_P.Pro|IT_보안팀 (ERP Lock)|lwj@ramostek.com">이우진 팀장_P.Pro (IT_보안팀 / ERP 출하정지 Lock) — lwj@ramostek.com</option>
                    <option value="이은산 센터장_상무|제조기획센터|eunsan.lee@ramostek.com">이은산 센터장_상무 (제조기획센터 총괄) — eunsan.lee@ramostek.com</option>
                    <option value="Sahong_Kim_김사홍 팀장_P.Pro|영업팀 (고객사 완제품 격리)|shk@ramostek.com">Sahong_Kim_김사홍 팀장_P.Pro (영업팀 / 고객창고 격리) — shk@ramostek.com</option>
                  </select>
                </div>
              </div>
            </div>
'''

target_tag = '            <div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:40px;">'
idx = content.find(target_tag)

if idx != -1:
    content = content[:idx] + cft_card_html + '\n' + content[idx:]
    print('Inserted CFT leadership card successfully!')
else:
    print('Error finding target tag for CFT card')

# Update handleCreateCase to build team from form inputs
old_team_code = '''        team: [
          { role: '8D Champion', name: '이창민 상무', dept: '품질총괄본부', contact: 'cm.lee@ramos.com', status: 'Active' },
          { role: '8D Leader', name: '김성중 S.Pro', dept: '품질혁신팀', contact: 'sj.kim@ramos.com', status: 'Active' },
          { role: 'Technical Lead', name: '박재환 책임', dept: 'FA분석실', contact: 'jh.park@ramos.com', status: 'Active' },
          { role: 'Process Eng', name: '서태웅 수석', dept: '제조기술본부', contact: 'tw.seo@ramos.com', status: 'Active' }
        ],'''

new_team_code = '''        team: [
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

if old_team_code in content:
    content = content.replace(old_team_code, new_team_code, 1)
    print('Updated handleCreateCase team assignment successfully!')
else:
    print('Could not find exact old_team_code, checking alternative')

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('All changes saved to index.html!')
