import os

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

# 1. Update ensureCaseGates in js/views/reports.js
with open(os.path.join(base_dir, 'js', 'views', 'reports.js'), 'r', encoding='utf-8') as f:
    rep_content = f.read()

# Replace ensureCaseGates function with strict sanitization
old_ensure = """function ensureCaseGates(c) {
  if (!c.gates) {
    c.gates = {
      gate3D: {
        title: 'Initial 3D Containment Report (D1~D3 봉쇄 확정)',
        reportType: 'initial',
        status: (c.currentStage === 'D1' || c.currentStage === 'D2') ? 'Pending' : 'Approved',
        internalApproved: true,
        dispatchedByQuality: true,
        dispatchDate: '2026-09-02 11:15',
        approvalDate: '2026-09-02 11:15',
        approvers: [
          { role: '1차: 물류/자재 격리 책임자', name: c.team?.find(t=>t.role.includes('Containment'))?.name || '이은산 센터장_상무', status: 'Approved', date: '2026-09-02 09:15', comment: '공장 완제품 45,000ea 출하 락 및 협력사 입고격리 완료' },
          { role: '2차: 8D Leader (연구소 주관)', name: c.team?.find(t=>t.role.includes('Leader'))?.name || '김현수 실장_상무', status: 'Approved', date: '2026-09-02 10:00', comment: '초동 선별 방안 수립 및 D3 봉쇄 유효성 검증 승인' },
          { role: '3차: 8D Champion (품질혁신)', name: c.team?.find(t=>t.role.includes('Champion'))?.name || '황승안 팀장_상무', status: 'Approved', date: '2026-09-02 11:00', comment: '전사 초동 대응 종합 승인 및 고객 송부 최종 결재' },
          { role: '4차: 8D 품질실무 (고객사 공식 송부)', name: '김성중 S.Pro', status: 'Approved', date: '2026-09-02 11:15', comment: `고객사(${c.customer} - ${c.customerContact || '최영수 책임'}) 앞 공식 3D Report 송부 완료 (SLA 18h 준수)` }
        ]
      },
      gate5D: {
        title: 'Interim 5D Root Cause & PCA Report (D4~D5 원인/영구대책)',
        reportType: 'interim',
        status: (c.currentStage === 'D6' || c.currentStage === 'D7' || c.currentStage === 'D8' || c.status === 'Closed') ? 'Approved' : (c.currentStage === 'D4' || c.currentStage === 'D5' ? 'Pending' : 'Locked'),
        internalApproved: (c.currentStage === 'D6' || c.currentStage === 'D7' || c.currentStage === 'D8' || c.status === 'Closed'),
        dispatchedByQuality: (c.currentStage === 'D6' || c.currentStage === 'D7' || c.currentStage === 'D8' || c.status === 'Closed'),
        dispatchDate: '2026-09-06 16:00',
        approvalDate: '2026-09-06 16:00',
        approvers: [
          { role: '1차: 불량 분석 리더 (FA)', name: c.team?.find(t=>t.role.includes('FA') || t.role.includes('Technical'))?.name || '박재환 팀장_S.Pro', status: (c.currentStage === 'D4' || c.currentStage === 'D5' || c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-05 14:00', comment: 'SEM 단면 Crack 및 Decap 탄화 물리적 입증 성적서(EVD-08) 검증' },
          { role: '2차: 8D Leader (연구소 주관)', name: c.team?.find(t=>t.role.includes('Leader'))?.name || '김현수 실장_상무', status: (c.currentStage === 'D5' || c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-06 11:00', comment: 'C102 MLCC X7R 125도 고온 보증 등급 설계 변경 ECN 승인' },
          { role: '3차: 8D Champion (품질혁신)', name: c.team?.find(t=>t.role.includes('Champion'))?.name || '황승안 팀장_상무', status: (c.status === 'Closed' || c.currentStage === 'D8') ? 'Approved' : 'Pending', date: '2026-09-06 15:30', comment: 'Interim 5D 영구대책 내부 결재 최종 승인' },
          { role: '4차: 8D 품질실무 (고객사 공식 송부)', name: '김성중 S.Pro', status: (c.status === 'Closed' || c.currentStage === 'D8') ? 'Approved' : 'Pending', date: '2026-09-06 16:00', comment: `고객사(${c.customer}) 앞 Interim 5D 정식 송부 완결` }
        ]
      },
      gate8D: {
        title: 'Final 8D Closure Report (D6~D8 효과검증 & 영구종결)',
        reportType: 'final',
        status: (c.status === 'Closed' || c.currentStage === 'D8') ? 'Approved' : 'Pending',
        internalApproved: (c.status === 'Closed'),
        dispatchedByQuality: (c.status === 'Closed'),
        dispatchDate: '2026-09-12 18:00',
        approvalDate: '2026-09-12 18:00',
        approvers: [
          { role: '1차: 8D Leader (연구소 주관)', name: c.team?.find(t=>t.role.includes('Leader'))?.name || '김현수 실장_상무', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 14:00', comment: 'HTOL 504시간 0 Fail 및 0 PPM 달성 검증' },
          { role: '2차: 알앤디부문장 (연구소장)', name: '박정훈 부문장_전무', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 15:30', comment: '전사 개발 표준 반영 및 설계 수평전개 승인' },
          { role: '3차: 8D Champion (품질혁신)', name: c.team?.find(t=>t.role.includes('Champion'))?.name || '황승안 팀장_상무', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 17:00', comment: 'Final 8D 내부 결재 최종 완료 및 고객 송부 승인' },
          { role: '4차: 8D 품질실무 (고객사 공식 송부)', name: '김성중 S.Pro', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 18:00', comment: `고객사(${c.customer}) 앞 Final 8D 완결본 공식 송부 및 종결 처리` }
        ]
      }
    };
  }
  return c.gates;
}"""

