/* One-time reset authorized by the user on 2026-10-02. Never clear new records. */
(() => {
  const marker='RAMOS_CLEAN_START_20261002';
  const archiveKey='RAMOS_RECOVERY_BEFORE_CLEAN_START_20261002';
  try {
    if (localStorage.getItem(marker)==='done') return;
    const legacyKeys=Object.keys(localStorage).filter(key =>
      /^AI_QMS_8D_DATA_V[3-9](?:_|$)/.test(key) || key==='RAMOS_SUPPLIER_RECORDS_V2');
    const archive={at:new Date().toISOString(),local:{},session:{}};
    legacyKeys.forEach(key => archive.local[key]=localStorage.getItem(key));
    const draftKey='RAMOS_INTAKE_FORM_DRAFT_V1';
    const draft=sessionStorage.getItem(draftKey);
    if (draft!==null) archive.session[draftKey]=draft;
    // Save recovery copies before removing only the old business record keys.
    if (!localStorage.getItem(archiveKey)) localStorage.setItem(archiveKey,JSON.stringify(archive));
    legacyKeys.forEach(key => localStorage.removeItem(key));
    sessionStorage.removeItem(draftKey);
    localStorage.setItem(marker,'done');
  } catch (error) {
    console.warn('Legacy recovery data retained; clean workspace uses separate keys:',error);
  }
})();
