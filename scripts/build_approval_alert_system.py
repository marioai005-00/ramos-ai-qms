import os

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

# 1. Update js/data.js with comprehensive Approval detection logic
with open(os.path.join(base_dir, 'js', 'data.js'), 'r', encoding='utf-8') as f:
    data_content = f.read()

# Replace getUserPendingTasks function in data.js
old_task_fn_marker = 'function getUserPendingTasks(user = CURRENT_USER) {'
new_task_fn_code = """function getUserPendingTasks(user = CURRENT_USER) {
      const tasks = [];
      const cases = (appData && Array.isArray(appData.cases)) ? appData.cases : INITIAL_CASES;

      cases.forEach(c => {
        const cft = c.team || [];
        const isMember = cft.some(m => m.name && m.name.includes(user.name));
        
        // Ensure gates sanitized
        if (typeof ensureCaseGates === 'function') {
          ensureCaseGates(c);
        }
        const gates = c.gates || {};

        // A. DIRECT ELECTRONIC SIGN-OFF & APPROVAL TASKS (우선순위 최고: 1차/2차/3차 내부결재 및 4차 고객송부)
        ['gate3D', 'gate5D', 'gate8D'].forEach(gk => {
          const g = gates[gk];
          if (!g || !Array.isArray(g.approvers)) return;

          // Find the active pending approver
          for (let i = 0; i < g.approvers.length; i++) {
            const appr = g.approvers[i];
            if (appr.status !== 'Approved') {
              // If this pending step is for the current user
              if (appr.name.includes(user.name) || (i === 3 && user.name === '김성중')) {
                const isDispatch = (i === 3);
                tasks.push({
                  caseId: c.id,
                  customer: c.customer,
                  targetStage: 'reports-hub',
                  gateKey: gk,
                  stageCode: isDispatch ? '고객 송부' : '결재 대기',
                  urgency: 'critical',
                  isApproval: true,
                  stepNum: i + 1,
                  role: appr.role,
                  title: isDispatch 
                    ? `[고객사 공식 송부 대기] ${g.title} 내부 승인 완료 ➔ 고객사 송부 실행 필요` 
                    : `[전자 결재 승인 대기] ${g.title} (${appr.role}) 승인 필요`,
                  desc: isDispatch 
                    ? `3차 8D Champion 결재 완료됨. SLA 준수를 위해 ${c.customerContact || '고객품질팀'} 앞 메일 발송을 처리하세요.` 
                    : `이전 결재 단계 완료됨. 8D 공식 보고서 내용 검토 후 [${appr.name}] 님의 승인 서명을 완료하세요.`
                });
              }
              break; // Only the first pending approver in sequence is active
            }
          }
        });

        // B. ROLE-SPECIFIC 8D PROBLEM SOLVING TASKS
        // 1. 김성중 S.Pro (품질 실무 간사)
        if (user.name === '김성중') {
          if (cft.length < 4) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D1',
              stageCode: 'D1. Team',
              urgency: 'high',
              isApproval: false,
              title: `[CFT 편성 누락] 전사 조직도에서 8D 리더 및 FA/물류 책임자 배속 필요`,
              desc: `현재 CFT 인원이 ${cft.length}명으로 부족합니다. 조직도에서 엔지니어를 추가 배속하세요.`
            });
          }
        }

        // 2. 김현수 실장 / 신덕용 팀장 (8D Leader)
        if (user.name === '김현수' || user.name === '신덕용' || user.roleDesc.includes('Leader')) {
          if (c.currentStage === 'D4' && (!c.d4?.candidateCauses || c.d4?.candidateCauses.length === 0)) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D4',
              stageCode: 'D4. Root Cause',
              urgency: 'high',
              isApproval: false,
              title: `[원인분석 주관] 5-Why 및 물리적 FA 메커니즘 기술 검토 및 원인 확정 필요`,
              desc: `불량 현상(${c.claimTitle})에 대한 개발실 주관의 5-Why 원인 확정 및 검증이 필요합니다.`
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
              isApproval: false,
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
              urgency: 'high',
              isApproval: false,
              title: `[긴급 재고 봉쇄] 평택공장 완제품 ERP 출하 락 및 원부자재 격리 조치 필요`,
              desc: `Lot ${c.lotNumber} 관련 창고 재고 및 협력사 입고분 100% 격리 현황을 확정하세요.`
            });
          }
        }

        // 5. 일반 CFT 팀원 (정현석, 이성우, 양태욱 등)
        if (isMember && user.name !== '김성중' && user.name !== '황승안') {
          tasks.push({
            caseId: c.id,
            customer: c.customer,
            targetStage: c.currentStage || 'D1',
            stageCode: `${c.currentStage} 단계`,
            urgency: 'normal',
            isApproval: false,
            title: `[CFT 참여] Case ${c.id} (${c.product}) 문제 해결 액션 실행`,
            desc: `현재 ${c.currentStage} 단계 작업 및 소속 부서별 개선 대책에 협업하세요.`
          });
        }
      });

      return tasks;
    }"""

idx = data_content.find(old_task_fn_marker)
if idx != -1:
    data_content = data_content[:idx] + new_task_fn_code + '\n'
    with open(os.path.join(base_dir, 'js', 'data.js'), 'w', encoding='utf-8') as f:
        f.write(data_content)
    print('Updated getUserPendingTasks in js/data.js with electronic sign-off detection!')
else:
    print('Could not find old_task_fn_marker in data.js')
