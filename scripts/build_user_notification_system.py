import os

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

# 1. Update js/data.js with User Management and Dynamic Task Generator
with open(os.path.join(base_dir, 'js', 'data.js'), 'r', encoding='utf-8') as f:
    data_content = f.read()

user_mgmt_code = """
    // =========================================================================
    // CURRENT LOGGED-IN USER & PERSONALIZED TASK ENGINE
    // =========================================================================
    const PRESET_USERS = [
      { name: '김성중', position: 'Senior Pro', dept: '품질혁신팀', email: 'sjkim@ramostek.com', roleDesc: '8D 품질 실무 간사 / Facilitator' },
      { name: '김현수', position: '실장_상무', dept: 'Flash 개발실', email: 'hskim@ramostek.com', roleDesc: '8D Leader (Flash 개발 총괄)' },
      { name: '박재환', position: '팀장_S.Pro', dept: 'Flash 개발2팀', email: 'jhpark@ramostek.com', roleDesc: '불량 분석 리더 (FA / Technical Lead)' },
      { name: '이은산', position: '센터장_상무', dept: '제조기획센터', email: 'eunsan.lee@ramostek.com', roleDesc: '물류/자재 격리 책임자 (Containment Lead)' },
      { name: '황승안', position: '팀장_상무', dept: '품질혁신팀', email: 'sahwang@ramostek.com', roleDesc: '8D Champion (품질혁신 총괄)' },
      { name: '정현석', position: '팀장_S.Pro', dept: 'Flash 개발1팀', email: 'hsjeong@ramostek.com', roleDesc: 'D1 CFT 엔지니어 / 펌웨어' },
      { name: '이성우', position: '팀장_P.Pro', dept: 'Flash 개발3팀', email: 'fog1007@ramostek.com', roleDesc: 'D1 CFT 엔지니어 / 공정기술' },
      { name: '신덕용', position: '팀장_P.Pro', dept: 'DRAM 개발2팀', email: 'satiou@ramostek.com', roleDesc: '8D Leader (DRAM 개발)' },
      { name: '박정훈', position: '부문장_전무', dept: '알앤디부문', email: 'gh8229@ramostek.com', roleDesc: '연구소장 / R&D 총괄' },
      { name: '조장호', position: '대표이사', dept: '대표이사', email: 'jh.choue66@ramostek.com', roleDesc: 'CEO / 최고 의사결정권자' }
    ];

    let CURRENT_USER = PRESET_USERS[0]; // Default: 김성중 S.Pro

    function setCurrentUser(userName) {
      const found = PRESET_USERS.find(u => u.name === userName);
      if (found) {
        CURRENT_USER = found;
        localStorage.setItem('RAMOS_CURRENT_USER', userName);
      }
    }

    function loadCurrentUser() {
      const saved = localStorage.getItem('RAMOS_CURRENT_USER');
      if (saved) {
        const found = PRESET_USERS.find(u => u.name === saved);
        if (found) CURRENT_USER = found;
      }
    }
    loadCurrentUser();

    function getUserPendingTasks(user = CURRENT_USER) {
      const tasks = [];
      const cases = (appData && Array.isArray(appData.cases)) ? appData.cases : INITIAL_CASES;

      cases.forEach(c => {
        const cft = c.team || [];
        const isMember = cft.some(m => m.name.includes(user.name));
        const gates = c.gates || {};

        // 1. 김성중 S.Pro (품질 실무 간사)
        if (user.name === '김성중') {
          if (gates.gate3D?.internalApproved && !gates.gate3D?.dispatchedByQuality) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'reports-hub',
              stageCode: 'Gate 01',
              urgency: 'critical',
              title: `[고객사 송부 대기] Initial 3D Report 내부 결재 완결 ➔ 고객사(${c.customer}) 앞 공식 송부 실행 필요`,
              desc: `8D Champion 결재 완료됨. SLA 준수를 위해 ${c.customerContact || '고객품질팀'} 앞 메일 발송을 처리하세요.`
            });
          }
          if (cft.length < 4) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D1',
              stageCode: 'D1. Team',
              urgency: 'high',
              title: `[CFT 편성 누락] 전사 조직도에서 8D 리더 및 FA/물류 책임자 배속 필요`,
              desc: `현재 CFT 인원이 ${cft.length}명으로 부족합니다. 조직도에서 엔지니어를 추가 배속하세요.`
            });
          }
        }

        // 2. 김현수 실장 / 신덕용 팀장 (8D Leader)
        if (user.name === '김현수' || user.name === '신덕용' || user.roleDesc.includes('Leader')) {
          if (c.currentStage === 'D4' || (!c.d4?.candidateCauses || c.d4?.candidateCauses.length === 0)) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D4',
              stageCode: 'D4. Root Cause',
              urgency: 'critical',
              title: `[원인분석 주관] 5-Why 및 물리적 FA 메커니즘 기술 검토 및 원인 확정 필요`,
              desc: `불량 현상(${c.claimTitle})에 대한 개발실 주관의 5-Why 원인 확정 및 검증이 필요합니다.`
            });
          }
          if (c.currentStage === 'D5' || (!c.d5?.candidates || c.d5?.candidates.length === 0)) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D5',
              stageCode: 'D5. PCA',
              urgency: 'high',
              title: `[영구대책 수립] 설계 변경(ECN) 및 공정 개선안 PCA 검토 및 승인`,
              desc: `근본 원인 재발 방지를 위한 영구 시정조치(PCA) 방안을 수립하세요.`
            });
          }
        }

        // 3. 박재환 팀장 (FA 불량 분석 리더)
        if (user.name === '박재환' || user.roleDesc.includes('FA')) {
          const hasFAEvidence = (c.evidenceList || []).some(e => e.type === 'FA Analysis' || (e.linkedStages || []).includes('D4'));
          if (!hasFAEvidence) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D4',
              stageCode: 'D4. FA 성적서',
              urgency: 'critical',
              title: `[물리적 분석 증거 누락] Decap 및 SEM 단면 분석 성적서(EVD) 등록 필요`,
              desc: `불량 시료 ${c.defectQty}ea에 대한 X-Ray, Decap, SEM 단면 Crack 정밀 분석 보고서를 등록하세요.`
            });
          }
        }

        // 4. 이은산 센터장 (물류/자재 격리 책임자)
        if (user.name === '이은산' || user.roleDesc.includes('격리')) {
          const hasMaterialFlow = c.d3?.materialFlow && c.d3.materialFlow.length > 0;
          if (!hasMaterialFlow || c.currentStage === 'D1' || c.currentStage === 'D2' || c.currentStage === 'D3') {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D3',
              stageCode: 'D3. Containment',
              urgency: 'critical',
              title: `[긴급 재고 봉쇄] 평택공장 완제품 ERP 출하 락 및 원부자재 격리 조치 필요`,
              desc: `Lot ${c.lotNumber} 관련 창고 재고 및 협력사 입고분 100% 격리 현황을 확정하세요.`
            });
          }
        }

        // 5. 황승안 팀장 (8D Champion)
        if (user.name === '황승안' || user.roleDesc.includes('Champion')) {
          if (gates.gate3D?.status === 'Pending' && !gates.gate3D?.internalApproved) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'reports-hub',
              stageCode: 'Gate 01 결재',
              urgency: 'high',
              title: `[내부 결재 대기] Initial 3D Containment Report 최종 승인 결재 필요`,
              desc: `D1~D3 초동 대응 결과 검토 후 Champion 최종 결재 서명을 완료하세요.`
            });
          }
        }

        // 6. 일반 CFT 팀원 (정현석, 이성우, 양태욱 등)
        if (isMember && user.name !== '김성중' && user.name !== '황승안') {
          tasks.push({
            caseId: c.id,
            customer: c.customer,
            targetStage: c.currentStage || 'D1',
            stageCode: `${c.currentStage} 단계`,
            urgency: 'normal',
            title: `[CFT 참여] Case ${c.id} (${c.product}) 문제 해결 액션 실행`,
            desc: `현재 ${c.currentStage} 단계 작업 및 소속 부서별 개선 대책에 협업하세요.`
          });
        }
      });

      return tasks;
    }
"""

with open(os.path.join(base_dir, 'js', 'data.js'), 'a', encoding='utf-8') as f:
    f.write('\n' + user_mgmt_code)
print('Appended User Management & Dynamic Task Generator to js/data.js')
