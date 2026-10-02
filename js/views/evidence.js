/* Case originals, stage traceability and real original-file actions. */
function renderEvidenceHubView(c) {
  return `${renderQmsPageHeader({title:'품질 증거 저장소 (Evidence)',icon:'file-check-2',description:'고객 원본과 측정 자료를 첨부하고 D1~D8 단계에 연결합니다. 사실 확인과 승인은 별도로 진행합니다.',reference:c.id})}
    <div class="card">${renderCaseEvidencePanel(c)}${renderCaseEvidenceList(c)}</div>`;
}
