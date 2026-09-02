/* CNMI Blood Component QC · Platelet module v4.8.0 - plain JS / Supabase */
(() => {
  'use strict';
  const C = window.APP_CONFIG || {};
  const $ = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = v => (v===null||v===undefined||v===''||Number.isNaN(Number(v))) ? null : Number(v);
  const fmt = (v,d=2)=> v===null||v===undefined||v==='' ? '–' : Number(v).toLocaleString('th-TH',{minimumFractionDigits:d,maximumFractionDigits:d});
  const roleTH = r => ({staff:'Staff',reviewer:'Reviewer',admin:'Admin'})[r] || r || '-';
  const statusTH = s => ({draft:'ร่าง/กำลังบันทึก',submitted:'รอตรวจทวน',locked:'LOCK แล้ว'})[s] || s;
  const profileName = id => { const p=state.profiles.find(x=>x.id===id); return p?.display_name || p?.email || (id?'ไม่ทราบผู้ใช้':'–'); };
  const qcTH = s => ({not_qc:'ไม่ใช่รายการ QC',incomplete:'ข้อมูล QC ยังไม่ครบ',pass:'ผ่านเกณฑ์ QC',review:'ต้องตรวจสอบ QC'})[s] || s;
  const purposeTH = p => p==='qc' ? 'ใช้เป็น QC' : 'Prepare ตามปกติ';
  const purposeBadge = p => `<span class="badge ${p==='qc'?'qc-purpose':'prepare-purpose'}">${esc(purposeTH(p))}</span>`;
  const measuredTH = iso => iso ? dateTH(iso) : 'ยังไม่บันทึก';
  const state = { sb:null, session:null, user:null, profile:null, settings:null, productSettings:[], records:[], profiles:[], currentRecordId:null, currentEvidence:[], currentPool:[], lastLoginPassword:null, uiMode:'staff', auditUserFilter:'', resetTargetId:null, showDeletedRecords:false };
  const productSetting = type => state.productSettings.find(x=>x.product_type===type);
  const activeProducts = () => state.productSettings.filter(x=>x.is_active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.product_type.localeCompare(b.product_type));
  const productOptions = selected => activeProducts().map(x=>`<option value="${esc(x.product_type)}" ${selected===x.product_type?'selected':''}>${esc(x.product_type)}</option>`).join('');
  const PLATELET_ROUTES = {
    dashboard:'#/platelet',
    record:'#/platelet/new',
    records:'#/platelet/records',
    settings:'#/platelet/admin',
    audit:'#/platelet/audit'
  };
  function routeForView(v){ return PLATELET_ROUTES[v] || PLATELET_ROUTES.dashboard; }
  function viewFromHash(){
    const h=(location.hash||'').replace(/\/+$/,'');
    if(h==='#/platelet/new') return 'record';
    if(h==='#/platelet/records') return 'records';
    if(h==='#/platelet/admin') return 'settings';
    if(h==='#/platelet/audit') return 'audit';
    return 'dashboard';
  }
  function isKnownPlateletRoute(){
    const h=(location.hash||'').replace(/\/+$/,'');
    return !h || h==='#' || Object.values(PLATELET_ROUTES).includes(h);
  }
  function normalizePlateletRoute(){
    if(!isKnownPlateletRoute()) history.replaceState(null,'',location.pathname+location.search+PLATELET_ROUTES.dashboard);
    else if(!location.hash || location.hash==='#') history.replaceState(null,'',location.pathname+location.search+PLATELET_ROUTES.dashboard);
  }

  function showToast(msg,type='') { const t=$('#toast'); t.textContent=msg; t.className=`toast show ${type}`; clearTimeout(showToast._t); showToast._t=setTimeout(()=>t.className='toast',3500); }
  function errText(e){ return e?.message || String(e || 'เกิดข้อผิดพลาด'); }
  function bangkokISO(inputValue){ return inputValue ? new Date(inputValue+':00+07:00').toISOString() : null; }
  function inputFromISO(iso){ if(!iso) return ''; const d=new Date(iso); const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d); const m=Object.fromEntries(parts.map(x=>[x.type,x.value])); return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`; }
  function dateTH(iso,withTime=true){ if(!iso) return '–'; return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',...(withTime?{timeStyle:'short'}:{})}).format(new Date(iso)); }
  function sameBangkokDate(a,b){ return a&&b && inputFromISO(a).slice(0,10)===inputFromISO(b).slice(0,10); }
  function firstOfMonthISO(){ const now=new Date(); return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(); }
  function cfgReady(){ return C.SUPABASE_URL && C.SUPABASE_KEY && !C.SUPABASE_URL.includes('PASTE_') && !C.SUPABASE_KEY.includes('PASTE_'); }
  async function logActivity(action,entityType='system',recordId=null,detail={}){
    if(!state.sb||!state.user||!state.profile||state.profile.must_change_password) return;
    const payload={app_version:'4.8.0',ui_mode:state.uiMode,...detail};
    const {error}=await state.sb.rpc('log_activity',{p_action:action,p_entity_type:entityType,p_record_id:recordId,p_detail:payload});
    if(error) console.warn('activity log failed',error);
  }
  async function invokeAdminUsers(body){
    const {data,error}=await state.sb.functions.invoke('admin-users',{body});
    if(error){
      let msg=error.message||'เรียก Admin function ไม่สำเร็จ';
      try{ if(error.context){ const j=await error.context.clone().json(); if(j?.error) msg=j.error; } }catch(_e){}
      throw new Error(msg);
    }
    if(data?.error) throw new Error(data.error);
    return data;
  }
  function actionTH(a){
    const m={login:'เข้าสู่ระบบ',logout:'ออกจากระบบ',ui_mode_change:'สลับโหมด',view_record:'เปิดดูรายการ',export_csv:'Export CSV',create_user:'สร้างบัญชีผู้ใช้',reset_password:'Reset password',update_profile:'แก้ข้อมูล/สิทธิ์ผู้ใช้',update_qc_settings:'แก้เกณฑ์ QC',update_product_settings:'แก้น้ำหนักถุง/Density',password_changed:'เปลี่ยนรหัสผ่าน',create:'สร้างรายการ',update:'แก้ไขรายการ',admin_edit:'Admin แก้ไขรายการ',admin_delete:'Admin ลบรายการ',admin_restore:'Admin กู้คืนรายการ',insert:'เพิ่มข้อมูล',delete:'ลบข้อมูล'};
    if(m[a]) return m[a];
    if(a?.startsWith('status:draft→submitted')) return 'ส่งตรวจทวน';
    if(a?.startsWith('status:submitted→locked')) return 'ตรวจทวนและ LOCK';
    if(a?.startsWith('status:locked→draft')) return 'ปลดล็อก / Revision ใหม่';
    return a||'-';
  }
  function effectiveRole(){
    if(!state.profile) return 'staff';
    if(state.profile.role==='admin' && state.uiMode==='staff') return 'staff';
    return state.profile.role;
  }
  function reviewerUi(){ return ['reviewer','admin'].includes(effectiveRole()); }
  function adminUi(){ return effectiveRole()==='admin'; }
  function activeView(){ return $('#mainTabs button.active')?.dataset.view || 'dashboard'; }
  function closeSidebar(){ $('#sideNav')?.classList.remove('open'); $('#sidebarBackdrop')?.classList.add('hidden'); $('#mobileMenuBtn')?.setAttribute('aria-expanded','false'); }
  function openSidebar(){ $('#sideNav')?.classList.add('open'); $('#sidebarBackdrop')?.classList.remove('hidden'); $('#mobileMenuBtn')?.setAttribute('aria-expanded','true'); }
  function applyUiMode(render=true){
    if(!state.profile) return;
    const isAdmin=state.profile.role==='admin';
    if(!isAdmin) state.uiMode=state.profile.role;
    $('#settingsTab')?.classList.toggle('hidden',!adminUi());
    $('#auditTab')?.classList.toggle('hidden',!adminUi());
    $('#adminNavLabel')?.classList.toggle('hidden',!adminUi());
    $('#adminModePanel')?.classList.toggle('hidden',!isAdmin);
    $('#regularUserCard')?.classList.toggle('hidden',isAdmin);
    const label=adminUi()?'Admin mode':'Staff mode';
    const badge=$('#currentModeBadge'); if(badge){ badge.textContent=isAdmin?label:roleTH(state.profile.role); badge.classList.toggle('admin',adminUi()); }
    const btnLabel=$('#modeButtonLabel'); if(btnLabel) btnLabel.textContent=label;
    $('#modeDot')?.classList.toggle('admin',adminUi());
    if($('#headerUser')) $('#headerUser').textContent=state.profile.display_name || state.profile.email.split('@')[0];
    if($('#headerRole')) $('#headerRole').textContent=roleTH(state.profile.role);
    if($('#regularUserName')) $('#regularUserName').textContent=state.profile.display_name || state.profile.email.split('@')[0];
    if($('#regularUserRole')) $('#regularUserRole').textContent=roleTH(state.profile.role);
    if(!adminUi() && ['settings','audit'].includes(activeView())) switchView('dashboard');
    if(render){
      const v=activeView();
      if(v==='dashboard') renderDashboard(); else if(v==='records') renderRecordsList(); else if(v==='record') renderRecordForm(); else if(v==='settings'&&adminUi()) renderSettings(); else if(v==='audit'&&adminUi()) renderAuditLog();
    }
  }
  function setUiMode(mode){
    if(state.profile?.role!=='admin') return;
    state.uiMode=mode==='admin'?'admin':'staff';
    localStorage.setItem('platelet_ui_mode',state.uiMode);
    $('#modeMenu')?.classList.add('hidden'); $('#modeMenuBtn')?.setAttribute('aria-expanded','false');
    applyUiMode(true); logActivity('ui_mode_change','session',null,{mode:state.uiMode}).catch(()=>{}); showToast(state.uiMode==='admin'?'เปิดโหมดผู้ดูแลระบบแล้ว':'กลับสู่โหมดผู้ใช้งานทั่วไปแล้ว','good');
  }

  async function init(){
    if(!cfgReady() || !window.supabase){ $('#setupScreen').classList.remove('hidden'); return; }
    state.sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    state.sb.auth.onAuthStateChange((event,session)=>{
      setTimeout(async()=>{
        try{
          if(event==='PASSWORD_RECOVERY' && session){
            state.session=session; state.user=session.user;
            await showForcedPassword(true);
            return;
          }
          if(session && !state.session) await enterApp(session);
          if(!session){state.session=null;state.user=null;state.profile=null;showLogin();}
        }catch(e){console.error(e);showToast(errText(e),'error');}
      },0);
    });
    const {data:{session}}=await state.sb.auth.getSession();
    if(session) await enterApp(session); else showLogin();
  }

  function hideAuthScreens(){
    $('#setupScreen').classList.add('hidden');
    $('#loginScreen').classList.add('hidden');
    $('#forcePasswordScreen').classList.add('hidden');
    $('#appShell').classList.add('hidden');
  }

  function showLogin(){
    hideAuthScreens();
    $('#loginScreen').classList.remove('hidden');
    $('#loginPassword').value='';
    $('#loginMessage').textContent='';
  }

  async function loadOwnProfile(){
    const {data:p,error}=await state.sb.from('profiles').select('*').eq('id',state.user.id).maybeSingle();
    if(error) throw error;
    return p;
  }

  async function enterApp(session){
    state.session=session; state.user=session.user;
    if(!state.user.email?.toLowerCase().endsWith('@mahidol.ac.th')){ await state.sb.auth.signOut(); showToast('บัญชีนี้ไม่ใช่ @mahidol.ac.th','error'); return; }
    let p;
    try{ p=await loadOwnProfile(); }catch(e){ await state.sb.auth.signOut(); showToast('อ่านสิทธิ์ผู้ใช้ไม่ได้: '+errText(e),'error'); return; }
    if(!p){ await state.sb.auth.signOut(); showToast('บัญชียังไม่ได้รับสิทธิ์ในระบบ หรือยังไม่มี Profile','error'); return; }
    if(!p.is_active){ await state.sb.auth.signOut(); showToast('บัญชีนี้ถูกปิดการใช้งาน','error'); return; }
    state.profile=p;
    if(p.must_change_password){ await showForcedPassword(false); return; }
    await openAppShell();
  }

  async function openAppShell(){
    hideAuthScreens();
    $('#appShell').classList.remove('hidden');
    const p=state.profile;
    state.uiMode=p.role==='admin' ? (localStorage.getItem('platelet_ui_mode')==='admin'?'admin':'staff') : p.role;
    await loadSettings(); await loadProductSettings(); await loadProfiles(); await loadRecords();
    applyUiMode(false);
    const loginKey=`platelet_login_${state.user.id}_${String(state.session?.access_token||'').slice(-16)}`;
    if(!sessionStorage.getItem(loginKey)){
      await logActivity('login','session',null,{platform:navigator.platform||'',standalone:window.matchMedia?.('(display-mode: standalone)')?.matches||false});
      sessionStorage.setItem(loginKey,'1');
      await loadProfiles();
    }
    normalizePlateletRoute();
    switchView(viewFromHash(),true);
  }

  async function showForcedPassword(recoveryMode=false){
    if(state.user && !state.profile){
      try{state.profile=await loadOwnProfile();}catch(_e){}
    }
    hideAuthScreens();
    $('#forcePasswordScreen').classList.remove('hidden');
    $('#forcePasswordTitle').textContent=recoveryMode?'ตั้งรหัสผ่านใหม่':'เปลี่ยนรหัสผ่านครั้งแรก';
    $('#forcePasswordText').textContent=recoveryMode?'กำหนดรหัสผ่านใหม่สำหรับบัญชีนี้':'กรุณาเปลี่ยนรหัสผ่านตั้งต้นที่ Admin กำหนดให้ ก่อนเข้าใช้งานระบบ';
    $('#forcePasswordMessage').textContent='รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
    $('#forcePasswordForm').dataset.recovery=recoveryMode?'1':'0';
    $('#forceNewPassword').value=''; $('#forceConfirmPassword').value='';
    setTimeout(()=>$('#forceNewPassword').focus(),50);
  }

  async function loadSettings(){ const {data,error}=await state.sb.from('qc_settings').select('*').eq('id',1).single(); if(error) throw error; state.settings=data; }
  async function loadProductSettings(){ const {data,error}=await state.sb.from('platelet_product_settings').select('*').order('sort_order').order('product_type'); if(error) throw error; state.productSettings=data||[]; }
  async function loadRecords(){
    const {data,error}=await state.sb.from('platelet_records').select('*').order('collection_at',{ascending:false}).limit(1000);
    if(error) throw error; state.records=data||[];
  }
  async function loadProfiles(){ const {data,error}=await state.sb.from('profiles').select('*').order('display_name'); if(error) throw error; state.profiles=data||[]; }

  $('#loginForm').addEventListener('submit', async e=>{
    e.preventDefault();
    let raw=$('#loginEmail').value.trim().toLowerCase();
    let email=raw.includes('@')?raw:`${raw}@mahidol.ac.th`;
    const password=$('#loginPassword').value;
    if(!email.endsWith('@mahidol.ac.th')){ $('#loginMessage').textContent='อนุญาตเฉพาะอีเมล @mahidol.ac.th'; return; }
    if(password.length<8){ $('#loginMessage').textContent='รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'; return; }
    $('#loginMessage').textContent='กำลังเข้าสู่ระบบ...';
    state.lastLoginPassword=password;
    const {error}=await state.sb.auth.signInWithPassword({email,password});
    if(error){ state.lastLoginPassword=null; $('#loginMessage').textContent='อีเมลหรือรหัสผ่านไม่ถูกต้อง'; return; }
    $('#loginMessage').textContent='';
  });

  $('#forgotPasswordBtn').addEventListener('click',()=>{
    $('#loginMessage').textContent='หากลืมรหัสผ่าน กรุณาติดต่อ Admin เพื่อ Reset รหัสผ่านชั่วคราวให้ ระบบจะบังคับให้ตั้งรหัสใหม่หลัง Login';
  });

  $('#forcePasswordForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const p1=$('#forceNewPassword').value, p2=$('#forceConfirmPassword').value;
    if(p1.length<8){$('#forcePasswordMessage').textContent='รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';return;}
    if(state.lastLoginPassword && p1===state.lastLoginPassword){$('#forcePasswordMessage').textContent='รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านตั้งต้น';return;}
    if(p1!==p2){$('#forcePasswordMessage').textContent='รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน';return;}
    $('#forcePasswordMessage').textContent='กำลังบันทึก...';
    const {error}=await state.sb.auth.updateUser({password:p1});
    if(error){$('#forcePasswordMessage').textContent='เปลี่ยนรหัสผ่านไม่ได้: '+errText(error);return;}
    if(state.profile){
      const {error:flagError}=await state.sb.rpc('complete_password_change');
      if(flagError){$('#forcePasswordMessage').textContent='เปลี่ยนรหัสผ่านแล้ว แต่บันทึกสถานะไม่สำเร็จ: '+errText(flagError);return;}
      state.profile={...state.profile,must_change_password:false,password_changed_at:new Date().toISOString()};
    }
    $('#forcePasswordMessage').textContent='เปลี่ยนรหัสผ่านเรียบร้อย';
    showToast('เปลี่ยนรหัสผ่านเรียบร้อย','good');
    state.lastLoginPassword=null;
    if(state.profile) await openAppShell(); else { await state.sb.auth.signOut(); showLogin(); }
  });

  async function logoutWithAudit(){ try{await logActivity('logout','session');}catch(_e){} await state.sb.auth.signOut(); }
  $('#forceLogoutBtn').addEventListener('click',()=>state.sb.auth.signOut());
  $('#logoutBtn').addEventListener('click',logoutWithAudit);
  $('#closeDetailBtn').addEventListener('click',()=>$('#detailDialog').close());
  $('#mainTabs').addEventListener('click',e=>{ const b=e.target.closest('button[data-view]'); if(b){ switchView(b.dataset.view); closeSidebar(); } });
  $('#mobileMenuBtn').addEventListener('click',()=>$('#sideNav').classList.contains('open')?closeSidebar():openSidebar());
  $('#sidebarBackdrop').addEventListener('click',closeSidebar);
  $('#modeMenuBtn').addEventListener('click',()=>{ const m=$('#modeMenu'); const willOpen=m.classList.contains('hidden'); m.classList.toggle('hidden',!willOpen); $('#modeMenuBtn').setAttribute('aria-expanded',willOpen?'true':'false'); });
  $$('#modeMenu [data-ui-mode]').forEach(b=>b.addEventListener('click',()=>setUiMode(b.dataset.uiMode)));
  document.addEventListener('click',e=>{ if(!e.target.closest('#adminModePanel')){ $('#modeMenu')?.classList.add('hidden'); $('#modeMenuBtn')?.setAttribute('aria-expanded','false'); } });

  $('#changePasswordBtn').addEventListener('click',()=>{
    $('#currentPassword').value=''; $('#newPassword').value=''; $('#confirmPassword').value=''; $('#passwordDialogMessage').textContent='';
    $('#passwordDialog').showModal();
  });
  $('#closePasswordDialogBtn').addEventListener('click',()=>$('#passwordDialog').close());
  $('#cancelPasswordBtn').addEventListener('click',()=>$('#passwordDialog').close());
  $('#passwordDialogForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const current=$('#currentPassword').value, p1=$('#newPassword').value, p2=$('#confirmPassword').value;
    if(current.length<8 || p1.length<8){$('#passwordDialogMessage').textContent='รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';return;}
    if(p1!==p2){$('#passwordDialogMessage').textContent='รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน';return;}
    if(current===p1){$('#passwordDialogMessage').textContent='รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านปัจจุบัน';return;}
    $('#passwordDialogMessage').textContent='กำลังตรวจสอบรหัสผ่านปัจจุบัน...';
    const {error:loginError}=await state.sb.auth.signInWithPassword({email:state.user.email,password:current});
    if(loginError){$('#passwordDialogMessage').textContent='รหัสผ่านปัจจุบันไม่ถูกต้อง';return;}
    const {error}=await state.sb.auth.updateUser({password:p1});
    if(error){$('#passwordDialogMessage').textContent='เปลี่ยนรหัสผ่านไม่ได้: '+errText(error);return;}
    await state.sb.rpc('complete_password_change');
    $('#passwordDialog').close(); showToast('เปลี่ยนรหัสผ่านเรียบร้อย','good');
  });

  $('#closeAdminResetPasswordBtn').addEventListener('click',()=>$('#adminResetPasswordDialog').close());
  $('#cancelAdminResetPasswordBtn').addEventListener('click',()=>$('#adminResetPasswordDialog').close());
  $('#adminResetPasswordForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!adminUi()||!state.resetTargetId) return;
    const p1=$('#adminTempPassword').value,p2=$('#adminTempPasswordConfirm').value;
    if(p1.length<8){$('#adminResetPasswordMessage').textContent='รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';return;}
    if(p1!==p2){$('#adminResetPasswordMessage').textContent='รหัสผ่านทั้งสองช่องไม่ตรงกัน';return;}
    $('#adminResetPasswordMessage').textContent='กำลัง Reset password...';
    try{
      await invokeAdminUsers({action:'reset_password',user_id:state.resetTargetId,password:p1});
      $('#adminResetPasswordDialog').close(); showToast('Reset password แล้ว ผู้ใช้ต้องเปลี่ยนรหัสเมื่อ Login ครั้งถัดไป','good');
      await loadProfiles(); renderSettings();
    }catch(e2){$('#adminResetPasswordMessage').textContent=errText(e2);}
  });

  function switchView(v,fromRoute=false){
    if(['settings','audit'].includes(v)&&!adminUi()) v='dashboard';
    if(!fromRoute){
      const target=routeForView(v);
      if(location.hash!==target){ location.hash=target; return; }
    }
    $$('#mainTabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
    $$('.view').forEach(x=>x.classList.add('hidden'));
    $(`#view-${v}`).classList.remove('hidden');
    if(v==='dashboard') renderDashboard();
    if(v==='records') renderRecordsList();
    if(v==='record') renderRecordForm();
    if(v==='settings') renderSettings();
    if(v==='audit') renderAuditLog();
    if(window.innerWidth<=760) window.scrollTo({top:0,behavior:'smooth'});
  }
  window.addEventListener('hashchange',()=>{
    if($('#appShell') && !$('#appShell').classList.contains('hidden')){
      normalizePlateletRoute();
      switchView(viewFromHash(),true);
    }
  });
  function statusBadge(s){ return `<span class="badge ${esc(s)}">${esc(statusTH(s))}</span>`; }
  function qcBadge(s){ return `<span class="badge ${esc(s)}">${esc(qcTH(s))}</span>`; }
  function qcBadgeForRecord(r){ return r?.record_purpose==='qc' ? qcBadge(r.qc_status) : ''; }
  function deletedBadge(r){ return r?.deleted_at ? '<span class="badge deleted">ลบแล้ว</span>' : ''; }
  function pHBadge(r){ if(!r.ph_measured_at||!r.expiry_at) return ''; return sameBangkokDate(r.ph_measured_at,r.expiry_at)?'<span class="badge pass">pH ตรงวัน Exp.</span>':'<span class="badge late">pH ไม่ตรงวัน Exp.</span>'; }
  function waitingPH(r){ return r.status==='draft' && !r.ph_value && r.expiry_at; }

  function renderDashboard(){
    const rec=state.records.filter(r=>!r.deleted_at);
    const month=rec.filter(r=>r.collection_at && r.collection_at>=firstOfMonthISO());
    const prepare=month.filter(r=>(r.record_purpose||'prepare')==='prepare').length;
    const qc=month.filter(r=>r.record_purpose==='qc').length;
    const wait=rec.filter(waitingPH).length;
    const submitted=rec.filter(r=>r.status==='submitted').length;
    const attention=rec.filter(r=>r.record_purpose==='qc'&&r.qc_status==='review').length;
    $('#view-dashboard').innerHTML=`
      <div class="page-head"><div><h1>ภาพรวม Platelet</h1><p class="muted">ติดตามการเตรียมเกล็ดเลือดทั้งหมด และแยกรายการที่กำหนดใช้เป็น QC</p></div><div class="actions"><button class="btn primary" id="dashNew">+ บันทึก Platelet</button></div></div>
      <div class="grid cards">
        ${metric('เดือนนี้',month.length,'รายการทั้งหมด')}${metric('Prepare',prepare,'รายการปกติ')}${metric('ใช้เป็น QC',qc,'รายการ QC')}${metric('รอตรวจทวน',submitted,'Submitted')}${metric('QC ต้องตรวจสอบ',attention,'เฉพาะรายการ QC')}
      </div>
      ${wait?`<div class="notice info small"><strong>รอ pH ${wait} รายการ</strong> สามารถกลับมาเติมผลภายหลังได้</div>`:''}
      <div class="panel"><h2>รายการล่าสุด</h2>${recordsTable(rec.slice(0,12))}</div>`;
    $('#dashNew').onclick=()=>{state.currentRecordId=null;switchView('record');}; bindRecordLinks($('#view-dashboard'));
  }

  function metric(label,value,sub){ return `<div class="card metric"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`; }
  function recordsTable(rows){
    if(!rows.length) return '<div class="empty">ยังไม่มีข้อมูล</div>';
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Product No.</th><th>ผลิตภัณฑ์</th><th>ประเภท</th><th>วันเจาะ</th><th>Group</th><th>Yield</th><th>ผล QC</th><th>สถานะ</th><th>ผู้บันทึก</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.deleted_at?'deleted-row':''}"><td><button class="link-btn record-link" data-id="${r.id}">${esc(r.product_no)}</button></td><td>${esc(r.product_type)}</td><td>${purposeBadge(r.record_purpose)} ${deletedBadge(r)}</td><td class="nowrap">${dateTH(r.collection_at,false)}</td><td>${esc(r.blood_group||'–')}</td><td>${fmt(r.platelet_yield,2)}</td><td>${r.record_purpose==='qc'?qcBadge(r.qc_status):'<span class="muted">–</span>'}</td><td>${statusBadge(r.status)}</td><td>${esc(profileName(r.created_by))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function bindRecordLinks(root=document){ $$('.record-link',root).forEach(b=>b.onclick=()=>openDetail(b.dataset.id)); }

  function renderRecordsList(){
    const deletedControl=adminUi()?`<label class="inline-check"><input type="checkbox" id="fDeleted" ${state.showDeletedRecords?'checked':''}> แสดงรายการที่ลบแล้ว</label>`:'';
    $('#view-records').innerHTML=`<div class="page-head"><div><h1>รายการ Platelet</h1><p class="muted">ค้นหาและเปิดดูข้อมูลการเตรียมเกล็ดเลือด ทั้ง Prepare และรายการที่ใช้เป็น QC</p></div><div class="actions"><button class="btn" id="exportCsv">Export CSV</button><button class="btn primary" id="listNew">+ บันทึก Platelet</button></div></div>
      <div class="panel"><div class="filters"><input id="fSearch" placeholder="ค้นหา Product No. / ผลิตภัณฑ์"><select id="fPurpose"><option value="">Prepare + QC</option><option value="prepare">Prepare ตามปกติ</option><option value="qc">ใช้เป็น QC</option></select><select id="fStatus"><option value="">ทุกสถานะ</option><option value="draft">ร่าง</option><option value="submitted">รอตรวจทวน</option><option value="locked">LOCK</option></select><select id="fQc"><option value="">ทุกผล QC</option><option value="pass">ผ่านเกณฑ์ QC</option><option value="review">ต้องตรวจสอบ QC</option><option value="incomplete">ข้อมูล QC ยังไม่ครบ</option></select><select id="fProduct"><option value="">ทุกผลิตภัณฑ์</option>${activeProducts().map(x=>`<option>${esc(x.product_type)}</option>`).join('')}</select><button class="btn" id="fClear">ล้าง</button></div>${deletedControl}<div id="recordsTableHost" style="margin-top:12px"></div></div>`;
    const apply=()=>{
      const q=$('#fSearch').value.trim().toLowerCase(),purpose=$('#fPurpose').value,s=$('#fStatus').value,qc=$('#fQc').value,p=$('#fProduct').value;
      if($('#fDeleted')) state.showDeletedRecords=$('#fDeleted').checked;
      const rows=state.records.filter(r=>(state.showDeletedRecords||!r.deleted_at)&&(!q||`${r.product_no} ${r.product_type}`.toLowerCase().includes(q))&&(!purpose||(r.record_purpose||'prepare')===purpose)&&(!s||r.status===s)&&(!qc||(r.record_purpose==='qc'&&r.qc_status===qc))&&(!p||r.product_type===p));
      $('#recordsTableHost').innerHTML=recordsTable(rows); bindRecordLinks($('#recordsTableHost')); return rows;
    };
    ['#fSearch','#fPurpose','#fStatus','#fQc','#fProduct'].forEach(x=>$(x).addEventListener('input',apply)); if($('#fDeleted'))$('#fDeleted').addEventListener('change',apply);
    $('#fClear').onclick=()=>{['#fSearch','#fPurpose','#fStatus','#fQc','#fProduct'].forEach(x=>$(x).value='');if($('#fDeleted')){$('#fDeleted').checked=false;state.showDeletedRecords=false;}apply();};
    $('#listNew').onclick=()=>{state.currentRecordId=null;switchView('record');}; $('#exportCsv').onclick=()=>exportCSV(apply()); apply();
  }

  function exportCSV(rows){
    const headers=['Product No.','Product','Purpose','Group','Collection','Expiry','Gross weight g','Bag tare g','Density','Volume mL','Pool PYI','PLT instrument','PLT1','PLT2','PLT measured at','PLT used','Yield x10^11','Equivalent Units','WBC ADAM','WBC measured at','Residual WBC x10^6','pH','pH measured','QC result','Status','Revision','Deleted at','Delete reason','Notes'];
    const vals=r=>[r.product_no,r.product_type,r.record_purpose,r.blood_group,r.collection_at,r.expiry_at,r.gross_weight_g,r.bag_tare_weight_g,r.density,r.volume_ml,r.pool_pyi,r.plt_instrument,r.plt_value_1,r.plt_value_2,r.plt_measured_at,r.plt_used,r.platelet_yield,r.equivalent_units,r.wbc_adam,r.wbc_measured_at,r.residual_wbc,r.ph_value,r.ph_measured_at,r.record_purpose==='qc'?r.qc_status:'not_qc',r.status,r.revision,r.deleted_at,r.delete_reason,r.notes];
    const quote=v=>`"${String(v??'').replaceAll('"','""')}"`; const csv='\ufeff'+[headers,...rows.map(vals)].map(a=>a.map(quote).join(',')).join('\r\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download=`platelet_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href); logActivity('export_csv','report',null,{rows:rows.length}).catch(()=>{});
  }

  async function renderRecordForm(){
    let r=null,pool=[]; state.currentEvidence=[]; state.currentPool=[];
    if(state.currentRecordId){
      const {data,error}=await state.sb.from('platelet_records').select('*').eq('id',state.currentRecordId).single(); if(error){showToast(errText(error),'error');return;} r=data;
      const {data:pu}=await state.sb.from('pool_units').select('*').eq('record_id',r.id).order('position'); pool=pu||[]; state.currentPool=pool.map(x=>({position:x.position,unit_no:x.unit_no,pyi:Number(x.pyi)}));
      const {data:ev}=await state.sb.from('evidence_files').select('*').eq('record_id',r.id).order('created_at'); state.currentEvidence=ev||[];
    }
    const locked=r?.status==='locked', submitted=r?.status==='submitted', deleted=!!r?.deleted_at;
    const editable=!deleted && (adminUi() || (!locked && (!submitted || reviewerUi())));
    const purpose=r?.record_purpose||'prepare';
    const adminCorrection=r&&adminUi()&&!deleted;
    $('#view-record').innerHTML=`
      <div class="page-head"><div><h1>${r?'แก้ไข / ตรวจรายการ Platelet':'บันทึก Platelet'}</h1><p class="muted">ใช้ฟอร์มเดียวกันทุกถุง ค่าเริ่มต้นเป็น Prepare ตามปกติ ถ้าถุงนี้ใช้เป็น QC ให้เลือก “ใช้เป็น QC” ที่ด้านบน</p></div><div class="status-line">${r?purposeBadge(purpose)+deletedBadge(r)+statusBadge(r.status)+qcBadgeForRecord(r)+pHBadge(r):purposeBadge('prepare')}</div></div>
      ${deleted?`<div class="notice bad"><strong>รายการนี้ถูกลบออกจากการใช้งานแล้ว</strong><br>เหตุผล: ${esc(r.delete_reason||'–')} · ${dateTH(r.deleted_at)} · โดย ${esc(profileName(r.deleted_by))}</div>`:''}
      ${locked&&!adminUi()?'<div class="notice good"><strong>รายการนี้ LOCK แล้ว</strong> ข้อมูลถูกป้องกันการแก้ไข หากพบข้อผิดพลาดให้แจ้ง Admin พร้อมหลักฐาน</div>':''}
      ${locked&&adminUi()&&!deleted?'<div class="notice warning"><strong>Admin correction</strong> รายการนี้ LOCK แล้ว แต่ Admin สามารถแก้ไขได้โดยระบุเหตุผล ระบบจะเพิ่ม Revision และบันทึกค่าก่อน/หลังใน Audit Log</div>':''}
      ${!locked&&!deleted?'<div class="notice info"><strong>บันทึกต่างวันได้</strong><br>CBC, ADAM และ pH สามารถกรอกภายหลังโดยเจ้าหน้าที่คนละคนได้ พร้อมเก็บวันเวลาและหลักฐานแยกกัน</div>':''}
      <form id="recordForm">
      <div class="panel purpose-panel"><h2>1. รายการนี้ใช้ทำอะไร</h2><div class="purpose-selector" role="radiogroup" aria-label="ประเภทการบันทึก"><label class="purpose-option ${purpose==='prepare'?'selected':''}"><input type="radio" name="record_purpose" value="prepare" ${purpose==='prepare'?'checked':''} ${editable?'':'disabled'}><span><strong>Prepare ตามปกติ</strong><small>ค่าเริ่มต้น · บันทึกการเตรียมเกล็ดเลือดตามงานประจำ</small></span></label><label class="purpose-option ${purpose==='qc'?'selected':''}"><input type="radio" name="record_purpose" value="qc" ${purpose==='qc'?'checked':''} ${editable?'':'disabled'}><span><strong>ใช้เป็น QC</strong><small>เลือกเมื่อหน่วยกำหนดถุงนี้ให้เป็นตัวอย่าง QC</small></span></label></div><p class="section-note purpose-note">ไม่มีการสุ่ม QC อัตโนมัติ ถ้าเป็น Prepare ไม่ต้องแตะอะไรเพิ่ม</p></div>
      ${adminCorrection?`<div class="panel admin-correction-panel"><h2>การแก้ไขโดย Admin</h2><p class="section-note">กรณีเจ้าหน้าที่แจ้งว่าลงผลผิด ให้ระบุเหตุผลก่อนบันทึก เช่น “เจ้าหน้าที่แจ้งว่า PLT ลงผลผิด ตรวจสอบหลักฐานใหม่แล้วแก้ไข” ระบบจะเก็บค่าก่อนและหลังไว้ใน Audit Log แนะนำให้คงหลักฐานเดิมและแนบหลักฐานใหม่เพิ่ม</p><div class="field"><label>เหตุผลการแก้ไขโดย Admin</label><textarea id="admin_edit_reason" placeholder="ระบุเหตุผลและสิ่งที่ตรวจสอบก่อนแก้ไข"></textarea></div></div>`:''}
      <div class="panel"><h2>2. ข้อมูลผลิตภัณฑ์</h2><div class="form-grid">
        ${field('Product No.','product_no',r?.product_no,'text',false,'','required')}
        <div class="field"><label class="required">ผลิตภัณฑ์</label><select id="product_type" ${editable?'':'disabled'}><option value="">เลือก</option>${productOptions(r?.product_type)}${r?.product_type&&!productSetting(r.product_type)?`<option value="${esc(r.product_type)}" selected>${esc(r.product_type)} (ข้อมูลเดิม)</option>`:''}</select></div>
        <div class="field"><label>Group</label><select id="blood_group" ${editable?'':'disabled'}><option value="">เลือก</option>${['O','A','B','AB'].map(x=>`<option ${r?.blood_group===x?'selected':''}>${x}</option>`).join('')}</select></div>
        ${field('วัน-เวลาเริ่มเจาะถุงที่ 1','collection_at',inputFromISO(r?.collection_at),'datetime-local',false,'','required')}
        ${field('น้ำหนักที่ชั่งได้ (g)','gross_weight_g',r?.gross_weight_g,'number',false,'0.01','required')}
        <div class="field"><label>น้ำหนักถุงเปล่า (g)</label><input id="bag_tare_weight_g" readonly value="${esc(r?.bag_tare_weight_g??'')}"><span class="hint">ระบบกำหนดตามชนิดผลิตภัณฑ์</span></div>
        <div class="field"><label>Density</label><input id="density" readonly value="${esc(r?.density??'')}"><span class="hint">ระบบกำหนดตามชนิดผลิตภัณฑ์</span></div>
        <div class="field"><label>Volume ที่คำนวณได้ (mL)</label><input id="volume_ml" readonly value="${esc(r?.volume_ml??'')}"><span class="hint">(น้ำหนักที่ชั่งได้ − น้ำหนักถุงเปล่า) ÷ Density</span></div>
        <div class="field"><label>วัน-เวลาหมดอายุ</label><input id="expiry_preview" readonly value="${esc(inputFromISO(r?.expiry_at))}"><span class="hint">คำนวณอัตโนมัติจากวัน/เวลาเริ่มเจาะ + ${state.settings.expiry_days} วัน</span></div>
        <div class="field span2"><label>ผู้บันทึกครั้งแรก</label><input readonly value="${esc(r?dateTH(r.created_at)+' · '+profileName(r.created_by):(state.profile.display_name||state.profile.email))}"></div>
      </div></div>
      <div class="panel" id="poolPanel"><h2>3. Units ที่ใช้ Pool (เฉพาะ LDPPC)</h2><p class="section-note">ใส่ 3–6 ถุง ระบบรวม Pool PYI ให้อัตโนมัติ</p><div class="table-wrap"><table class="pool-table"><thead><tr><th>#</th><th>Unit No.</th><th>PYI</th></tr></thead><tbody>${[1,2,3,4,5,6].map(i=>{const u=pool.find(x=>x.position===i);return `<tr><td>${i}</td><td><input class="pool-unit" data-pos="${i}" value="${esc(u?.unit_no||'')}" ${editable?'':'disabled'} placeholder="Unit No."></td><td><input class="pool-pyi" data-pos="${i}" type="number" step="0.01" min="0" value="${esc(u?.pyi??'')}" ${editable?'':'disabled'} placeholder="PYI"></td></tr>`}).join('')}</tbody></table></div><div class="calc-box" style="margin-top:10px"><span>Pool PYI</span><strong id="poolSum">${fmt(r?.pool_pyi,2)}</strong></div></div>
      <div class="panel"><h2>4. ผล Platelet จาก CBC</h2><p class="section-note">บันทึกวัน-เวลาที่ตรวจ CBC จริง เผื่อกรอกภายหลังหรือกรอกโดยเจ้าหน้าที่คนละคน</p><div class="form-grid">
        <div class="field"><label>เครื่อง</label><select id="plt_instrument" ${editable?'':'disabled'}><option value="">เลือก</option>${['Mindray','Sysmex'].map(x=>`<option ${r?.plt_instrument===x?'selected':''}>${x}</option>`).join('')}</select></div>
        ${field('PLT ครั้งที่ 1 (K/µL)','plt_value_1',r?.plt_value_1,'number',false,'0.01')}${field('PLT ครั้งที่ 2 (K/µL)','plt_value_2',r?.plt_value_2,'number',false,'0.01')}
        ${field('วัน-เวลาที่วัด CBC','plt_measured_at',inputFromISO(r?.plt_measured_at),'datetime-local')}
        <div class="field"><label>ค่าที่ใช้คำนวณ</label><select id="plt_use_mode" ${editable?'':'disabled'}>${[['first','ครั้งที่ 1'],['second','ครั้งที่ 2'],['average','ค่าเฉลี่ยครั้งที่ 1–2']].map(([v,t])=>`<option value="${v}" ${(r?.plt_use_mode||'first')===v?'selected':''}>${t}</option>`).join('')}</select></div>
      </div></div>
      <div class="panel"><h2>5. WBC จาก ADAM</h2><p class="section-note">บันทึกวัน-เวลาที่อ่านค่า ADAM จริงได้แยกจาก CBC</p><div class="form-grid">${field('WBC (/µL)','wbc_adam',r?.wbc_adam,'number',false,'0.0001')}${field('วัน-เวลาที่วัด ADAM','wbc_measured_at',inputFromISO(r?.wbc_measured_at),'datetime-local')}</div></div>
      <div class="panel"><h2>6. pH ณ วันหมดอายุ</h2><p class="section-note">ถ้าวัดไม่ตรงวันหมดอายุ ระบบจะเตือนและให้ระบุเหตุผลก่อนส่งตรวจทวน</p><div class="form-grid">${field('pH','ph_value',r?.ph_value,'number',false,'0.001')}${field('วัน-เวลาที่วัด pH','ph_measured_at',inputFromISO(r?.ph_measured_at),'datetime-local')}<div class="field span2"><label>เหตุผล ถ้าวัด pH ไม่ตรงวันหมดอายุ</label><input id="ph_deviation_reason" value="${esc(r?.ph_deviation_reason||'')}" ${editable?'':'disabled'} placeholder="เช่น เครื่องขัดข้อง / วัดล่าช้า 2 วัน"></div></div></div>
      <div class="panel"><h2>7. ผลคำนวณอัตโนมัติ</h2><div class="calc-grid"><div class="calc-box"><span>PLT ที่ใช้</span><strong id="cPlt">${fmt(r?.plt_used,2)}</strong><small>K/µL</small></div><div class="calc-box"><span>Platelet yield</span><strong id="cYield">${fmt(r?.platelet_yield,3)}</strong><small>×10¹¹ cells/unit</small></div><div class="calc-box"><span>Equivalent Units</span><strong id="cEq">${fmt(r?.equivalent_units,2)}</strong><small>factor ${state.settings.equivalent_unit_factor}</small></div><div class="calc-box"><span>Residual WBC</span><strong id="cWbc">${fmt(r?.residual_wbc,3)}</strong><small>×10⁶ cells/unit</small></div></div><div id="calcWarnings" style="margin-top:12px"></div></div>
      <div class="panel"><h2>8. หลักฐานจากเครื่อง</h2><p class="section-note">ไฟล์เก็บใน Private Storage หาก Admin แก้ไขหลัง LOCK แนะนำให้คงไฟล์เดิมและแนบหลักฐานใหม่เพิ่มเพื่อทวนสอบย้อนหลัง</p><div class="evidence-grid">${evidenceBox('cbc','CBC / PLT')}${evidenceBox('adam','ADAM / WBC')}${evidenceBox('ph','pH')}</div></div>
      <div class="panel"><h2>9. หมายเหตุ</h2><textarea id="notes" ${editable?'':'disabled'} placeholder="บันทึกเหตุการณ์หรือข้อมูลเพิ่มเติม">${esc(r?.notes||'')}</textarea></div>
      <div class="sticky-actions"><div class="left"><button type="button" class="btn" id="cancelEdit">กลับรายการทั้งหมด</button></div><div class="right">${editable?'<button type="button" class="btn" id="saveDraft">บันทึก</button>':''}${r&&r.status==='draft'&&editable?'<button type="button" class="btn primary" id="submitReview">ส่งตรวจทวน</button>':''}${r&&r.status==='submitted'&&reviewerUi()?'<button type="button" class="btn good" id="lockRecord">ตรวจทวนและ LOCK</button>':''}${r&&r.status==='locked'&&adminUi()&&!deleted?'<button type="button" class="btn danger" id="unlockRecord">ปลดล็อกเป็น Draft</button>':''}</div></div>
      </form>`;
    setEditable(editable); applyProductWeightConfig(r); togglePool(); updateCalcPreview(); renderEvidenceLists(r?.id,editable,locked);
    $$('input[name="record_purpose"]').forEach(el=>el.addEventListener('change',()=>{$$('.purpose-option').forEach(x=>x.classList.toggle('selected',$('input',x)?.checked));updateCalcPreview();}));
    $('#product_type').addEventListener('change',()=>{applyProductWeightConfig(null);togglePool();updateCalcPreview();}); ['collection_at','gross_weight_g','plt_value_1','plt_value_2','plt_use_mode','wbc_adam','ph_value','ph_measured_at','plt_measured_at','wbc_measured_at'].forEach(id=>$('#'+id)?.addEventListener('input',updateCalcPreview));
    $$('.pool-pyi,.pool-unit').forEach(x=>x.addEventListener('input',updatePoolPreview));
    $('#cancelEdit').onclick=()=>switchView('records'); if($('#saveDraft')) $('#saveDraft').onclick=()=>saveRecord(false); if($('#submitReview')) $('#submitReview').onclick=submitRecord; if($('#lockRecord')) $('#lockRecord').onclick=lockRecord; if($('#unlockRecord')) $('#unlockRecord').onclick=unlockRecord;
  }

  function field(label,id,value,type='text',readonly=false,step='',required=''){ const disabled=readonly?'readonly':''; return `<div class="field"><label class="${required}">${label}</label><input id="${id}" type="${type}" value="${esc(value??'')}" ${step?`step="${step}"`:''} ${type==='number'?'min="0"':''} ${disabled}></div>`; }
  function setEditable(editable){ if(editable) return; $$('#recordForm input,#recordForm select,#recordForm textarea').forEach(el=>{if(!el.readOnly) el.disabled=true;}); }
  function currentProductConfig(){ return productSetting($('#product_type')?.value||''); }
  function applyProductWeightConfig(record=null){
    const cfg=currentProductConfig();
    const sameRecord=record && record.product_type===$('#product_type')?.value;
    const tare=sameRecord&&record.bag_tare_weight_g!==null&&record.bag_tare_weight_g!==undefined?Number(record.bag_tare_weight_g):(cfg?Number(cfg.tare_weight_g):null);
    const density=sameRecord&&record.density!==null&&record.density!==undefined?Number(record.density):(cfg?Number(cfg.density):null);
    if($('#bag_tare_weight_g')) $('#bag_tare_weight_g').value=tare??'';
    if($('#density')) $('#density').value=density??'';
  }
  function togglePool(){ const cfg=currentProductConfig(); const show=cfg?!!cfg.requires_pool:$('#product_type').value.startsWith('LDPPC '); $('#poolPanel').classList.toggle('hidden',!show); }
  function updatePoolPreview(){ const sum=$$('.pool-pyi').reduce((s,x)=>s+(num(x.value)||0),0); $('#poolSum').textContent=fmt(sum,2); }
  function calcFrontend(){
    const gross=num($('#gross_weight_g')?.value),tare=num($('#bag_tare_weight_g')?.value),density=num($('#density')?.value),legacyVolume=num($('#volume_ml')?.value); const volume=gross!==null&&tare!==null&&density!==null&&density>0&&gross>=tare?(gross-tare)/density:legacyVolume; const p1=num($('#plt_value_1')?.value),p2=num($('#plt_value_2')?.value),mode=$('#plt_use_mode')?.value,wbc=num($('#wbc_adam')?.value),ph=num($('#ph_value')?.value); let used=null;
    if(mode==='first') used=p1; else if(mode==='second') used=p2; else if(p1!==null&&p2!==null) used=(p1+p2)/2;
    const y=volume!==null&&used!==null?volume*used/100000:null, eq=y!==null?y/Number(state.settings.equivalent_unit_factor):null, rw=volume!==null&&wbc!==null?volume*wbc/1000:null; let diff=null; if(p1!==null&&p2!==null&&(p1+p2)>0) diff=Math.abs(p1-p2)/((p1+p2)/2)*100;
    return {gross,tare,density,volume,p1,p2,used,y,eq,rw,diff,ph};
  }
  function updateCalcPreview(){
    const c=calcFrontend(); if($('#volume_ml')) $('#volume_ml').value=c.volume===null?'':Number(c.volume).toFixed(2); $('#cPlt').textContent=fmt(c.used,2);$('#cYield').textContent=fmt(c.y,3);$('#cEq').textContent=fmt(c.eq,2);$('#cWbc').textContent=fmt(c.rw,3); const col=$('#collection_at')?.value;if(col){const d=new Date(col+':00+07:00');d.setDate(d.getDate()+Number(state.settings.expiry_days));$('#expiry_preview').value=inputFromISO(d.toISOString());}
    const isQc=($('input[name="record_purpose"]:checked')?.value||'prepare')==='qc';
    const w=[]; if(c.gross!==null&&c.tare!==null&&c.gross<c.tare)w.push('น้ำหนักที่ชั่งได้น้อยกว่าน้ำหนักถุงเปล่า กรุณาตรวจสอบ'); if(c.gross!==null&&(c.tare===null||c.density===null))w.push('ยังไม่มีค่าน้ำหนักถุง/Density สำหรับผลิตภัณฑ์นี้');
    if(isQc){ if(c.diff!==null&&c.diff>Number(state.settings.plt_repeat_diff_max_pct))w.push(`PLT ซ้ำต่างกัน ${fmt(c.diff,1)}% มากกว่าเกณฑ์เตือน ${state.settings.plt_repeat_diff_max_pct}%`); if(c.y!==null&&c.y<Number(state.settings.platelet_yield_min))w.push(`Platelet yield ต่ำกว่า ${state.settings.platelet_yield_min}`); if(c.rw!==null&&c.rw>Number(state.settings.residual_wbc_max))w.push(`Residual WBC มากกว่า ${state.settings.residual_wbc_max}`); if(c.ph!==null&&c.ph<Number(state.settings.ph_min))w.push(`pH ต่ำกว่า ${state.settings.ph_min}`); }
    const pm=$('#ph_measured_at')?.value, ex=$('#expiry_preview')?.value; if(pm&&ex&&pm.slice(0,10)!==ex.slice(0,10))w.push('วันที่วัด pH ไม่ตรงวันหมดอายุ ต้องใส่เหตุผลก่อนส่งตรวจทวน');
    if(w.length) $('#calcWarnings').innerHTML=`<div class="notice warning"><strong>ต้องตรวจสอบ</strong><br>${w.map(esc).join('<br>')}</div>`;
    else if(isQc) $('#calcWarnings').innerHTML='<div class="notice good">ยังไม่พบเงื่อนไขเตือนตามเกณฑ์ QC จากค่าที่กรอก</div>';
    else $('#calcWarnings').innerHTML='<div class="notice info"><strong>Prepare ตามปกติ</strong> ระบบคำนวณค่าให้ครบ แต่ไม่นำรายการนี้ไปตัดสินผ่าน/ไม่ผ่าน QC</div>';
  }
  function evidenceBox(cat,title){ return `<div class="evidence-box"><h3>${title}</h3><div class="muted small">มือถือถ่ายรูปหลักฐานได้ทันที หรือเลือกภาพ/PDF ที่มีอยู่</div><input class="hidden-file-input" type="file" id="camera_${cat}" accept="image/*" capture="environment"><input class="hidden-file-input" type="file" id="file_${cat}" accept="image/*,application/pdf"><div class="evidence-pick-actions"><button type="button" class="btn primary small-btn camera-pick" data-cat="${cat}">ถ่ายรูป</button><button type="button" class="btn small-btn file-pick" data-cat="${cat}">เลือกไฟล์</button></div><div class="evidence-list" id="list_${cat}"></div></div>`; }
  function renderEvidenceLists(recordId,editable,locked=false){ ['cbc','adam','ph'].forEach(cat=>{ const host=$('#list_'+cat); const arr=state.currentEvidence.filter(x=>x.category===cat); const canDelete=editable && !(locked&&adminUi()); host.innerHTML=arr.length?arr.map(e=>`<div class="evidence-item"><span class="name" title="${esc(e.original_name)}">${esc(e.original_name)}${e.change_reason?`<small class="evidence-reason">Admin: ${esc(e.change_reason)}</small>`:''}</span><span class="e-actions"><button type="button" class="btn small-btn ev-view" data-id="${e.id}">ดู</button>${canDelete?`<button type="button" class="btn small-btn danger ev-del" data-id="${e.id}">ลบ</button>`:''}</span></div>`).join(''):'<div class="muted small">ยังไม่มีไฟล์</div>'; });
    $$('.ev-view').forEach(b=>b.onclick=()=>viewEvidence(b.dataset.id)); $$('.ev-del').forEach(b=>b.onclick=()=>deleteEvidence(b.dataset.id));
    $$('.camera-pick').forEach(b=>{b.disabled=!editable;b.onclick=()=>$('#camera_'+b.dataset.cat).click();});
    $$('.file-pick').forEach(b=>{b.disabled=!editable;b.onclick=()=>$('#file_'+b.dataset.cat).click();});
    ['cbc','adam','ph'].forEach(cat=>{ const camera=$('#camera_'+cat), file=$('#file_'+cat); if(camera)camera.onchange=()=>uploadEvidence(cat,'camera'); if(file)file.onchange=()=>uploadEvidence(cat,'file'); });
  }

  async function ensureSaved(){ if(state.currentRecordId) return state.currentRecordId; const ok=await saveRecord(false,true); return ok?state.currentRecordId:null; }
  function collectRecord(){
    const purpose=$('input[name="record_purpose"]:checked')?.value||'prepare';
    const payload={record_purpose:purpose,product_no:$('#product_no').value.trim(),product_type:$('#product_type').value,blood_group:$('#blood_group').value||null,collection_at:bangkokISO($('#collection_at').value),gross_weight_g:num($('#gross_weight_g').value),plt_instrument:$('#plt_instrument').value||null,plt_value_1:num($('#plt_value_1').value),plt_value_2:num($('#plt_value_2').value),plt_measured_at:bangkokISO($('#plt_measured_at').value),plt_use_mode:$('#plt_use_mode').value,wbc_adam:num($('#wbc_adam').value),wbc_measured_at:bangkokISO($('#wbc_measured_at').value),ph_value:num($('#ph_value').value),ph_measured_at:bangkokISO($('#ph_measured_at').value),ph_deviation_reason:$('#ph_deviation_reason').value.trim()||null,notes:$('#notes').value.trim()||null};
    if(state.currentRecordId&&adminUi()){
      const reason=$('#admin_edit_reason')?.value.trim();
      if(reason){payload.last_admin_edit_reason=reason;payload.last_admin_edit_id=crypto.randomUUID();}
    }
    return payload;
  }

  function collectPool(){ return [1,2,3,4,5,6].map(i=>({position:i,unit_no:$(`.pool-unit[data-pos="${i}"]`).value.trim(),pyi:num($(`.pool-pyi[data-pos="${i}"]`).value)})).filter(x=>x.unit_no||x.pyi!==null); }
  function normalizedPool(rows){ return rows.map(x=>({position:Number(x.position),unit_no:String(x.unit_no||''),pyi:x.pyi===null?null:Number(x.pyi)})).filter(x=>x.unit_no||x.pyi!==null).sort((a,b)=>a.position-b.position); }
  function poolHasChanged(){ return JSON.stringify(normalizedPool(collectPool()))!==JSON.stringify(normalizedPool(state.currentPool||[])); }
  async function savePool(recordId){
    const rows=collectPool(); for(const x of rows){if(!x.unit_no||x.pyi===null)throw new Error(`Pool unit #${x.position}: กรุณากรอก Unit No. และ PYI ให้ครบ`);}
    if(!poolHasChanged()) return;
    const {error:del}=await state.sb.from('pool_units').delete().eq('record_id',recordId); if(del)throw del;
    if(rows.length){const {error}=await state.sb.from('pool_units').insert(rows.map(x=>({...x,record_id:recordId,created_by:state.user.id})));if(error)throw error;}
    state.currentPool=normalizedPool(rows);
  }
  function recordPayloadHasChanged(payload){
    const cur=state.records.find(x=>x.id===state.currentRecordId); if(!cur)return false;
    const keys=['record_purpose','product_no','product_type','blood_group','collection_at','gross_weight_g','plt_instrument','plt_value_1','plt_value_2','plt_measured_at','plt_use_mode','wbc_adam','wbc_measured_at','ph_value','ph_measured_at','ph_deviation_reason','notes'];
    const dateKeys=new Set(['collection_at','plt_measured_at','wbc_measured_at','ph_measured_at']);
    const numberKeys=new Set(['gross_weight_g','plt_value_1','plt_value_2','wbc_adam','ph_value']);
    const norm=(k,v)=>{if(v===undefined||v===null||v==='')return null;if(dateKeys.has(k)){const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toISOString();}if(numberKeys.has(k))return Number(v);return String(v);};
    return keys.some(k=>JSON.stringify(norm(k,payload[k]))!==JSON.stringify(norm(k,cur[k])));
  }

  async function saveRecord(silent=false,auto=false){
    try{
      const payload=collectRecord();
      if(!payload.product_no||!payload.product_type){if(auto)showToast('กรอก Product No. และผลิตภัณฑ์ก่อนแนบไฟล์','error');else showToast('กรุณากรอก Product No. และผลิตภัณฑ์','error');return false;}
      let id=state.currentRecordId;
      const recordChanged=id?recordPayloadHasChanged(payload):true;
      const poolChangedNow=id?poolHasChanged():false;
      if(id&&adminUi()){
        const correction=recordChanged||poolChangedNow;
        if(correction&&!payload.last_admin_edit_reason){showToast('Admin กรุณาระบุเหตุผลการแก้ไขก่อนบันทึก','error');$('#admin_edit_reason')?.focus();return false;}
        if(!correction){delete payload.last_admin_edit_reason;delete payload.last_admin_edit_id;}
      }
      if(id){if(recordChanged || (adminUi()&&poolChangedNow)){const {error}=await state.sb.from('platelet_records').update(payload).eq('id',id);if(error)throw error;}}
      else {const {data,error}=await state.sb.from('platelet_records').insert({...payload,created_by:state.user.id}).select('id').single();if(error)throw error;id=data.id;state.currentRecordId=id;}
      if(productSetting(payload.product_type)?.requires_pool || payload.product_type?.startsWith('LDPPC ')) await savePool(id); else if((state.currentPool||[]).length){const {error}=await state.sb.from('pool_units').delete().eq('record_id',id);if(error)throw error;state.currentPool=[];}
      await loadRecords(); if(!silent)showToast(state.currentRecordId===id?'บันทึกแล้ว':'บันทึกแล้ว','good'); if(!auto) await renderRecordForm(); return true;
    }catch(e){showToast(errText(e),'error');return false;}
  }

  async function uploadEvidence(cat,source='file'){
    try{
      const input=$('#'+(source==='camera'?'camera_':'file_')+cat),file=input.files[0];if(!file){showToast('เลือกไฟล์ก่อน','error');return;} if(file.size>10*1024*1024){showToast('ไฟล์ต้องไม่เกิน 10 MB','error');return;}
      let changeReason=null;
      if(state.currentRecordId&&adminUi()){
        changeReason=$('#admin_edit_reason')?.value.trim()||null;
        if(!changeReason){showToast('Admin กรุณาระบุเหตุผลการแก้ไขก่อนแนบหลักฐานใหม่','error');input.value='';$('#admin_edit_reason')?.focus();return;}
      }
      const rid=await ensureSaved();if(!rid)return;
      const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100); const path=`${rid}/${cat}/${Date.now()}_${clean}`;
      const {error:uerr}=await state.sb.storage.from('platelet-evidence').upload(path,file,{upsert:false,contentType:file.type||undefined});if(uerr)throw uerr;
      const {data,error}=await state.sb.from('evidence_files').insert({record_id:rid,category:cat,storage_path:path,original_name:file.name,mime_type:file.type,file_size:file.size,uploaded_by:state.user.id,change_reason:changeReason}).select('*').single();
      if(error){await state.sb.storage.from('platelet-evidence').remove([path]);throw error;}
      state.currentEvidence.push(data);input.value='';
      const current=state.records.find(x=>x.id===rid);renderEvidenceLists(rid,true,current?.status==='locked');showToast('อัปโหลดหลักฐานแล้ว','good');
    }catch(e){showToast(errText(e),'error');}
  }

  async function viewEvidence(id){ const e=state.currentEvidence.find(x=>x.id===id);if(!e)return; const {data,error}=await state.sb.storage.from('platelet-evidence').createSignedUrl(e.storage_path,120);if(error){showToast(errText(error),'error');return;} window.open(data.signedUrl,'_blank','noopener'); }
  async function deleteEvidence(id){
    const e=state.currentEvidence.find(x=>x.id===id);if(!e)return;
    const current=state.records.find(x=>x.id===state.currentRecordId);
    if(current?.status==='locked'&&adminUi()){showToast('รายการ LOCK แล้ว ให้คงหลักฐานเดิมและแนบหลักฐานใหม่เพิ่ม','error');return;}
    let adminReason=null;
    if(state.currentRecordId&&adminUi()){
      adminReason=$('#admin_edit_reason')?.value.trim()||null;
      if(!adminReason){showToast('Admin กรุณาระบุเหตุผลการแก้ไขก่อนลบหลักฐาน','error');$('#admin_edit_reason')?.focus();return;}
    }
    if(!confirm(`ลบหลักฐาน ${e.original_name} ?`))return;
    if(adminReason){
      const {error:logErr}=await state.sb.from('platelet_records').update({last_admin_edit_reason:adminReason,last_admin_edit_id:crypto.randomUUID()}).eq('id',state.currentRecordId);
      if(logErr){showToast(errText(logErr),'error');return;}
    }
    const {error:s}=await state.sb.storage.from('platelet-evidence').remove([e.storage_path]);if(s){showToast(errText(s),'error');return;}
    const {error}=await state.sb.from('evidence_files').delete().eq('id',id);if(error){showToast(errText(error),'error');return;}
    state.currentEvidence=state.currentEvidence.filter(x=>x.id!==id);renderEvidenceLists(state.currentRecordId,true,false);showToast('ลบหลักฐานแล้ว');
  }
  async function submitRecord(){ if(!await saveRecord(true))return; try{const {error}=await state.sb.from('platelet_records').update({status:'submitted'}).eq('id',state.currentRecordId);if(error)throw error;await loadRecords();showToast('ส่งตรวจทวนแล้ว','good');await renderRecordForm();}catch(e){showToast(errText(e),'error');} }
  async function lockRecord(){ if(!confirm('ยืนยันว่าตรวจทวนข้อมูลและหลักฐานแล้ว และต้องการ LOCK รายการนี้?'))return; try{const {error}=await state.sb.from('platelet_records').update({status:'locked'}).eq('id',state.currentRecordId);if(error)throw error;await loadRecords();showToast('LOCK รายการแล้ว','good');await renderRecordForm();}catch(e){showToast(errText(e),'error');} }
  async function unlockRecord(){ const reason=prompt('ระบุเหตุผลที่ต้องปลดล็อก (จำเป็น):');if(!reason?.trim())return; try{const {error}=await state.sb.from('platelet_records').update({status:'draft',last_unlock_reason:reason.trim()}).eq('id',state.currentRecordId);if(error)throw error;await loadRecords();showToast('ปลดล็อกแล้ว ระบบเพิ่ม Revision ใหม่','good');await renderRecordForm();}catch(e){showToast(errText(e),'error');} }
  async function adminDeleteRecord(id){
    if(!adminUi())return;
    const reason=prompt('ระบุเหตุผลที่ลบรายการ (จำเป็น):\nเช่น สร้าง Product No. ซ้ำ / บันทึกรายการผิดคน');
    if(!reason?.trim())return;
    if(!confirm('ยืนยันลบรายการนี้ออกจากรายการใช้งาน? ข้อมูลและหลักฐานจะยังเก็บไว้เพื่อ Audit'))return;
    try{
      const {error}=await state.sb.from('platelet_records').update({deleted_at:new Date().toISOString(),deleted_by:state.user.id,delete_reason:reason.trim()}).eq('id',id);if(error)throw error;
      await loadRecords();showToast('ลบรายการแล้ว และเก็บประวัติไว้ใน Audit Log','good');$('#detailDialog')?.close();switchView('records');
    }catch(e){showToast(errText(e),'error');}
  }
  async function adminRestoreRecord(id){
    if(!adminUi())return;
    const reason=prompt('ระบุเหตุผลที่กู้คืนรายการ (จำเป็น):');if(!reason?.trim())return;
    try{
      const {error}=await state.sb.from('platelet_records').update({deleted_at:null,deleted_by:null,delete_reason:null,last_admin_edit_reason:reason.trim(),last_admin_edit_id:crypto.randomUUID()}).eq('id',id);if(error)throw error;
      await loadRecords();showToast('กู้คืนรายการแล้ว','good');$('#detailDialog')?.close();switchView('records');
    }catch(e){showToast(errText(e),'error');}
  }

  async function openDetail(id){
    try{
      const {data:r,error}=await state.sb.from('platelet_records').select('*').eq('id',id).single();if(error)throw error;
      const [{data:pool},{data:ev},{data:audit}]=await Promise.all([state.sb.from('pool_units').select('*').eq('record_id',id).order('position'),state.sb.from('evidence_files').select('*').eq('record_id',id).order('created_at'),adminUi()?state.sb.from('audit_logs').select('*').eq('record_id',id).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[]})]);
      $('#detailTitle').textContent=r.product_no;$('#detailSubtitle').textContent=`${r.product_type} · ${purposeTH(r.record_purpose)} · Revision ${r.revision}`;
      logActivity('view_record','record',r.id,{product_no:r.product_no,product_type:r.product_type,purpose:r.record_purpose}).catch(()=>{});
      const canEdit=!r.deleted_at&&(adminUi()||r.status==='draft'||(reviewerUi()&&r.status==='submitted'));
      $('#detailBody').innerHTML=`<div class="status-line">${purposeBadge(r.record_purpose)} ${deletedBadge(r)} ${statusBadge(r.status)} ${qcBadgeForRecord(r)} ${pHBadge(r)}</div>
      ${r.deleted_at?`<div class="notice bad"><strong>ลบออกจากรายการใช้งานแล้ว</strong><br>${esc(r.delete_reason||'–')} · ${dateTH(r.deleted_at)} · ${esc(profileName(r.deleted_by))}</div>`:''}
      <div class="divider"></div><div class="detail-grid">${dcell('ประเภท',purposeTH(r.record_purpose))}${dcell('กำหนดประเภทเมื่อ',dateTH(r.purpose_selected_at))}${dcell('กำหนดโดย',profileName(r.purpose_selected_by))}${dcell('Group',r.blood_group)}${dcell('วัน-เวลาเริ่มเจาะ',dateTH(r.collection_at))}${dcell('วัน-เวลาหมดอายุ',dateTH(r.expiry_at))}${dcell('น้ำหนักที่ชั่งได้',fmt(r.gross_weight_g,2)+' g')}${dcell('น้ำหนักถุงเปล่า',fmt(r.bag_tare_weight_g,2)+' g')}${dcell('Density',fmt(r.density,2))}${dcell('Volume',fmt(r.volume_ml,2)+' mL')}${dcell('Pool PYI',fmt(r.pool_pyi,2))}${dcell('เครื่อง CBC',r.plt_instrument)}${dcell('วันเวลาวัด CBC',measuredTH(r.plt_measured_at))}${dcell('PLT ที่ใช้',fmt(r.plt_used,2)+' K/µL')}${dcell('Platelet yield',fmt(r.platelet_yield,3)+' ×10¹¹')}${dcell('Equivalent Units',fmt(r.equivalent_units,2))}${dcell('WBC ADAM',fmt(r.wbc_adam,4)+' /µL')}${dcell('วันเวลาวัด ADAM',measuredTH(r.wbc_measured_at))}${dcell('Residual WBC',fmt(r.residual_wbc,3)+' ×10⁶')}${dcell('pH',fmt(r.ph_value,3))}${dcell('วันเวลาวัด pH',dateTH(r.ph_measured_at))}${dcell('ผู้บันทึก',profileName(r.created_by))}${dcell('ผู้ LOCK',profileName(r.locked_by))}</div>
      ${r.record_purpose==='qc'?`<div class="notice ${r.qc_status==='pass'?'good':r.qc_status==='review'?'warning':'info'}"><strong>ผลประเมิน QC:</strong> ${esc(qcTH(r.qc_status))}</div>`:'<div class="notice info"><strong>Prepare ตามปกติ</strong> ค่าตรวจและผลคำนวณยังถูกเก็บครบ แต่รายการนี้ไม่นำไปนับเป็น QC</div>'}
      ${r.ph_deviation_reason?`<div class="notice warning"><strong>เหตุผล pH ไม่ตรงวัน Exp.</strong><br>${esc(r.ph_deviation_reason)}</div>`:''}${r.notes?`<div class="panel"><h3>หมายเหตุ</h3>${esc(r.notes)}</div>`:''}
      <div class="panel"><h3>Units ที่ใช้ Pool</h3>${pool?.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Unit No.</th><th>PYI</th></tr></thead><tbody>${pool.map(x=>`<tr><td>${x.position}</td><td>${esc(x.unit_no)}</td><td>${fmt(x.pyi,2)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">ไม่ใช่ LDPPC / ไม่มีข้อมูล Pool</div>'}</div>
      <div class="panel"><h3>หลักฐาน</h3><div class="evidence-list">${ev?.length?ev.map(x=>`<div class="evidence-item"><span class="name">${esc(x.category.toUpperCase())} · ${esc(x.original_name)}${x.change_reason?`<small class="evidence-reason">เหตุผล Admin: ${esc(x.change_reason)}</small>`:''}</span><button class="btn small-btn detail-evidence" data-path="${esc(x.storage_path)}">ดู</button></div>`).join(''):'<div class="muted">ยังไม่มีหลักฐาน</div>'}</div></div>
      ${adminUi()?`<div class="panel"><h3>Audit trail</h3><div class="timeline">${audit?.length?audit.map(a=>auditItem(a)).join(''):'<div class="muted">ยังไม่มีประวัติ</div>'}</div></div>`:''}
      <div class="actions"><button class="btn" id="detailClose">ปิด</button>${canEdit?'<button class="btn primary" id="detailEdit">เปิดแก้ไข / ตรวจทวน</button>':''}${adminUi()&&!r.deleted_at?'<button class="btn danger" id="detailDelete">ลบรายการ</button>':''}${adminUi()&&r.deleted_at?'<button class="btn good" id="detailRestore">กู้คืนรายการ</button>':''}</div>`;
      $$('.detail-evidence').forEach(b=>b.onclick=async()=>{const {data,error}=await state.sb.storage.from('platelet-evidence').createSignedUrl(b.dataset.path,120);if(error)showToast(errText(error),'error');else window.open(data.signedUrl,'_blank','noopener');});
      $('#detailClose').onclick=()=>$('#detailDialog').close();
      if($('#detailEdit'))$('#detailEdit').onclick=()=>{$('#detailDialog').close();state.currentRecordId=id;switchView('record');};
      if($('#detailDelete'))$('#detailDelete').onclick=()=>adminDeleteRecord(id);
      if($('#detailRestore'))$('#detailRestore').onclick=()=>adminRestoreRecord(id);
      $('#detailDialog').showModal();
    }catch(e){showToast(errText(e),'error');}
  }

  function dcell(l,v){return `<div class="detail-cell"><span>${l}</span><strong>${esc(v??'–')}</strong></div>`;}
  function auditItem(a){
    const who=a.actor_id?profileName(a.actor_id):'ระบบ'; let diff='';
    const labels={record_purpose:'ประเภท',status:'สถานะ',product_no:'Product No.',product_type:'ผลิตภัณฑ์',blood_group:'Group',collection_at:'วันเวลาเริ่มเจาะ',gross_weight_g:'น้ำหนักที่ชั่งได้ (g)',bag_tare_weight_g:'น้ำหนักถุงเปล่า (g)',density:'Density',volume_ml:'Volume (mL)',pool_pyi:'Pool PYI',plt_instrument:'เครื่อง CBC',plt_value_1:'PLT ครั้งที่ 1',plt_value_2:'PLT ครั้งที่ 2',plt_measured_at:'วันเวลาวัด CBC',plt_use_mode:'ค่าที่ใช้คำนวณ',wbc_adam:'WBC ADAM',wbc_measured_at:'วันเวลาวัด ADAM',ph_value:'pH',ph_measured_at:'วันเวลาวัด pH',ph_deviation_reason:'เหตุผล pH',notes:'หมายเหตุ',revision:'Revision',deleted_at:'สถานะการลบ'};
    if(a.old_data&&a.new_data){const changed=Object.keys(labels).filter(k=>JSON.stringify(a.old_data[k])!==JSON.stringify(a.new_data[k])); if(changed.length)diff=changed.map(k=>`${labels[k]}: ${a.old_data[k]??'–'} → ${a.new_data[k]??'–'}`).join('\n');}
    return `<div class="timeline-item"><strong>${esc(actionTH(a.action))}</strong><small>${esc(who)} · ${dateTH(a.created_at)}</small>${a.note?`<div class="diff"><strong>เหตุผล:</strong> ${esc(a.note)}</div>`:''}${diff?`<div class="diff">${esc(diff)}</div>`:''}</div>`;
  }

  async function renderSettings(){
    if(!adminUi()){switchView('dashboard');return;} await loadProfiles(); const s=state.settings;
    $('#view-settings').innerHTML=`<div class="page-head"><div><h1>จัดการระบบ Platelet</h1><p class="muted">จัดการผู้ใช้งาน สิทธิ์ รหัสผ่าน ค่าคำนวณ และเกณฑ์สำหรับรายการที่ใช้เป็น QC</p></div><div class="actions"><button class="btn" id="openAuditFromSettings">ประวัติการใช้งาน</button></div></div>
      <div class="panel"><h2>สร้างบัญชีเจ้าหน้าที่</h2><p class="section-note">Admin สร้างบัญชี @mahidol.ac.th และกำหนดรหัสผ่านชั่วคราวได้จากหน้านี้ ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อ Login ครั้งแรก</p>
        <div class="user-create-grid">
          <div class="field"><label>Mahidol ID / Username</label><div class="email-field"><input id="new_username" autocomplete="off" placeholder="เช่น somchai.som"><span>@mahidol.ac.th</span></div></div>
          <div class="field"><label>ชื่อ-นามสกุล / ชื่อที่แสดง</label><input id="new_display_name" placeholder="ชื่อที่แสดงในระบบ"></div>
          <div class="field"><label>ตำแหน่ง</label><input id="new_position" placeholder="เช่น นักเทคนิคการแพทย์"></div>
          <div class="field"><label>สิทธิ์</label><select id="new_role"><option value="staff">Staff</option><option value="reviewer">Reviewer</option><option value="admin">Admin</option></select></div>
          <div class="field user-create-password"><label>รหัสผ่านชั่วคราว</label><input id="new_temp_password" type="password" minlength="8" autocomplete="new-password" placeholder="อย่างน้อย 8 ตัวอักษร"></div>
          <div class="field user-create-action"><label>&nbsp;</label><button class="btn primary" id="createUserBtn" type="button">+ สร้างบัญชี</button></div>
        </div><p id="createUserMessage" class="muted small"></p>
        <div class="notice info small"><strong>ความปลอดภัย:</strong> การสร้างบัญชีและ Reset password ทำผ่าน Supabase Edge Function เท่านั้น ไม่มี Service Role / Secret key อยู่ใน GitHub Pages</div>
      </div>
      <div class="panel"><h2>ผู้ใช้งานระบบ Platelet</h2><p class="section-note">บัญชีเดียวใช้สำหรับการบันทึก Prepare และ QC ของ Platelet และรองรับโมดูลอื่นในอนาคต</p><div class="table-wrap"><table class="data-table users-table"><thead><tr><th>Username</th><th>ชื่อ</th><th>ตำแหน่ง</th><th>Role</th><th>Active</th><th>First Login</th><th>Last Login</th><th>จัดการ</th></tr></thead><tbody>${state.profiles.map(p=>`<tr data-user-id="${p.id}"><td><strong>${esc((p.email||'').split('@')[0])}</strong><div class="muted small">${esc(p.email)}</div></td><td><input class="u-name" value="${esc(p.display_name||'')}"></td><td><input class="u-position" value="${esc(p.position||'')}" placeholder="ตำแหน่ง"></td><td><select class="role-select u-role">${['staff','reviewer','admin'].map(r=>`<option value="${r}" ${p.role===r?'selected':''}>${roleTH(r)}</option>`).join('')}</select></td><td><label class="toggle-cell"><input class="u-active" type="checkbox" ${p.is_active?'checked':''}> <span>${p.is_active?'Active':'ปิดใช้'}</span></label></td><td><span class="password-state ${p.must_change_password?'pending':'ok'}">${p.must_change_password?'รอเปลี่ยนรหัส':'ตั้งรหัสแล้ว'}</span></td><td class="nowrap">${dateTH(p.last_login_at)}</td><td><div class="row-actions"><button class="btn small-btn u-save" data-id="${p.id}">บันทึก</button><button class="btn small-btn u-reset" data-id="${p.id}" ${p.id===state.user.id?'disabled title="ใช้เมนูเปลี่ยนรหัสผ่านของตนเอง"':''}>Reset password</button><button class="btn small-btn u-audit" data-id="${p.id}">Audit</button></div></td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><h2>ค่าคำนวณ Volume จากน้ำหนัก</h2><p class="section-note">เจ้าหน้าที่กรอกน้ำหนักที่ชั่งได้เป็นกรัม ระบบใช้สูตร (น้ำหนักที่ชั่งได้ − น้ำหนักถุงเปล่า) ÷ Density และเก็บค่าที่ใช้คำนวณไว้กับแต่ละรายการเพื่อทวนสอบย้อนหลัง</p><div class="table-wrap"><table class="data-table product-setting-table"><thead><tr><th>ผลิตภัณฑ์</th><th>น้ำหนักถุงเปล่า (g)</th><th>Density</th><th>Pool</th><th></th></tr></thead><tbody>${state.productSettings.filter(x=>x.is_active).map(x=>`<tr data-product-type="${esc(x.product_type)}"><td><strong>${esc(x.product_type)}</strong></td><td><input class="ps-tare" type="number" step="0.01" min="0" value="${esc(x.tare_weight_g)}"></td><td><input class="ps-density" type="number" step="0.001" min="0.001" value="${esc(x.density)}"></td><td>${x.requires_pool?'LDPPC 3–6 Units':'–'}</td><td><button class="btn small-btn ps-save" type="button" data-product="${esc(x.product_type)}">บันทึก</button></td></tr>`).join('')}</tbody></table></div></div>
      <div class="notice warning"><strong>ก่อนเริ่มใช้งานจริง:</strong> ตรวจสอบทั้งค่าน้ำหนักถุง/Density และเกณฑ์ QC ของเกล็ดเลือดให้ตรงกับ WI และข้อกำหนดที่หน่วยอนุมัติ การเปลี่ยนค่าจะมีผลกับรายการใหม่และถูกบันทึกใน Audit Log</div>
      <div class="panel"><h2>เกณฑ์ QC เกล็ดเลือด</h2><div class="form-grid">${settingField('Platelet yield ขั้นต่ำ','s_yield',s.platelet_yield_min)}${settingField('Equivalent Unit factor','s_factor',s.equivalent_unit_factor)}${settingField('Residual WBC สูงสุด','s_wbc',s.residual_wbc_max)}${settingField('pH ขั้นต่ำ','s_ph',s.ph_min)}${settingField('อายุผลิตภัณฑ์ (วัน)','s_expiry',s.expiry_days,1)}${settingField('PLT repeat ต่างกันสูงสุด (%)','s_diff',s.plt_repeat_diff_max_pct)}</div><div class="switch-row" style="margin-top:14px"><label><input id="s_cbc" type="checkbox" ${s.require_cbc_evidence?'checked':''}> บังคับหลักฐาน CBC</label><label><input id="s_adam" type="checkbox" ${s.require_adam_evidence?'checked':''}> บังคับหลักฐาน ADAM</label><label><input id="s_ph_ev" type="checkbox" ${s.require_ph_evidence?'checked':''}> บังคับหลักฐาน pH</label></div><div class="actions" style="margin-top:14px"><button class="btn primary" id="saveSettings">บันทึกเกณฑ์</button></div></div>`;
    $('#createUserBtn').onclick=createUserByAdmin; $('#saveSettings').onclick=saveSettings; $('#openAuditFromSettings').onclick=()=>{state.auditUserFilter='';switchView('audit');};
    $$('.u-save').forEach(b=>b.onclick=()=>saveUser(b.dataset.id));
    $$('.u-reset').forEach(b=>b.onclick=()=>openAdminReset(b.dataset.id));
    $$('.u-audit').forEach(b=>b.onclick=()=>{state.auditUserFilter=b.dataset.id;switchView('audit');});
    $$('.ps-save').forEach(b=>b.onclick=()=>saveProductSetting(b.dataset.product));
  }
  function settingField(l,id,v,step='0.01'){return `<div class="field"><label>${l}</label><input id="${id}" type="number" step="${step}" min="0" value="${esc(v)}"></div>`;}
  async function createUserByAdmin(){
    const username=$('#new_username').value.trim().toLowerCase(),display_name=$('#new_display_name').value.trim(),position=$('#new_position').value.trim(),role=$('#new_role').value,password=$('#new_temp_password').value;
    const msg=$('#createUserMessage');
    if(!username||username.includes('@')){msg.textContent='กรอกเฉพาะ Mahidol ID เช่น somchai.som';return;}
    if(!display_name){msg.textContent='กรุณากรอกชื่อที่แสดง';return;}
    if(password.length<8){msg.textContent='รหัสผ่านชั่วคราวต้องอย่างน้อย 8 ตัวอักษร';return;}
    msg.textContent='กำลังสร้างบัญชี...';
    try{await invokeAdminUsers({action:'create_user',username,display_name,position,role,password});msg.textContent='';showToast('สร้างบัญชีเรียบร้อย','good');await loadProfiles();renderSettings();}catch(e){msg.textContent=errText(e);}
  }
  function openAdminReset(id){
    const p=state.profiles.find(x=>x.id===id); if(!p)return; state.resetTargetId=id;
    $('#adminResetTarget').textContent=`${p.display_name||p.email} · ${p.email}`; $('#adminTempPassword').value='';$('#adminTempPasswordConfirm').value='';$('#adminResetPasswordMessage').textContent='';$('#adminResetPasswordDialog').showModal();
  }
  async function saveProductSetting(type){
    try{ const row=$$('.product-setting-table tbody tr').find(x=>x.dataset.productType===type); if(!row)throw new Error('ไม่พบผลิตภัณฑ์'); const tare=num($('.ps-tare',row).value),density=num($('.ps-density',row).value); if(tare===null||tare<0)throw new Error('น้ำหนักถุงไม่ถูกต้อง'); if(density===null||density<=0)throw new Error('Density ต้องมากกว่า 0'); const {error}=await state.sb.from('platelet_product_settings').update({tare_weight_g:tare,density}).eq('product_type',type); if(error)throw error; await loadProductSettings(); showToast(`บันทึก ${type} แล้ว`,'good'); renderSettings(); }catch(e){showToast(errText(e),'error');}
  }
  async function saveSettings(){ try{const payload={platelet_yield_min:num($('#s_yield').value),equivalent_unit_factor:num($('#s_factor').value),residual_wbc_max:num($('#s_wbc').value),ph_min:num($('#s_ph').value),expiry_days:Number($('#s_expiry').value),plt_repeat_diff_max_pct:num($('#s_diff').value),require_cbc_evidence:$('#s_cbc').checked,require_adam_evidence:$('#s_adam').checked,require_ph_evidence:$('#s_ph_ev').checked}; const {error}=await state.sb.from('qc_settings').update(payload).eq('id',1);if(error)throw error;await loadSettings();showToast('บันทึกเกณฑ์แล้ว','good');renderSettings();}catch(e){showToast(errText(e),'error');} }
  async function saveUser(id){
    try{
      const row=$(`tr[data-user-id="${id}"]`); if(!row)throw new Error('ไม่พบแถวผู้ใช้');
      const payload={display_name:$('.u-name',row).value.trim()||null,position:$('.u-position',row).value.trim()||null,role:$('.u-role',row).value,is_active:$('.u-active',row).checked};
      if(id===state.user.id&&!payload.is_active)throw new Error('ไม่ควรปิดบัญชี Admin ที่กำลังใช้งานอยู่');
      const {error}=await state.sb.from('profiles').update(payload).eq('id',id);if(error)throw error;
      if(id===state.user.id){state.profile={...state.profile,...payload};applyUiMode(false);}
      showToast('บันทึกผู้ใช้แล้ว','good');await loadProfiles();renderSettings();
    }catch(e){showToast(errText(e),'error');}
  }
  async function renderAuditLog(){
    if(!adminUi()){switchView('dashboard');return;}
    await loadProfiles();
    const {data,error}=await state.sb.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(1000); if(error){showToast(errText(error),'error');return;}
    const all=data||[];
    $('#view-audit').innerHTML=`<div class="page-head"><div><h1>ประวัติการใช้งาน (Audit Log)</h1><p class="muted">ทวนสอบว่าใครเข้าระบบ สร้างหรือแก้ไขรายการ เปลี่ยน Prepare/QC แนบหลักฐาน ลบรายการ ส่งตรวจทวน LOCK หรือจัดการระบบ</p></div><div class="actions"><button class="btn" id="auditRefresh">รีเฟรช</button></div></div>
      <div class="panel"><div class="audit-filters"><select id="auditUser"><option value="">ผู้ใช้ทุกคน</option>${state.profiles.map(p=>`<option value="${p.id}" ${state.auditUserFilter===p.id?'selected':''}>${esc(p.display_name||p.email)}</option>`).join('')}</select><input id="auditSearch" placeholder="ค้นหา action / Product No. / Email"><select id="auditType"><option value="">ทุกประเภท</option><option value="session">Session</option><option value="record">Record</option><option value="pool_units">Pool</option><option value="evidence_files">Evidence</option><option value="profile">Profile</option><option value="settings">Settings</option><option value="product_settings">Product Settings</option><option value="user_admin">User Admin</option><option value="account">Account</option><option value="report">Report</option></select><button class="btn" id="auditClear">ล้างตัวกรอง</button></div><div id="auditHost"></div></div>`;
    const render=()=>{
      const uid=$('#auditUser').value,q=$('#auditSearch').value.trim().toLowerCase(),typ=$('#auditType').value;
      state.auditUserFilter=uid;
      const rows=all.filter(a=>(!uid||a.actor_id===uid)&&(!typ||a.entity_type===typ)&&(!q||`${a.action} ${a.entity_type} ${JSON.stringify(a.new_data||{})} ${JSON.stringify(a.old_data||{})}`.toLowerCase().includes(q)));
      $('#auditHost').innerHTML=rows.length?`<div class="table-wrap"><table class="data-table audit-table"><thead><tr><th>วันเวลา</th><th>ผู้ใช้งาน</th><th>การกระทำ</th><th>รายการ/รายละเอียด</th></tr></thead><tbody>${rows.map(a=>`<tr><td class="nowrap">${dateTH(a.created_at)}</td><td><strong>${esc(profileName(a.actor_id))}</strong></td><td><span class="badge draft">${esc(actionTH(a.action))}</span><div class="muted small">${esc(a.entity_type||'-')}</div></td><td>${auditSummary(a)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">ไม่พบ Audit Log ตามเงื่อนไข</div>';
    };
    $('#auditUser').addEventListener('change',render);$('#auditSearch').addEventListener('input',render);$('#auditType').addEventListener('change',render);$('#auditClear').onclick=()=>{state.auditUserFilter='';$('#auditUser').value='';$('#auditSearch').value='';$('#auditType').value='';render();};$('#auditRefresh').onclick=()=>renderAuditLog();render();
  }
  function auditSummary(a){
    const n=a.new_data||{},o=a.old_data||{};
    const product=n.product_no||o.product_no||''; const target=n.email||o.email||n.display_name||o.display_name||'';
    let headline=product?`Product: ${esc(product)}`:(target?esc(target):(a.record_id?`Record ${esc(a.record_id)}`:'-'));
    const safe={old:o,new:n,note:a.note||null};
    return `<div>${headline}</div>${a.note?`<div class="audit-note"><strong>เหตุผล:</strong> ${esc(a.note)}</div>`:''}<details class="audit-details"><summary>ดูรายละเอียดค่าก่อน/หลัง</summary><pre>${esc(JSON.stringify(safe,null,2))}</pre></details>`;
  }


  init().catch(e=>{console.error(e);showToast(errText(e),'error');showLogin();});
})();
