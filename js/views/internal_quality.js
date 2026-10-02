/* Internal registers: authenticated server records, no automatic decisions. */
(function(global){
'use strict';
const statuses={Submitted:'접수',UnderReview:'검토 중',InProgress:'조치 중',Closed:'종결',Approved:'승인',Implemented:'적용 완료',Rejected:'반려'};
const tones={Submitted:'info',UnderReview:'warn',InProgress:'warn',Closed:'success',Approved:'success',Implemented:'success',Rejected:'danger'};
const cache={Issue:{},PCN:{}};
const ui={Issue:{screen:'list',search:'',status:'',draft:{}},PCN:{screen:'list',search:'',status:'',draft:{}}};
const esc=value=>qmsUiEscape(value??'');
const user=()=>QMSApi.getState().user;
const kindNow=()=>appData.currentView==='internal-pcn'?'PCN':'Issue';
const isCurrent=kind=>appData.currentView===(kind==='PCN'?'internal-pcn':'internal-issues');
const title=kind=>kind==='PCN'?'내부 PCN 변경 관리':'내부 Issue·부적합 관리';
const canWrite=()=>!user()?.isSupplier&&(user()?.roles||[]).some(r=>['system_admin','quality_reviewer','case_facilitator','stage_drafter','stage_leader','stage_champion','customer_dispatcher'].includes(r));
const canReview=()=>!user()?.isSupplier&&(user()?.roles||[]).some(r=>['system_admin','quality_reviewer'].includes(r));
const date=value=>value?new Date(value).toLocaleString('ko-KR',{hour12:false}):'—';
const badge=record=>`<span class="qms-status-chip qms-tone-${tones[record.status]||'neutral'}">${esc(statuses[record.status]||record.status)}</span>`;
function rerender(kind){if(isCurrent(kind))renderCurrentView();}
async function load(kind,force=false){
 const entry=cache[kind],actor=user()?.username;
 if(!actor||user()?.isSupplier)return;
 if(entry.actor!==actor){Object.keys(entry).forEach(k=>delete entry[k]);entry.actor=actor;ui[kind].screen='list';ui[kind].selected=null;ui[kind].draft={};}
 if(entry.loading||entry.loaded&&!force)return;
 entry.loading=true;entry.error='';
 try{const result=await QMSApi.request('/__api__/qms/internal-quality?kind='+kind);if(user()?.username!==actor)return;entry.items=result.items||[];entry.loaded=true;}
 catch(error){entry.error=error.message;entry.loaded=true;}
 finally{entry.loading=false;rerender(kind);}
}
function internalQualityOpen(screen,id){const kind=kindNow();ui[kind].screen=screen;ui[kind].selected=id||null;ui[kind].message='';renderCurrentView();}
function internalQualityCapture(form){const kind=kindNow(),data=new FormData(form);const values=Object.fromEntries(data);values.change4M=data.getAll('change4M');if(ui[kind].screen==='edit')ui[kind].editDraft=values;else ui[kind].draft=values;}
function field(label,name,value='',options={}){
 const {required=false,type='text',wide=false,textarea=false,choices=null,readonly=false}=options;
 const common=`name="${name}" ${required?'required':''} ${readonly?'readonly':''}`;
 let control;
 if(choices)control=`<select ${common}>${choices.map(([v,t])=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
 else if(textarea)control=`<textarea ${common} rows="3" maxlength="8000">${esc(value)}</textarea>`;
 else control=`<input ${common} type="${type}" value="${esc(value)}" ${type==='number'?'min="0" step="1"':'maxlength="240"'}>`;
 return `<label class="iq-field ${wide?'iq-wide':''}"><span>${esc(label)}${required?' <b aria-label="필수">*</b>':''}</span>${control}</label>`;
}
function filesField(){return `<label class="iq-field iq-wide"><span>Evidence 원본 첨부</span><input type="file" name="evidence" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.xlsx,.xls,.csv,.docx,.eml,.txt"><small>사진·PDF·측정 자료·메일 등 최대 10개, 합계 30 MB. 저장 후 원본을 내려받을 수 있습니다.</small></label>`;}
function formView(kind){
 const state=ui[kind],editing=state.screen==='edit',rec=editing?(cache[kind].items||[]).find(r=>r.ticketId===state.selected):null;
 const f=editing?{...rec,...state.editDraft}:state.draft;
 return `<section class="iq-card"><div class="iq-card-heading"><h2>${editing?'접수 내용 수정':'신규 '+(kind==='PCN'?'내부 PCN':'내부 Issue·부적합')+' 등록'}</h2><span class="qms-status-chip qms-tone-neutral">${editing?esc(rec.ticketId):'로그인 계정으로 접수'}</span></div>
 <form id="internalQualityForm" onsubmit="handleInternalQualitySubmit(event)" oninput="internalQualityCapture(this)" onchange="internalQualityCapture(this)">
 <div class="iq-form-grid">
 ${field('제목','title',f.title,{required:true,wide:true})}
 ${field('주관 부서','department',f.department||user()?.dept||'',{required:true})}${field('조치 / 적용 담당자','owner',f.owner)}
 ${field('생산 Site','site',f.site,{choices:[['','선택 / 해당 없음'],...['TechL Vina','Winpac','SSPC','Ramos 3Camp'].map(v=>[v,v])]})}${field('공정 / 발생 위치','process',f.process)}
 ${field('대상 제품','product',f.product)}${field('품번 (P/N)','partNumber',f.partNumber)}${field('Lot No.','lotNo',f.lotNo)}${field('관리 기한','dueDate',f.dueDate,{type:'date'})}
 ${kind==='Issue'?`${field('접수 구분','issueType',f.issueType||'Issue',{required:true,choices:[['Issue','내부 Issue'],['Nonconformance','내부 부적합']]})}${field('발생 일시','occurredAt',f.occurredAt,{required:true,type:'datetime-local'})}${field('검사 / 대상 수량 (ea)','inputQty',f.inputQty??'',{type:'number'})}${field('불량 수량 (ea)','defectQty',f.defectQty??'',{type:'number'})}`:''}
 ${field(kind==='PCN'?'변경 요청 개요':'발생 내용 / 확인된 현상','description',f.description,{required:true,wide:true,textarea:true})}
 ${kind==='Issue'?field('초동 조치 / 봉쇄 내용','containment',f.containment,{wide:true,textarea:true}):`
 <fieldset class="iq-wide iq-fourm"><legend>4M 변경 구분 *</legend>${[['Man','인원'],['Machine','설비'],['Material','자재'],['Method','방법 / 공정']].map(([v,t])=>`<label><input type="checkbox" name="change4M" value="${v}" ${(f.change4M||[]).includes(v)?'checked':''}>${t}</label>`).join('')}</fieldset>
 ${field('변경 전','beforeChange',f.beforeChange,{required:true,textarea:true})}${field('변경 후','afterChange',f.afterChange,{required:true,textarea:true})}
 ${field('변경 사유','changeReason',f.changeReason,{required:true,wide:true,textarea:true})}${field('시험 / 신뢰성 검증 계획','validationPlan',f.validationPlan,{required:true,wide:true,textarea:true})}
 ${field('적용 예정일','plannedDate',f.plannedDate,{required:true,type:'date'})}${field('고객 통보 필요 여부 (검토용)','customerNotice',f.customerNotice||'Unknown',{choices:[['Unknown','검토 필요'],['Required','통보 필요'],['NotRequired','통보 불필요']]})}`}
 ${editing?field('수정 사유','comment','',{required:true,wide:true,textarea:true}):''}${filesField()}
 </div><div class="iq-note">확인된 정보만 입력하세요. 미확인 수량은 빈칸으로 두며, 접수만으로 승인·조치 완료가 기록되지 않습니다.</div>
 <p id="internalQualityError" class="iq-error" role="alert"></p>
 <div class="iq-actions"><button type="button" class="btn btn-secondary" onclick="internalQualityOpen('list')">목록</button><button class="btn btn-primary" type="submit">${editing?'수정 내용 저장':'접수 등록'}</button></div></form></section>`;
}
function tableView(kind){
 const state=ui[kind],entry=cache[kind];
 if(entry.loading||!entry.loaded)return renderQmsEmpty({title:'내부 접수 기록을 불러오는 중입니다.',icon:'loader-circle'});
 if(entry.error)return `<div class="iq-error" role="alert">${esc(entry.error)} <button class="btn btn-secondary" onclick="refreshInternalQuality()">다시 불러오기</button></div>`;
 const q=state.search.trim().toLowerCase();
 const rows=(entry.items||[]).filter(r=>(!state.status||r.status===state.status)&&(!q||[r.ticketId,r.title,r.department,r.owner,r.product,r.partNumber,r.lotNo].join(' ').toLowerCase().includes(q)));
 if(!rows.length)return renderQmsEmpty({title:'등록된 '+(kind==='PCN'?'내부 PCN':'내부 Issue·부적합')+' 기록이 없습니다.',description:state.search||state.status?'검색 조건을 변경하거나 초기화해 주세요.':'신규 등록 버튼으로 첫 접수를 시작하세요.'});
 return `<div class="qms-table-scroll"><table class="iq-table"><thead><tr><th>접수번호 / 구분</th><th>제목 / 대상 품목</th><th>주관 부서 / 담당자</th><th>Site / Lot</th><th>${kind==='PCN'?'적용 예정일':'발생 일시'}</th><th>상태</th><th>상세</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong class="iq-code">${esc(r.ticketId)}</strong><small>${kind==='PCN'?'내부 PCN':r.issueType==='Nonconformance'?'내부 부적합':'내부 Issue'}</small></td><td><strong>${esc(r.title)}</strong><small>${esc(r.product||'품목 미지정')} ${esc(r.partNumber)}</small></td><td>${esc(r.department)}<small>${esc(r.owner||'담당자 미지정')}</small></td><td>${esc(r.site||'—')}<small>${esc(r.lotNo||'Lot 미지정')}</small></td><td>${esc(kind==='PCN'?r.plannedDate:r.occurredAt.replace('T',' '))}</td><td>${badge(r)}</td><td><button class="btn btn-secondary btn-sm" onclick="internalQualityOpen('detail','${r.ticketId}')">보기</button></td></tr>`).join('')}</tbody></table></div>`;
}
function internalQualityFilter(form){const state=ui[kindNow()];state.search=form.querySelector('[name=search]').value;state.status=form.querySelector('[name=status]').value;document.getElementById('internalQualityTable').innerHTML=tableView(kindNow());}
function listView(kind){
 const records=cache[kind].items||[],state=ui[kind];
 const metrics=[{label:'총 접수',value:records.length,note:kind==='PCN'?'내부 변경 요청':'내부 Issue 및 부적합',tone:'info'}, {label:'접수 / 검토',value:records.filter(r=>['Submitted','UnderReview'].includes(r.status)).length,note:'담당자 확인 필요',tone:'warn'}, {label:kind==='PCN'?'승인 / 적용 완료':'조치 / 종결',value:records.filter(r=>(kind==='PCN'?['Approved','Implemented']:['InProgress','Closed']).includes(r.status)).length,note:'이력과 검증 결과 확인',tone:'success'}, {label:'반려',value:records.filter(r=>r.status==='Rejected').length,note:'보완 후 재접수 가능',tone:'danger'}];
 return `<div class="iq-metrics">${metrics.map(renderQmsMetric).join('')}</div><section class="iq-card"><form class="iq-filters" onsubmit="event.preventDefault()" oninput="internalQualityFilter(this)"><label>검색<input name="search" value="${esc(state.search)}" placeholder="제목, 품번, Lot, 담당자"></label><label>상태<select name="status"><option value="">전체 상태</option>${Object.entries(statuses).filter(([k])=>kind==='PCN'?!['InProgress','Closed'].includes(k):!['Approved','Implemented'].includes(k)).map(([k,v])=>`<option value="${k}" ${state.status===k?'selected':''}>${v}</option>`).join('')}</select></label><button class="btn btn-secondary" type="button" onclick="resetInternalQualityFilter()">초기화</button></form><div id="internalQualityTable">${tableView(kind)}</div></section>`;
}
function item(label,value){return `<div class="iq-info"><dt>${esc(label)}</dt><dd>${esc(value||'미등록')}</dd></div>`;}
function detailView(kind){
 const state=ui[kind],r=(cache[kind].items||[]).find(x=>x.ticketId===state.selected);if(!r)return renderQmsEmpty({title:'기록을 불러오는 중이거나 찾을 수 없습니다.'});
 const next=kind==='PCN'?{Submitted:['UnderReview','Rejected'],UnderReview:['Approved','Rejected'],Approved:['Implemented'],Rejected:['Submitted'],Implemented:[]}:{Submitted:['UnderReview','Rejected'],UnderReview:['InProgress','Rejected'],InProgress:['Closed','UnderReview'],Rejected:['Submitted'],Closed:['UnderReview']};
 return `<section class="iq-card"><div class="iq-card-heading"><div><span class="iq-code">${esc(r.ticketId)}</span><h2>${esc(r.title)}</h2></div>${badge(r)}</div><dl class="iq-info-grid">${item('주관 부서 / 담당자',r.department+' / '+(r.owner||'미지정'))}${item('생산 Site / 공정',(r.site||'해당 없음')+' / '+(r.process||'미등록'))}${item('제품 / 품번',(r.product||'미등록')+' / '+(r.partNumber||'미등록'))}${item('Lot No.',r.lotNo)}${item('등록자',r.createdBy.name+' · '+r.createdBy.dept)}${item('등록일',date(r.createdAt))}${kind==='Issue'?item('접수 구분 / 발생 일시',(r.issueType==='Nonconformance'?'내부 부적합':'내부 Issue')+' / '+r.occurredAt.replace('T',' '))+item('검사 / 불량 수량',(r.inputQty??'미확인')+' / '+(r.defectQty??'미확인')+' ea'):item('4M 변경',r.change4M.join(', '))+item('적용 예정일',r.plannedDate)}</dl>
 ${item(kind==='Issue'?'발생 내용':'변경 개요',r.description)}${kind==='Issue'?item('초동 조치 / 봉쇄',r.containment):`<dl class="iq-info-grid">${item('변경 전',r.beforeChange)}${item('변경 후',r.afterChange)}</dl>${item('변경 사유',r.changeReason)}${item('검증 계획',r.validationPlan)}${item('고객 통보 검토',{Unknown:'검토 필요',Required:'통보 필요',NotRequired:'통보 불필요'}[r.customerNotice]||'미등록')}`}
 ${item('검증 결과',r.validationResult)}${r.implementedDate?item('실제 적용일',r.implementedDate):''}
 <h3>Evidence 원본 (${r.files.length})</h3><ul class="iq-file-list">${r.files.length?r.files.map(f=>`<li><a href="/__api__/qms/internal-quality/${r.ticketId}/files/${f.id}" download>${esc(f.name)}</a><small>${(f.size/1024).toFixed(1)} KB · ${esc(f.uploadedBy.name)}</small></li>`).join(''):'<li>첨부된 원본이 없습니다. 아래에서 Evidence를 추가할 수 있습니다.</li>'}</ul>
 ${canWrite()?`<details class="iq-manage" open><summary>담당자·조치·검토 관리</summary><form id="internalQualityUpdateForm" onsubmit="handleInternalQualityUpdate(event)"><div class="iq-form-grid">${field('담당자','owner',r.owner)}${field('관리 기한','dueDate',r.dueDate,{type:'date'})}
 ${field('8D Case 연결 (선택)','linkedCaseId',r.linkedCaseId,{wide:true,choices:[['','연결하지 않음'],...(appData.cases||[]).map(c=>[c.id,c.id+' · '+(c.claimTitle||c.customer||'')])]})}
 ${field('검증 결과 / 확인 내용','validationResult',r.validationResult,{wide:true,textarea:true,readonly:['Approved','Implemented','Closed'].includes(r.status)})}${kind==='PCN'?field('실제 적용일 (승인 후 입력)','implementedDate',r.implementedDate,{type:'date'}):''}
 ${field('관리 작업','nextStatus','note',{choices:[['note','상태 유지 · 관리 내용 저장'],...(canReview()?(next[r.status]||[]).map(k=>[k,statuses[k]+'으로 변경']):[])]})}
 ${field('조치 / 검토 의견','comment','',{required:true,wide:true,textarea:true})}${filesField()}</div>
 <div class="iq-note">${canReview()?'검토 상태는 현재 로그인한 품질 검토자의 이름으로 기록됩니다.':'상태 변경은 품질 검토 권한이 있는 담당자가 수행합니다.'} ${kind==='PCN'?'PCN 승인은 내부 승인입니다. 고객 승인·양산 적용·8D 승인은 별도로 확인해야 합니다.':'종결에는 검증 결과와 원본 Evidence가 필요합니다.'} 8D 연결은 기존 Case 참조를 기록합니다.</div><p class="iq-error" id="internalQualityError" role="alert"></p><div class="iq-actions"><button class="btn btn-primary" type="submit">관리 내용 저장</button></div></form></details>`:''}
 <h3>접수·검토 이력</h3><ol class="iq-history">${[...r.history].reverse().map(h=>`<li><div><strong>${esc(h.actor.name)} · ${esc(h.actor.dept)}</strong><span>${esc(statuses[h.status]||h.status)} · ${esc(date(h.at))}</span></div><p>${esc(h.comment)}</p></li>`).join('')}</ol>
 <div class="iq-actions"><button class="btn btn-secondary" onclick="internalQualityOpen('list')">목록</button>${canWrite()&&['Submitted','Rejected'].includes(r.status)?`<button class="btn btn-secondary" onclick="editInternalQuality('${r.ticketId}')">접수 내용 수정</button>`:''}</div></section>`;
}
function renderInternalQualityView(kind){
 if(user()?.isSupplier)return renderQmsEmpty({title:'내부 기록 접근 권한이 없습니다.'});
 queueMicrotask(()=>load(kind));
 const state=ui[kind];
 return `<div class="internal-quality-workspace">${renderQmsPageHeader({title:title(kind),icon:kind==='PCN'?'git-pull-request':'clipboard-check',description:kind==='PCN'?'사내 변경 요청의 전후 조건·검증·승인·실제 적용 이력을 관리합니다.':'사내 공정·검사·재고·업무에서 발생한 Issue와 부적합의 조치 및 종결 이력을 관리합니다.',badges:[{label:'사내 관리',tone:'info'}],actions:`<button class="btn btn-secondary" onclick="refreshInternalQuality()">새로 불러오기</button>${canWrite()?'<button class="btn btn-primary" onclick="newInternalQuality()">+ 신규 등록</button>':''}`})}
 ${state.message?`<div class="iq-success" role="status">${esc(state.message)}</div>`:''}
 ${state.screen==='new'||state.screen==='edit'?formView(kind):state.screen==='detail'?detailView(kind):listView(kind)}</div>`;
}
async function readFiles(form){const files=[...(form.querySelector('[name=evidence]')?.files||[])];if(files.length>10||files.reduce((s,f)=>s+f.size,0)>30*1024*1024)throw new Error('첨부는 최대 10개, 합계 30 MB까지 가능합니다.');return Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({filename:file.name,dataUrl:reader.result});reader.onerror=()=>reject(new Error('첨부 원본을 읽지 못했습니다.'));reader.readAsDataURL(file);})))}
function errorForm(error,form){form.querySelector('#internalQualityError').textContent=error.message;}
function put(kind,record){cache[kind].items=[record,...(cache[kind].items||[]).filter(r=>r.ticketId!==record.ticketId)];cache[kind].loaded=true;ui[kind].selected=record.ticketId;ui[kind].screen='detail';ui[kind].message='저장 완료 · '+record.ticketId;}
async function handleInternalQualitySubmit(event){
 event.preventDefault();const form=event.target,kind=kindNow(),state=ui[kind],button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
 try{if(!form.reportValidity())return;internalQualityCapture(form);const data={...(state.screen==='edit'?state.editDraft:state.draft),kind,files:await readFiles(form)};for(const key of ['inputQty','defectQty'])data[key]=data[key]===''||data[key]==null?null:Number(data[key]);
 const editing=state.screen==='edit',record=(cache[kind].items||[]).find(r=>r.ticketId===state.selected);if(editing)Object.assign(data,{action:'edit',expectedRevision:record.revision});
 const result=await QMSApi.request('/__api__/qms/internal-quality'+(editing?'/'+record.ticketId:''),{method:'POST',body:data});if(editing)state.editDraft={};else state.draft={};put(kind,result.record);rerender(kind);
 }catch(error){errorForm(error,form)}finally{button.disabled=false;}
}
async function handleInternalQualityUpdate(event){
 event.preventDefault();const form=event.target,kind=kindNow(),record=(cache[kind].items||[]).find(r=>r.ticketId===ui[kind].selected),button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
 try{if(!form.reportValidity())return;const values=Object.fromEntries(new FormData(form)),target=values.nextStatus;
 const result=await QMSApi.request('/__api__/qms/internal-quality/'+record.ticketId,{method:'POST',body:{...values,action:target==='note'?'note':'status',status:target,expectedRevision:record.revision,files:await readFiles(form)}});put(kind,result.record);rerender(kind);
 }catch(error){errorForm(error,form)}finally{button.disabled=false;}
}
Object.assign(global,{renderInternalQualityView,internalQualityOpen,internalQualityCapture,internalQualityFilter,handleInternalQualitySubmit,handleInternalQualityUpdate,
 newInternalQuality:()=>{const kind=kindNow();ui[kind].screen='new';ui[kind].selected=null;ui[kind].message='';renderCurrentView()},
 editInternalQuality:id=>{ui[kindNow()].editDraft={};internalQualityOpen('edit',id)},
 refreshInternalQuality:()=>load(kindNow(),true),resetInternalQualityFilter:()=>{const s=ui[kindNow()];s.search='';s.status='';renderCurrentView()}});
})(window);