new_ensure = """function ensureCaseGates(c) {
  // Build clean standardized 4-step internal + dispatch gates
  const defaultGates = {
    gate3D: {
      title: 'Initial 3D Containment Report (D1~D3 봉쇄 확정)',
      reportType: 'initial',
      status: (c.currentStage === 'D1' || c.currentStage === 'D2') ? 'Pending' : 'Approved',
      internalApproved: true,
      dispatchedByQuality: true,
      dispatchDate: '2026-09-02 11:15',
      approvalDate: '2026-09-02 11:15',
      approvers: [
        { role: '1차: 물류/자재 격리 책임자', name: c.team?.find(t=>t.role.includes('Containment'))?.name || '이은산 센터장_상무', status: 'Approved', date: '2026-09-02 09:15', comment: '공장 완제품 45,000ea 출하 락 및 협력사 입고격리 완료' },
        { role: '2차: 8D Leader (연구소 주관)', name: c.team?.find(t=>t.role.includes('Leader'))?.name || '김현수 실장_상무', status: 'Approved', date: '2026-09-02 10:00', comment: '초동 선별 방안 수립 및 D3 봉쇄 유효성 검증 승인' },
        { role: '3차: 8D Champion (품질혁신)', name: c.team?.find(t=>t.role.includes('Champion'))?.name || '황승안 팀장_상무', status: 'Approved', date: '2026-09-02 11:00', comment: '전사 초동 대응 종합 승인 및 고객 송부 최종 결재' },
        { role: '4차: 8D 품질실무 (고객사 공식 송부)', name: '김성중 S.Pro', status: 'Approved', date: '2026-09-02 11:15', comment: `고객사(${c.customer} - ${c.customerContact || '최영수 책임'}) 앞 공식 3D Report 송부 완료 (SLA 18h 준수)` }
      ]
    },
    gate5D: {
      title: 'Interim 5D Root Cause & PCA Report (D4~D5 원인/영구대책)',
      reportType: 'interim',
      status: (c.currentStage === 'D6' || c.currentStage === 'D7' || c.currentStage === 'D8' || c.status === 'Closed') ? 'Approved' : (c.currentStage === 'D4' || c.currentStage === 'D5' ? 'Pending' : 'Locked'),
      internalApproved: (c.currentStage === 'D6' || c.currentStage === 'D7' || c.currentStage === 'D8' || c.status === 'Closed'),
      dispatchedByQuality: (c.currentStage === 'D6' || c.currentStage === 'D7' || c.currentStage === 'D8' || c.status === 'Closed'),
      dispatchDate: '2026-09-06 16:00',
      approvalDate: '2026-09-06 16:00',
      approvers: [
        { role: '1차: 불량 분석 리더 (FA)', name: c.team?.find(t=>t.role.includes('FA') || t.role.includes('Technical'))?.name || '박재환 팀장_S.Pro', status: (c.currentStage === 'D4' || c.currentStage === 'D5' || c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-05 14:00', comment: 'SEM 단면 Crack 및 Decap 탄화 물리적 입증 성적서(EVD-08) 검증' },
        { role: '2차: 8D Leader (연구소 주관)', name: c.team?.find(t=>t.role.includes('Leader'))?.name || '김현수 실장_상무', status: (c.currentStage === 'D5' || c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-06 11:00', comment: 'C102 MLCC X7R 125도 고온 보증 등급 설계 변경 ECN 승인' },
        { role: '3차: 8D Champion (품질혁신)', name: c.team?.find(t=>t.role.includes('Champion'))?.name || '황승안 팀장_상무', status: (c.status === 'Closed' || c.currentStage === 'D8') ? 'Approved' : 'Pending', date: '2026-09-06 15:30', comment: 'Interim 5D 영구대책 내부 결재 최종 승인' },
        { role: '4차: 8D 품질실무 (고객사 공식 송부)', name: '김성중 S.Pro', status: (c.status === 'Closed' || c.currentStage === 'D8') ? 'Approved' : 'Pending', date: '2026-09-06 16:00', comment: `고객사(${c.customer}) 앞 Interim 5D 정식 송부 완결` }
      ]
    },
    gate8D: {
      title: 'Final 8D Closure Report (D6~D8 효과검증 & 영구종결)',
      reportType: 'final',
      status: (c.status === 'Closed' || c.currentStage === 'D8') ? 'Approved' : 'Pending',
      internalApproved: (c.status === 'Closed'),
      dispatchedByQuality: (c.status === 'Closed'),
      dispatchDate: '2026-09-12 18:00',
      approvalDate: '2026-09-12 18:00',
      approvers: [
        { role: '1차: 8D Leader (연구소 주관)', name: c.team?.find(t=>t.role.includes('Leader'))?.name || '김현수 실장_상무', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 14:00', comment: 'HTOL 504시간 0 Fail 및 0 PPM 달성 검증' },
        { role: '2차: 알앤디부문장 (연구소장)', name: '박정훈 부문장_전무', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 15:30', comment: '전사 개발 표준 반영 및 설계 수평전개 승인' },
        { role: '3차: 8D Champion (품질혁신)', name: c.team?.find(t=>t.role.includes('Champion'))?.name || '황승안 팀장_상무', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 17:00', comment: 'Final 8D 내부 결재 최종 완료 및 고객 송부 승인' },
        { role: '4차: 8D 품질실무 (고객사 공식 송부)', name: '김성중 S.Pro', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 18:00', comment: `고객사(${c.customer}) 앞 Final 8D 완결본 공식 송부 및 종결 처리` }
      ]
    }
  };

  if (!c.gates) {
    c.gates = defaultGates;
  } else {
    // Forcefully remove any customer approver (5th step) and strictly sanitize to 4 steps
    ['gate3D', 'gate5D', 'gate8D'].forEach(gk => {
      if (!c.gates[gk]) {
        c.gates[gk] = defaultGates[gk];
      } else if (Array.isArray(c.gates[gk].approvers)) {
        // Filter out any approver with role containing '고객사' or index >= 4
        c.gates[gk].approvers = c.gates[gk].approvers.filter(a => !a.role.includes('고객사')).slice(0, 4);
        // Ensure 4th is always Kim Seong-joong
        if (c.gates[gk].approvers.length < 4) {
          c.gates[gk].approvers = defaultGates[gk].approvers;
        }
      }
    });
  }
  return c.gates;
}"""

if old_ensure in rep_content:
    rep_content = rep_content.replace(old_ensure, new_ensure, 1)
    with open(os.path.join(base_dir, 'js', 'views', 'reports.js'), 'w', encoding='utf-8') as f:
        f.write(rep_content)
    print('Updated js/views/reports.js to aggressively sanitize and remove customer approvals!')
else:
    print('Could not find old_ensure in reports.js')
