/* Company-to-supplier notices: authenticated central records and original files. */
(function (global) {
  'use strict';
  const API = '/__api__/qms/supplier-notices';
  const labels = {Draft:'통보 대기',Issued:'회신 대기',Responded:'회신 접수',UnderReview:'회신 검토 중',RevisionRequested:'추가 회신 요청',Closed:'종결'};
  const tones = {Draft:'neutral',Issued:'warn',Responded:'info',UnderReview:'warn',RevisionRequested:'danger',Closed:'success'};
  const actionLabels = {note:'담당자·기한·의견 저장',publish:'외주사에 공개 · 회신 요청',review:'회신 검토 시작',requestRevision:'추가 회신 요청',close:'검증 확인 · 종결',reopen:'종결 건 재검토'};
  const state = {actor:'',items:null,loading:false,error:'',screen:'list',selected:'',draft:{},search:'',status:'',supplier:'',message:''};
  const user = () => QMSApi.getState().user;
  const esc = value => qmsUiEscape(value ?? '');
  const external = () => Boolean(user()?.isSupplier);
  const write = () => !external() && (user()?.roles || []).some(r => ['system_admin','quality_reviewer','case_facilitator','stage_drafter','stage_leader','stage_champion','customer_dispatcher'].includes(r));
  const review = () => !external() && (user()?.roles || []).some(r => ['system_admin','quality_reviewer'].includes(r));
  const current = () => appData.currentView === 'supplier-notices';
  const selected = () => (state.items || []).find(r => r.ticketId === state.selected);
  const date = value => value ? new Date(value).toLocaleString('ko-KR',{hour12:false}) : '—';
  const badge = r => `<span class="qms-status-chip qms-tone-${tones[r.status] || 'neutral'}">${esc(labels[r.status] || r.status)}</span>`;
  const info = (label,value) => `<div class="iq-info"><dt>${esc(label)}</dt><dd>${esc(value === 0 ? 0 : value || '미등록')}</dd></div>`;
  const overdue = r => ['Issued','RevisionRequested'].includes(r.status) && r.dueDate < new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
  function actorScope() {
    const actor = user()?.username || '';
    if (actor !== state.actor) Object.assign(state,{actor,items:null,loading:false,error:'',screen:'list',selected:'',draft:{},message:'',search:'',status:'',supplier:''});
    return actor;
  }
  async function load(force=false) {
    const actor = actorScope();
    if (!actor || state.loading || state.items !== null && !force) return;
    state.loading=true;state.error='';
    try { const result=await QMSApi.request(API);if(user()?.username!==actor)return;state.items=result.items || []; }
    catch(error) { if(user()?.username===actor){state.error=error.message;state.items=[];} }
    finally { if(state.actor===actor){state.loading=false;if(current()&&!['new','edit'].includes(state.screen))renderCurrentView();} }
  }
  function field(label,name,value='',options={}) {
    const {required=false,type='text',wide=false,area=false,choices=null}=options;
    const attrs=`name="${name}" ${required?'required':''}`;
    const control=choices?`<select ${attrs}>${choices.map(([v,t])=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(t)}</option>`).join('')}</select>`:area?`<textarea ${attrs} rows="3" maxlength="8000">${esc(value)}</textarea>`:`<input ${attrs} type="${type}" value="${esc(value)}" ${type==='number'?'min="0" step="1"':'maxlength="240"'}>`;
    return `<label class="iq-field ${wide?'iq-wide':''}"><span>${esc(label)}${required?' <b aria-label="필수">*</b>':''}</span>${control}</label>`;
  }
  function filesField() {return `<label class="iq-field iq-wide"><span>Evidence 원본 첨부</span><input name="evidence" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.xlsx,.xls,.csv,.docx,.eml,.txt"><small>사진·측정 자료·분석 보고서·메일 원본 등 최대 10개, 합계 30 MB. 저장 후 내려받을 수 있습니다.</small></label>`;}
  function contact(id) {
    const s=MASTER_SUPPLIERS.find(v=>v.id===id);
    return s?`${info('통보 대상',s.name)}${info('외주사 담당자',s.defaultContact)}${info('외주사 이메일',s.email)}`:info('외주사 담당자','외주사를 선택하면 공식 담당자와 이메일이 표시됩니다.');
  }
  function caseField(value) {return field('기존 8D Case 참조 (선택)','linkedCaseId',value,{wide:true,choices:[['','연결하지 않음'],...(appData.cases||[]).map(c=>[c.id,c.id+' · '+(c.claimTitle||c.customer||'')])]});}
  function formView() {
    const editing=state.screen==='edit',r=editing?selected():null,f=state.draft;
    if(!write())return renderQmsEmpty({title:'통보 등록 권한이 없습니다.'});
    return `<section class="iq-card"><div class="iq-card-heading"><h2>${editing?'통보 내용 수정':'외주사 부적합 통보 등록'}</h2><span class="qms-status-chip qms-tone-info">우리 회사 → 외주사</span></div>
    <form id="supplierNoticeForm" onsubmit="handleSupplierNoticeSubmit(event)" oninput="supplierNoticeCapture(this)" onchange="supplierNoticeCapture(this)"><div class="iq-form-grid">
    ${field('통보 대상 외주사','supplierId',f.supplierId,{required:true,choices:[['','외주사 선택'],...MASTER_SUPPLIERS.map(s=>[s.id,s.name])]})}${field('위험도 (품질 확인값)','severity',f.severity||'Unknown',{choices:[['Unknown','미확정'],['Minor','Minor'],['Major','Major'],['Critical','Critical']]})}
    <dl class="iq-info-grid iq-wide" id="supplierNoticeContact">${contact(f.supplierId)}</dl>
    ${field('통보 제목','title',f.title,{required:true,wide:true})}${field('사내 주관 부서','department',f.department??user()?.dept,{required:true})}${field('사내 담당자','owner',f.owner??user()?.name,{required:true})}
    ${field('생산 Site','site',f.site,{choices:[['','선택 / 해당 없음'],...['TechL Vina','Winpac','SSPC','Ramos 3Camp'].map(v=>[v,v])]})}${field('확인 공정 / 위치','process',f.process)}
    ${field('대상 제품','product',f.product)}${field('품번 (P/N)','partNumber',f.partNumber)}${field('Lot No.','lotNo',f.lotNo)}${field('발생 일시','occurredAt',f.occurredAt,{required:true,type:'datetime-local'})}
    ${field('검사 / 대상 수량 (ea)','inputQty',f.inputQty??'',{type:'number'})}${field('불량 수량 (ea)','defectQty',f.defectQty??'',{type:'number'})}
    ${field('확인된 부적합 현상 / 통보 내용','description',f.description,{required:true,wide:true,area:true})}${field('현재 초동 조치 / 봉쇄 내용','containment',f.containment,{wide:true,area:true})}
    ${field('외주사 요청 사항','requestedAction',f.requestedAction,{required:true,wide:true,area:true})}${field('외주사 회신 기한','dueDate',f.dueDate,{required:true,type:'date'})}${caseField(f.linkedCaseId)}
    ${editing?field('수정 사유','comment','',{required:true,wide:true,area:true}):''}${filesField()}</div>
    <div class="iq-note">등록 후에는 ‘통보 대기’로 보관됩니다. 품질 담당자가 ‘외주사에 공개 · 회신 요청’을 선택하면 해당 업체의 로그인 화면에서 확인할 수 있습니다. 이메일은 자동 발송되지 않습니다. 미확인 수량은 빈칸으로 두세요.</div>
    <p class="iq-error sn-form-error" role="alert"></p><div class="iq-actions"><button class="btn btn-secondary" type="button" onclick="supplierNoticeOpen('list')">목록</button><button class="btn btn-primary" type="submit">${editing?'수정 내용 저장':'통보 내용 등록'}</button></div></form></section>`;
  }
  function tableView() {
    if(state.items===null || state.loading)return renderQmsEmpty({title:'부적합 통보를 불러오는 중입니다.',icon:'loader-circle'});
    if(state.error)return `<p class="iq-error" role="alert">${esc(state.error)}</p>`;
    const q=state.search.trim().toLowerCase(),rows=state.items.filter(r=>(!state.status||r.status===state.status)&&(!state.supplier||r.supplier.id===state.supplier)&&(!q||[r.ticketId,r.title,r.product,r.partNumber,r.lotNo,r.owner,r.supplier.name].join(' ').toLowerCase().includes(q)));
    if(!rows.length)return renderQmsEmpty({title:state.search||state.status||state.supplier?'조건에 맞는 통보가 없습니다.':external()?'공개된 부적합 통보가 없습니다.':'등록된 외주사 부적합 통보가 없습니다.',description:external()?'우리 회사가 해당 업체에 공개한 통보가 표시됩니다.':'신규 통보 등록 버튼으로 부적합 통보를 시작하세요.'});
    return `<div class="qms-table-scroll"><table class="iq-table"><thead><tr><th>통보번호 / 외주사</th><th>제목 / 대상 품목</th><th>사내 담당자</th><th>Lot / 회신 기한</th><th>상태</th><th>상세</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong class="iq-code">${esc(r.ticketId)}</strong><small>${esc(r.supplier.name+' · '+r.supplier.contact)}</small></td><td><strong>${esc(r.title)}</strong><small>${esc(r.product)} ${esc(r.partNumber)}</small></td><td>${esc(r.owner)}<small>${esc(r.department)}</small></td><td>${esc(r.lotNo||'Lot 미확인')}<small>${esc(r.dueDate)}</small>${overdue(r)?'<span class="qms-status-chip qms-tone-danger">회신 기한 초과</span>':''}</td><td>${badge(r)}</td><td><button class="btn btn-secondary btn-sm" onclick="supplierNoticeOpen('detail','${r.ticketId}')">보기</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function listView() {
    const items=state.items||[],metrics=[{label:'총 통보',value:items.length,tone:'info'},{label:'회신 대기 / 추가 요청',value:items.filter(r=>['Issued','RevisionRequested'].includes(r.status)).length,tone:'warn'},{label:'회신 접수 / 검토',value:items.filter(r=>['Responded','UnderReview'].includes(r.status)).length,tone:'info'},{label:'종결',value:items.filter(r=>r.status==='Closed').length,tone:'success'}];
    return `<div class="iq-metrics">${metrics.map(renderQmsMetric).join('')}</div><section class="iq-card"><form class="iq-filters" onsubmit="event.preventDefault()" oninput="supplierNoticeFilter(this)"><label>검색<input name="search" value="${esc(state.search)}" placeholder="통보번호, 제목, 품번, Lot, 담당자"></label>${!external()?`<label>외주사<select name="supplier"><option value="">전체 외주사</option>${MASTER_SUPPLIERS.map(s=>`<option value="${s.id}" ${state.supplier===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`:''}<label>상태<select name="status"><option value="">전체 상태</option>${Object.entries(labels).filter(([k])=>!external()||k!=='Draft').map(([k,v])=>`<option value="${k}" ${state.status===k?'selected':''}>${v}</option>`).join('')}</select></label><button type="button" class="btn btn-secondary" onclick="resetSupplierNoticeFilters()">초기화</button></form><div id="supplierNoticeTable">${tableView()}</div></section>`;
  }
  function management(r) {
    if(!write())return '';
    const next={Draft:['publish'],Responded:['review'],UnderReview:['requestRevision','close'],Closed:['reopen']};
    if(r.status==='Closed'&&!review())return '';
    return `<details class="iq-manage" open><summary>통보·회신 검토 관리</summary><form id="supplierNoticeManageForm" onsubmit="handleSupplierNoticeManage(event)"><div class="iq-form-grid">
    ${r.status!=='Closed'?field('사내 담당자','owner',r.owner,{required:true})+field('회신 기한','dueDate',r.dueDate,{required:true,type:'date'})+caseField(r.linkedCaseId):''}
    ${field('관리 작업','action',r.status==='Closed'?'reopen':'note',{choices:[...(r.status!=='Closed'?[['note',actionLabels.note]]:[]),...(review()?(next[r.status]||[]).map(a=>[a,actionLabels[a]]):[])]})}
    ${r.status==='UnderReview'?field('종결 검증 결과 (종결 선택 시 필수)','validationResult','',{wide:true,area:true}):''}${field('통보 / 검토 의견','comment','',{required:true,wide:true,area:true})}${r.status!=='Closed'?filesField():''}</div>
    <div class="iq-note">외주사 공개는 해당 업체의 수신함에 게시하는 작업입니다. 이메일 자동 발송은 꺼져 있습니다. 종결에는 품질 담당자의 검증 결과와 회신 또는 검증 Evidence 원본이 필요합니다.</div><p class="iq-error sn-form-error" role="alert"></p><div class="iq-actions"><button class="btn btn-primary" type="submit">관리 내용 저장</button></div></form></details>`;
  }
  function replyForm(r) {
    if(!['Issued','RevisionRequested','Responded'].includes(r.status)||!external()&&!write())return '';
    return `<details class="iq-manage" ${external()?'open':''}><summary>${external()?'외주사 회신 등록':'별도로 받은 외주사 회신 기록'}</summary><form id="supplierNoticeReplyForm" onsubmit="handleSupplierNoticeReply(event)"><div class="iq-form-grid">
    ${!external()?field('실제 회신 경로','responseSource','Email',{required:true,choices:[['Email','이메일 회신'],['Meeting','회의 / 유선 회신'],['Other','기타 경로']]})+field('실제 회신 받은 일시','responseReceivedAt','',{required:true,type:'datetime-local'}):''}
    ${field('외주사 회신 내용','responseSummary','',{required:true,wide:true,area:true})}${field('초동 조치 / 봉쇄','responseContainment','',{wide:true,area:true})}${field('확인된 원인 (미확인이면 빈칸)','rootCause','',{wide:true,area:true})}${field('시정 조치','correctiveAction','',{wide:true,area:true})}${field('재발 방지','preventiveAction','',{wide:true,area:true})}${field('외주사 조치 예정일','actionDueDate','',{type:'date'})}${filesField()}</div>
    <div class="iq-note">${external()?'현재 로그인한 외주사 담당자의 회신으로 기록됩니다.':'사내 담당자가 별도로 수신한 내용을 기록합니다. 외주사 직접 회신과 구분해 이력을 남깁니다.'} 회신 등록으로 종결되지는 않습니다.</div><p class="iq-error sn-form-error" role="alert"></p><div class="iq-actions"><button class="btn btn-primary" type="submit">회신 기록 저장</button></div></form></details>`;
  }
  function detailView() {
    const r=selected();if(!r)return renderQmsEmpty({title:'통보 내용을 불러오는 중입니다.'});
    return `<section class="iq-card"><div class="iq-card-heading"><div><span class="iq-code">${esc(r.ticketId)}</span><h2>${esc(r.title)}</h2></div>${badge(r)}</div>
    <dl class="iq-info-grid">${info('통보 대상 / 담당자',r.supplier.name+' · '+r.supplier.contact)}${info('외주사 이메일',r.supplier.email)}${info('사내 주관 / 담당자',r.department+' · '+r.owner)}${info('회신 기한',r.dueDate)}${info('제품 / 품번',(r.product||'미확인')+' / '+(r.partNumber||'미확인'))}${info('Lot No.',r.lotNo)}${info('생산 Site / 확인 공정',(r.site||'미확인')+' / '+(r.process||'미확인'))}${info('발생 일시',r.occurredAt.replace('T',' '))}${info('검사 / 불량 수량',(r.inputQty??'미확인')+' / '+(r.defectQty??'미확인')+' ea')}${info('위험도',r.severity==='Unknown'?'미확정':r.severity)}${info('등록자 / 등록일',r.createdBy.name+' · '+date(r.createdAt))}${info('외주사 공개일',r.issuedAt?date(r.issuedAt):'공개 전')}</dl>
    ${info('확인된 부적합 / 통보 내용',r.description)}${info('현재 초동 조치 / 봉쇄',r.containment)}${info('외주사 요청 사항',r.requestedAction)}${r.linkedCaseId?info('기존 8D Case 참조',r.linkedCaseId):''}
    <h3>외주사 회신 (${r.responses.length})</h3>${r.responses.length?r.responses.map(v=>`<details class="iq-manage" open><summary>${esc(date(v.receivedAt))} · ${esc({Portal:'외주사 직접 회신',Email:'이메일 회신 사내 기록',Meeting:'회의 / 유선 사내 기록',Other:'기타 경로 사내 기록'}[v.source])}</summary>${info('회신 내용',v.responseSummary)}${info('초동 조치',v.responseContainment)}${info('확인된 원인',v.rootCause)}${info('시정 조치',v.correctiveAction)}${info('재발 방지',v.preventiveAction)}${info('조치 예정일',v.actionDueDate)}${info('실제 기록자',v.recordedBy.name+' · '+v.recordedBy.dept)}</details>`).join(''):info('회신 상태','등록된 회신이 없습니다.')}
    ${r.validationResult?info('종결 검증 결과',r.validationResult):''}${r.status==='Closed'?info('종결 확인',r.closedBy.name+' · '+date(r.closedAt)):''}
    <h3>Evidence 원본 (${r.files.length})</h3><ul class="iq-file-list">${r.files.length?r.files.map(f=>`<li><a href="${API}/${r.ticketId}/files/${f.id}" download>${esc(f.name)}</a><small>${esc({Notice:'통보 근거',Response:'외주사 회신',Review:'사내 검토'}[f.phase])} · ${(f.size/1024).toFixed(1)} KB · ${esc(f.uploadedBy.name)}</small></li>`).join(''):'<li>첨부된 원본이 없습니다. 등록·회신·검토 화면에서 첨부할 수 있습니다.</li>'}</ul>
    ${replyForm(r)}${management(r)}<h3>통보·회신·검토 이력</h3><ol class="iq-history">${[...r.history].reverse().map(h=>`<li><div><strong>${esc(h.actor.name+' · '+h.actor.dept)}</strong><span>${esc(labels[h.status])} · ${esc(date(h.at))}</span></div><p>${esc(h.comment)}</p></li>`).join('')}</ol><div class="iq-actions"><button class="btn btn-secondary" onclick="supplierNoticeOpen('list')">목록</button>${write()&&r.status==='Draft'?`<button class="btn btn-secondary" onclick="supplierNoticeEdit('${r.ticketId}')">통보 내용 수정</button>`:''}</div></section>`;
  }
  function renderSupplierNoticesView() {
    actorScope();queueMicrotask(()=>load());
    return `<div class="internal-quality-workspace">${renderQmsPageHeader({title:external()?'받은 부적합 통보':'외주사 부적합 통보 관리',icon:'send',description:external()?'우리 회사가 해당 업체에 공개한 부적합 통보를 확인하고 회신·조치 자료를 등록합니다.':'우리 회사에서 외주사로 통보하는 부적합의 근거·회신 기한·조치·검토·종결을 관리합니다.',badges:[{label:'우리 회사 → 외주사',tone:'info'}],actions:`<button class="btn btn-secondary" onclick="refreshSupplierNotices()">새로 불러오기</button>${write()?'<button class="btn btn-primary" onclick="supplierNoticeNew()">+ 신규 통보 등록</button>':''}`})}
    <div class="iq-note">${external()?'현재 로그인한 업체에 공개된 통보만 표시됩니다.':'이 화면의 통보와 첨부 원본은 중앙 서버에 저장됩니다. 외주사에서 보내는 PCN·Issue 접수와 별도로 관리합니다.'} 이메일 자동 발송은 꺼져 있습니다.</div>${state.message?`<div class="iq-success" role="status">${esc(state.message)}</div>`:''}${['new','edit'].includes(state.screen)?formView():state.screen==='detail'?detailView():listView()}</div>`;
  }
  function supplierNoticeCapture(form) {state.draft=Object.fromEntries(new FormData(form));const node=document.getElementById('supplierNoticeContact');if(node)node.innerHTML=contact(state.draft.supplierId);}
  function supplierNoticeOpen(screen,id='') {state.screen=screen;state.selected=id;state.message='';renderCurrentView();}
  function supplierNoticeFilter(form) {const v=Object.fromEntries(new FormData(form));Object.assign(state,{search:v.search||'',status:v.status||'',supplier:v.supplier||''});document.getElementById('supplierNoticeTable').innerHTML=tableView();}
  async function readFiles(form) {const files=[...(form.querySelector('[name=evidence]')?.files||[])];if(files.length>10||files.reduce((n,f)=>n+f.size,0)>30*1024*1024)throw new Error('첨부는 최대 10개, 합계 30 MB까지 가능합니다.');return Promise.all(files.map(f=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({filename:f.name,dataUrl:reader.result});reader.onerror=()=>reject(new Error('첨부 원본을 읽지 못했습니다.'));reader.readAsDataURL(f);})))}
  function put(record) {state.items=[record,...(state.items||[]).filter(r=>r.ticketId!==record.ticketId)];state.selected=record.ticketId;state.screen='detail';state.message='저장 완료 · '+labels[record.status];}
  async function sendForm(event,kind) {
    event.preventDefault();const actor=user()?.username;const form=event.target,button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
    try {if(!form.reportValidity())return;const values=Object.fromEntries(new FormData(form)),files=await readFiles(form),r=selected();if(user()?.username!==actor)return;let body={...values,files},url=API;
      if(kind==='create'){const editing=state.screen==='edit';for(const k of ['inputQty','defectQty'])body[k]=values[k]===''?null:Number(values[k]);if(editing){url+='/'+r.ticketId;Object.assign(body,{action:'edit',expectedRevision:r.revision});}}
      else {url+='/'+r.ticketId;body.expectedRevision=r.revision;if(kind==='reply'){body.action=external()?'reply':'recordReply';body.comment=values.responseSummary;}}
      const result=await QMSApi.request(url,{method:'POST',body});if(user()?.username!==actor||state.actor!==actor)return;put(result.record);if(kind==='create')state.draft={};if(current())renderCurrentView();
    } catch(error) {form.querySelector('.sn-form-error').textContent=error.message;}
    finally {button.disabled=false;}
  }
  Object.assign(global,{renderSupplierNoticesView,supplierNoticeCapture,supplierNoticeOpen,supplierNoticeFilter,
    supplierNoticeNew:()=>{state.screen='new';state.selected='';state.message='';renderCurrentView();},
    supplierNoticeEdit:id=>{const r=(state.items||[]).find(v=>v.ticketId===id);state.draft={...r,supplierId:r.supplier.id};supplierNoticeOpen('edit',id);},
    refreshSupplierNotices:()=>load(true),resetSupplierNoticeFilters:()=>{Object.assign(state,{search:'',status:'',supplier:''});renderCurrentView();},
    handleSupplierNoticeSubmit:event=>sendForm(event,'create'),handleSupplierNoticeManage:event=>sendForm(event,'manage'),handleSupplierNoticeReply:event=>sendForm(event,'reply')});
})(window);
