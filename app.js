/* CNMI Blood Component QC v5.3.8 - monthly QC tracking, Platelet weekly auto-QC/no-Pool evidence, mandatory result evidence */
(() => {
  'use strict';
  const C = window.APP_CONFIG || {};
  const $ = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = v => (v===null||v===undefined||v===''||Number.isNaN(Number(v))) ? null : Number(v);
  const fmt = (v,d=2)=> v===null||v===undefined||v==='' ? '–' : Number(v).toLocaleString('th-TH',{minimumFractionDigits:d,maximumFractionDigits:d});
  const roleTH = r => ({staff:'Staff',reviewer:'Reviewer (แพทย์)',admin:'Admin'})[r] || r || '-';
  const statusTH = s => ({draft:'ร่าง/กำลังบันทึก',submitted:'รอตรวจทวน',locked:'LOCK แล้ว'})[s] || s;
  const profileName = id => { const p=state.profiles.find(x=>x.id===id); return p?.display_name || p?.email || (id?'ไม่ทราบผู้ใช้':'–'); };
  const qcTH = s => ({not_qc:'ไม่ใช่รายการ QC',incomplete:'ข้อมูล QC ยังไม่ครบ',pass:'ผ่านเกณฑ์ QC',review:'ต้องตรวจสอบ QC'})[s] || s;
  const purposeTH = p => p==='qc' ? 'ใช้เป็น QC' : 'Prepare ตามปกติ';
  const purposeBadge = p => `<span class="badge ${p==='qc'?'qc-purpose':'prepare-purpose'}">${esc(purposeTH(p))}</span>`;
  const poolReleaseTH = s => ({not_applicable:'–',pending_pool:'รอข้อมูล Pool PYI',standard:'ผ่านเกณฑ์ Pool PYI',conditional_pending:'Pool แบบมีเงื่อนไข · รอผล Yield',conditional_pass:'ผ่านสำหรับฉลากปกติ',conditional_fail:'ไม่ผ่านเงื่อนไขฉลากปกติ',below_min:'Pool PYI ต่ำกว่าเกณฑ์อนุโลม'})[s] || s || '–';
  const poolReleaseBadge = s => {
    if(!s || s==='not_applicable') return '<span class="muted">–</span>';
    const cls=({standard:'pool-standard',conditional_pass:'pool-standard',conditional_pending:'pool-conditional',conditional_fail:'pool-fail',below_min:'pool-fail',pending_pool:'pool-pending'})[s]||'pool-pending';
    return `<span class="badge ${cls}">${esc(poolReleaseTH(s))}</span>`;
  };
  const measuredTH = iso => iso ? dateTH(iso) : 'ยังไม่บันทึก';
  const state = { sb:null, session:null, user:null, profile:null, settings:null, productSettings:[], records:[], plateletWeeklyEvents:[], plateletWeeklyEvidence:[], plateletWeeklyReady:false, plateletDashboardMonth:'', plasmaSettings:null, plasmaProductSettings:[], plasmaRecords:[], plasmaBatches:[], plasmaReady:false, plasmaDashboardMonth:'', rbcSettings:null, rbcProductSettings:[], rbcRecords:[], rbcMonthlyProduction:[], rbcReady:false, profiles:[], currentRecordId:null, currentEvidence:[], currentPool:[], currentPlasmaRecordId:null, currentPlasmaEvidence:[], currentPlasmaBatchId:null, currentRbcRecordId:null, currentRbcEvidence:[], rbcDashboardMonth:'', lastLoginPassword:null, uiMode:'staff', auditUserFilter:'', resetTargetId:null, showDeletedRecords:false, showDeletedPlasma:false, showDeletedRbc:false, currentView:'home', currentModule:null, currentPage:null, sessionRetryTimer:null, sidebarCollapsed:localStorage.getItem('bloodqc_sidebar_collapsed')==='1', openNavGroup:null, plasmaBatchPage:1 };
  const productSetting = type => state.productSettings.find(x=>x.product_type===type);
  const activeProducts = () => state.productSettings.filter(x=>x.is_active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.product_type.localeCompare(b.product_type));
  const productOptions = selected => activeProducts().map(x=>`<option value="${esc(x.product_type)}" ${selected===x.product_type?'selected':''}>${esc(x.product_type)}</option>`).join('');
  const ROUTES = {
    home:'#/',
    platelet:{dashboard:'#/platelet',record:'#/platelet/new',records:'#/platelet/records',guide:'#/platelet/guide',settings:'#/platelet/qc_settings'},
    rbc:{dashboard:'#/rbc',record:'#/rbc/new',records:'#/rbc/records',guide:'#/rbc/guide',settings:'#/rbc/qc_settings'},
    plasma:{dashboard:'#/plasma',record:'#/plasma/new',records:'#/plasma/records',guide:'#/plasma/guide',settings:'#/plasma/qc_settings'},
    review:'#/review',
    users:'#/admin/users',
    audit:'#/admin/audit'
  };
  function isStandaloneApp(){
    return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
  }
  function normalizeStandaloneLaunch(){
    // iOS Add to Home Screen can remember the exact page used during installation.
    // When the app is launched/reloaded as a standalone app, always begin at the Blood QC home.
    if(isStandaloneApp() && cleanHash()!==ROUTES.home){
      history.replaceState(null,'',location.pathname+location.search+ROUTES.home);
    }
  }

  const MODULE_META = {
    platelet:{label:'Platelet',title:'Platelet Preparation & QC',active:true},
    rbc:{label:'RBC',title:'RBC Preparation & QC',active:true},
    plasma:{label:'Plasma',title:'Plasma Preparation & QC',active:true}
  };
  function routeForView(v){
    const m={home:ROUTES.home,dashboard:ROUTES.platelet.dashboard,record:ROUTES.platelet.record,records:ROUTES.platelet.records,guide:ROUTES.platelet.guide,settings:ROUTES.platelet.settings,review:ROUTES.review,users:ROUTES.users,audit:ROUTES.audit};
    return m[v] || ROUTES.home;
  }
  function cleanHash(){ return (location.hash||'').replace(/\/+$/,'') || '#/'; }
  function parseRoute(){
    let h=cleanHash();
    const legacy={'#/platelet/admin':ROUTES.platelet.settings,'#/platelet/audit':ROUTES.audit};
    if(legacy[h]){ history.replaceState(null,'',location.pathname+location.search+legacy[h]); h=legacy[h]; }
    if(h==='#/' || h==='#') return {view:'home',module:null,page:'home',hash:ROUTES.home};
    if(h===ROUTES.review) return {view:'review',module:null,page:'review',hash:h,reviewerOnly:true};
    if(h===ROUTES.users) return {view:'users',module:null,page:'users',hash:h,adminOnly:true};
    if(h===ROUTES.audit) return {view:'audit',module:null,page:'audit',hash:h,adminOnly:true};
    for(const [module,routes] of Object.entries({platelet:ROUTES.platelet,rbc:ROUTES.rbc,plasma:ROUTES.plasma})){
      for(const [page,hash] of Object.entries(routes)){
        if(h===hash){
          if(module==='platelet'){
            const viewMap={dashboard:'dashboard',record:'record',records:'records',guide:'guide',settings:'settings'};
            return {view:viewMap[page]||'dashboard',module,page,hash,adminOnly:page==='settings'};
          }
          return {view:'module',module,page,hash,adminOnly:page==='settings'};
        }
      }
    }
    return {view:'home',module:null,page:'home',hash:ROUTES.home,unknown:true};
  }
  function normalizeAppRoute(){
    const r=parseRoute();
    if(r.unknown) history.replaceState(null,'',location.pathname+location.search+ROUTES.home);
    return parseRoute();
  }
  function updateRouteChrome(route){
    const sub=$('#brandSubtitle');
    const footer=$('#appFooter');
    if(route.module){
      const meta=MODULE_META[route.module];
      if(sub) sub.textContent=`${meta.title} · CNMI Blood Bank`;
      if(footer) footer.textContent=`CNMI Blood Component QC · ${meta.label} module · v5.3.8 · bloodqc.cnmiblood.com${route.hash}`;
    }else{
      if(sub) sub.textContent='Blood Component Preparation & QC · CNMI Blood Bank';
      if(footer) footer.textContent='CNMI Blood Component QC · v5.3.8 · bloodqc.cnmiblood.com';
    }
    document.title='Blood QC';
    $$('#mainTabs button[data-route]').forEach(b=>b.classList.remove('active'));
    const exact=$(`#mainTabs button[data-route="${route.hash}"]`);
    if(exact) exact.classList.add('active');
    else if(route.module){ $(`#${route.module}Tab`)?.classList.add('active'); }
    syncNavGroupToRoute(route);
  }

  function showToast(msg,type='') { const t=$('#toast'); t.textContent=msg; t.className=`toast show ${type}`; clearTimeout(showToast._t); showToast._t=setTimeout(()=>t.className='toast',3500); }
  function errText(e){ return e?.message || String(e || 'เกิดข้อผิดพลาด'); }
  function bangkokISO(inputValue){ return inputValue ? new Date(inputValue+':00+07:00').toISOString() : null; }
  function inputFromISO(iso){ if(!iso) return ''; const d=new Date(iso); const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d); const m=Object.fromEntries(parts.map(x=>[x.type,x.value])); return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`; }
  function dateTH(iso,withTime=true){ if(!iso) return '–'; return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',...(withTime?{timeStyle:'short'}:{})}).format(new Date(iso)); }
  function dateTHLong(iso){ if(!iso)return '–'; return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'}).format(new Date(iso)); }
  function sameBangkokDate(a,b){ return a&&b && inputFromISO(a).slice(0,10)===inputFromISO(b).slice(0,10); }
  function firstOfMonthISO(){ const now=new Date(); return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(); }
  function cfgReady(){ return C.SUPABASE_URL && C.SUPABASE_KEY && !C.SUPABASE_URL.includes('PASTE_') && !C.SUPABASE_KEY.includes('PASTE_'); }
  async function logActivity(action,entityType='system',recordId=null,detail={}){
    if(!state.sb||!state.user||!state.profile||state.profile.must_change_password) return;
    const payload={app_version:'5.3.8',module:state.currentModule||'core',ui_mode:state.uiMode,...detail};
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
    const m={login:'เข้าสู่ระบบ',logout:'ออกจากระบบ',ui_mode_change:'สลับโหมด',view_record:'เปิดดูรายการ',export_csv:'Export CSV',create_user:'สร้างบัญชีผู้ใช้',reset_password:'Reset password',update_profile:'แก้ข้อมูล/สิทธิ์ผู้ใช้',update_qc_settings:'แก้เกณฑ์การเตรียม/QC',update_product_settings:'แก้น้ำหนักถุง/Density',password_changed:'เปลี่ยนรหัสผ่าน',create:'สร้างรายการ',update:'แก้ไขรายการ',admin_edit:'Admin แก้ไขรายการ',admin_delete:'Admin ลบรายการ',admin_restore:'Admin กู้คืนรายการ',insert:'เพิ่มข้อมูล',delete:'ลบข้อมูล',create_outlab_batch:'สร้างชุดนำส่ง Factor VIII',update_outlab_batch:'แก้ชุดนำส่ง Factor VIII',export_pdf:'Export PDF'};
    if(m[a]) return m[a];
    if(a?.startsWith('status:draft→submitted')) return 'ส่งตรวจทวน';
    if(a?.startsWith('status:submitted→locked')) return 'แพทย์ทบทวนและ LOCK';
    if(a?.startsWith('status:submitted→draft')) return 'แพทย์ส่งกลับแก้ไข';
    if(a?.startsWith('status:locked→draft')) return 'ปลดล็อก / Revision ใหม่';
    return a||'-';
  }
  function doctorTestAvailable(){ return state.profile?.role==='admin' && state.profile?.can_review===true; }
  function doctorTestMode(){ return doctorTestAvailable() && state.uiMode==='reviewer'; }
  function effectiveRole(){
    if(!state.profile) return 'staff';
    if(state.profile.role==='admin'){
      if(state.uiMode==='staff') return 'staff';
      if(state.uiMode==='reviewer' && doctorTestAvailable()) return 'reviewer';
      return 'admin';
    }
    return state.profile.role;
  }
  function reviewerUi(){ return effectiveRole()==='reviewer'; }
  function staffWriteUi(){ return ['staff','admin'].includes(effectiveRole()); }
  function adminUi(){ return effectiveRole()==='admin'; }
  function activeView(){ return state.currentView || 'home'; }
  function desktopSidebar(){ return window.matchMedia('(min-width:901px)').matches; }
  function closeSidebar(){ $('#sideNav')?.classList.remove('open'); $('#sidebarBackdrop')?.classList.add('hidden'); $('#mobileMenuBtn')?.setAttribute('aria-expanded','false'); }
  function openSidebar(){ $('#sideNav')?.classList.add('open'); $('#sidebarBackdrop')?.classList.remove('hidden'); $('#mobileMenuBtn')?.setAttribute('aria-expanded','true'); }
  function applySidebarCollapsed(){
    const collapsed=desktopSidebar() && state.sidebarCollapsed;
    $('#appShell')?.classList.toggle('sidebar-collapsed',collapsed);
    const topBtn=$('#mobileMenuBtn');
    if(topBtn){ topBtn.setAttribute('aria-label',collapsed?'เปิดแถบเมนู':'ยุบแถบเมนู'); topBtn.title=collapsed?'เปิดแถบเมนู':'ยุบแถบเมนู'; }
  }
  function toggleDesktopSidebar(){
    state.sidebarCollapsed=!state.sidebarCollapsed;
    localStorage.setItem('bloodqc_sidebar_collapsed',state.sidebarCollapsed?'1':'0');
    applySidebarCollapsed();
  }
  function setOpenNavGroup(group,force=null){
    const current=state.openNavGroup;
    state.openNavGroup=force===null ? (current===group?null:group) : (force?group:null);
    $$('.nav-module-group[data-nav-group]').forEach(el=>{
      const expanded=el.dataset.navGroup===state.openNavGroup;
      el.classList.toggle('expanded',expanded);
      el.querySelector('.nav-submenu')?.classList.toggle('nav-submenu-open',expanded);
      el.querySelector('.nav-group-head')?.setAttribute('aria-expanded',expanded?'true':'false');
    });
  }
  function syncNavGroupToRoute(route){
    let group=null;
    if(route.module) group=route.module;
    else if(['users','audit'].includes(route.view)) group='admin';
    if(group!==state.openNavGroup) setOpenNavGroup(group,true);
    $$('.nav-module-group').forEach(el=>el.classList.toggle('current-group',el.dataset.navGroup===group));
  }
  function applyUiMode(render=true){
    if(!state.profile) return;
    const isAdmin=state.profile.role==='admin';
    if(!isAdmin) state.uiMode=state.profile.role;
    $('#settingsTab')?.classList.toggle('hidden',!adminUi());
    $('#plasmaSettingsTab')?.classList.toggle('hidden',!adminUi());
    $('#rbcSettingsTab')?.classList.toggle('hidden',!adminUi());
    $('#reviewTab')?.classList.toggle('hidden',!reviewerUi());
    $('#reviewNavLabel')?.classList.toggle('hidden',!reviewerUi());
    $('#plateletNewTab')?.classList.toggle('hidden',!staffWriteUi());
    $('#plasmaNewTab')?.classList.toggle('hidden',!staffWriteUi());
    $('#rbcNewTab')?.classList.toggle('hidden',!staffWriteUi());
    const reviewCount=pendingReviewRecords().length; if($('#reviewCount')) $('#reviewCount').textContent=reviewCount?String(reviewCount):'';
    $('#usersTab')?.classList.toggle('hidden',!adminUi());
    $('#auditTab')?.classList.toggle('hidden',!adminUi());
    $('#adminNavLabel')?.classList.toggle('hidden',!adminUi());
    $('#adminModePanel')?.classList.toggle('hidden',!isAdmin);
    $('#regularUserCard')?.classList.toggle('hidden',isAdmin);
    $('#doctorModeOption')?.classList.toggle('hidden',!doctorTestAvailable());
    const label=adminUi()?'Admin mode':doctorTestMode()?'แพทย์ mode · ทดสอบ':'Staff mode';
    const badge=$('#currentModeBadge'); if(badge){ badge.textContent=isAdmin?label:roleTH(state.profile.role); badge.classList.toggle('admin',adminUi()); badge.classList.toggle('reviewer',doctorTestMode()); }
    const btnLabel=$('#modeButtonLabel'); if(btnLabel) btnLabel.textContent=label;
    $('#modeDot')?.classList.toggle('admin',adminUi());
    $('#modeDot')?.classList.toggle('reviewer',doctorTestMode());
    if($('#headerUser')) $('#headerUser').textContent=state.profile.display_name || state.profile.email.split('@')[0];
    if($('#headerRole')) $('#headerRole').textContent=doctorTestMode()?'Reviewer (แพทย์) · โหมดทดสอบ':roleTH(state.profile.role);
    if($('#regularUserName')) $('#regularUserName').textContent=state.profile.display_name || state.profile.email.split('@')[0];
    if($('#regularUserRole')) $('#regularUserRole').textContent=roleTH(state.profile.role);
    if(!adminUi() && ['settings','users','audit'].includes(activeView())){ const r=parseRoute(); location.hash=r.module?ROUTES[r.module].dashboard:ROUTES.home; return; }
    if(!reviewerUi() && activeView()==='review'){ location.hash=ROUTES.home; return; }
    if(render){
      const v=activeView();
      if(v==='home') renderHome(); else if(v==='dashboard') renderDashboard(); else if(v==='records') renderRecordsList(); else if(v==='record') renderRecordForm(); else if(v==='review'&&reviewerUi()) renderReviewQueue(); else if(v==='settings'&&adminUi()) renderSettings(); else if(v==='users'&&adminUi()) renderUsers(); else if(v==='audit'&&adminUi()) renderAuditLog(); else if(v==='module') renderModulePlaceholder(state.currentModule,state.currentPage);
    }
  }
  function setUiMode(mode){
    if(state.profile?.role!=='admin') return;
    if(mode==='reviewer' && !doctorTestAvailable()) return;
    state.uiMode=mode==='admin'?'admin':mode==='reviewer'?'reviewer':'staff';
    localStorage.setItem('bloodqc_ui_mode',state.uiMode);
    $('#modeMenu')?.classList.add('hidden'); $('#modeMenuBtn')?.setAttribute('aria-expanded','false');
    applyUiMode(true); logActivity('ui_mode_change','session',null,{mode:state.uiMode}).catch(()=>{});
    showToast(state.uiMode==='admin'?'เปิดโหมดผู้ดูแลระบบแล้ว':state.uiMode==='reviewer'?'เปิดโหมดแพทย์ทดสอบแล้ว':'กลับสู่โหมดผู้ใช้งานทั่วไปแล้ว','good');
  }

  let enterAppPromise=null;
  function clearSessionRetry(){
    if(state.sessionRetryTimer){ clearTimeout(state.sessionRetryTimer); state.sessionRetryTimer=null; }
  }
  function hideAuthScreens(){
    $('#setupScreen').classList.add('hidden');
    $('#resumeScreen')?.classList.add('hidden');
    $('#loginScreen').classList.add('hidden');
    $('#forcePasswordScreen').classList.add('hidden');
    $('#appShell').classList.add('hidden');
  }
  function showResume(message='กำลังตรวจสอบการเข้าสู่ระบบ...',allowActions=false){
    hideAuthScreens();
    $('#resumeScreen')?.classList.remove('hidden');
    if($('#resumeMessage')) $('#resumeMessage').textContent=message;
    $('#resumeActions')?.classList.toggle('hidden',!allowActions);
  }
  function showLogin(){
    clearSessionRetry();
    hideAuthScreens();
    $('#loginScreen').classList.remove('hidden');
    $('#loginPassword').value='';
    $('#loginMessage').textContent='';
  }
  function scheduleSessionRetry(delay=4000){
    clearSessionRetry();
    state.sessionRetryTimer=setTimeout(()=>restoreCurrentSession(true),delay);
  }
  async function restoreCurrentSession(fromRetry=false){
    if(!state.sb) return;
    showResume(fromRetry?'กำลังเชื่อมต่อใหม่ โดยยังคงสถานะการเข้าสู่ระบบไว้...':'กำลังเปิด Blood QC...');
    try{
      const {data,error}=await state.sb.auth.getSession();
      if(error) throw error;
      const session=data?.session||null;
      if(session){
        state.session=session; state.user=session.user;
        await enterApp(session);
      }else{
        state.session=null; state.user=null; state.profile=null;
        showLogin();
      }
    }catch(e){
      console.warn('session restore failed',e);
      showResume('ยังเชื่อมต่อระบบไม่ได้ แต่ระบบยังเก็บการเข้าสู่ระบบไว้ จะลองใหม่อัตโนมัติ',true);
      scheduleSessionRetry();
    }
  }
  async function init(){
    normalizeStandaloneLaunch();
    if(!cfgReady() || !window.supabase){ $('#setupScreen').classList.remove('hidden'); return; }
    showResume('กำลังตรวจสอบการเข้าสู่ระบบ...');
    state.sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
    state.sb.auth.onAuthStateChange((event,session)=>{
      setTimeout(async()=>{
        try{
          if(event==='PASSWORD_RECOVERY' && session){
            clearSessionRetry(); state.session=session; state.user=session.user;
            await showForcedPassword(true);
            return;
          }
          if(event==='SIGNED_OUT' || !session){
            clearSessionRetry(); state.session=null;state.user=null;state.profile=null;showLogin(); return;
          }
          state.session=session; state.user=session.user;
          if(event==='TOKEN_REFRESHED') return;
          if(!state.profile) await enterApp(session);
        }catch(e){console.error(e);showToast(errText(e),'error');}
      },0);
    });
    await restoreCurrentSession(false);
  }

  async function loadOwnProfile(){
    const {data:p,error}=await state.sb.from('profiles').select('*').eq('id',state.user.id).maybeSingle();
    if(error) throw error;
    return p;
  }

  async function enterApp(session){
    if(enterAppPromise) return enterAppPromise;
    enterAppPromise=(async()=>{
      clearSessionRetry();
      state.session=session; state.user=session.user;
      if(!state.user.email?.toLowerCase().endsWith('@mahidol.ac.th')){ await state.sb.auth.signOut(); showToast('บัญชีนี้ไม่ใช่ @mahidol.ac.th','error'); return; }
      let p;
      try{
        p=await loadOwnProfile();
      }catch(e){
        // A temporary network/Supabase error must not erase a valid saved session.
        console.warn('profile restore failed; keeping session',e);
        state.profile=null;
        showResume('เชื่อมต่อข้อมูลผู้ใช้งานไม่สำเร็จ แต่ยังคงสถานะการเข้าสู่ระบบไว้ จะลองใหม่อัตโนมัติ',true);
        scheduleSessionRetry();
        return;
      }
      if(!p){ await state.sb.auth.signOut(); showToast('บัญชียังไม่ได้รับสิทธิ์ในระบบ หรือยังไม่มี Profile','error'); return; }
      if(!p.is_active){ await state.sb.auth.signOut(); showToast('บัญชีนี้ถูกปิดการใช้งาน','error'); return; }
      state.profile=p;
      if(p.must_change_password){ await showForcedPassword(false); return; }
      await openAppShell();
    })();
    try{return await enterAppPromise;} finally{enterAppPromise=null;}
  }

  async function openAppShell(){
    hideAuthScreens();
    $('#appShell').classList.remove('hidden');
    applySidebarCollapsed();
    const p=state.profile;
    const savedMode=localStorage.getItem('bloodqc_ui_mode')||localStorage.getItem('platelet_ui_mode')||'staff';
    state.uiMode=p.role==='admin' ? (savedMode==='reviewer'&&p.can_review===true?'reviewer':savedMode==='admin'?'admin':'staff') : p.role;
    await loadSettings(); await loadProductSettings(); await loadProfiles(); await loadRecords(); await loadPlateletWeeklyData(); await loadPlasmaModuleData(); await loadRbcModuleData();
    applyUiMode(false);
    const loginKey=`bloodqc_login_${state.user.id}_${String(state.session?.access_token||'').slice(-16)}`;
    if(!sessionStorage.getItem(loginKey)){
      await logActivity('login','session',null,{platform:navigator.platform||'',standalone:window.matchMedia?.('(display-mode: standalone)')?.matches||false});
      sessionStorage.setItem(loginKey,'1');
      await loadProfiles();
    }
    const route=normalizeAppRoute();
    switchView(route.view,true,route);
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
  async function loadPlateletWeeklyData(){
    try{
      const [evRes,fileRes]=await Promise.all([
        state.sb.from('platelet_weekly_events').select('*').is('deleted_at',null).order('event_date',{ascending:false}).order('created_at',{ascending:false}).limit(300),
        state.sb.from('platelet_weekly_evidence_files').select('*').order('created_at',{ascending:false}).limit(600)
      ]);
      if(evRes.error)throw evRes.error;if(fileRes.error)throw fileRes.error;
      state.plateletWeeklyEvents=evRes.data||[];state.plateletWeeklyEvidence=fileRes.data||[];state.plateletWeeklyReady=true;
    }catch(e){console.warn('Platelet weekly tracking not ready',e);state.plateletWeeklyEvents=[];state.plateletWeeklyEvidence=[];state.plateletWeeklyReady=false;}
  }
  async function reloadPlateletWeeklyData(){return loadPlateletWeeklyData();}
  function monthKeyFromDateString(dateStr){return dateStr?String(dateStr).slice(0,7):'';}
  function plateletMonthKey(d=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(d).replace('/','-');}
  function plateletDateFromRecord(r){return r?.collection_at?inputFromISO(r.collection_at).slice(0,10):'';}
  function plateletWeekSlot(dateStr){const d=Number(String(dateStr||'').slice(8,10));return !d?null:d<=7?1:d<=14?2:d<=21?3:4;}
  function plateletWeekRange(ym,slot){const last=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0).getDate();const ranges={1:[1,7],2:[8,14],3:[15,21],4:[22,last]};return ranges[slot]||[1,last];}
  function plateletWeekLabel(ym,slot){const [a,b]=plateletWeekRange(ym,slot);return `สัปดาห์ ${slot} · ${a}–${b}`;}
  function weeklyEventHasEvidence(eventId){return state.plateletWeeklyEvidence.some(x=>x.event_id===eventId);}
  function plateletQcInSlot(ym,slot,excludeId=null){return state.records.filter(r=>!r.deleted_at&&r.id!==excludeId&&r.record_purpose==='qc').filter(r=>{const d=plateletDateFromRecord(r);return monthKeyFromDateString(d)===ym&&plateletWeekSlot(d)===slot;});}
  function plateletNoPoolInSlot(ym,slot){return state.plateletWeeklyEvents.filter(e=>monthKeyFromDateString(e.event_date)===ym&&plateletWeekSlot(e.event_date)===slot&&weeklyEventHasEvidence(e.id));}
  function plateletWeeklySummary(ym){return [1,2,3,4].map(slot=>{const qc=plateletQcInSlot(ym,slot),noPool=plateletNoPoolInSlot(ym,slot);return {slot,qc,noPool,complete:qc.length>0||noPool.length>0,status:qc.length?'qc':noPool.length?'no_pool':'pending'};});}
  async function loadProfiles(){ const {data,error}=await state.sb.from('profiles').select('*').order('display_name'); if(error) throw error; state.profiles=data||[]; }

  async function loadPlasmaModuleData(){
    try{
      const [settingsRes,productsRes,recordsRes,batchesRes]=await Promise.all([
        state.sb.from('plasma_qc_settings').select('*').eq('id',1).single(),
        state.sb.from('plasma_product_settings').select('*').order('sort_order').order('product_type'),
        state.sb.from('plasma_records').select('*').order('manufactured_on',{ascending:false}).limit(1000),
        state.sb.from('plasma_outlab_batches').select('*').order('sent_at',{ascending:false}).limit(300)
      ]);
      const firstError=[settingsRes.error,productsRes.error,recordsRes.error,batchesRes.error].find(Boolean);
      if(firstError) throw firstError;
      state.plasmaSettings=settingsRes.data;
      state.plasmaProductSettings=productsRes.data||[];
      state.plasmaRecords=recordsRes.data||[];
      state.plasmaBatches=batchesRes.data||[];
      state.plasmaReady=true;
    }catch(e){
      console.warn('Plasma module not ready',e);
      state.plasmaSettings=null; state.plasmaProductSettings=[]; state.plasmaRecords=[]; state.plasmaBatches=[]; state.plasmaReady=false;
    }
  }
  async function reloadPlasmaRecords(){ if(!state.plasmaReady)return; const {data,error}=await state.sb.from('plasma_records').select('*').order('manufactured_on',{ascending:false}).limit(1000); if(error)throw error; state.plasmaRecords=data||[]; }
  async function reloadPlasmaBatches(){ if(!state.plasmaReady)return; const {data,error}=await state.sb.from('plasma_outlab_batches').select('*').order('sent_at',{ascending:false}).limit(300); if(error)throw error; state.plasmaBatches=data||[]; }
  const plasmaProductSetting = type => state.plasmaProductSettings.find(x=>x.product_type===type);
  const activePlasmaProducts = () => state.plasmaProductSettings.filter(x=>x.is_active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.product_type.localeCompare(b.product_type));
  const plasmaProductOptions = selected => activePlasmaProducts().map(x=>`<option value="${esc(x.product_type)}" ${selected===x.product_type?'selected':''}>${esc(x.product_type)}</option>`).join('');
  const plasmaQcTH = s => ({incomplete:'ข้อมูลยังไม่ครบ',pass:'ผ่านเกณฑ์ QC',review:'ต้องตรวจสอบ'})[s]||s||'-';
  const plasmaQcBadge = s => `<span class="badge ${s==='pass'?'pass':s==='review'?'review':'incomplete'}">${esc(plasmaQcTH(s))}</span>`;
  function plasmaOutlabState(r){ if(!r.outlab_batch_id)return 'รอจัดชุดนำส่ง'; if(r.factor_viii_percent==null)return 'รอผล Factor VIII'; return 'ได้รับผลแล้ว'; }

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
  $('#retrySessionBtn')?.addEventListener('click',()=>restoreCurrentSession(true));
  $('#resumeLogoutBtn')?.addEventListener('click',async()=>{ clearSessionRetry(); await state.sb?.auth.signOut(); });
  window.addEventListener('online',()=>{ if(state.session && !state.profile) restoreCurrentSession(true); });
  $('#forceLogoutBtn').addEventListener('click',()=>state.sb.auth.signOut());
  $('#logoutBtn').addEventListener('click',logoutWithAudit);
  $('#closeDetailBtn').addEventListener('click',()=>$('#detailDialog').close());
  $('#mainTabs').addEventListener('click',e=>{
    const adminHead=e.target.closest('button[data-nav-head="admin"]');
    if(adminHead){ setOpenNavGroup('admin'); return; }
    const b=e.target.closest('button[data-route]');
    if(!b) return;
    const head=b.dataset.navHead;
    if(head){
      const isOpen=state.openNavGroup===head;
      const currentRoute=parseRoute();
      if(isOpen && currentRoute.module===head && currentRoute.hash===b.dataset.route){ setOpenNavGroup(head,false); return; }
      setOpenNavGroup(head,true);
    }
    if(b.dataset.route===ROUTES.platelet.record)state.currentRecordId=null;
    if(b.dataset.route===ROUTES.plasma.record)state.currentPlasmaRecordId=null;
    location.hash=b.dataset.route;
    if(!desktopSidebar()) closeSidebar();
  });
  $('#mobileMenuBtn').addEventListener('click',()=>{
    if(desktopSidebar()) toggleDesktopSidebar();
    else $('#sideNav').classList.contains('open')?closeSidebar():openSidebar();
  });
  $('#sidebarCollapseBtn')?.addEventListener('click',toggleDesktopSidebar);
  $('#sidebarBackdrop').addEventListener('click',closeSidebar);
  window.addEventListener('resize',()=>{ applySidebarCollapsed(); if(desktopSidebar()) closeSidebar(); });
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
      await loadProfiles(); if(state.currentView==='users') renderUsers();
    }catch(e2){$('#adminResetPasswordMessage').textContent=errText(e2);}
  });

  function switchView(v,fromRoute=false,routeObj=null){
    let route=routeObj || (fromRoute?parseRoute():null);
    if(!fromRoute){
      const target=routeForView(v);
      if(location.hash!==target){ location.hash=target; return; }
      route=parseRoute();
    }
    route=route||parseRoute();
    if(route.reviewerOnly&&!reviewerUi()){ location.hash=ROUTES.home; return; }
    if(route.adminOnly&&!adminUi()){
      location.hash=route.module?ROUTES[route.module].dashboard:ROUTES.home;
      return;
    }
    state.currentView=v;
    state.currentModule=route.module||null;
    state.currentPage=route.page||null;
    updateRouteChrome(route);
    $$('.view').forEach(x=>x.classList.add('hidden'));
    const host=$(`#view-${v}`);
    if(!host){ location.hash=ROUTES.home; return; }
    host.classList.remove('hidden');
    if(v==='home') renderHome();
    if(v==='dashboard') renderDashboard();
    if(v==='records') renderRecordsList();
    if(v==='record') renderRecordForm();
    if(v==='guide') renderPlateletGuide();
    if(v==='review') renderReviewQueue();
    if(v==='settings') renderSettings();
    if(v==='users') renderUsers();
    if(v==='audit') renderAuditLog();
    if(v==='module') renderModulePlaceholder(route.module,route.page);
    if(window.innerWidth<=760) window.scrollTo({top:0,behavior:'smooth'});
  }
  window.addEventListener('hashchange',()=>{
    if($('#appShell') && !$('#appShell').classList.contains('hidden')){
      const route=normalizeAppRoute();
      switchView(route.view,true,route);
    }
  });
  function statusBadge(s){ return `<span class="badge ${esc(s)}">${esc(statusTH(s))}</span>`; }
  function qcBadge(s){ return `<span class="badge ${esc(s)}">${esc(qcTH(s))}</span>`; }
  function qcBadgeForRecord(r){ return r?.record_purpose==='qc' ? qcBadge(r.qc_status) : ''; }
  function deletedBadge(r){ return r?.deleted_at ? '<span class="badge deleted">ลบแล้ว</span>' : ''; }
  function pHBadge(r){ if(!r.ph_measured_at||!r.expiry_at) return ''; return sameBangkokDate(r.ph_measured_at,r.expiry_at)?'<span class="badge pass">pH ตรงวัน Exp.</span>':'<span class="badge late">pH ไม่ตรงวัน Exp.</span>'; }
  function waitingPH(r){ return r.status==='draft' && !r.ph_value && r.expiry_at; }

  function bindRouteButtons(root=document){
    $$('[data-go-route]',root).forEach(b=>b.onclick=()=>{
      const route=b.dataset.goRoute;
      if(route===ROUTES.platelet.record) state.currentRecordId=null;
      if(route===ROUTES.plasma.record) state.currentPlasmaRecordId=null;
      if(route===ROUTES.rbc.record) state.currentRbcRecordId=null;
      location.hash=route;
    });
  }

  function pendingReviewRecords(){
    const rows=state.records.filter(r=>!r.deleted_at && r.record_purpose==='qc' && r.status==='submitted').map(r=>({module:'platelet',record:r}));
    if(state.plasmaReady) rows.push(...state.plasmaRecords.filter(r=>!r.deleted_at&&r.status==='submitted').map(r=>({module:'plasma',record:r})));
    if(state.rbcReady) rows.push(...state.rbcRecords.filter(r=>!r.deleted_at&&r.status==='submitted').map(r=>({module:'rbc',record:r})));
    return rows.sort((a,b)=>new Date(a.record.submitted_at||0)-new Date(b.record.submitted_at||0));
  }

  function renderReviewQueue(){
    if(!reviewerUi()){ location.hash=ROUTES.home; return; }
    const rows=pendingReviewRecords();
    $('#view-review').innerHTML=`
      <div class="page-head"><div><h1>งานรอตรวจทวน</h1><p class="muted">Platelet · Plasma · RBC</p></div><div class="actions"><span class="badge submitted">${rows.length} รายการ</span></div></div>
      ${doctorTestMode()?`<div class="review-test-banner"><strong>โหมดแพทย์ทดสอบ</strong><span>มุมมองและปุ่มเหมือน Reviewer จริง หากกด “อนุมัติและ LOCK” หรือ “ส่งกลับแก้ไข” ระบบจะบันทึกการกระทำจริงเป็นบัญชีของคุณ</span></div>`:''}
      <div class="panel review-queue-panel">
        ${rows.length?`<div class="table-wrap"><table class="data-table review-table"><thead><tr><th>Module</th><th>Product No.</th><th>ผลิตภัณฑ์</th><th>ส่งโดย</th><th>เวลาที่ส่ง</th><th>ผล QC</th><th></th></tr></thead><tbody>${rows.map(x=>{const r=x.record;return `<tr><td><span class="badge">${x.module==='plasma'?'Plasma':x.module==='rbc'?'RBC':'Platelet'}</span></td><td><strong>${esc(r.product_no)}</strong></td><td>${esc(r.product_type)}</td><td>${esc(profileName(r.submitted_by))}</td><td class="nowrap">${esc(dateTH(r.submitted_at))}</td><td>${x.module==='plasma'?plasmaQcBadge(r.qc_status):x.module==='rbc'?rbcQcBadge(r.qc_status):(r.record_purpose==='qc'?qcBadge(r.qc_status):'<span class="muted">–</span>')}</td><td><button class="btn small-btn primary review-open" data-module="${x.module}" data-id="${r.id}">ทบทวน</button></td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty"><strong>ไม่มีรายการรอตรวจทวน</strong></div>'}
      </div>`;
    $$('.review-open',$('#view-review')).forEach(b=>b.onclick=()=>b.dataset.module==='plasma'?openPlasmaDetail(b.dataset.id):b.dataset.module==='rbc'?openRbcDetail(b.dataset.id):openDetail(b.dataset.id));
  }

  function renderHome(){
    const rec=state.records.filter(r=>!r.deleted_at);
    const month=rec.filter(r=>r.collection_at && r.collection_at>=firstOfMonthISO());
    const qc=month.filter(r=>r.record_purpose==='qc').length;
    $('#view-home').innerHTML=`
      <div class="page-head"><div><h1>CNMI Blood Component QC</h1><p class="muted">ระบบบันทึกและควบคุมคุณภาพส่วนประกอบโลหิต</p></div></div>
      <div class="module-grid">
        <article class="module-card active-module">
          <div class="module-card-head"><div><h2>Platelet</h2><p>Preparation & QC</p></div><span class="module-status live">ใช้งานจริง</span></div>
          <div class="module-stats"><span><strong>${month.length}</strong> รายการเดือนนี้</span><span><strong>${qc}</strong> ใช้เป็น QC</span></div>
          <div class="module-actions"><button class="btn primary" data-go-route="#/platelet">ภาพรวม</button>${staffWriteUi()?'<button class="btn" data-go-route="#/platelet/new">บันทึกใหม่</button>':''}<button class="btn" data-go-route="#/platelet/records">รายการ</button><button class="btn" data-go-route="#/platelet/guide">คู่มือ</button></div>
        </article>
        ${plasmaModuleCard()}
        ${rbcModuleCard()}
      </div>
      ${reviewerUi()?`<div class="panel review-home-panel"><div class="section-title-row"><h2>งานรอตรวจทวน</h2><span class="badge submitted">${pendingReviewRecords().length}</span></div><div class="actions left-actions"><button class="btn primary" data-go-route="#/review">เปิดงานรอตรวจทวน</button></div></div>`:''}
      ${adminUi()?`<div class="panel core-admin-panel"><h2>Admin</h2><div class="actions left-actions"><button class="btn" data-go-route="#/admin/users">ผู้ใช้งานระบบ</button><button class="btn" data-go-route="#/admin/audit">ประวัติการใช้งาน</button></div></div>`:''}`;
    bindRouteButtons($('#view-home'));
  }

  function futureModuleCard(module,label){
    return `<article class="module-card future-module"><div class="module-card-head"><div><h2>${label}</h2></div><span class="module-status planned">ยังไม่เปิดใช้</span></div></article>`;
  }


  function plasmaModuleCard(){
    if(!state.plasmaReady) return `<article class="module-card future-module"><div class="module-card-head"><div><h2>Plasma</h2><p>FFP Preparation & QC</p></div><span class="module-status planned">รออัปเกรดฐานข้อมูล</span></div></article>`;
    const ym=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date()).replace('/','-');
    const month=state.plasmaRecords.filter(r=>!r.deleted_at&&String(r.manufactured_on||'').slice(0,7)===ym);
    const waiting=state.plasmaRecords.filter(r=>!r.deleted_at&&r.outlab_batch_id&&r.factor_viii_percent==null).length;
    return `<article class="module-card active-module"><div class="module-card-head"><div><h2>Plasma</h2><p>FFP · Factor VIII QC</p></div><span class="module-status live">ใช้งานจริง</span></div><div class="module-stats"><span><strong>${month.length}</strong> รายการเดือนนี้</span><span><strong>${waiting}</strong> รอผล Factor VIII</span></div><div class="module-actions"><button class="btn primary" data-go-route="#/plasma">ภาพรวม</button>${staffWriteUi()?'<button class="btn" data-go-route="#/plasma/new">บันทึก FFP</button>':''}<button class="btn" data-go-route="#/plasma/records">รายการ</button></div></article>`;
  }

  function renderPlateletGuide(){
    $('#view-guide').innerHTML=`
      <div class="page-head"><div><h1>คู่มือ Platelet</h1><p class="muted">สรุปวิธีใช้งานสำหรับเจ้าหน้าที่</p></div><div class="actions">${staffWriteUi()?'<button class="btn primary" data-go-route="#/platelet/new">+ บันทึก Platelet</button>':''}</div></div>
      <div class="notice warning"><strong>หลักฐานเป็นข้อบังคับ:</strong> ทุกค่าผลตรวจที่กรอกในระบบต้องมีรูปหรือ PDF หลักฐานของผลนั้น หากไม่มีหลักฐาน ระบบจะไม่ยอมบันทึกค่าผล</div><div class="guide-grid">
        <section class="guide-card"><div class="guide-no">1</div><div><h2>ระบบช่วยติดตาม QC รายสัปดาห์</h2><p>Platelet กำหนดติดตาม 4 ช่วงต่อเดือน: วันที่ 1–7, 8–14, 15–21 และ 22–สิ้นเดือน</p><p>เมื่อกรอกวัน-เวลาเริ่มเจาะ หากช่วงนั้นยังไม่มีรายการ QC ระบบจะเลือก <strong>ใช้เป็น QC</strong> ให้อัตโนมัติ เพื่อลดโอกาสลืมเก็บ QC</p><div class="guide-callout">ถ้าวันนั้นไม่มี Pool ให้กด <strong>วันนี้ไม่มี Pool</strong> ที่หน้า Platelet และต้องแนบรูปหรือ PDF ที่แสดงว่าไม่มี Pool ระบบจึงนับช่วงนั้นว่ามีการติดตามแล้ว หากภายหลังมีถุงในช่วงเดียวกันและยังไม่มี QC ระบบยังเลือกถุงนั้นเป็น QC ให้อัตโนมัติ</div></div></section>
        <section class="guide-card"><div class="guide-no">2</div><div><h2>กรอกข้อมูลผลิตภัณฑ์</h2><p>กรอก Product No., ชนิดผลิตภัณฑ์, Group, วัน-เวลาเริ่มเจาะ และ <strong>น้ำหนักที่ชั่งได้เป็น g</strong></p><div class="guide-callout">ระบบใส่น้ำหนักถุงเปล่าและ Density ตามชนิดผลิตภัณฑ์ แล้วคำนวณ Volume = (น้ำหนักที่ชั่งได้ − น้ำหนักถุงเปล่า) ÷ Density</div><p>วัน-เวลาหมดอายุคำนวณจากวัน-เวลาเริ่มเจาะตามค่าที่ Admin กำหนด</p></div></section>
        <section class="guide-card"><div class="guide-no">3</div><div><h2>LDPPC: Pool PYI</h2><p>กรอก Unit No. และ PYI จำนวน 3–6 ถุง ระบบรวม Pool PYI ให้อัตโนมัติ</p><div class="guide-rule-row"><span class="guide-rule good">PYI ≥ ${fmt(state.settings.pool_pyi_standard_min,0)} · ปกติ</span><span class="guide-rule warn">${fmt(state.settings.pool_pyi_conditional_min,0)}–${fmt(state.settings.pool_pyi_standard_min-1,0)} · กรณีจำเป็น</span></div><p>ช่วงกรณีจำเป็น ต้องตรวจ CBC และมี Platelet yield ≥ ${fmt(state.settings.pool_conditional_yield_min,2)} ×10¹¹ cells/unit จึงผ่านสำหรับฉลากปกติ</p></div></section>
        <section class="guide-card"><div class="guide-no">4</div><div><h2>ผล CBC, ADAM และ pH</h2><p>ผลทั้ง 3 ส่วน <strong>กรอกคนละวันหรือคนละคนได้</strong> ให้บันทึกวัน-เวลาที่วัดจริงในแต่ละช่อง</p><p>ถ้า pH วัดไม่ตรงวันหมดอายุ ระบบจะเตือนและให้ระบุเหตุผลก่อนส่งตรวจทวน</p></div></section>
        <section class="guide-card"><div class="guide-no">5</div><div><h2>แนบหลักฐาน</h2><p>ถ่ายรูปหรือเลือกไฟล์ของ CBC / ADAM / pH แยกกัน ไฟล์เก็บใน Private Storage</p><div class="guide-callout"><strong>ถ้ามีการแก้หลัง LOCK:</strong> ให้คงหลักฐานเดิมไว้ และแนบหลักฐานใหม่เพิ่ม เพื่อทวนสอบย้อนหลังได้</div></div></section>
        <section class="guide-card"><div class="guide-no">6</div><div><h2>บันทึก → ตรวจทวน → LOCK</h2><p><strong>Prepare</strong> บันทึกและกลับมาเติมผลภายหลังได้โดยไม่ต้องส่งแพทย์ ส่วนรายการที่เลือก <strong>ใช้เป็น QC</strong> เมื่อข้อมูลครบจึงส่งให้แพทย์ Reviewer ทบทวนและ LOCK</p><p>Admin แก้รายการที่ LOCK แล้วได้เมื่อจำเป็น แต่ต้องระบุเหตุผล ระบบเก็บค่าก่อน–หลัง ผู้แก้ วันเวลา และ Revision ใน Audit Log</p></div></section>
      </div>
      <div class="panel guide-terms"><h2>คำที่ใช้ในระบบ</h2><div class="term-grid"><div><strong>Prepare</strong><span>รายการเตรียมตามปกติ</span></div><div><strong>QC</strong><span>รายการที่นำไปประเมินเกณฑ์ QC</span></div><div><strong>Draft</strong><span>ยังกรอกต่อได้</span></div><div><strong>Submitted</strong><span>ส่งให้แพทย์ทบทวนแล้ว</span></div><div><strong>LOCK</strong><span>แพทย์ทบทวนเสร็จและล็อกข้อมูล</span></div><div><strong>Revision</strong><span>ครั้งที่แก้ไขหลังการล็อก</span></div></div></div>`;
    bindRouteButtons($('#view-guide'));
  }

  function renderModulePlaceholder(module,page='dashboard'){
    if(module==='plasma') return renderPlasmaPage(page);
    if(module==='rbc') return renderRbcPage(page);
    const meta=MODULE_META[module]||{label:module?.toUpperCase()||'-',title:'Module'};
    const pageTitle={dashboard:'ภาพรวม',record:'บันทึกใหม่',records:'รายการทั้งหมด',settings:'QC Settings'}[page]||'ภาพรวม';
    $('#view-module').innerHTML=`
      <div class="page-head"><div><div class="breadcrumb"><button class="link-btn" data-go-route="#/">Blood Component QC</button><span>›</span><span>${esc(meta.label)}</span></div><h1>${esc(meta.label)} · ${pageTitle}</h1></div><div class="actions"><button class="btn" data-go-route="#/">กลับหน้าหลัก</button></div></div>
      <div class="panel module-placeholder-panel"><span class="module-status planned">ยังไม่เปิดใช้งาน</span><h2>${esc(meta.label)}</h2></div>`;
    bindRouteButtons($('#view-module'));
  }

  function renderDashboard(){
    const rec=state.records.filter(r=>!r.deleted_at);
    const ym=state.plateletDashboardMonth||plateletMonthKey();state.plateletDashboardMonth=ym;
    const month=rec.filter(r=>monthKeyFromDateString(plateletDateFromRecord(r))===ym);
    const prepare=month.filter(r=>(r.record_purpose||'prepare')==='prepare').length;
    const qc=month.filter(r=>r.record_purpose==='qc').length;
    const wait=rec.filter(waitingPH).length;
    const submitted=month.filter(r=>r.record_purpose==='qc'&&r.status==='submitted').length;
    const lockedQc=month.filter(r=>r.record_purpose==='qc'&&r.status==='locked').length;
    const weeks=plateletWeeklySummary(ym),complete=weeks.filter(x=>x.complete).length,noPool=weeks.filter(x=>x.status==='no_pool').length;
    const weeklyCards=weeks.map(w=>`<div class="qc-progress-card ${w.status}"><div class="qc-progress-head"><strong>${esc(plateletWeekLabel(ym,w.slot))}</strong><span class="badge ${w.status==='qc'?'pass':w.status==='no_pool'?'warning':'incomplete'}">${w.status==='qc'?'QC แล้ว':w.status==='no_pool'?'ไม่มี Pool · มีหลักฐาน':'รอดำเนินการ'}</span></div><div class="qc-progress-sub">${w.status==='qc'?`${w.qc.length} รายการ QC${w.noPool.length?` · เคยบันทึกไม่มี Pool ${w.noPool.length} ครั้ง`:''}`:w.status==='no_pool'?`${w.noPool.length} รายการไม่มี Pool`:'ยังไม่มี QC / หลักฐานไม่มี Pool'}</div>${w.noPool.length?`<button class="btn small-btn weekly-evidence-view" data-event-id="${w.noPool[0].id}">ดูหลักฐานไม่มี Pool</button>`:''}</div>`).join('');
    $('#view-dashboard').innerHTML=`
      <div class="page-head"><div><h1>ภาพรวม Platelet</h1><p class="muted">Prepare และ QC</p></div><div class="actions"><input id="plateletDashMonth" class="month-input" type="month" value="${esc(ym)}">${staffWriteUi()?'<button class="btn" id="plateletNoPoolBtn">วันนี้ไม่มี Pool</button><button class="btn primary" id="dashNew">+ บันทึก Platelet</button>':''}${reviewerUi()?'<button class="btn" data-go-route="#/review">งานรอตรวจทวน</button>':''}</div></div>
      <div class="grid cards">
        ${metric('เดือนนี้',month.length,'รายการทั้งหมด')}${metric('QC รายสัปดาห์',`${complete}/4`,'QC หรือไม่มี Pool ที่มีหลักฐาน')}${metric('QC จริง',qc,'รายการที่ใช้เป็น QC')}${metric('ไม่มี Pool',noPool,'สัปดาห์ที่มีหลักฐาน')}${metric('รอแพทย์ทบทวน',submitted,'เฉพาะ Platelet QC')}
      </div>
      <div class="panel qc-tracking-panel"><div class="section-title-row"><div><h2>ติดตาม Platelet QC รายสัปดาห์</h2><p class="muted small">กำหนด 4 ช่วงต่อเดือน: 1–7, 8–14, 15–21 และ 22–สิ้นเดือน</p></div><strong class="tracking-total">${complete}/4</strong></div><div class="qc-progress-grid">${weeklyCards}</div></div>
      ${wait?`<div class="notice info small"><strong>รอ pH ${wait} รายการ</strong> สามารถกลับมาเติมผลภายหลังได้</div>`:''}
      <div class="panel"><h2>รายการล่าสุด</h2>${recordsTable(rec.slice(0,12))}</div>`;
    $('#plateletDashMonth').onchange=e=>{state.plateletDashboardMonth=e.target.value||plateletMonthKey();renderDashboard();};
    if($('#plateletNoPoolBtn'))$('#plateletNoPoolBtn').onclick=openPlateletNoPoolDialog;
    $$('.weekly-evidence-view',$('#view-dashboard')).forEach(b=>b.onclick=()=>viewPlateletWeeklyEvidence(b.dataset.eventId));
    if($('#dashNew')) $('#dashNew').onclick=()=>{state.currentRecordId=null;switchView('record');}; bindRouteButtons($('#view-dashboard')); bindRecordLinks($('#view-dashboard'));
  }

  async function viewPlateletWeeklyEvidence(eventId){
    const e=state.plateletWeeklyEvidence.find(x=>x.event_id===eventId);if(!e){showToast('ไม่พบหลักฐาน','error');return;}const {data,error}=await state.sb.storage.from('bloodqc-evidence').createSignedUrl(e.storage_path,120);if(error){showToast(errText(error),'error');return;}window.open(data.signedUrl,'_blank','noopener');
  }

  async function openPlateletNoPoolDialog(){
    if(!staffWriteUi()||!state.plateletWeeklyReady){showToast('กรุณา Run SQL v5.3.8 ก่อนใช้งานบันทึกไม่มี Pool','error');return;}
    let selectedFile=null;
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    $('#detailDialog').innerHTML=`<div class="dialog-head"><div><h2>บันทึกวันนี้ไม่มี Pool</h2><p class="muted">ใช้เป็นหลักฐานกรณีไม่มี Platelet สำหรับเก็บ QC</p></div><button class="icon-btn" id="noPoolClose">×</button></div><div class="detail-scroll"><div class="panel no-pool-dialog-panel"><div class="form-grid"><div class="field"><label class="required">วันที่</label><input id="noPoolDate" type="date" value="${esc(today)}"></div><div class="field span2"><label>หมายเหตุ</label><input id="noPoolNote" placeholder="เช่น วันนี้ไม่มีการ Pool Platelet"></div></div><div class="measurement-evidence"><div class="measurement-evidence-head"><strong>หลักฐานว่าไม่มี Pool</strong><span class="section-badge required-evidence">บังคับ</span></div><input class="hidden-file-input" type="file" id="noPoolCamera" accept="image/*" capture="environment"><input class="hidden-file-input" type="file" id="noPoolFile" accept="image/*,application/pdf"><div class="evidence-pick-actions"><button type="button" class="btn primary small-btn" id="noPoolCameraBtn">ถ่ายรูป</button><button type="button" class="btn small-btn" id="noPoolFileBtn">เลือกไฟล์ / PDF</button></div><div id="noPoolSelected" class="muted small">ยังไม่ได้เลือกหลักฐาน</div></div></div><div class="dialog-actions"><button class="btn" id="noPoolCancel">ยกเลิก</button><button class="btn primary" id="noPoolSave">บันทึกไม่มี Pool</button></div></div>`;
    const dlg=$('#detailDialog');dlg.showModal();
    const setFile=f=>{selectedFile=f||null;$('#noPoolSelected').textContent=f?`เลือกแล้ว: ${f.name}`:'ยังไม่ได้เลือกหลักฐาน';};
    $('#noPoolCameraBtn').onclick=()=>$('#noPoolCamera').click();$('#noPoolFileBtn').onclick=()=>$('#noPoolFile').click();
    $('#noPoolCamera').onchange=e=>setFile(e.target.files?.[0]);$('#noPoolFile').onchange=e=>setFile(e.target.files?.[0]);
    $('#noPoolClose').onclick=$('#noPoolCancel').onclick=()=>dlg.close();
    $('#noPoolSave').onclick=async()=>{
      const eventDate=$('#noPoolDate').value,note=$('#noPoolNote').value.trim()||null;
      if(!eventDate){showToast('กรุณาระบุวันที่','error');return;}if(!selectedFile){showToast('ต้องแนบรูปหรือ PDF ที่แสดงว่าไม่มี Pool','error');return;}if(selectedFile.size>10*1024*1024){showToast('ไฟล์ต้องไม่เกิน 10 MB','error');return;}
      try{
        const {data:event,error:eventErr}=await state.sb.from('platelet_weekly_events').insert({event_date:eventDate,event_type:'no_pool',note,created_by:state.user.id}).select('*').single();if(eventErr)throw eventErr;
        const clean=selectedFile.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100),path=`platelet_weekly/${event.id}/evidence/${Date.now()}_${clean}`;
        const {error:u}=await state.sb.storage.from('bloodqc-evidence').upload(path,selectedFile,{upsert:false,contentType:selectedFile.type||undefined});if(u){await state.sb.from('platelet_weekly_events').delete().eq('id',event.id);throw u;}
        const {error:ferr}=await state.sb.from('platelet_weekly_evidence_files').insert({event_id:event.id,storage_path:path,original_name:selectedFile.name,mime_type:selectedFile.type,file_size:selectedFile.size,uploaded_by:state.user.id});
        if(ferr){await state.sb.storage.from('bloodqc-evidence').remove([path]);await state.sb.from('platelet_weekly_events').delete().eq('id',event.id);throw ferr;}
        await reloadPlateletWeeklyData();dlg.close();showToast('บันทึกไม่มี Pool พร้อมหลักฐานแล้ว','good');renderDashboard();
      }catch(e){showToast(errText(e),'error');}
    };
  }

  function metric(label,value,sub){ return `<div class="card metric"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`; }
  function recordsTable(rows){
    if(!rows.length) return '<div class="empty">ยังไม่มีข้อมูล</div>';
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Product No.</th><th>ผลิตภัณฑ์</th><th>ประเภท</th><th>วันเจาะ</th><th>Group</th><th>Yield</th><th>Pool / ฉลาก</th><th>ผล QC</th><th>สถานะ</th><th>ผู้บันทึก</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.deleted_at?'deleted-row':''}"><td><button class="link-btn record-link" data-id="${r.id}">${esc(r.product_no)}</button></td><td>${esc(r.product_type)}</td><td>${purposeBadge(r.record_purpose)} ${deletedBadge(r)}</td><td class="nowrap">${dateTH(r.collection_at,false)}</td><td>${esc(r.blood_group||'–')}</td><td>${fmt(r.platelet_yield,2)}</td><td>${poolReleaseBadge(r.pool_release_status)}</td><td>${r.record_purpose==='qc'?qcBadge(r.qc_status):'<span class="muted">–</span>'}</td><td>${statusBadge(r.status)}</td><td>${esc(profileName(r.created_by))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function bindRecordLinks(root=document){ $$('.record-link',root).forEach(b=>b.onclick=()=>openDetail(b.dataset.id)); }

  function renderRecordsList(){
    const deletedControl=adminUi()?`<label class="inline-check"><input type="checkbox" id="fDeleted" ${state.showDeletedRecords?'checked':''}> แสดงรายการที่ลบแล้ว</label>`:'';
    $('#view-records').innerHTML=`<div class="page-head"><div><h1>รายการ Platelet</h1><p class="muted">รายการ Prepare และ QC</p></div><div class="actions"><button class="btn" id="exportCsv">Export CSV</button>${staffWriteUi()?'<button class="btn primary" id="listNew">+ บันทึก Platelet</button>':''}</div></div>
      <div class="panel"><div class="filters"><input id="fSearch" placeholder="ค้นหา Product No. / ผลิตภัณฑ์"><select id="fPurpose"><option value="">Prepare + QC</option><option value="prepare">Prepare ตามปกติ</option><option value="qc">ใช้เป็น QC</option></select><select id="fStatus"><option value="">ทุกสถานะ</option><option value="draft">ร่าง</option><option value="submitted">รอตรวจทวน</option><option value="locked">LOCK</option></select><select id="fQc"><option value="">ทุกผล QC</option><option value="pass">ผ่านเกณฑ์ QC</option><option value="review">ต้องตรวจสอบ QC</option><option value="incomplete">ข้อมูล QC ยังไม่ครบ</option></select><select id="fProduct"><option value="">ทุกผลิตภัณฑ์</option>${activeProducts().map(x=>`<option>${esc(x.product_type)}</option>`).join('')}</select><button class="btn" id="fClear">ล้าง</button></div>${deletedControl}<div id="recordsTableHost" style="margin-top:12px"></div></div>`;
    const apply=()=>{
      const q=$('#fSearch').value.trim().toLowerCase(),purpose=$('#fPurpose').value,s=$('#fStatus').value,qc=$('#fQc').value,p=$('#fProduct').value;
      if($('#fDeleted')) state.showDeletedRecords=$('#fDeleted').checked;
      const rows=state.records.filter(r=>(state.showDeletedRecords||!r.deleted_at)&&(!q||`${r.product_no} ${r.product_type}`.toLowerCase().includes(q))&&(!purpose||(r.record_purpose||'prepare')===purpose)&&(!s||r.status===s)&&(!qc||(r.record_purpose==='qc'&&r.qc_status===qc))&&(!p||r.product_type===p));
      $('#recordsTableHost').innerHTML=recordsTable(rows); bindRecordLinks($('#recordsTableHost')); return rows;
    };
    ['#fSearch','#fPurpose','#fStatus','#fQc','#fProduct'].forEach(x=>$(x).addEventListener('input',apply)); if($('#fDeleted'))$('#fDeleted').addEventListener('change',apply);
    $('#fClear').onclick=()=>{['#fSearch','#fPurpose','#fStatus','#fQc','#fProduct'].forEach(x=>$(x).value='');if($('#fDeleted')){$('#fDeleted').checked=false;state.showDeletedRecords=false;}apply();};
    if($('#listNew')) $('#listNew').onclick=()=>{state.currentRecordId=null;switchView('record');}; $('#exportCsv').onclick=()=>exportCSV(apply()); apply();
  }

  function exportCSV(rows){
    const headers=['Product No.','Product','Purpose','Group','Collection','Expiry','Gross weight g','Bag tare g','Density','Volume mL','Pool PYI','Pool/Label status','PLT instrument','PLT1','PLT2','PLT measured at','PLT used','Yield x10^11','Equivalent Units','WBC ADAM','WBC measured at','Residual WBC x10^6','pH','pH measured','QC result','Status','Revision','Deleted at','Delete reason','Notes'];
    const vals=r=>[r.product_no,r.product_type,r.record_purpose,r.blood_group,r.collection_at,r.expiry_at,r.gross_weight_g,r.bag_tare_weight_g,r.density,r.volume_ml,r.pool_pyi,r.pool_release_status,r.plt_instrument,r.plt_value_1,r.plt_value_2,r.plt_measured_at,r.plt_used,r.platelet_yield,r.equivalent_units,r.wbc_adam,r.wbc_measured_at,r.residual_wbc,r.ph_value,r.ph_measured_at,r.record_purpose==='qc'?r.qc_status:'not_qc',r.status,r.revision,r.deleted_at,r.delete_reason,r.notes];
    const quote=v=>`"${String(v??'').replaceAll('"','""')}"`; const csv='\ufeff'+[headers,...rows.map(vals)].map(a=>a.map(quote).join(',')).join('\r\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download=`platelet_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href); logActivity('export_csv','report',null,{rows:rows.length}).catch(()=>{});
  }

  async function renderRecordForm(){
    if(!state.currentRecordId && !staffWriteUi()){ location.hash=ROUTES.review; return; }
    let r=null,pool=[]; state.currentEvidence=[]; state.currentPool=[];
    if(state.currentRecordId){
      const {data,error}=await state.sb.from('platelet_records').select('*').eq('id',state.currentRecordId).single(); if(error){showToast(errText(error),'error');return;} r=data;
      const {data:pu}=await state.sb.from('pool_units').select('*').eq('record_id',r.id).order('position'); pool=pu||[]; state.currentPool=pool.map(x=>({position:x.position,unit_no:x.unit_no,pyi:Number(x.pyi)}));
      const {data:ev}=await state.sb.from('evidence_files').select('*').eq('record_id',r.id).order('created_at'); state.currentEvidence=ev||[];
    }
    const locked=r?.status==='locked', submitted=r?.status==='submitted', deleted=!!r?.deleted_at;
    const editable=!deleted && (adminUi() || (!locked && !submitted && staffWriteUi()));
    const purpose=r?.record_purpose||'prepare';
    const adminCorrection=r&&adminUi()&&!deleted;
    $('#view-record').innerHTML=`
      <div class="page-head"><div><h1>${r?'แก้ไข / ตรวจรายการ Platelet':'บันทึก Platelet'}</h1></div><div class="page-head-tools"><button type="button" class="btn small-btn" id="recordGuideBtn">คู่มือ</button>${r?`<div class="status-line">${deletedBadge(r)}${statusBadge(r.status)}${pHBadge(r)}</div>`:''}</div></div>
      ${deleted?`<div class="notice bad"><strong>รายการนี้ถูกลบออกจากการใช้งานแล้ว</strong><br>เหตุผล: ${esc(r.delete_reason||'–')} · ${dateTH(r.deleted_at)} · โดย ${esc(profileName(r.deleted_by))}</div>`:''}
      ${locked&&!adminUi()?'<div class="notice good"><strong>รายการนี้ LOCK แล้ว</strong> ข้อมูลถูกป้องกันการแก้ไข หากพบข้อผิดพลาดให้แจ้ง Admin พร้อมหลักฐาน</div>':''}
      ${locked&&adminUi()&&!deleted?'<div class="notice warning"><strong>Admin correction</strong> รายการนี้ LOCK แล้ว แต่ Admin สามารถแก้ไขได้โดยระบุเหตุผล ระบบจะเพิ่ม Revision และบันทึกค่าก่อน/หลังใน Audit Log</div>':''}
      ${r?.status==='draft'&&r?.returned_at&&r?.review_note?`<div class="notice warning"><strong>แพทย์ส่งกลับแก้ไข</strong><br>${esc(r.review_note)}<br><span class="small">${esc(profileName(r.returned_by))} · ${esc(dateTH(r.returned_at))}</span></div>`:''}
      ${r?.status==='submitted'&&r?.record_purpose==='qc'&&reviewerUi()?`<div class="panel reviewer-action-panel"><div class="section-title-row"><h2>การทบทวนโดยแพทย์</h2><span class="section-badge">Reviewer</span></div><div class="field"><label>หมายเหตุการทบทวน</label><textarea id="review_note" placeholder="ถ้าส่งกลับแก้ไข ต้องระบุเหตุผล; ถ้าอนุมัติจะใส่หมายเหตุหรือเว้นว่างก็ได้">${esc(r.review_note||'')}</textarea></div><div class="actions"><button type="button" class="btn danger" id="returnForCorrection">ส่งกลับแก้ไข</button><button type="button" class="btn good" id="approveAndLock">อนุมัติและ LOCK</button></div></div>`:''}
      <form id="recordForm">
      <div class="panel purpose-panel"><h2>1. ประเภทรายการ</h2><div class="purpose-selector" role="radiogroup" aria-label="ประเภทการบันทึก"><label class="purpose-option ${purpose==='prepare'?'selected':''}"><input type="radio" name="record_purpose" value="prepare" ${purpose==='prepare'?'checked':''} ${editable?'':'disabled'}><span><strong>Prepare</strong><small>ค่าเริ่มต้น</small></span></label><label class="purpose-option ${purpose==='qc'?'selected':''}"><input type="radio" name="record_purpose" value="qc" ${purpose==='qc'?'checked':''} ${editable?'':'disabled'}><span><strong>ใช้เป็น QC</strong></span></label></div></div>
      ${adminCorrection?`<div class="panel admin-correction-panel"><div class="section-title-row"><h2>การแก้ไขโดย Admin</h2><span class="section-badge warning">เก็บก่อน–หลังใน Audit Log</span></div><div class="field"><label>เหตุผลการแก้ไขโดย Admin</label><textarea id="admin_edit_reason" placeholder="เช่น เจ้าหน้าที่แจ้งผลผิด ตรวจหลักฐานใหม่แล้วแก้ไข"></textarea></div></div>`:''}
      <div class="panel"><h2>2. ข้อมูลผลิตภัณฑ์</h2><div class="form-grid">
        ${field('Product No.','product_no',r?.product_no,'text',false,'','required')}
        <div class="field"><label class="required">ผลิตภัณฑ์</label><select id="product_type" ${editable?'':'disabled'}><option value="">เลือก</option>${productOptions(r?.product_type)}${r?.product_type&&!productSetting(r.product_type)?`<option value="${esc(r.product_type)}" selected>${esc(r.product_type)} (ข้อมูลเดิม)</option>`:''}</select></div>
        <div class="field"><label>Group</label><select id="blood_group" ${editable?'':'disabled'}><option value="">เลือก</option>${['O','A','B','AB'].map(x=>`<option ${r?.blood_group===x?'selected':''}>${x}</option>`).join('')}</select></div>
        ${field('วัน-เวลาเริ่มเจาะถุงที่ 1','collection_at',inputFromISO(r?.collection_at),'datetime-local',false,'','required')}
        ${field('น้ำหนักที่ชั่งได้ (g)','gross_weight_g',r?.gross_weight_g,'number',false,'0.01','required')}
        <div class="field"><label>น้ำหนักถุงเปล่า (g) <span class="field-badge">อัตโนมัติ</span></label><input id="bag_tare_weight_g" readonly value="${esc(r?.bag_tare_weight_g??'')}"></div>
        <div class="field"><label>Density <span class="field-badge">อัตโนมัติ</span></label><input id="density" readonly value="${esc(r?.density??'')}"></div>
        <div class="field"><label>Volume (mL) <span class="field-badge">คำนวณอัตโนมัติ</span></label><input id="volume_ml" readonly value="${esc(r?.volume_ml??'')}"></div>
        <div class="field"><label>วัน-เวลาหมดอายุ <span class="field-badge">อัตโนมัติ</span></label><input id="expiry_preview" readonly value="${esc(inputFromISO(r?.expiry_at))}"></div>
        <div class="field span2"><label>ผู้บันทึกครั้งแรก</label><input readonly value="${esc(r?dateTH(r.created_at)+' · '+profileName(r.created_by):(state.profile.display_name||state.profile.email))}"></div>
      </div></div>
      <div class="panel" id="poolPanel"><div class="section-title-row"><h2>3. Units ที่ใช้ Pool (เฉพาะ LDPPC)</h2><div class="rule-chips"><span class="rule-chip">PYI ≥ ${fmt(state.settings.pool_pyi_standard_min,0)}</span><span class="rule-chip warn">${fmt(state.settings.pool_pyi_conditional_min,0)}–${fmt(state.settings.pool_pyi_standard_min-1,0)} → Yield ≥ ${fmt(state.settings.pool_conditional_yield_min,2)}</span></div></div><div class="table-wrap"><table class="pool-table"><thead><tr><th>#</th><th>Unit No.</th><th>PYI</th></tr></thead><tbody>${[1,2,3,4,5,6].map(i=>{const u=pool.find(x=>x.position===i);return `<tr><td>${i}</td><td><input class="pool-unit" data-pos="${i}" value="${esc(u?.unit_no||'')}" ${editable?'':'disabled'} placeholder="Unit No."></td><td><input class="pool-pyi" data-pos="${i}" type="number" step="0.01" min="0" value="${esc(u?.pyi??'')}" ${editable?'':'disabled'} placeholder="PYI"></td></tr>`}).join('')}</tbody></table></div><div class="pool-summary-grid"><div class="calc-box"><span>Pool PYI</span><strong id="poolSum">${fmt(r?.pool_pyi,2)}</strong></div><div class="calc-box pool-rule-box"><span>สถานะการ Pool / ฉลาก</span><div id="poolRuleStatus">${poolReleaseBadge(r?.pool_release_status)}</div><small id="poolRuleHint"></small></div></div></div>
      <div class="panel measurement-entry-panel"><div class="section-title-row"><h2>4. ผล Platelet จาก CBC</h2><span class="section-badge">ผล + หลักฐาน</span></div>
        <div class="form-grid platelet-cbc-meta">
          <div class="field"><label>เครื่อง CBC</label><select id="plt_instrument" ${editable?'':'disabled'}><option value="">เลือก</option>${['Mindray','Sysmex'].map(x=>`<option ${r?.plt_instrument===x?'selected':''}>${x}</option>`).join('')}</select></div>
          ${field('วัน-เวลาที่วัด CBC','plt_measured_at',inputFromISO(r?.plt_measured_at),'datetime-local')}
          <div class="field"><label>ค่าที่ใช้คำนวณ</label><select id="plt_use_mode" ${editable?'':'disabled'}>${[['first','เครื่องที่ 1'],['second','เครื่องที่ 2'],['average','ค่าเฉลี่ยเครื่องที่ 1–2']].map(([v,t])=>`<option value="${v}" ${(r?.plt_use_mode||'first')===v?'selected':''}>${t}</option>`).join('')}</select></div>
        </div>
        <div class="table-wrap platelet-repeat-wrap"><table class="data-table platelet-repeat-table"><thead><tr><th></th><th>PLT (K/µL)</th></tr></thead><tbody>
          <tr><th>เครื่องที่ 1</th><td><input id="plt_value_1" type="number" min="0" step="0.01" value="${esc(r?.plt_value_1??'')}" ${editable?'':'disabled'}></td></tr>
          <tr><th>เครื่องที่ 2</th><td><input id="plt_value_2" type="number" min="0" step="0.01" value="${esc(r?.plt_value_2??'')}" ${editable?'':'disabled'}></td></tr>
        </tbody></table></div>
        ${measurementEvidenceBox('cbc','หลักฐาน CBC / PLT')}
      </div>
      <div class="panel measurement-entry-panel"><div class="section-title-row"><h2>5. WBC จาก ADAM</h2><span class="section-badge">ผล + หลักฐาน</span></div><div class="form-grid">${field('WBC (/µL)','wbc_adam',r?.wbc_adam,'number',false,'0.0001')}${field('วัน-เวลาที่วัด ADAM','wbc_measured_at',inputFromISO(r?.wbc_measured_at),'datetime-local')}</div>${measurementEvidenceBox('adam','หลักฐาน ADAM / WBC')}</div>
      <div class="panel measurement-entry-panel"><div class="section-title-row"><h2>6. pH ณ วันหมดอายุ</h2><span class="section-badge">ผล + หลักฐาน</span></div><div class="form-grid">${field('pH','ph_value',r?.ph_value,'number',false,'0.001')}${field('วัน-เวลาที่วัด pH','ph_measured_at',inputFromISO(r?.ph_measured_at),'datetime-local')}<div class="field span2"><label>เหตุผล ถ้าวัด pH ไม่ตรงวันหมดอายุ</label><input id="ph_deviation_reason" value="${esc(r?.ph_deviation_reason||'')}" ${editable?'':'disabled'} placeholder="เช่น เครื่องขัดข้อง / วัดล่าช้า 2 วัน"></div></div>${measurementEvidenceBox('ph','หลักฐาน pH')}</div>
      <div class="panel"><h2>7. ผลคำนวณอัตโนมัติ</h2><div class="calc-grid"><div class="calc-box"><span>PLT ที่ใช้</span><strong id="cPlt">${fmt(r?.plt_used,2)}</strong><small>K/µL</small></div><div class="calc-box"><span>Platelet yield</span><strong id="cYield">${fmt(r?.platelet_yield,3)}</strong><small>×10¹¹ cells/unit</small></div><div class="calc-box"><span>Equivalent Units</span><strong id="cEq">${fmt(r?.equivalent_units,2)}</strong><small>factor ${state.settings.equivalent_unit_factor}</small></div><div class="calc-box"><span>Residual WBC</span><strong id="cWbc">${fmt(r?.residual_wbc,3)}</strong><small>×10⁶ cells/unit</small></div></div><div id="calcWarnings" style="margin-top:12px"></div></div>
      <div class="panel"><h2>8. หมายเหตุ</h2><textarea id="notes" ${editable?'':'disabled'} placeholder="บันทึกเหตุการณ์หรือข้อมูลเพิ่มเติม">${esc(r?.notes||'')}</textarea></div>
      <div class="sticky-actions"><div class="left"><button type="button" class="btn" id="cancelEdit">กลับรายการทั้งหมด</button></div><div class="right ${!r?'new-record-actions':''}">${!r&&editable?'<button type="button" class="btn clear-form-btn" id="clearForm">ล้างฟอร์ม</button>':''}${editable?'<button type="button" class="btn" id="saveDraft">บันทึก</button>':''}${r&&r.status==='draft'&&r.record_purpose==='qc'&&editable?'<button type="button" class="btn primary" id="submitReview">ส่งให้แพทย์ทบทวน</button>':''}${r&&r.status==='locked'&&adminUi()&&!deleted?'<button type="button" class="btn danger" id="unlockRecord">ปลดล็อกเป็น Draft</button>':''}</div></div>
      </form>`;
    setEditable(editable); applyProductWeightConfig(r); togglePool(); updateCalcPreview(); updatePoolRuleStatus(); renderEvidenceLists(r?.id,editable,locked);
    $$('input[name="record_purpose"]').forEach(el=>el.addEventListener('change',()=>{$$('.purpose-option').forEach(x=>x.classList.toggle('selected',$('input',x)?.checked));updateCalcPreview();}));
    $('#product_type').addEventListener('change',()=>{applyProductWeightConfig(null);togglePool();updateCalcPreview();}); ['collection_at','gross_weight_g','plt_value_1','plt_value_2','plt_use_mode','wbc_adam','ph_value','ph_measured_at','plt_measured_at','wbc_measured_at'].forEach(id=>$('#'+id)?.addEventListener('input',updateCalcPreview));
    $$('.pool-pyi,.pool-unit').forEach(x=>x.addEventListener('input',updatePoolPreview));
    $('#recordGuideBtn').onclick=()=>switchView('guide'); $('#cancelEdit').onclick=()=>switchView('records'); if($('#clearForm')) $('#clearForm').onclick=clearNewRecordForm; if($('#saveDraft')) $('#saveDraft').onclick=()=>saveRecord(false); if($('#submitReview')) $('#submitReview').onclick=submitRecord; if($('#returnForCorrection')) $('#returnForCorrection').onclick=returnForCorrection; if($('#approveAndLock')) $('#approveAndLock').onclick=approveAndLock; if($('#unlockRecord')) $('#unlockRecord').onclick=unlockRecord;
    if(!r&&$('#collection_at')){$('#collection_at').addEventListener('change',()=>maybeAutoSelectPlateletQc());$('#collection_at').addEventListener('blur',()=>maybeAutoSelectPlateletQc());}
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
  function currentPoolSum(){ return $$('.pool-pyi').reduce((s,x)=>s+(num(x.value)||0),0); }
  function updatePoolPreview(){ const sum=currentPoolSum(); if($('#poolSum')) $('#poolSum').textContent=fmt(sum,2); updatePoolRuleStatus(); }
  function poolReleaseState(poolPyi,yieldValue){
    const std=Number(state.settings.pool_pyi_standard_min??280),cond=Number(state.settings.pool_pyi_conditional_min??260),yieldMin=Number(state.settings.pool_conditional_yield_min??2);
    if(poolPyi===null||poolPyi<=0) return 'pending_pool';
    if(poolPyi>=std) return 'standard';
    if(poolPyi>=cond){ if(yieldValue===null) return 'conditional_pending'; return yieldValue>=yieldMin?'conditional_pass':'conditional_fail'; }
    return 'below_min';
  }
  function updatePoolRuleStatus(){
    if(!$('#poolRuleStatus')||$('#poolPanel')?.classList.contains('hidden')) return;
    const poolPyi=currentPoolSum(),c=calcFrontend(),st=poolReleaseState(poolPyi,c.y);
    $('#poolRuleStatus').innerHTML=poolReleaseBadge(st);
    const std=Number(state.settings.pool_pyi_standard_min??280),cond=Number(state.settings.pool_pyi_conditional_min??260),yieldMin=Number(state.settings.pool_conditional_yield_min??2);
    const hint=st==='conditional_pending'?`รอ Platelet yield ≥ ${fmt(yieldMin,2)}`:
      st==='conditional_pass'?`Yield ${fmt(c.y,3)} ≥ ${fmt(yieldMin,2)}`:
      st==='conditional_fail'?`Yield ${fmt(c.y,3)} < ${fmt(yieldMin,2)}`:
      st==='below_min'?`ต่ำกว่า ${fmt(cond,0)}`:'';
    if($('#poolRuleHint')) $('#poolRuleHint').textContent=hint;
  }
  function clearNewRecordForm(){
    if(state.currentRecordId) return;
    if(!confirm('ล้างข้อมูลที่กรอกในฟอร์มนี้ทั้งหมด?')) return;
    renderRecordForm();
  }
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
    const cfg=currentProductConfig(); if(cfg?.requires_pool){ const pst=poolReleaseState(currentPoolSum(),c.y); const cond=Number(state.settings.pool_pyi_conditional_min??260),std=Number(state.settings.pool_pyi_standard_min??280),ym=Number(state.settings.pool_conditional_yield_min??2); if(pst==='below_min')w.push(`Pool PYI ต่ำกว่า ${fmt(cond,0)} ไม่เข้าเงื่อนไขอนุโลม`); if(pst==='conditional_pending')w.push(`Pool PYI อยู่ช่วง ${fmt(cond,0)}–<${fmt(std,0)} ต้องตรวจ Platelet yield และต้อง ≥ ${fmt(ym,2)} ×10¹¹ cells/unit`); if(pst==='conditional_fail')w.push(`Pool PYI อยู่ช่วงอนุโลม แต่ Platelet yield ต้อง ≥ ${fmt(ym,2)} ×10¹¹ cells/unit จึงผ่านสำหรับฉลากปกติ`); }
    if(isQc){ if(c.diff!==null&&c.diff>Number(state.settings.plt_repeat_diff_max_pct))w.push(`PLT ซ้ำต่างกัน ${fmt(c.diff,1)}% มากกว่าเกณฑ์เตือน ${state.settings.plt_repeat_diff_max_pct}%`); if(c.y!==null&&c.y<Number(state.settings.platelet_yield_min))w.push(`Platelet yield ต่ำกว่า ${state.settings.platelet_yield_min}`); if(c.rw!==null&&c.rw>Number(state.settings.residual_wbc_max))w.push(`Residual WBC มากกว่า ${state.settings.residual_wbc_max}`); if(c.ph!==null&&c.ph<Number(state.settings.ph_min))w.push(`pH ต่ำกว่า ${state.settings.ph_min}`); }
    const pm=$('#ph_measured_at')?.value, ex=$('#expiry_preview')?.value; if(pm&&ex&&pm.slice(0,10)!==ex.slice(0,10))w.push('วันที่วัด pH ไม่ตรงวันหมดอายุ ต้องใส่เหตุผลก่อนส่งตรวจทวน');
    if(w.length) $('#calcWarnings').innerHTML=`<div class="notice warning"><strong>ต้องตรวจสอบ</strong><br>${w.map(esc).join('<br>')}</div>`;
    else if(isQc) $('#calcWarnings').innerHTML='<div class="notice good">ยังไม่พบเงื่อนไขเตือนตามเกณฑ์ QC จากค่าที่กรอก</div>';
    else $('#calcWarnings').innerHTML='';
    updatePoolRuleStatus();
  }
  function measurementEvidenceBox(cat,title){ return `<div class="measurement-evidence"><div class="measurement-evidence-head"><strong>${title}</strong><span class="section-badge required-evidence">บังคับ</span></div><input class="hidden-file-input" type="file" id="camera_${cat}" accept="image/*" capture="environment"><input class="hidden-file-input" type="file" id="file_${cat}" accept="image/*,application/pdf"><div class="evidence-pick-actions"><button type="button" class="btn primary small-btn camera-pick" data-cat="${cat}">ถ่ายรูป</button><button type="button" class="btn small-btn file-pick" data-cat="${cat}">เลือกไฟล์</button></div><div class="evidence-list" id="list_${cat}"></div></div>`; }
  function renderEvidenceLists(recordId,editable,locked=false){ ['cbc','adam','ph'].forEach(cat=>{ const host=$('#list_'+cat); if(!host)return; const arr=state.currentEvidence.filter(x=>x.category===cat); const canDelete=editable && !(locked&&adminUi()); host.innerHTML=arr.length?arr.map(e=>`<div class="evidence-item"><span class="name evidence-name" title="${esc(e.original_name)}"><strong>${esc(e.original_name)}</strong><small>ผู้แนบหลักฐาน ${esc(profileName(e.uploaded_by))} · ${esc(dateTH(e.created_at))}</small>${e.change_reason?`<small class="evidence-reason">Admin: ${esc(e.change_reason)}</small>`:''}</span><span class="e-actions"><button type="button" class="btn small-btn ev-view" data-id="${e.id}">ดู</button>${canDelete?`<button type="button" class="btn small-btn danger ev-del" data-id="${e.id}">ลบ</button>`:''}</span></div>`).join(''):'<div class="muted small">ยังไม่มีหลักฐาน</div>'; });
    $$('.ev-view').forEach(b=>b.onclick=()=>viewEvidence(b.dataset.id)); $$('.ev-del').forEach(b=>b.onclick=()=>deleteEvidence(b.dataset.id));
    $$('.camera-pick').forEach(b=>{b.disabled=!editable;b.onclick=()=>$('#camera_'+b.dataset.cat).click();});
    $$('.file-pick').forEach(b=>{b.disabled=!editable;b.onclick=()=>$('#file_'+b.dataset.cat).click();});
    ['cbc','adam','ph'].forEach(cat=>{ const camera=$('#camera_'+cat), file=$('#file_'+cat); if(camera)camera.onchange=()=>uploadEvidence(cat,'camera'); if(file)file.onchange=()=>uploadEvidence(cat,'file'); });
  }

  function plateletHasEvidence(cat){return state.currentEvidence.some(e=>e.category===cat);}
  function plateletEvidenceMissing(payload){const m=[];if((payload.plt_value_1!==null||payload.plt_value_2!==null)&&!plateletHasEvidence('cbc'))m.push('ผล Platelet จาก CBC ต้องมีหลักฐาน CBC');if(payload.wbc_adam!==null&&!plateletHasEvidence('adam'))m.push('ผล WBC จาก ADAM ต้องมีหลักฐาน ADAM');if(payload.ph_value!==null&&!plateletHasEvidence('ph'))m.push('ผล pH ต้องมีหลักฐาน pH');return m;}
  function stripPlateletResults(payload){return {...payload,plt_instrument:null,plt_value_1:null,plt_value_2:null,plt_measured_at:null,wbc_adam:null,wbc_measured_at:null,ph_value:null,ph_measured_at:null,ph_deviation_reason:null};}
  async function ensureSaved(){ if(state.currentRecordId) return state.currentRecordId; const ok=await saveRecord(true,true); return ok?state.currentRecordId:null; }
  function collectRecord(){
    const purpose=$('input[name="record_purpose"]:checked')?.value||'prepare';
    const payload={record_purpose:purpose,product_no:$('#product_no').value.trim(),product_type:$('#product_type').value,blood_group:$('#blood_group').value||null,collection_at:bangkokISO($('#collection_at').value),gross_weight_g:num($('#gross_weight_g').value),plt_instrument:$('#plt_instrument').value||null,plt_value_1:num($('#plt_value_1').value),plt_value_2:num($('#plt_value_2').value),plt_measured_at:bangkokISO($('#plt_measured_at').value),plt_use_mode:$('#plt_use_mode').value,wbc_adam:num($('#wbc_adam').value),wbc_measured_at:bangkokISO($('#wbc_measured_at').value),ph_value:num($('#ph_value').value),ph_measured_at:bangkokISO($('#ph_measured_at').value),ph_deviation_reason:$('#ph_deviation_reason').value.trim()||null,notes:$('#notes').value.trim()||null};
    if(state.currentRecordId&&adminUi()){
      const reason=$('#admin_edit_reason')?.value.trim();
      if(reason){payload.last_admin_edit_reason=reason;payload.last_admin_edit_id=crypto.randomUUID();}
    }
    return payload;
  }

  function maybeAutoSelectPlateletQc(){
    if(state.currentRecordId)return;const raw=$('#collection_at')?.value;if(!raw)return;const date=raw.slice(0,10),ym=monthKeyFromDateString(date),slot=plateletWeekSlot(date);if(!slot)return;
    const hasQc=plateletQcInSlot(ym,slot).length>0;if(hasQc)return;
    const radio=$('input[name="record_purpose"][value="qc"]');if(radio&&!radio.checked){radio.checked=true;$$('.purpose-option').forEach(x=>x.classList.toggle('selected',x.querySelector('input')?.checked));showToast(`สัปดาห์ ${slot} ยังไม่มี Platelet QC ระบบเลือก “ใช้เป็น QC” ให้อัตโนมัติ`,'good');}
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
      let payload=collectRecord();
      if(!payload.product_no||!payload.product_type){if(auto)showToast('กรอก Product No. และผลิตภัณฑ์ก่อนแนบไฟล์','error');else showToast('กรุณากรอก Product No. และผลิตภัณฑ์','error');return false;}
      let id=state.currentRecordId;
      if(auto&&!id) payload=stripPlateletResults(payload);
      if(!auto){const missingEvidence=plateletEvidenceMissing(payload);if(missingEvidence.length){showToast(missingEvidence[0],'error');return false;}}
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
    const {error}=await state.sb.from('evidence_files').delete().eq('id',id);if(error){showToast(errText(error),'error');return;}
    const {error:s}=await state.sb.storage.from('platelet-evidence').remove([e.storage_path]);if(s)console.warn('storage cleanup failed',s);
    state.currentEvidence=state.currentEvidence.filter(x=>x.id!==id);renderEvidenceLists(state.currentRecordId,true,false);showToast('ลบหลักฐานแล้ว');
  }
  async function submitRecord(){ if(!await saveRecord(true))return; const current=state.records.find(r=>r.id===state.currentRecordId); if(current?.record_purpose!=='qc'){showToast('Prepare บันทึกได้ตามปกติ ไม่ต้องส่งแพทย์ทบทวน','good');return;} try{const {error}=await state.sb.from('platelet_records').update({status:'submitted'}).eq('id',state.currentRecordId);if(error)throw error;await loadRecords();showToast('ส่งให้แพทย์ทบทวนแล้ว','good');await renderRecordForm();}catch(e){showToast(errText(e),'error');} }
  async function refreshAfterReviewAction(){
    if(state.currentView==='review') renderReviewQueue();
    else if(state.currentView==='records') renderRecordsList();
    else if(state.currentView==='dashboard') renderDashboard();
    else if(state.currentView==='home') renderHome();
    else if(state.currentView==='record') await renderRecordForm();
  }
  async function approveAndLock(recordId=state.currentRecordId,note=null){ const id=recordId; if(!id||!reviewerUi())return; const reviewNote=note===null?($('#review_note')?.value.trim()||null):note; if(!confirm('ยืนยันว่าตรวจทวนข้อมูลและหลักฐานแล้ว และอนุมัติให้ LOCK รายการนี้?'))return; try{const {error}=await state.sb.from('platelet_records').update({status:'locked',review_note:reviewNote}).eq('id',id);if(error)throw error;await loadRecords();showToast('ทบทวนและ LOCK แล้ว','good');if($('#detailDialog')?.open) $('#detailDialog').close(); await refreshAfterReviewAction();}catch(e){showToast(errText(e),'error');} }
  async function returnForCorrection(recordId=state.currentRecordId,note=null){ const id=recordId; if(!id||!reviewerUi())return; const reviewNote=(note===null?$('#review_note')?.value:note)?.trim(); if(!reviewNote){showToast('กรุณาระบุเหตุผลที่ส่งกลับแก้ไข','error');($('#review_note')||$('#detail_review_note'))?.focus();return;} if(!confirm('ส่งรายการนี้กลับเป็น Draft ให้เจ้าหน้าที่แก้ไข?'))return; try{const {error}=await state.sb.from('platelet_records').update({status:'draft',review_note:reviewNote}).eq('id',id);if(error)throw error;await loadRecords();showToast('ส่งกลับให้แก้ไขแล้ว','good');if($('#detailDialog')?.open) $('#detailDialog').close(); await refreshAfterReviewAction();}catch(e){showToast(errText(e),'error');} }
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
      const [{data:pool},{data:ev},{data:audit}]=await Promise.all([
        state.sb.from('pool_units').select('*').eq('record_id',id).order('position'),
        state.sb.from('evidence_files').select('*').eq('record_id',id).order('created_at'),
        adminUi()?state.sb.from('audit_logs').select('*').eq('record_id',id).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[]})
      ]);
      $('#detailTitle').textContent=r.product_no;$('#detailSubtitle').textContent=`${r.product_type} · ${purposeTH(r.record_purpose)} · Revision ${r.revision}`;
      logActivity('view_record','record',r.id,{product_no:r.product_no,product_type:r.product_type,purpose:r.record_purpose}).catch(()=>{});
      const canEdit=!r.deleted_at&&(adminUi()||(r.status==='draft'&&staffWriteUi()));
      const canReview=!r.deleted_at&&r.record_purpose==='qc'&&r.status==='submitted'&&reviewerUi();
      const sectionMeta=(measuredAt,by,recordedAt)=>{
        const parts=[];
        if(measuredAt) parts.push(`<span class="detail-meta-chip"><b>วันที่ตรวจ</b> ${esc(dateTH(measuredAt))}</span>`);
        if(by) parts.push(`<span class="detail-meta-chip"><b>ผู้กรอกผล</b> ${esc(profileName(by))}</span>`);
        if(recordedAt) parts.push(`<span class="detail-meta-chip"><b>บันทึกล่าสุด</b> ${esc(dateTH(recordedAt))}</span>`);
        return parts.join('');
      };
      const prepMeta=sectionMeta(null,r.prep_recorded_by||r.created_by,r.prep_recorded_at||r.created_at);
      const pltHasResult=r.plt_value_1!=null||r.plt_value_2!=null;
      const wbcHasResult=r.wbc_adam!=null;
      const phHasResult=r.ph_value!=null;
      const pltMeta=pltHasResult?sectionMeta(r.plt_measured_at,r.plt_recorded_by,r.plt_recorded_at):'';
      const wbcMeta=wbcHasResult?sectionMeta(r.wbc_measured_at,r.wbc_recorded_by,r.wbc_recorded_at):'';
      const phMeta=phHasResult?sectionMeta(r.ph_measured_at,r.ph_recorded_by,r.ph_recorded_at):'';
      const detailEvidence=(cat)=>{
        const rows=(ev||[]).filter(x=>x.category===cat);
        if(!rows.length)return '<div class="measurement-evidence-empty">ยังไม่มีหลักฐาน</div>';
        return `<div class="detail-section-evidence"><div class="detail-evidence-title">หลักฐาน</div>${rows.map(x=>`<div class="evidence-item"><span class="name evidence-name"><strong>${esc(x.original_name)}</strong><small>ผู้แนบหลักฐาน ${esc(profileName(x.uploaded_by))} · ${esc(dateTH(x.created_at))}</small>${x.change_reason?`<small class="evidence-reason">เหตุผล Admin: ${esc(x.change_reason)}</small>`:''}</span><button class="btn small-btn detail-evidence" data-path="${esc(x.storage_path)}">ดู</button></div>`).join('')}</div>`;
      };
      const poolRows=(pool||[]).map(x=>`<tr><td>${x.position}</td><td>${esc(x.unit_no)}</td><td>${fmt(x.pyi,2)}</td><td>${esc(profileName(x.updated_by||x.created_by))}</td><td class="nowrap">${esc(dateTH(x.updated_at||x.created_at))}</td></tr>`).join('');
      $('#detailBody').innerHTML=`<div class="status-line">${purposeBadge(r.record_purpose)} ${deletedBadge(r)} ${statusBadge(r.status)} ${qcBadgeForRecord(r)} ${pHBadge(r)}</div>
      ${r.deleted_at?`<div class="notice bad"><strong>ลบออกจากรายการใช้งานแล้ว</strong><br>${esc(r.delete_reason||'–')} · ${dateTH(r.deleted_at)} · ${esc(profileName(r.deleted_by))}</div>`:''}

      <section class="detail-section">
        <div class="detail-section-head"><div><h3>ข้อมูลการเตรียม</h3><p>ข้อมูลผลิตภัณฑ์และค่าที่ใช้คำนวณ Volume</p></div><div class="detail-section-meta">${prepMeta}</div></div>
        <div class="detail-grid">${dcell('ประเภท',purposeTH(r.record_purpose))}${dcell('กำหนดประเภทเมื่อ',dateTH(r.purpose_selected_at))}${dcell('กำหนดประเภทโดย',profileName(r.purpose_selected_by))}${dcell('Group',r.blood_group)}${dcell('วัน-เวลาเริ่มเจาะ',dateTH(r.collection_at))}${dcell('วัน-เวลาหมดอายุ',dateTH(r.expiry_at))}${dcell('น้ำหนักที่ชั่งได้',fmt(r.gross_weight_g,2)+' g')}${dcell('น้ำหนักถุงเปล่า',fmt(r.bag_tare_weight_g,2)+' g')}${dcell('Density',fmt(r.density,2))}${dcell('Volume',fmt(r.volume_ml,2)+' mL')}</div>
      </section>

      ${pool?.length?`<section class="detail-section"><div class="detail-section-head"><div><h3>Pool LDPPC</h3><p>แสดงผู้บันทึกและเวลาของแต่ละ Unit</p></div><div class="detail-section-meta"><span class="detail-meta-chip"><b>Pool PYI</b> ${fmt(r.pool_pyi,2)}</span><span class="detail-meta-chip"><b>ฉลาก</b> ${esc(poolReleaseTH(r.pool_release_status))}</span></div></div><div class="table-wrap"><table class="data-table detail-pool-table"><thead><tr><th>#</th><th>Unit No.</th><th>PYI</th><th>ผู้กรอก</th><th>เวลาบันทึก</th></tr></thead><tbody>${poolRows}</tbody></table></div></section>`:''}

      <section class="detail-section measurement-section">
        <div class="detail-section-head"><div><h3>CBC / Platelet</h3><p>ผลตรวจ Platelet และค่าที่ใช้คำนวณ Yield</p></div><div class="detail-section-meta">${pltMeta||'<span class="detail-meta-chip muted-chip">ยังไม่มีผล</span>'}</div></div>
        <div class="detail-grid">${dcell('เครื่อง CBC',r.plt_instrument)}${dcell('PLT ที่ใช้',r.plt_used==null?'–':fmt(r.plt_used,2)+' K/µL')}${dcell('Platelet yield',r.platelet_yield==null?'–':fmt(r.platelet_yield,3)+' ×10¹¹ cells/unit')}${dcell('Equivalent Units',fmt(r.equivalent_units,2))}</div>
        <div class="table-wrap platelet-detail-repeat-wrap"><table class="data-table platelet-repeat-table"><thead><tr><th></th><th>PLT (K/µL)</th></tr></thead><tbody><tr><th>เครื่องที่ 1</th><td>${r.plt_value_1==null?'–':fmt(r.plt_value_1,2)}</td></tr><tr><th>เครื่องที่ 2</th><td>${r.plt_value_2==null?'–':fmt(r.plt_value_2,2)}</td></tr></tbody></table></div>
        ${detailEvidence('cbc')}
      </section>

      <section class="detail-section measurement-section">
        <div class="detail-section-head"><div><h3>ADAM / WBC</h3><p>ผล WBC และ Residual WBC</p></div><div class="detail-section-meta">${wbcMeta||'<span class="detail-meta-chip muted-chip">ยังไม่มีผล</span>'}</div></div>
        <div class="detail-grid">${dcell('WBC ADAM',r.wbc_adam==null?'–':fmt(r.wbc_adam,4)+' /µL')}${dcell('Residual WBC',r.residual_wbc==null?'–':fmt(r.residual_wbc,3)+' ×10⁶ cells/unit')}</div>
        ${detailEvidence('adam')}
      </section>

      <section class="detail-section measurement-section">
        <div class="detail-section-head"><div><h3>pH</h3><p>ค่า pH และวันเวลาที่ตรวจ</p></div><div class="detail-section-meta">${phMeta||'<span class="detail-meta-chip muted-chip">ยังไม่มีผล</span>'}</div></div>
        <div class="detail-grid">${dcell('pH',fmt(r.ph_value,3))}${r.ph_deviation_reason?dcell('เหตุผลที่ตรวจไม่ตรงวันหมดอายุ',r.ph_deviation_reason):''}</div>
        ${detailEvidence('ph')}
      </section>

      ${r.pool_release_status&&r.pool_release_status!=='not_applicable'?`<div class="notice ${['standard','conditional_pass'].includes(r.pool_release_status)?'good':['conditional_pending'].includes(r.pool_release_status)?'warning':'bad'}"><strong>การ Pool / ฉลาก:</strong> ${esc(poolReleaseTH(r.pool_release_status))}${r.pool_release_status==='conditional_pending'?` · ต้องมี Platelet yield ≥ ${fmt(state.settings.pool_conditional_yield_min,2)} ×10¹¹ cells/unit`:''}</div>`:''}
      ${r.record_purpose==='qc'?`<div class="notice ${r.qc_status==='pass'?'good':r.qc_status==='review'?'warning':'info'}"><strong>ผลประเมิน QC:</strong> ${esc(qcTH(r.qc_status))}</div>`:'<div class="compact-status"><span class="badge prepare-purpose">Prepare · ไม่ประเมิน QC</span></div>'}
      ${r.notes?`<div class="detail-section"><div class="detail-section-head"><div><h3>หมายเหตุ</h3></div></div><div class="detail-note">${esc(r.notes)}</div></div>`:''}
      ${r.status==='draft'&&r.returned_at&&r.review_note?`<div class="notice warning"><strong>แพทย์ส่งกลับแก้ไข:</strong> ${esc(r.review_note)}<br><span class="small">${esc(profileName(r.returned_by))} · ${esc(dateTH(r.returned_at))}</span></div>`:''}
      ${r.reviewed_at&&r.status==='locked'?`<div class="notice good"><strong>แพทย์ผู้ทบทวน:</strong> ${esc(profileName(r.reviewed_by))} · ${esc(dateTH(r.reviewed_at))}${r.review_note?`<br><strong>หมายเหตุ:</strong> ${esc(r.review_note)}`:''}</div>`:''}
      ${canReview?`<section class="detail-section reviewer-action-panel"><div class="detail-section-head"><div><h3>การทบทวนโดยแพทย์</h3><p>ตรวจผลและหลักฐานก่อนตัดสินใจ</p></div></div><div class="field"><label>หมายเหตุการทบทวน</label><textarea id="detail_review_note" placeholder="ถ้าส่งกลับแก้ไข ต้องระบุเหตุผล">${esc(r.review_note||'')}</textarea></div></section>`:''}

      <section class="detail-section workflow-section">
        <div class="detail-section-head"><div><h3>ลำดับการบันทึก</h3></div></div>
        <div class="workflow-grid ${r.record_purpose==='prepare'?'prepare-workflow':''}">
          ${workflowStep(r.record_purpose==='qc'?'สร้างรายการ QC':'บันทึก Prepare',r.created_by,r.created_at)}
          ${r.record_purpose==='qc'?workflowStep('ส่งให้แพทย์ทบทวน',r.submitted_by,r.submitted_at):''}
          ${r.record_purpose==='qc'?(r.returned_at?workflowStep('แพทย์ส่งกลับแก้ไข',r.returned_by,r.returned_at):workflowStep('แพทย์ทบทวน / LOCK',r.locked_by||r.reviewed_by,r.locked_at||r.reviewed_at)):''}
        </div>
      </section>

      ${adminUi()?`<div class="panel"><h3>Audit trail</h3><div class="timeline">${audit?.length?audit.map(a=>auditItem(a)).join(''):'<div class="muted">ยังไม่มีประวัติ</div>'}</div></div>`:''}
      <div class="actions"><button class="btn" id="detailClose">ปิด</button>${canReview?'<button class="btn danger" id="detailReturn">ส่งกลับแก้ไข</button><button class="btn good" id="detailApprove">อนุมัติและ LOCK</button>':''}${canEdit?'<button class="btn primary" id="detailEdit">เปิดแก้ไข</button>':''}${adminUi()&&!r.deleted_at?'<button class="btn danger" id="detailDelete">ลบรายการ</button>':''}${adminUi()&&r.deleted_at?'<button class="btn good" id="detailRestore">กู้คืนรายการ</button>':''}</div>`;
      $$('.detail-evidence').forEach(b=>b.onclick=async()=>{const {data,error}=await state.sb.storage.from('platelet-evidence').createSignedUrl(b.dataset.path,120);if(error)showToast(errText(error),'error');else window.open(data.signedUrl,'_blank','noopener');});
      $('#detailClose').onclick=()=>$('#detailDialog').close();
      if($('#detailReturn')) $('#detailReturn').onclick=()=>returnForCorrection(id,$('#detail_review_note')?.value||'');
      if($('#detailApprove')) $('#detailApprove').onclick=()=>approveAndLock(id,$('#detail_review_note')?.value||'');
      if($('#detailEdit'))$('#detailEdit').onclick=()=>{$('#detailDialog').close();state.currentRecordId=id;switchView('record');};
      if($('#detailDelete'))$('#detailDelete').onclick=()=>adminDeleteRecord(id);
      if($('#detailRestore'))$('#detailRestore').onclick=()=>adminRestoreRecord(id);
      $('#detailDialog').showModal();
    }catch(e){showToast(errText(e),'error');}
  }

  function workflowStep(label,by,at){
    const done=!!(by||at);
    return `<div class="workflow-step ${done?'done':''}"><span class="workflow-dot"></span><div><strong>${esc(label)}</strong><small>${done?`${esc(profileName(by))} · ${esc(dateTH(at))}`:'–'}</small></div></div>`;
  }

  function dcell(l,v){return `<div class="detail-cell"><span>${l}</span><strong>${esc(v??'–')}</strong></div>`;}
  function auditItem(a){
    const who=a.actor_id?profileName(a.actor_id):'ระบบ'; let diff='';
    const labels={record_purpose:'ประเภท',status:'สถานะ',product_no:'Product No.',product_type:'ผลิตภัณฑ์',blood_group:'Group',collection_at:'วันเวลาเริ่มเจาะ',gross_weight_g:'น้ำหนักที่ชั่งได้ (g)',bag_tare_weight_g:'น้ำหนักถุงเปล่า (g)',density:'Density',volume_ml:'Volume (mL)',pool_pyi:'Pool PYI',pool_release_status:'สถานะ Pool / ฉลาก',plt_instrument:'เครื่อง CBC',plt_value_1:'PLT เครื่องที่ 1',plt_value_2:'PLT เครื่องที่ 2',plt_measured_at:'วันเวลาวัด CBC',plt_use_mode:'ค่าที่ใช้คำนวณ',wbc_adam:'WBC ADAM',wbc_measured_at:'วันเวลาวัด ADAM',ph_value:'pH',ph_measured_at:'วันเวลาวัด pH',ph_deviation_reason:'เหตุผล pH',notes:'หมายเหตุ',review_note:'หมายเหตุแพทย์',returned_at:'วันที่ส่งกลับแก้ไข',revision:'Revision',deleted_at:'สถานะการลบ'};
    if(a.old_data&&a.new_data){const changed=Object.keys(labels).filter(k=>JSON.stringify(a.old_data[k])!==JSON.stringify(a.new_data[k])); if(changed.length)diff=changed.map(k=>`${labels[k]}: ${a.old_data[k]??'–'} → ${a.new_data[k]??'–'}`).join('\n');}
    return `<div class="timeline-item"><strong>${esc(actionTH(a.action))}</strong><small>${esc(who)} · ${dateTH(a.created_at)}</small>${a.note?`<div class="diff"><strong>เหตุผล:</strong> ${esc(a.note)}</div>`:''}${diff?`<div class="diff">${esc(diff)}</div>`:''}</div>`;
  }

  async function renderSettings(){
    if(!adminUi()){location.hash=ROUTES.platelet.dashboard;return;} const s=state.settings;
    $('#view-settings').innerHTML=`<div class="page-head"><div><div class="breadcrumb"><button class="link-btn" data-go-route="#/">Blood Component QC</button><span>›</span><button class="link-btn" data-go-route="#/platelet">Platelet</button><span>›</span><span>QC Settings</span></div><h1>ตั้งค่า Platelet QC</h1></div><div class="actions"><button class="btn" data-go-route="#/admin/audit">ประวัติการใช้งาน</button></div></div>
      <div class="panel"><h2>ค่าคำนวณ Volume จากน้ำหนัก</h2><p class="section-note">เจ้าหน้าที่กรอกน้ำหนักที่ชั่งได้เป็นกรัม ระบบใช้สูตร (น้ำหนักที่ชั่งได้ − น้ำหนักถุงเปล่า) ÷ Density และเก็บค่าที่ใช้คำนวณไว้กับแต่ละรายการเพื่อทวนสอบย้อนหลัง</p><div class="table-wrap"><table class="data-table product-setting-table"><thead><tr><th>ผลิตภัณฑ์</th><th>น้ำหนักถุงเปล่า (g)</th><th>Density</th><th>Pool</th><th></th></tr></thead><tbody>${state.productSettings.filter(x=>x.is_active).map(x=>`<tr data-product-type="${esc(x.product_type)}"><td><strong>${esc(x.product_type)}</strong></td><td><input class="ps-tare" type="number" step="0.01" min="0" value="${esc(x.tare_weight_g)}"></td><td><input class="ps-density" type="number" step="0.001" min="0.001" value="${esc(x.density)}"></td><td>${x.requires_pool?'LDPPC 3–6 Units':'–'}</td><td><button class="btn small-btn ps-save" type="button" data-product="${esc(x.product_type)}">บันทึก</button></td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><h2>เกณฑ์การ Pool และฉลาก LDPPC</h2><p class="section-note">ใช้กับทั้ง Prepare ตามปกติและรายการที่ใช้เป็น QC ไม่เกี่ยวกับการเลือกว่าจะนับรายการนั้นเป็น QC หรือไม่</p><div class="form-grid">${settingField('Pool PYI เกณฑ์ปกติ ≥','s_pool_standard',s.pool_pyi_standard_min)}${settingField('Pool PYI อนุโลมขั้นต่ำ','s_pool_conditional',s.pool_pyi_conditional_min)}${settingField('Platelet yield ช่วงอนุโลม ต้อง ≥','s_pool_yield',s.pool_conditional_yield_min)}</div><div class="notice info small" style="margin-top:12px">ค่าเริ่มต้น: Pool PYI ≥ 280 ผ่านเกณฑ์ปกติ · Pool PYI 260–&lt;280 ให้ Pool ได้กรณีจำเป็น แต่ต้องมี Platelet yield ≥ 2.00 ×10¹¹ cells/unit จึงผ่านสำหรับฉลากปกติ</div></div>
      <div class="notice warning"><strong>ก่อนเริ่มใช้งานจริง:</strong> ตรวจสอบค่าน้ำหนักถุง/Density เกณฑ์ Pool/ฉลาก และเกณฑ์ QC ให้ตรงกับ WI/ข้อกำหนดที่หน่วยอนุมัติ การเปลี่ยนค่าจะถูกบันทึกใน Audit Log</div>
      <div class="panel"><h2>เกณฑ์สำหรับรายการที่ใช้เป็น QC</h2><p class="section-note">ใช้ประเมินเฉพาะรายการที่เลือก “ใช้เป็น QC” เท่านั้น รายการ Prepare ตามปกติยังเก็บผลครบแต่ไม่นำไปตัดสิน QC</p><div class="form-grid">${settingField('Platelet yield ขั้นต่ำ','s_yield',s.platelet_yield_min)}${settingField('Equivalent Unit factor','s_factor',s.equivalent_unit_factor)}${settingField('Residual WBC สูงสุด','s_wbc',s.residual_wbc_max)}${settingField('pH ขั้นต่ำ','s_ph',s.ph_min)}${settingField('อายุผลิตภัณฑ์ (วัน)','s_expiry',s.expiry_days,1)}${settingField('PLT repeat ต่างกันสูงสุด (%)','s_diff',s.plt_repeat_diff_max_pct)}</div><div class="switch-row" style="margin-top:14px"><label><input id="s_cbc" type="checkbox" checked disabled> บังคับหลักฐาน CBC</label><label><input id="s_adam" type="checkbox" checked disabled> บังคับหลักฐาน ADAM</label><label><input id="s_ph_ev" type="checkbox" checked disabled> บังคับหลักฐาน pH</label></div><div class="actions" style="margin-top:14px"><button class="btn primary" id="saveSettings">บันทึกเกณฑ์</button></div></div>`;
    $('#saveSettings').onclick=saveSettings;
    $$('.ps-save').forEach(b=>b.onclick=()=>saveProductSetting(b.dataset.product));
    bindRouteButtons($('#view-settings'));
  }

  async function renderUsers(){
    if(!adminUi()){location.hash=ROUTES.home;return;} await loadProfiles();
    $('#view-users').innerHTML=`<div class="page-head"><div><div class="breadcrumb"><button class="link-btn" data-go-route="#/">Blood Component QC</button><span>›</span><span>Admin</span></div><h1>ผู้ใช้งานระบบ</h1><p class="muted">บัญชีเดียวใช้ร่วมกันทุก Module ของ CNMI Blood Component QC</p></div><div class="actions"><button class="btn" data-go-route="#/admin/audit">ประวัติการใช้งาน</button></div></div>
      <div class="panel"><h2>สร้างบัญชีเจ้าหน้าที่</h2><p class="section-note">Admin สร้างบัญชี @mahidol.ac.th และกำหนดรหัสผ่านชั่วคราว ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อ Login ครั้งแรก</p>
        <div class="user-create-grid"><div class="field"><label>Mahidol ID / Username</label><div class="email-field"><input id="new_username" autocomplete="off" placeholder="เช่น somchai.som"><span>@mahidol.ac.th</span></div></div><div class="field"><label>ชื่อ-นามสกุล / ชื่อที่แสดง</label><input id="new_display_name" placeholder="ชื่อที่แสดงในระบบ"></div><div class="field"><label>ตำแหน่ง</label><input id="new_position" placeholder="เช่น นักเทคนิคการแพทย์"></div><div class="field"><label>สิทธิ์</label><select id="new_role"><option value="staff">Staff</option><option value="reviewer">Reviewer (แพทย์)</option><option value="admin">Admin</option></select></div><div class="field user-create-password"><label>รหัสผ่านชั่วคราว</label><input id="new_temp_password" type="password" minlength="8" autocomplete="new-password" placeholder="อย่างน้อย 8 ตัวอักษร"></div><div class="field user-create-action"><label>&nbsp;</label><button class="btn primary" id="createUserBtn" type="button">+ สร้างบัญชี</button></div></div><p id="createUserMessage" class="muted small"></p>
        <div class="notice info small"><strong>ความปลอดภัย:</strong> การสร้างบัญชีและ Reset password ทำผ่าน Supabase Edge Function เท่านั้น ไม่มี Service Role / Secret key อยู่ใน GitHub Pages</div>
      </div>
      <div class="panel"><h2>รายชื่อผู้ใช้งาน</h2><p class="section-note">Reviewer (แพทย์) ใช้สำหรับแพทย์ผู้ทบทวนผล ส่งกลับแก้ไข หรืออนุมัติและ LOCK</p><div class="table-wrap"><table class="data-table users-table"><thead><tr><th>Username</th><th>ชื่อ</th><th>ตำแหน่ง</th><th>Role</th><th>Active</th><th>First Login</th><th>Last Login</th><th>จัดการ</th></tr></thead><tbody>${state.profiles.map(p=>`<tr data-user-id="${p.id}"><td><strong>${esc((p.email||'').split('@')[0])}</strong><div class="muted small">${esc(p.email)}</div></td><td><input class="u-name" value="${esc(p.display_name||'')}"></td><td><input class="u-position" value="${esc(p.position||'')}" placeholder="ตำแหน่ง"></td><td><select class="role-select u-role">${['staff','reviewer','admin'].map(r=>`<option value="${r}" ${p.role===r?'selected':''}>${roleTH(r)}</option>`).join('')}</select></td><td><label class="toggle-cell"><input class="u-active" type="checkbox" ${p.is_active?'checked':''}> <span>${p.is_active?'Active':'ปิดใช้'}</span></label></td><td><span class="password-state ${p.must_change_password?'pending':'ok'}">${p.must_change_password?'รอเปลี่ยนรหัส':'ตั้งรหัสแล้ว'}</span></td><td class="nowrap">${dateTH(p.last_login_at)}</td><td><div class="row-actions"><button class="btn small-btn u-save" data-id="${p.id}">บันทึก</button><button class="btn small-btn u-reset" data-id="${p.id}" ${p.id===state.user.id?'disabled title="ใช้เมนูเปลี่ยนรหัสผ่านของตนเอง"':''}>Reset password</button><button class="btn small-btn u-audit" data-id="${p.id}">Audit</button></div></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#createUserBtn').onclick=createUserByAdmin;
    $$('.u-save').forEach(b=>b.onclick=()=>saveUser(b.dataset.id));
    $$('.u-reset').forEach(b=>b.onclick=()=>openAdminReset(b.dataset.id));
    $$('.u-audit').forEach(b=>b.onclick=()=>{state.auditUserFilter=b.dataset.id;location.hash=ROUTES.audit;});
    bindRouteButtons($('#view-users'));
  }
  function settingField(l,id,v,step='0.01'){return `<div class="field"><label>${l}</label><input id="${id}" type="number" step="${step}" min="0" value="${esc(v)}"></div>`;}
  async function createUserByAdmin(){
    const username=$('#new_username').value.trim().toLowerCase(),display_name=$('#new_display_name').value.trim(),position=$('#new_position').value.trim(),role=$('#new_role').value,password=$('#new_temp_password').value;
    const msg=$('#createUserMessage');
    if(!username||username.includes('@')){msg.textContent='กรอกเฉพาะ Mahidol ID เช่น somchai.som';return;}
    if(!display_name){msg.textContent='กรุณากรอกชื่อที่แสดง';return;}
    if(password.length<8){msg.textContent='รหัสผ่านชั่วคราวต้องอย่างน้อย 8 ตัวอักษร';return;}
    msg.textContent='กำลังสร้างบัญชี...';
    try{await invokeAdminUsers({action:'create_user',username,display_name,position,role,password});msg.textContent='';showToast('สร้างบัญชีเรียบร้อย','good');await loadProfiles();renderUsers();}catch(e){msg.textContent=errText(e);}
  }
  function openAdminReset(id){
    const p=state.profiles.find(x=>x.id===id); if(!p)return; state.resetTargetId=id;
    $('#adminResetTarget').textContent=`${p.display_name||p.email} · ${p.email}`; $('#adminTempPassword').value='';$('#adminTempPasswordConfirm').value='';$('#adminResetPasswordMessage').textContent='';$('#adminResetPasswordDialog').showModal();
  }
  async function saveProductSetting(type){
    try{ const row=$$('.product-setting-table tbody tr').find(x=>x.dataset.productType===type); if(!row)throw new Error('ไม่พบผลิตภัณฑ์'); const tare=num($('.ps-tare',row).value),density=num($('.ps-density',row).value); if(tare===null||tare<0)throw new Error('น้ำหนักถุงไม่ถูกต้อง'); if(density===null||density<=0)throw new Error('Density ต้องมากกว่า 0'); const {error}=await state.sb.from('platelet_product_settings').update({tare_weight_g:tare,density}).eq('product_type',type); if(error)throw error; await loadProductSettings(); showToast(`บันทึก ${type} แล้ว`,'good'); renderSettings(); }catch(e){showToast(errText(e),'error');}
  }
  async function saveSettings(){ try{const payload={pool_pyi_standard_min:num($('#s_pool_standard').value),pool_pyi_conditional_min:num($('#s_pool_conditional').value),pool_conditional_yield_min:num($('#s_pool_yield').value),platelet_yield_min:num($('#s_yield').value),equivalent_unit_factor:num($('#s_factor').value),residual_wbc_max:num($('#s_wbc').value),ph_min:num($('#s_ph').value),expiry_days:Number($('#s_expiry').value),plt_repeat_diff_max_pct:num($('#s_diff').value),require_cbc_evidence:true,require_adam_evidence:true,require_ph_evidence:true}; if(payload.pool_pyi_conditional_min>=payload.pool_pyi_standard_min)throw new Error('Pool PYI อนุโลมขั้นต่ำต้องน้อยกว่าเกณฑ์ปกติ'); if(payload.pool_conditional_yield_min<0)throw new Error('Platelet yield ช่วงอนุโลมไม่ถูกต้อง'); const {error}=await state.sb.from('qc_settings').update(payload).eq('id',1);if(error)throw error;await loadSettings();showToast('บันทึกเกณฑ์แล้ว','good');renderSettings();}catch(e){showToast(errText(e),'error');} }
  async function saveUser(id){
    try{
      const row=$(`tr[data-user-id="${id}"]`); if(!row)throw new Error('ไม่พบแถวผู้ใช้');
      const payload={display_name:$('.u-name',row).value.trim()||null,position:$('.u-position',row).value.trim()||null,role:$('.u-role',row).value,is_active:$('.u-active',row).checked};
      if(id===state.user.id&&!payload.is_active)throw new Error('ไม่ควรปิดบัญชี Admin ที่กำลังใช้งานอยู่');
      const {error}=await state.sb.from('profiles').update(payload).eq('id',id);if(error)throw error;
      if(id===state.user.id){state.profile={...state.profile,...payload};applyUiMode(false);}
      showToast('บันทึกผู้ใช้แล้ว','good');await loadProfiles();renderUsers();
    }catch(e){showToast(errText(e),'error');}
  }
  async function renderAuditLog(){
    if(!adminUi()){switchView('dashboard');return;}
    await loadProfiles();
    const {data,error}=await state.sb.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(1000); if(error){showToast(errText(error),'error');return;}
    const all=data||[];
    $('#view-audit').innerHTML=`<div class="page-head"><div><h1>ประวัติการใช้งาน (Audit Log)</h1><p class="muted">ทวนสอบว่าใครเข้าระบบ สร้างหรือแก้ไขรายการ เปลี่ยน Prepare/QC แนบหลักฐาน ลบรายการ ส่งตรวจทวน LOCK หรือจัดการระบบ</p></div><div class="actions"><button class="btn" id="auditRefresh">รีเฟรช</button></div></div>
      <div class="panel"><div class="audit-filters"><select id="auditUser"><option value="">ผู้ใช้ทุกคน</option>${state.profiles.map(p=>`<option value="${p.id}" ${state.auditUserFilter===p.id?'selected':''}>${esc(p.display_name||p.email)}</option>`).join('')}</select><input id="auditSearch" placeholder="ค้นหา action / Product No. / Email"><select id="auditType"><option value="">ทุกประเภท</option><option value="session">Session</option><option value="record">Record</option><option value="pool_units">Pool</option><option value="evidence_files">Evidence</option><option value="profile">Profile</option><option value="settings">Settings</option><option value="product_settings">Product Settings</option><option value="user_admin">User Admin</option><option value="account">Account</option><option value="report">Report</option><option value="plasma_record">Plasma Record</option><option value="plasma_evidence">Plasma Evidence</option><option value="plasma_outlab_batch">Plasma Outlab</option><option value="plasma_settings">Plasma Settings</option><option value="plasma_product_settings">Plasma Product Settings</option><option value="rbc_record">RBC Record</option><option value="rbc_evidence">RBC Evidence</option><option value="rbc_settings">RBC Settings</option><option value="rbc_product_settings">RBC Product Settings</option></select><button class="btn" id="auditClear">ล้างตัวกรอง</button></div><div id="auditHost"></div></div>`;
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
    let headline=product?`${a.module?esc(a.module)+' · ':''}Product: ${esc(product)}`:(target?esc(target):((a.entity_id||a.record_id)?`${a.module?esc(a.module)+' · ':''}Record ${esc(a.entity_id||a.record_id)}`:'-'));
    const safe={old:o,new:n,note:a.note||null};
    return `<div>${headline}</div>${a.note?`<div class="audit-note"><strong>เหตุผล:</strong> ${esc(a.note)}</div>`:''}<details class="audit-details"><summary>ดูรายละเอียดค่าก่อน/หลัง</summary><pre>${esc(JSON.stringify(safe,null,2))}</pre></details>`;
  }


  // ===== Plasma / FFP module v5.2.3 =====
  function plasmaMonthKey(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date()).replace('/','-'); }
  function plasmaBatchById(id){ return state.plasmaBatches.find(x=>x.id===id); }
  function plasmaModuleReadyNotice(){
    return `<div class="page-head"><div><h1>Plasma</h1><p class="muted">FFP · Factor VIII QC</p></div></div><div class="notice warning"><strong>Plasma module ยังไม่พร้อม</strong><br>ให้ Admin Run <code>supabase/upgrade_v5_1_0_to_v5_2_0.sql</code> ใน Supabase Project ของ Blood QC ก่อน</div>`;
  }
  function renderPlasmaPage(page='dashboard'){
    if(!state.plasmaReady){ $('#view-module').innerHTML=plasmaModuleReadyNotice(); return; }
    if(page==='record') return renderPlasmaRecordForm();
    if(page==='records') return renderPlasmaRecordsList();
    if(page==='guide') return renderPlasmaGuide();
    if(page==='settings') return renderPlasmaSettings();
    return renderPlasmaDashboard();
  }
  function plasmaStatusBadge(r){ return `${plasmaQcBadge(r.qc_status)} ${statusBadge(r.status)}`; }
  function plasmaRecordsTable(rows){
    if(!rows.length)return '<div class="empty">ยังไม่มีข้อมูล</div>';
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Product No.</th><th>ชนิด FFP</th><th>วันที่ผลิต</th><th>Group</th><th>Volume</th><th>Outlab</th><th>Factor VIII</th><th>IU/mL</th><th>QC</th><th>สถานะ</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.deleted_at?'deleted-row':''}"><td><button class="link-btn plasma-record-link" data-id="${r.id}">${esc(r.product_no)}</button>${r.deleted_at?' <span class="badge deleted">ลบแล้ว</span>':''}</td><td>${esc(r.product_type)}</td><td class="nowrap">${esc(r.manufactured_on||'–')}</td><td>${esc(r.blood_group||'–')}</td><td>${r.volume_ml==null?'–':fmt(r.volume_ml,2)+' mL'}</td><td>${esc(plasmaOutlabState(r))}</td><td>${r.factor_viii_percent==null?'–':fmt(r.factor_viii_percent,1)+' %'}</td><td>${r.factor_viii_iu_ml==null?'–':fmt(r.factor_viii_iu_ml,3)}</td><td>${plasmaQcBadge(r.qc_status)}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function bindPlasmaRecordLinks(root=document){ $$('.plasma-record-link',root).forEach(b=>b.onclick=()=>openPlasmaDetail(b.dataset.id)); }
  function renderPlasmaDashboard(){
    const rec=state.plasmaRecords.filter(r=>!r.deleted_at);
    const ym=state.plasmaDashboardMonth||plasmaMonthKey();state.plasmaDashboardMonth=ym;
    const month=rec.filter(r=>String(r.manufactured_on||'').slice(0,7)===ym);
    const noBatch=rec.filter(r=>r.status==='draft'&&!r.outlab_batch_id).length;
    const waiting=rec.filter(r=>r.outlab_batch_id&&r.factor_viii_percent==null).length;
    const review=month.filter(r=>r.status==='submitted').length;
    const locked=month.filter(r=>r.status==='locked').length;
    const target=4,done=month.length,progress=Math.min(100,done/target*100);
    $('#view-module').innerHTML=`<div class="page-head"><div><h1>ภาพรวม Plasma</h1><p class="muted">FFP · Factor VIII QC</p></div><div class="actions"><input id="plasmaDashMonth" class="month-input" type="month" value="${esc(ym)}"><button class="btn" data-go-route="#/plasma/guide">คู่มือ FFP</button>${staffWriteUi()?'<button class="btn" id="plasmaBatchBtn">+ สร้างใบนำส่ง</button><button class="btn primary" id="plasmaNewBtn">+ บันทึก FFP</button>':''}</div></div>
      <div class="grid cards">${metric('เดือนนี้',month.length,'รายการ FFP QC')}${metric('ความครบถ้วน',`${Math.min(done,target)}/4`,done>=target?'ครบเป้าหมายเดือนนี้':`เหลือ ${target-done} ถุง`)}${metric('รอผล Factor VIII',waiting,'ส่ง Outlab แล้ว')}${metric('รอตรวจทวน',review,'Submitted')}${metric('LOCK',locked,'แพทย์ทบทวนแล้ว')}</div>
      <div class="panel qc-tracking-panel"><div class="section-title-row"><div><h2>ติดตาม FFP QC รายเดือน</h2><p class="muted small">เป้าหมาย 4 ถุงต่อเดือน และยังบันทึกเกิน 4 ถุงได้</p></div><strong class="tracking-total">${done}/4</strong></div><div class="tracking-bar"><span style="width:${progress}%"></span></div></div>
      <div class="panel"><h2>รายการล่าสุด</h2>${plasmaRecordsTable(rec.slice(0,12))}</div>
      ${plasmaRecentBatchesPanel()}`;
    $('#plasmaDashMonth').onchange=e=>{state.plasmaDashboardMonth=e.target.value||plasmaMonthKey();renderPlasmaDashboard();};
    if($('#plasmaNewBtn'))$('#plasmaNewBtn').onclick=()=>{state.currentPlasmaRecordId=null;location.hash=ROUTES.plasma.record;};
    if($('#plasmaBatchBtn'))$('#plasmaBatchBtn').onclick=openPlasmaBatchBuilder;
    bindRouteButtons($('#view-module'));bindPlasmaRecordLinks($('#view-module'));bindPlasmaBatchPdf($('#view-module'));bindPlasmaBatchPager();
  }

  function sortedPlasmaBatches(){
    return [...state.plasmaBatches].sort((a,b)=>{
      const bt=new Date(b.sent_at||b.created_at||0).getTime()||0,at=new Date(a.sent_at||a.created_at||0).getTime()||0;
      if(bt!==at)return bt-at;
      const bc=new Date(b.created_at||0).getTime()||0,ac=new Date(a.created_at||0).getTime()||0;
      if(bc!==ac)return bc-ac;
      return String(b.batch_no||'').localeCompare(String(a.batch_no||''));
    });
  }
  function plasmaRecentBatchesPanel(){
    const all=sortedPlasmaBatches(),pageSize=5,totalPages=Math.max(1,Math.ceil(all.length/pageSize));
    state.plasmaBatchPage=Math.min(Math.max(1,Number(state.plasmaBatchPage)||1),totalPages);
    const start=(state.plasmaBatchPage-1)*pageSize,rows=all.slice(start,start+pageSize);
    const pager=all.length>pageSize?`<div class="batch-pager"><button class="btn small-btn" id="plasmaBatchPrev" ${state.plasmaBatchPage<=1?'disabled':''}>‹ ก่อนหน้า</button><strong>หน้า ${state.plasmaBatchPage}/${totalPages}</strong><button class="btn small-btn" id="plasmaBatchNext" ${state.plasmaBatchPage>=totalPages?'disabled':''}>ถัดไป ›</button></div>`:'';
    return `<div class="panel"><h2>ชุดนำส่งล่าสุด</h2>${plasmaBatchesTable(rows)}${pager}</div>`;
  }
  function bindPlasmaBatchPager(){
    const prev=$('#plasmaBatchPrev'),next=$('#plasmaBatchNext');
    if(prev)prev.onclick=()=>{state.plasmaBatchPage=Math.max(1,state.plasmaBatchPage-1);renderPlasmaDashboard();};
    if(next)next.onclick=()=>{state.plasmaBatchPage+=1;renderPlasmaDashboard();};
  }

function plasmaBatchRecords(batchId){
  return state.plasmaRecords.filter(r=>r.outlab_batch_id===batchId&&!r.deleted_at);
}
function canEditPlasmaBatch(b){
  if(!b||!staffWriteUi())return false;
  if(!(adminUi()||b.prepared_by===state.user?.id))return false;
  const rows=plasmaBatchRecords(b.id);
  return rows.length>0&&rows.every(r=>r.status==='draft'&&r.factor_viii_percent==null);
}
function plasmaBatchesTable(rows){
  if(!rows.length)return '<div class="empty">ยังไม่มีชุดนำส่ง</div>';
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>ชุดนำส่ง</th><th>วัน-เวลานำส่ง</th><th>Product No.</th><th>ผู้เตรียม</th><th>จำนวน</th><th></th></tr></thead><tbody>${rows.map(b=>{const rr=plasmaBatchRecords(b.id);const n=rr.length;const nums=rr.slice(0,4).map(r=>esc(r.product_no)).join(', ')+(n>4?` +${n-4}`:'');const edit=canEditPlasmaBatch(b)?`<button class="btn small-btn plasma-batch-edit" data-id="${b.id}">แก้ไข</button>`:'';return `<tr><td><strong>${esc(b.batch_no)}</strong></td><td class="nowrap">${esc(dateTH(b.sent_at))}</td><td>${nums||'–'}</td><td>${esc(profileName(b.prepared_by))}</td><td>${n}</td><td><span class="batch-actions"><button class="btn small-btn plasma-batch-pdf" data-id="${b.id}">PDF</button>${edit}</span></td></tr>`}).join('')}</tbody></table></div>`;
}
function bindPlasmaBatchPdf(root=document){
  $$('.plasma-batch-pdf',root).forEach(b=>b.onclick=()=>printPlasmaOutlabBatch(b.dataset.id));
  $$('.plasma-batch-edit',root).forEach(b=>b.onclick=()=>openPlasmaBatchBuilder(null,b.dataset.id));
}

  function renderPlasmaRecordsList(){
    const del=adminUi()?`<label class="inline-check"><input type="checkbox" id="pfDeleted" ${state.showDeletedPlasma?'checked':''}> แสดงรายการที่ลบแล้ว</label>`:'';
    $('#view-module').innerHTML=`<div class="page-head"><div><h1>รายการ FFP</h1><p class="muted">Plasma · Factor VIII QC</p></div><div class="actions"><button class="btn" id="plasmaCsv">Export CSV</button><button class="btn" data-go-route="#/plasma/guide">คู่มือ FFP</button>${staffWriteUi()?'<button class="btn" id="plasmaBatchBtn">+ สร้างใบนำส่ง</button><button class="btn primary" id="plasmaNewBtn">+ บันทึก FFP</button>':''}</div></div><div class="panel"><div class="filters"><input id="pfSearch" placeholder="ค้นหา Product No."><select id="pfProduct"><option value="">ทุกชนิด FFP</option>${activePlasmaProducts().map(x=>`<option>${esc(x.product_type)}</option>`).join('')}</select><select id="pfOutlab"><option value="">ทุกสถานะ Outlab</option><option value="no_batch">รอจัดชุดนำส่ง</option><option value="waiting">รอผล Factor VIII</option><option value="result">ได้รับผลแล้ว</option></select><select id="pfQc"><option value="">ทุกผล QC</option><option value="pass">ผ่าน</option><option value="review">ต้องตรวจสอบ</option><option value="incomplete">ข้อมูลไม่ครบ</option></select><select id="pfStatus"><option value="">ทุกสถานะ</option><option value="draft">Draft</option><option value="submitted">รอตรวจทวน</option><option value="locked">LOCK</option></select><button class="btn" id="pfClear">ล้าง</button></div>${del}<div id="plasmaTableHost" style="margin-top:12px"></div></div>`;
    const apply=()=>{ const q=$('#pfSearch').value.trim().toLowerCase(),prod=$('#pfProduct').value,out=$('#pfOutlab').value,qc=$('#pfQc').value,st=$('#pfStatus').value; if($('#pfDeleted'))state.showDeletedPlasma=$('#pfDeleted').checked; const rows=state.plasmaRecords.filter(r=>(state.showDeletedPlasma||!r.deleted_at)&&(!q||`${r.product_no} ${r.product_type}`.toLowerCase().includes(q))&&(!prod||r.product_type===prod)&&(!qc||r.qc_status===qc)&&(!st||r.status===st)&&(!out||(out==='no_batch'&&!r.outlab_batch_id)||(out==='waiting'&&r.outlab_batch_id&&r.factor_viii_percent==null)||(out==='result'&&r.factor_viii_percent!=null))); $('#plasmaTableHost').innerHTML=plasmaRecordsTable(rows);bindPlasmaRecordLinks($('#plasmaTableHost'));return rows; };
    ['#pfSearch','#pfProduct','#pfOutlab','#pfQc','#pfStatus'].forEach(x=>$(x).addEventListener('input',apply)); if($('#pfDeleted'))$('#pfDeleted').addEventListener('change',apply);
    $('#pfClear').onclick=()=>{['#pfSearch','#pfProduct','#pfOutlab','#pfQc','#pfStatus'].forEach(x=>$(x).value='');if($('#pfDeleted')){$('#pfDeleted').checked=false;state.showDeletedPlasma=false;}apply();};
    $('#plasmaCsv').onclick=()=>exportPlasmaCSV(apply());
    if($('#plasmaBatchBtn'))$('#plasmaBatchBtn').onclick=openPlasmaBatchBuilder;
    if($('#plasmaNewBtn'))$('#plasmaNewBtn').onclick=()=>{state.currentPlasmaRecordId=null;location.hash=ROUTES.plasma.record;};
    apply();
  }
  function exportPlasmaCSV(rows){
    const h=['Product No.','Product','Group','Mfg date','Expiry','Centrifuge','Prep time','Gross weight g','Tare g','Density','Volume mL','Outlab batch','Factor VIII %','IU/bag','IU/mL','Test date','QC','Status','Created by','Weight by','Segment/Outlab by','Factor result by','Notes'];
    const v=r=>[r.product_no,r.product_type,r.blood_group,r.manufactured_on,r.expiry_on,r.centrifuge_no,r.prep_time,r.gross_weight_g,r.bag_tare_weight_g,r.density,r.volume_ml,plasmaBatchById(r.outlab_batch_id)?.batch_no||'',r.factor_viii_percent,r.factor_viii_iu_bag,r.factor_viii_iu_ml,r.factor_tested_on,r.qc_status,r.status,profileName(r.created_by),profileName(r.weight_recorded_by),profileName(r.segment_prepared_by),profileName(r.factor_recorded_by),r.notes];
    const q=x=>`"${String(x??'').replaceAll('"','""')}"`;const csv='\ufeff'+[h,...rows.map(v)].map(a=>a.map(q).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`ffp_qc_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);logActivity('export_csv','report',null,{module:'plasma',rows:rows.length}).catch(()=>{});
  }
  function plasmaDateInput(v){ return v?String(v).slice(0,10):''; }
  function plasmaTimeInput(v){ return v?String(v).slice(0,5):''; }
  function plasmaField(label,id,value,type='text',readonly=false,required=false,step=''){return `<div class="field"><label class="${required?'required':''}">${label}</label><input id="${id}" type="${type}" value="${esc(value??'')}" ${readonly?'readonly':''} ${step?`step="${step}"`:''}></div>`;}
  function plasmaCalcPreview(){
    const cfg=plasmaProductSetting($('#plasma_product_type')?.value||''); const gross=num($('#plasma_gross_weight_g')?.value),tare=cfg?Number(cfg.tare_weight_g):null,density=cfg?Number(cfg.density):null; const volume=gross!=null&&tare!=null&&density>0&&gross>=tare?(gross-tare)/density:null; const pct=num($('#plasma_factor_viii_percent')?.value); const iuMl=pct==null?null:pct/100; const iuBag=pct!=null&&volume!=null?pct*volume/100:null; return {tare,density,volume,pct,iuMl,iuBag};
  }
  function updatePlasmaPreview(){
    const c=plasmaCalcPreview();if($('#plasma_tare'))$('#plasma_tare').value=c.tare==null?'':c.tare.toFixed(2);if($('#plasma_density'))$('#plasma_density').value=c.density==null?'':c.density.toFixed(3);if($('#plasma_volume'))$('#plasma_volume').value=c.volume==null?'':c.volume.toFixed(2);if($('#plasma_iu_ml'))$('#plasma_iu_ml').textContent=fmt(c.iuMl,3);if($('#plasma_iu_bag'))$('#plasma_iu_bag').textContent=fmt(c.iuBag,2);
    const m=$('#plasma_manufactured_on')?.value;if(m&&$('#plasma_expiry_on')){const d=new Date(`${m}T12:00:00+07:00`);d.setDate(d.getDate()+Number(state.plasmaSettings.expiry_days||365));$('#plasma_expiry_on').value=inputFromISO(d.toISOString()).slice(0,10);}
    if($('#plasma_qc_preview')){let text='ข้อมูลยังไม่ครบ',cls='incomplete';if(c.volume!=null&&c.iuMl!=null){if(c.volume>=Number(state.plasmaSettings.volume_min_ml)&&c.iuMl>=Number(state.plasmaSettings.factor_viii_min_iu_ml)){text='ผ่านเกณฑ์ QC';cls='pass';}else{text='ต้องตรวจสอบ';cls='review';}}$('#plasma_qc_preview').innerHTML=`<span class="badge ${cls}">${text}</span>`;}
  }
  async function renderPlasmaRecordForm(){
    if(!state.currentPlasmaRecordId&&!staffWriteUi()){location.hash=ROUTES.review;return;}
    let r=null;state.currentPlasmaEvidence=[];
    if(state.currentPlasmaRecordId){const {data,error}=await state.sb.from('plasma_records').select('*').eq('id',state.currentPlasmaRecordId).single();if(error){showToast(errText(error),'error');return;}r=data;const {data:ev}=await state.sb.from('plasma_evidence_files').select('*').eq('record_id',r.id).order('created_at');state.currentPlasmaEvidence=ev||[];}
    const locked=r?.status==='locked',submitted=r?.status==='submitted',deleted=!!r?.deleted_at;const editable=!deleted&&(adminUi()||(!locked&&!submitted&&staffWriteUi()));const batch=r?.outlab_batch_id?plasmaBatchById(r.outlab_batch_id):null;
    $('#view-module').innerHTML=`<div class="page-head"><div><h1>${r?'FFP · '+esc(r.product_no):'บันทึก FFP'}</h1><p class="muted">Plasma · Factor VIII QC</p></div><div class="page-head-tools"><button type="button" class="btn small-btn" data-go-route="#/plasma/guide">คู่มือ FFP</button>${r?`<div class="status-line">${plasmaQcBadge(r.qc_status)} ${statusBadge(r.status)}</div>`:''}</div></div>
      ${deleted?`<div class="notice bad"><strong>รายการนี้ถูกลบแล้ว</strong><br>${esc(r.delete_reason||'–')}</div>`:''}${locked&&!adminUi()?'<div class="notice good"><strong>LOCK แล้ว</strong> หากพบข้อมูลผิดให้แจ้ง Admin พร้อมหลักฐาน</div>':''}${r?.status==='draft'&&r?.returned_at&&r?.review_note?`<div class="notice warning"><strong>แพทย์ส่งกลับแก้ไข</strong><br>${esc(r.review_note)}</div>`:''}
      <form id="plasmaRecordForm">
      ${r&&adminUi()&&!deleted?`<div class="panel admin-correction-panel"><h2>การแก้ไขโดย Admin</h2><div class="field"><label>เหตุผลการแก้ไข</label><textarea id="plasma_admin_reason" placeholder="เช่น เจ้าหน้าที่แจ้งผลผิด ตรวจหลักฐานใหม่แล้วแก้ไข"></textarea></div></div>`:''}
      <div class="panel"><h2>1. ข้อมูล FFP</h2><div class="form-grid">${plasmaField('Product No.','plasma_product_no',r?.product_no,'text',false,true)}<div class="field"><label class="required">ชนิด FFP</label><select id="plasma_product_type"><option value="">เลือก</option>${plasmaProductOptions(r?.product_type)}</select></div><div class="field"><label>Group</label><select id="plasma_group"><option value="">เลือก</option>${['O','A','B','AB'].map(g=>`<option ${r?.blood_group===g?'selected':''}>${g}</option>`).join('')}</select></div>${plasmaField('วันที่ผลิต','plasma_manufactured_on',plasmaDateInput(r?.manufactured_on),'date')}${plasmaField('วันหมดอายุ','plasma_expiry_on',plasmaDateInput(r?.expiry_on),'date',true)}<div class="field"><label>เครื่องปั่น</label><select id="plasma_centrifuge"><option value="">เลือก</option><option value="1" ${r?.centrifuge_no==='1'?'selected':''}>1</option><option value="2" ${r?.centrifuge_no==='2'?'selected':''}>2</option></select></div>${plasmaField('เวลา','plasma_prep_time',plasmaTimeInput(r?.prep_time),'time')}</div></div>
      <div class="panel"><div class="section-title-row"><h2>2. น้ำหนักและ Volume</h2>${r?.weight_recorded_by?`<span class="section-badge">ผู้กรอก ${esc(profileName(r.weight_recorded_by))} · ${esc(dateTH(r.weight_recorded_at))}</span>`:''}</div><div class="form-grid">${plasmaField('น้ำหนักที่ชั่งได้ (g)','plasma_gross_weight_g',r?.gross_weight_g,'number',false,false,'0.01')}${plasmaField('น้ำหนักถุงเปล่า (g)','plasma_tare',r?.bag_tare_weight_g,'number',true)}${plasmaField('Density','plasma_density',r?.density,'number',true)}${plasmaField('Volume (mL)','plasma_volume',r?.volume_ml,'number',true)}</div></div>
      <div class="panel"><div class="section-title-row"><h2>3. นำส่ง Factor VIII</h2>${r?.segment_prepared_by?`<span class="section-badge">ผู้เตรียม/นำส่ง ${esc(profileName(r.segment_prepared_by))} · ${esc(dateTH(r.segment_prepared_at))}</span>`:''}</div>${batch?`<div class="detail-grid">${dcell('ชุดนำส่ง',batch.batch_no)}${dcell('วันที่-เวลานำส่ง',dateTH(batch.sent_at))}${dcell('ผู้เตรียมสิ่งส่งตรวจ',profileName(batch.prepared_by))}${dcell('เจ้าหน้าที่ RFS',batch.rfs_staff_name||'–')}</div><div class="actions left-actions" style="margin-top:12px"><button type="button" class="btn" id="plasmaPrintBatch">Export PDF ใบนำส่ง</button></div>`:`<div class="notice info small">ยังไม่ได้จัดเข้าชุดนำส่ง Factor VIII${r?'':' · บันทึกรายการก่อน'}</div>${r&&editable?'<button type="button" class="btn" id="plasmaOpenBatch">สร้าง/จัดชุดใบนำส่ง</button>':''}`}</div>
      <div class="panel measurement-entry-panel"><div class="section-title-row"><h2>4. ผล Factor VIII</h2>${r?.factor_recorded_by?`<span class="section-badge">ผู้กรอกผล ${esc(profileName(r.factor_recorded_by))} · ${esc(dateTH(r.factor_recorded_at))}</span>`:''}</div><div class="form-grid">${plasmaField('Factor VIII (%)','plasma_factor_viii_percent',r?.factor_viii_percent,'number',false,false,'0.1')}${plasmaField('วันที่ทดสอบ','plasma_factor_tested_on',plasmaDateInput(r?.factor_tested_on),'date')}<div class="calc-box"><span>Factor VIII</span><strong id="plasma_iu_ml">${fmt(r?.factor_viii_iu_ml,3)}</strong><small>IU/mL</small></div><div class="calc-box"><span>Factor VIII</span><strong id="plasma_iu_bag">${fmt(r?.factor_viii_iu_bag,2)}</strong><small>IU/bag</small></div></div><div id="plasma_qc_preview" style="margin-top:10px"></div>${plasmaEvidenceBox(r,editable,locked)}</div>
      <div class="panel"><h2>5. หมายเหตุ</h2><textarea id="plasma_notes" placeholder="บันทึกข้อมูลเพิ่มเติม">${esc(r?.notes||'')}</textarea></div>
      <div class="sticky-actions"><div class="left"><button type="button" class="btn" id="plasmaBack">กลับรายการทั้งหมด</button></div><div class="right">${!r&&editable?'<button type="button" class="btn clear-form-btn" id="plasmaClear">ล้างฟอร์ม</button>':''}${editable?'<button type="button" class="btn" id="plasmaSave">บันทึก</button>':''}${r&&r.status==='draft'&&editable?'<button type="button" class="btn primary" id="plasmaSubmit">ส่งตรวจทวน</button>':''}${r&&r.status==='locked'&&adminUi()&&!deleted?'<button type="button" class="btn danger" id="plasmaUnlock">ปลดล็อกเป็น Draft</button>':''}</div></div></form>`;
    if(!editable)$$('#plasmaRecordForm input,#plasmaRecordForm select,#plasmaRecordForm textarea').forEach(el=>{if(!el.readOnly)el.disabled=true;});
    updatePlasmaPreview();renderPlasmaEvidence(editable,locked);bindRouteButtons($('#view-module'));
    ['plasma_product_type','plasma_gross_weight_g','plasma_factor_viii_percent','plasma_manufactured_on'].forEach(id=>$('#'+id)?.addEventListener('input',updatePlasmaPreview));
    $('#plasmaBack').onclick=()=>location.hash=ROUTES.plasma.records;if($('#plasmaClear'))$('#plasmaClear').onclick=()=>{if(confirm('ล้างฟอร์มทั้งหมด?'))renderPlasmaRecordForm();};if($('#plasmaSave'))$('#plasmaSave').onclick=()=>savePlasmaRecord(false);if($('#plasmaSubmit'))$('#plasmaSubmit').onclick=submitPlasmaRecord;if($('#plasmaUnlock'))$('#plasmaUnlock').onclick=unlockPlasmaRecord;if($('#plasmaOpenBatch'))$('#plasmaOpenBatch').onclick=openPlasmaBatchBuilder;if($('#plasmaPrintBatch'))$('#plasmaPrintBatch').onclick=()=>printPlasmaOutlabBatch(batch.id);
  }
  function collectPlasmaRecord(){
    const adminReason=$('#plasma_admin_reason')?.value.trim()||null;return {product_no:$('#plasma_product_no').value.trim(),product_type:$('#plasma_product_type').value,blood_group:$('#plasma_group').value||null,manufactured_on:$('#plasma_manufactured_on').value||null,centrifuge_no:$('#plasma_centrifuge').value||null,prep_time:$('#plasma_prep_time').value||null,gross_weight_g:num($('#plasma_gross_weight_g').value),factor_viii_percent:num($('#plasma_factor_viii_percent').value),factor_tested_on:$('#plasma_factor_tested_on').value||null,notes:$('#plasma_notes').value.trim()||null,...(adminUi()&&state.currentPlasmaRecordId&&adminReason?{last_admin_edit_reason:adminReason,last_admin_edit_id:crypto.randomUUID()}:{} )};
  }
  function plasmaHasFactorEvidence(){return state.currentPlasmaEvidence.some(e=>e.category==='factor_viii');}
  async function savePlasmaRecord(silent=false,autoEvidence=false){
    try{let payload=collectPlasmaRecord();if(!payload.product_no||!payload.product_type){showToast('กรุณากรอก Product No. และชนิด FFP','error');return false;}let id=state.currentPlasmaRecordId;if(autoEvidence&&!id){payload={...payload,factor_viii_percent:null,factor_tested_on:null};}if(!autoEvidence&&payload.factor_viii_percent!==null&&!plasmaHasFactorEvidence()){showToast('ผล Factor VIII ต้องแนบรูปหรือ PDF หลักฐานก่อนบันทึก','error');return false;}if(id&&adminUi()&&!payload.last_admin_edit_reason){showToast('Admin กรุณาระบุเหตุผลการแก้ไข','error');$('#plasma_admin_reason')?.focus();return false;}if(id){const {error}=await state.sb.from('plasma_records').update(payload).eq('id',id);if(error)throw error;}else{const {data,error}=await state.sb.from('plasma_records').insert({...payload,created_by:state.user.id}).select('id').single();if(error)throw error;id=data.id;state.currentPlasmaRecordId=id;}await reloadPlasmaRecords();if(!silent)showToast('บันทึก FFP แล้ว','good');if(!silent&&!autoEvidence)await renderPlasmaRecordForm();return true;}catch(e){showToast(errText(e),'error');return false;}
  }
  function plasmaEvidenceBox(r,editable,locked){
    return `<div class="measurement-evidence"><div class="measurement-evidence-head"><strong>หลักฐานผล Factor VIII</strong><span class="section-badge required-evidence">บังคับ</span></div><input class="hidden-file-input" type="file" id="plasma_camera" accept="image/*" capture="environment"><input class="hidden-file-input" type="file" id="plasma_file" accept="image/*,application/pdf"><div class="evidence-pick-actions">${editable?'<button type="button" class="btn primary small-btn" id="plasmaCameraBtn">ถ่ายรูป</button><button type="button" class="btn small-btn" id="plasmaFileBtn">เลือกไฟล์ / PDF</button>':''}</div><div class="evidence-list" id="plasmaEvidenceList"></div></div>`;
  }
  function renderPlasmaEvidence(editable,locked=false){
    const host=$('#plasmaEvidenceList');if(!host)return;const arr=state.currentPlasmaEvidence||[];const canDelete=editable&&!locked;host.innerHTML=arr.length?arr.map(e=>`<div class="evidence-item"><span class="name evidence-name"><strong>${esc(e.original_name)}</strong><small>ผู้แนบหลักฐาน ${esc(profileName(e.uploaded_by))} · ${esc(dateTH(e.created_at))}</small>${e.change_reason?`<small>Admin: ${esc(e.change_reason)}</small>`:''}</span><span class="e-actions"><button type="button" class="btn small-btn plasma-ev-view" data-id="${e.id}">ดู</button>${canDelete?`<button type="button" class="btn small-btn danger plasma-ev-del" data-id="${e.id}">ลบ</button>`:''}</span></div>`).join(''):'<div class="muted small">ยังไม่มีหลักฐาน</div>';
    $$('.plasma-ev-view').forEach(b=>b.onclick=()=>viewPlasmaEvidence(b.dataset.id));$$('.plasma-ev-del').forEach(b=>b.onclick=()=>deletePlasmaEvidence(b.dataset.id));if($('#plasmaCameraBtn'))$('#plasmaCameraBtn').onclick=()=>$('#plasma_camera').click();if($('#plasmaFileBtn'))$('#plasmaFileBtn').onclick=()=>$('#plasma_file').click();if($('#plasma_camera'))$('#plasma_camera').onchange=()=>uploadPlasmaEvidence('plasma_camera');if($('#plasma_file'))$('#plasma_file').onchange=()=>uploadPlasmaEvidence('plasma_file');
  }
  async function uploadPlasmaEvidence(inputId){
    try{const input=$('#'+inputId),file=input?.files?.[0];if(!file)return;if(file.size>10*1024*1024)throw new Error('ไฟล์ต้องไม่เกิน 10 MB');const existed=!!state.currentPlasmaRecordId;if(!state.currentPlasmaRecordId){const ok=await savePlasmaRecord(true,true);if(!ok)return;}const rid=state.currentPlasmaRecordId;let reason=null;if(adminUi()&&existed){reason=$('#plasma_admin_reason')?.value.trim()||null;if(!reason)throw new Error('Admin กรุณาระบุเหตุผลการแก้ไขก่อนแนบหลักฐานใหม่');}const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100),path=`plasma/${rid}/factor_viii/${Date.now()}_${clean}`;const {error:u}=await state.sb.storage.from('bloodqc-evidence').upload(path,file,{upsert:false,contentType:file.type||undefined});if(u)throw u;const {data,error}=await state.sb.from('plasma_evidence_files').insert({record_id:rid,category:'factor_viii',storage_path:path,original_name:file.name,mime_type:file.type,file_size:file.size,uploaded_by:state.user.id,change_reason:reason}).select('*').single();if(error){await state.sb.storage.from('bloodqc-evidence').remove([path]);throw error;}state.currentPlasmaEvidence.push(data);input.value='';renderPlasmaEvidence(true,false);showToast('แนบหลักฐาน Factor VIII แล้ว','good');}catch(e){showToast(errText(e),'error');}
  }
  async function viewPlasmaEvidence(id){const e=state.currentPlasmaEvidence.find(x=>x.id===id);if(!e)return;const {data,error}=await state.sb.storage.from('bloodqc-evidence').createSignedUrl(e.storage_path,120);if(error)showToast(errText(error),'error');else window.open(data.signedUrl,'_blank','noopener');}
  async function deletePlasmaEvidence(id){const e=state.currentPlasmaEvidence.find(x=>x.id===id);if(!e)return;if(!confirm(`ลบหลักฐาน ${e.original_name} ?`))return;try{const {error}=await state.sb.from('plasma_evidence_files').delete().eq('id',id);if(error)throw error;const {error:s}=await state.sb.storage.from('bloodqc-evidence').remove([e.storage_path]);if(s)console.warn('storage cleanup failed',s);state.currentPlasmaEvidence=state.currentPlasmaEvidence.filter(x=>x.id!==id);renderPlasmaEvidence(true,false);showToast('ลบหลักฐานแล้ว');}catch(e2){showToast(errText(e2),'error');}}
  async function submitPlasmaRecord(){if(!await savePlasmaRecord(true))return;try{const {error}=await state.sb.from('plasma_records').update({status:'submitted'}).eq('id',state.currentPlasmaRecordId);if(error)throw error;await reloadPlasmaRecords();showToast('ส่งให้แพทย์ทบทวนแล้ว','good');await renderPlasmaRecordForm();}catch(e){showToast(errText(e),'error');}}
  async function unlockPlasmaRecord(){const reason=prompt('ระบุเหตุผลที่ต้องปลดล็อก (จำเป็น):');if(!reason?.trim())return;try{const {error}=await state.sb.from('plasma_records').update({status:'draft',last_unlock_reason:reason.trim()}).eq('id',state.currentPlasmaRecordId);if(error)throw error;await reloadPlasmaRecords();showToast('ปลดล็อกแล้ว','good');await renderPlasmaRecordForm();}catch(e){showToast(errText(e),'error');}}

async function openPlasmaBatchBuilder(preselectId=null,editBatchId=null){
  if(!staffWriteUi())return;
  const editing=!!editBatchId,batch=editing?plasmaBatchById(editBatchId):null;
  if(editing&&(!batch||!canEditPlasmaBatch(batch))){showToast('ชุดนำส่งนี้แก้ไขไม่ได้แล้ว เพราะมีผล Factor VIII / ส่งตรวจทวน / LOCK หรือไม่ใช่ชุดที่คุณเตรียม','error');return;}
  const currentIds=new Set(editing?plasmaBatchRecords(editBatchId).map(r=>r.id):[]);
  const candidates=state.plasmaRecords.filter(r=>!r.deleted_at&&r.status==='draft'&&r.factor_viii_percent==null&&(!r.outlab_batch_id||r.outlab_batch_id===editBatchId));
  if(!candidates.length){showToast(editing?'ไม่พบรายการที่แก้ไขได้ในชุดนี้':'ไม่มี FFP ที่รอจัดชุดนำส่ง','error');return;}
  const now=new Date(),today=inputFromISO(now.toISOString()).slice(0,10),defaultTime=String(state.plasmaSettings.default_send_time||'10:00').slice(0,5);
  const sentValue=editing?inputFromISO(batch.sent_at).slice(0,16):`${today}T${defaultTime}`;
  const ordered=[...candidates].sort((a,b)=>String(a.product_type).localeCompare(String(b.product_type),'th')||String(a.product_no).localeCompare(String(b.product_no)));
  $('#detailTitle').textContent=editing?'แก้ไขชุดนำส่ง Factor VIII':'สร้างใบนำส่ง Factor VIII ใหม่';
  $('#detailSubtitle').textContent=editing?`${batch.batch_no} · แก้ Product No. แล้ว Export PDF ใหม่ได้`:'1 เที่ยวส่ง = 1 ใบนำส่ง · เลือกได้ตั้งแต่ 1 ถุงขึ้นไป';
  $('#detailBody').innerHTML=`<div class="form-grid"><div class="field span2"><label>วัน-เวลานำส่ง</label><input id="batch_sent_at" type="datetime-local" value="${esc(sentValue)}"></div><div class="field span2"><label>เจ้าหน้าที่ RFS ที่นำส่ง</label><input id="batch_rfs" placeholder="ถ้ามี" value="${esc(editing?(batch.rfs_staff_name||''):'')}"></div></div>
    <div class="outlab-batch-toolbar"><label class="inline-check"><input type="checkbox" id="batchPickAll"> เลือกทั้งหมด</label><div id="batchTypeSummary" class="muted small">ยังไม่ได้เลือกรายการ</div></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>Product No.</th><th>ชนิด FFP</th><th>Group</th><th>Volume</th></tr></thead><tbody>${ordered.map(r=>`<tr><td><input type="checkbox" class="batch-pick" value="${r.id}" data-product-type="${esc(r.product_type)}" ${(currentIds.has(r.id)||(!editing&&preselectId===r.id))?'checked':''}></td><td><strong>${esc(r.product_no)}</strong></td><td>${esc(r.product_type)}</td><td>${esc(r.blood_group||'–')}</td><td>${r.volume_ml==null?'รอกรอก':fmt(r.volume_ml,2)+' mL'}</td></tr>`).join('')}</tbody></table></div>
    <div class="field" style="margin-top:14px"><label>หมายเหตุ</label><textarea id="batch_notes">${esc(editing?(batch.notes||''):'')}</textarea></div>
    ${editing?'<div class="notice warning small"><strong>กรณีเลือก Product No. ผิด:</strong> แก้รายการในชุดนี้แล้วกดบันทึก ระบบจะเก็บ Audit Log และให้ Export PDF ฉบับใหม่โดยใช้เลขชุดเดิม กรุณาไม่นำ PDF ฉบับเก่าไปใช้</div>':'<div class="notice info small"><strong>ส่งเพิ่มวันอื่น:</strong> สร้างใบนำส่งใหม่อีกชุด แล้วเลือกเฉพาะถุงที่ส่งครั้งนั้นได้ 1–2 ถุงหรือมากกว่านั้น</div>'}
    <div class="actions"><button class="btn" id="batchCancel">ยกเลิก</button><button class="btn primary" id="batchCreate">${editing?'บันทึกการแก้ไข + Export PDF ใหม่':'สร้างชุด + Export PDF'}</button></div>`;
  const updateSummary=()=>{
    const picked=$$('.batch-pick:checked');
    const counts={};picked.forEach(x=>{const t=x.dataset.productType||'อื่น';counts[t]=(counts[t]||0)+1;});
    $('#batchTypeSummary').textContent=picked.length?`${picked.length} รายการ · ${Object.entries(counts).map(([k,v])=>`${k} ${v}`).join(' · ')}`:'ยังไม่ได้เลือกรายการ';
    $('#batchPickAll').checked=picked.length===ordered.length;
    $('#batchPickAll').indeterminate=picked.length>0&&picked.length<ordered.length;
  };
  $$('.batch-pick').forEach(x=>x.onchange=updateSummary);
  $('#batchPickAll').onchange=e=>{$$('.batch-pick').forEach(x=>x.checked=e.target.checked);updateSummary();};
  $('#batchCancel').onclick=()=>$('#detailDialog').close();
  $('#batchCreate').onclick=()=>editing?updatePlasmaBatch(editBatchId,true):createPlasmaBatch(true);
  updateSummary();
  $('#detailDialog').showModal();
}
async function createPlasmaBatch(exportAfter=true){
  try{const ids=$$('.batch-pick:checked').map(x=>x.value);if(!ids.length)throw new Error('เลือกอย่างน้อย 1 รายการ');const sent=$('#batch_sent_at').value;if(!sent)throw new Error('กรุณาระบุวัน-เวลานำส่ง');const stamp=sent.replace(/[-T:]/g,'').slice(0,12),batchNo=`FFP-${stamp}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;const payload={batch_no:batchNo,sent_at:bangkokISO(sent),prepared_by:state.user.id,rfs_staff_name:$('#batch_rfs').value.trim()||null,service_code:state.plasmaSettings.outlab_service_code,test_name:state.plasmaSettings.outlab_test_name,form_code:state.plasmaSettings.outlab_form_code,form_effective_text:state.plasmaSettings.outlab_form_effective_text||'วันบังคับใช้ 15 มกราคม 2565',result_email:state.plasmaSettings.result_email||'transfusionbb_cnmi@mahidol.ac.th',destination:state.plasmaSettings.outlab_destination,notes:$('#batch_notes').value.trim()||null,created_by:state.user.id};const {data:b,error}=await state.sb.from('plasma_outlab_batches').insert(payload).select('*').single();if(error)throw error;const {error:u}=await state.sb.from('plasma_records').update({outlab_batch_id:b.id}).in('id',ids);if(u)throw u;await Promise.all([reloadPlasmaRecords(),reloadPlasmaBatches()]);state.plasmaBatchPage=1;$('#detailDialog').close();showToast('สร้างชุดนำส่งแล้ว','good');if(exportAfter)printPlasmaOutlabBatch(b.id);if(state.currentModule==='plasma')renderPlasmaPage(state.currentPage||'dashboard');}catch(e){showToast(errText(e),'error');}
}
async function updatePlasmaBatch(batchId,exportAfter=true){
  try{
    const ids=$$('.batch-pick:checked').map(x=>x.value);if(!ids.length)throw new Error('ชุดนำส่งต้องมีอย่างน้อย 1 รายการ');
    const sent=$('#batch_sent_at').value;if(!sent)throw new Error('กรุณาระบุวัน-เวลานำส่ง');
    const {error}=await state.sb.rpc('update_plasma_outlab_batch',{p_batch_id:batchId,p_record_ids:ids,p_sent_at:bangkokISO(sent),p_rfs_staff_name:$('#batch_rfs').value.trim()||null,p_notes:$('#batch_notes').value.trim()||null});
    if(error)throw error;
    await Promise.all([reloadPlasmaRecords(),reloadPlasmaBatches()]);state.plasmaBatchPage=1;$('#detailDialog').close();showToast('แก้ไขชุดนำส่งแล้ว · กรุณาใช้ PDF ฉบับใหม่','good');if(exportAfter)printPlasmaOutlabBatch(batchId);if(state.currentModule==='plasma')renderPlasmaPage(state.currentPage||'dashboard');
  }catch(e){showToast(errText(e),'error');}
}

function printPlasmaOutlabBatch(batchId){
  const b=plasmaBatchById(batchId);
  if(!b){showToast('ไม่พบชุดนำส่ง','error');return;}
  const rows=state.plasmaRecords.filter(r=>r.outlab_batch_id===batchId&&!r.deleted_at).sort((a,b)=>String(a.product_type).localeCompare(String(b.product_type),'th')||String(a.product_no).localeCompare(String(b.product_no)));
  if(!rows.length){showToast('ไม่มีรายการในชุดนำส่ง','error');return;}
  if(document.fonts&&!(document.fonts.check('16px "TH Sarabun New"')||document.fonts.check('16px "TH SarabunNew"'))){showToast('เครื่องนี้ไม่พบ TH Sarabun New - PDF อาจใช้ฟอนต์สำรอง','warn');}
  const w=window.open('','_blank');
  if(!w){showToast('Browser บล็อกหน้าต่าง PDF กรุณาอนุญาต Pop-up','error');return;}
  const sentDate=dateTHLong(b.sent_at);
  const sentTime=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(b.sent_at)).replace(':','.');
  const resultEmail=b.result_email||state.plasmaSettings.result_email||'transfusionbb_cnmi@mahidol.ac.th';
  const effectiveText=b.form_effective_text||state.plasmaSettings.outlab_form_effective_text||'วันบังคับใช้ 15 มกราคม 2565';
  const logoUrl=new URL('assets/ramathibodi-mark.png',location.href.split('#')[0]).href;
  const maxRowsPerPage=12;
  const pages=[];
  for(let i=0;i<rows.length;i+=maxRowsPerPage)pages.push(rows.slice(i,i+maxRowsPerPage));
  const pageHtml=(pageRows,pageIndex)=>`<section class="page">
    <table class="form-head-table"><tr><td class="form-logo" rowspan="3"><img src="${logoUrl}" alt="ตรามหาวิทยาลัยมหิดล"></td><td class="head-row"><span class="label">ชื่อแบบฟอร์ม :</span> บันทึกส่งสิ่งส่งตรวจต่อโรงพยาบาลรามาธิบดี ผ่าน ศูนย์บริการพยาธิวิทยา</td></tr><tr><td class="head-row"><span class="label">ฝ่าย/งาน/หน่วย :</span> หน่วยเวชศาสตร์บริการโลหิต</td></tr><tr><td class="head-row hospital">โรงพยาบาลรามาธิบดีจักรีนฤบดินทร์ คณะแพทยศาสตร์โรงพยาบาลรามาธิบดี มหาวิทยาลัยมหิดล</td></tr></table>
    <table class="sample-table"><thead><tr><th>ตัวอย่างส่งตรวจ</th><th>รหัสบริการ</th><th>ชื่อการทดสอบ</th></tr></thead><tbody>${pageRows.map(r=>`<tr><td>${esc(r.product_no)}</td><td>${esc(b.service_code)}</td><td>${esc(b.test_name)}</td></tr>`).join('')}</tbody></table>
    <div class="send-block">
      <div class="destination"><span>สำหรับ</span><strong>${esc(b.destination)}</strong></div>
      <div class="send-grid">
        <div class="send-line"><span class="send-label">ผู้เตรียมสิ่งส่งตรวจ</span><span class="value">${esc(profileName(b.prepared_by))}</span></div>
        <div class="send-line"><span class="send-label">เจ้าหน้าที่ RFS ที่นำส่ง</span><span class="value">${esc(b.rfs_staff_name||'')}</span></div>
        <div class="send-line"><span class="send-label">วันที่นำส่ง</span><span class="value">${esc(sentDate)}</span></div>
        <div class="send-line"><span class="send-label">เวลาที่นำส่ง</span><span class="value">${esc(sentTime)} น.</span></div>
      </div>
      <div class="note"><b>* หมายเหตุ:</b> ส่งผลกลับไปที่ E-mail: <b>${esc(resultEmail)}</b></div>
    </div>
    <div class="page-footer"><span>หน้า ${pageIndex+1} ของ ${pages.length} หน้า</span><span>${esc(b.form_code)}&nbsp;&nbsp;${esc(effectiveText)}</span></div>
  </section>`;
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(b.batch_no)}</title><style>
    @page{size:A4;margin:9mm 10mm 8mm}
    *{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;background:#fff}
    body{font-family:"TH Sarabun New","TH SarabunNew","Sarabun",Tahoma,sans-serif;font-size:16pt;line-height:1.08}
    .page{min-height:279mm;position:relative;display:flex;flex-direction:column;page-break-after:always}.page:last-child{page-break-after:auto}
    .form-head-table{width:100%;border-collapse:collapse;table-layout:fixed}
    .form-head-table td{border:1.1px solid #111}
    .form-logo{width:23mm;height:22mm;text-align:center;vertical-align:middle;padding:.7mm}
    .form-logo img{width:20mm;height:20mm;object-fit:contain;display:block;margin:auto}
    .head-row{height:7.3mm;padding:.45mm 2.2mm;font-size:14.6pt;line-height:1;vertical-align:middle;white-space:nowrap}
    .head-row.hospital{font-size:13.8pt}.label{font-weight:700;margin-right:1mm}
    .sample-table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:2.6mm}
    .sample-table th,.sample-table td{border:1.1px solid #111;padding:1mm 2.5mm;height:7.6mm;vertical-align:middle}
    .sample-table th{font-weight:700;text-align:center;background:#fafafa}
    .sample-table td:nth-child(1),.sample-table td:nth-child(2){text-align:center}
    .sample-table th:nth-child(1){width:38mm}.sample-table th:nth-child(2){width:28mm}
    .send-block{margin-top:8mm;padding:0 4mm}
    .destination{display:flex;align-items:flex-end;justify-content:center;gap:5mm;margin-bottom:6mm;font-size:20pt}
    .destination span{font-weight:700}.destination strong{min-width:105mm;text-align:center;border-bottom:1.2px dotted #111;padding:0 5mm 1mm;font-weight:700}
    .send-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:14mm;row-gap:5mm}
    .send-line{display:grid;grid-template-columns:auto 1fr;align-items:end;gap:3mm;min-width:0}
    .send-label{white-space:nowrap}.send-line .value{border-bottom:1.1px dotted #111;min-height:6mm;padding:0 2mm .8mm;text-align:center;overflow:hidden}
    .note{margin-top:7mm;padding:2.5mm 3.5mm;border:1px solid #bbb;border-radius:2px;font-size:14.5pt}
    .page-footer{margin-top:auto;display:flex;justify-content:space-between;gap:8mm;padding-top:6mm;font-size:10.5pt;color:#333}
    .print-help{position:fixed;right:12px;top:12px;z-index:20;padding:8px 14px;border:1px solid #bbb;border-radius:8px;background:#fff;font:14px sans-serif;box-shadow:0 2px 8px #0002}
    @media print{.print-help{display:none}.sample-table th{background:#fff}}
  </style></head><body><button class="print-help" onclick="window.print()">พิมพ์ / Save PDF</button>${pages.map(pageHtml).join('')}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),600));<\/script></body></html>`);
  w.document.close();
  logActivity('export_pdf','plasma_outlab_batch',batchId,{module:'plasma',batch_no:b.batch_no,records:rows.length,pages:pages.length}).catch(()=>{});
}
  async function openPlasmaDetail(id){
    try{const {data:r,error}=await state.sb.from('plasma_records').select('*').eq('id',id).single();if(error)throw error;const [{data:ev},{data:audit}]=await Promise.all([state.sb.from('plasma_evidence_files').select('*').eq('record_id',id).order('created_at'),adminUi()?state.sb.from('audit_logs').select('*').eq('module','plasma').eq('entity_id',id).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[]})]);const b=r.outlab_batch_id?plasmaBatchById(r.outlab_batch_id):null;state.currentPlasmaEvidence=ev||[];$('#detailTitle').textContent=r.product_no;$('#detailSubtitle').textContent=`${r.product_type} · Revision ${r.revision}`;const canEdit=!r.deleted_at&&(adminUi()||(r.status==='draft'&&staffWriteUi())),canReview=!r.deleted_at&&r.status==='submitted'&&reviewerUi();const evHtml=ev?.length?ev.map(x=>`<div class="evidence-item"><span class="name evidence-name"><strong>${esc(x.original_name)}</strong><small>ผู้แนบหลักฐาน ${esc(profileName(x.uploaded_by))} · ${esc(dateTH(x.created_at))}</small></span><button class="btn small-btn plasma-detail-ev" data-id="${x.id}">ดู</button></div>`).join(''):'<div class="muted small">ยังไม่มีหลักฐาน</div>';
      const batchRows=b?state.plasmaRecords.filter(x=>x.outlab_batch_id===b.id&&!x.deleted_at).sort((a,b)=>String(a.product_no).localeCompare(String(b.product_no))):[];
      const batchProducts=batchRows.length?batchRows.map(x=>`<span class="batch-product-chip ${x.id===r.id?'current':''}">${esc(x.product_no)} · ${esc(x.product_type)}</span>`).join(''):'';
      const prepState=r.weight_recorded_by?'<span class="step-state done">บันทึกน้ำหนักแล้ว</span>':'<span class="step-state pending">รอน้ำหนัก</span>';
      const outlabState=b?'<span class="step-state done">ออกใบนำส่งแล้ว</span>':'<span class="step-state pending">รอใบนำส่ง</span>';
      const factorState=r.factor_viii_percent!=null?'<span class="step-state done">มีผลแล้ว</span>':'<span class="step-state pending">รอผล</span>';
      const reviewState=r.status==='locked'?'<span class="step-state done">แพทย์ทบทวนแล้ว</span>':r.status==='submitted'?'<span class="step-state review">รอแพทย์</span>':'<span class="step-state pending">ยังไม่ส่งทบทวน</span>';
      $('#detailBody').innerHTML=`<div class="status-line plasma-detail-status">${plasmaQcBadge(r.qc_status)} ${statusBadge(r.status)}</div>
      <section class="detail-section plasma-step-section"><div class="detail-section-head"><div class="step-title"><span class="step-no">1</span><div><h3>FFP และน้ำหนัก</h3><p>ข้อมูลถุงและ Volume</p></div></div>${prepState}</div><div class="detail-section-meta plasma-meta-line"><span class="detail-meta-chip"><b>ผู้สร้าง</b> ${esc(profileName(r.created_by))} · ${esc(dateTH(r.created_at))}</span>${r.weight_recorded_by?`<span class="detail-meta-chip"><b>ผู้กรอกน้ำหนัก</b> ${esc(profileName(r.weight_recorded_by))} · ${esc(dateTH(r.weight_recorded_at))}</span>`:''}</div><div class="detail-grid">${dcell('ชนิด FFP',r.product_type)}${dcell('Group',r.blood_group)}${dcell('วันที่ผลิต',r.manufactured_on)}${dcell('วันหมดอายุ',r.expiry_on)}${dcell('เครื่องปั่น',r.centrifuge_no)}${dcell('เวลา',plasmaTimeInput(r.prep_time))}${dcell('น้ำหนักที่ชั่งได้',r.gross_weight_g==null?'–':fmt(r.gross_weight_g,2)+' g')}${dcell('น้ำหนักถุงเปล่า',fmt(r.bag_tare_weight_g,2)+' g')}${dcell('Density',fmt(r.density,3))}${dcell('Volume',r.volume_ml==null?'–':fmt(r.volume_ml,2)+' mL')}</div></section>
      <section class="detail-section plasma-step-section"><div class="detail-section-head"><div class="step-title"><span class="step-no">2</span><div><h3>ใบนำส่ง Factor VIII</h3><p>แต่ละเที่ยวส่งเป็นคนละชุด</p></div></div>${outlabState}</div>${b?`<div class="detail-section-meta plasma-meta-line"><span class="detail-meta-chip"><b>ชุดนำส่ง</b> ${esc(b.batch_no)}</span><span class="detail-meta-chip"><b>นำส่ง</b> ${esc(dateTH(b.sent_at))}</span><span class="detail-meta-chip"><b>ผู้เตรียม</b> ${esc(profileName(b.prepared_by))}</span>${b.rfs_staff_name?`<span class="detail-meta-chip"><b>RFS</b> ${esc(b.rfs_staff_name)}</span>`:''}</div><div class="batch-products">${batchProducts}</div><div class="actions left-actions"><button class="btn" id="detailPlasmaPdf">Export PDF ใบนำส่ง</button>${canEditPlasmaBatch(b)?'<button class="btn" id="detailEditBatch">แก้ไขชุดนำส่ง</button>':''}</div>`:`<div class="empty-step">รายการนี้ยังไม่อยู่ในใบนำส่ง</div>${staffWriteUi()?'<div class="actions left-actions"><button class="btn primary" id="detailCreateBatch">+ สร้างใบนำส่งใหม่</button></div>':''}`}</section>
      <section class="detail-section plasma-step-section measurement-section"><div class="detail-section-head"><div class="step-title"><span class="step-no">3</span><div><h3>ผล Factor VIII</h3><p>ผลจากพญาไทและหลักฐาน</p></div></div>${factorState}</div>${r.factor_viii_percent!=null?`<div class="detail-section-meta plasma-meta-line"><span class="detail-meta-chip"><b>วันที่ทดสอบ</b> ${esc(r.factor_tested_on||'–')}</span><span class="detail-meta-chip"><b>ผู้กรอกผล</b> ${esc(profileName(r.factor_recorded_by))} · ${esc(dateTH(r.factor_recorded_at))}</span></div>`:''}<div class="detail-grid">${dcell('ผลจากพญาไท',r.factor_viii_percent==null?'–':fmt(r.factor_viii_percent,1)+' %')}${dcell('Factor VIII',r.factor_viii_iu_ml==null?'–':fmt(r.factor_viii_iu_ml,3)+' IU/mL')}${dcell('Factor VIII ต่อถุง',r.factor_viii_iu_bag==null?'–':fmt(r.factor_viii_iu_bag,2)+' IU/bag')}</div><div class="detail-section-evidence"><div class="detail-evidence-title">หลักฐานผล</div>${evHtml}</div></section>
      <section class="detail-section plasma-step-section"><div class="detail-section-head"><div class="step-title"><span class="step-no">4</span><div><h3>QC และแพทย์ทบทวน</h3><p>สรุปก่อน LOCK</p></div></div>${reviewState}</div><div class="notice ${r.qc_status==='pass'?'good':r.qc_status==='review'?'warning':'info'} compact-review-notice"><strong>ผล QC:</strong> ${esc(plasmaQcTH(r.qc_status))}<span>Volume ≥ ${fmt(state.plasmaSettings.volume_min_ml,0)} mL · Factor VIII ≥ ${fmt(state.plasmaSettings.factor_viii_min_iu_ml,2)} IU/mL</span></div>${r.status==='draft'&&r.returned_at&&r.review_note?`<div class="notice warning"><strong>แพทย์ส่งกลับแก้ไข:</strong> ${esc(r.review_note)}<br>${esc(profileName(r.returned_by))} · ${esc(dateTH(r.returned_at))}</div>`:''}${r.reviewed_at&&r.status==='locked'?`<div class="notice good"><strong>แพทย์ผู้ทบทวน:</strong> ${esc(profileName(r.reviewed_by))} · ${esc(dateTH(r.reviewed_at))}${r.review_note?`<br>${esc(r.review_note)}`:''}</div>`:''}${canReview?`<div class="reviewer-action-panel"><div class="field"><label>หมายเหตุแพทย์</label><textarea id="plasma_review_note" placeholder="ถ้าส่งกลับแก้ไข ต้องระบุเหตุผล"></textarea></div></div>`:''}</section>
      <section class="detail-section workflow-section"><div class="detail-section-head"><div><h3>ลำดับการบันทึก</h3></div></div><div class="workflow-grid">${workflowStep('สร้างรายการ',r.created_by,r.created_at)}${workflowStep('ส่งให้แพทย์ทบทวน',r.submitted_by,r.submitted_at)}${r.returned_at?workflowStep('แพทย์ส่งกลับแก้ไข',r.returned_by,r.returned_at):workflowStep('แพทย์ทบทวน / LOCK',r.locked_by||r.reviewed_by,r.locked_at||r.reviewed_at)}</div></section>${adminUi()?`<div class="panel"><h3>Audit trail</h3><div class="timeline">${audit?.length?audit.map(a=>auditItem(a)).join(''):'<div class="muted">ยังไม่มีประวัติ</div>'}</div></div>`:''}<div class="actions"><button class="btn" id="plasmaDetailClose">ปิด</button>${canReview?'<button class="btn danger" id="plasmaReturn">ส่งกลับแก้ไข</button><button class="btn good" id="plasmaApprove">อนุมัติและ LOCK</button>':''}${canEdit?'<button class="btn primary" id="plasmaEdit">เปิดแก้ไข</button>':''}${adminUi()&&!r.deleted_at?'<button class="btn danger" id="plasmaDelete">ลบรายการ</button>':''}${adminUi()&&r.deleted_at?'<button class="btn good" id="plasmaRestore">กู้คืนรายการ</button>':''}</div>`;
      $$('.plasma-detail-ev').forEach(x=>x.onclick=()=>viewPlasmaEvidence(x.dataset.id));if($('#detailPlasmaPdf'))$('#detailPlasmaPdf').onclick=()=>printPlasmaOutlabBatch(b.id);if($('#detailEditBatch'))$('#detailEditBatch').onclick=()=>{$('#detailDialog').close();openPlasmaBatchBuilder(null,b.id);};if($('#detailCreateBatch'))$('#detailCreateBatch').onclick=()=>{$('#detailDialog').close();openPlasmaBatchBuilder(r.id);};$('#plasmaDetailClose').onclick=()=>$('#detailDialog').close();if($('#plasmaEdit'))$('#plasmaEdit').onclick=()=>{$('#detailDialog').close();state.currentPlasmaRecordId=id;location.hash=ROUTES.plasma.record;};if($('#plasmaReturn'))$('#plasmaReturn').onclick=()=>returnPlasmaForCorrection(id,$('#plasma_review_note').value);if($('#plasmaApprove'))$('#plasmaApprove').onclick=()=>approvePlasmaAndLock(id,$('#plasma_review_note').value);if($('#plasmaDelete'))$('#plasmaDelete').onclick=()=>adminDeletePlasma(id);if($('#plasmaRestore'))$('#plasmaRestore').onclick=()=>adminRestorePlasma(id);$('#detailDialog').showModal();logActivity('view_record','plasma_record',id,{module:'plasma',product_no:r.product_no}).catch(()=>{});
    }catch(e){showToast(errText(e),'error');}
  }
  async function approvePlasmaAndLock(id,note=''){if(!reviewerUi())return;if(!confirm('ยืนยันว่าตรวจทวนผลและหลักฐานแล้ว และอนุมัติให้ LOCK?'))return;try{const {error}=await state.sb.from('plasma_records').update({status:'locked',review_note:note.trim()||null}).eq('id',id);if(error)throw error;await reloadPlasmaRecords();$('#detailDialog').close();showToast('ทบทวนและ LOCK แล้ว','good');renderReviewQueue();}catch(e){showToast(errText(e),'error');}}
  async function returnPlasmaForCorrection(id,note=''){if(!reviewerUi())return;note=note.trim();if(!note){showToast('กรุณาระบุเหตุผลที่ส่งกลับแก้ไข','error');return;}try{const {error}=await state.sb.from('plasma_records').update({status:'draft',review_note:note}).eq('id',id);if(error)throw error;await reloadPlasmaRecords();$('#detailDialog').close();showToast('ส่งกลับให้แก้ไขแล้ว','good');renderReviewQueue();}catch(e){showToast(errText(e),'error');}}
  async function adminDeletePlasma(id){if(!adminUi())return;const reason=prompt('ระบุเหตุผลที่ลบรายการ (จำเป็น):');if(!reason?.trim())return;try{const {error}=await state.sb.from('plasma_records').update({deleted_at:new Date().toISOString(),delete_reason:reason.trim()}).eq('id',id);if(error)throw error;await reloadPlasmaRecords();$('#detailDialog').close();showToast('ลบรายการแล้วและเก็บ Audit ไว้','good');renderPlasmaPage('records');}catch(e){showToast(errText(e),'error');}}
  async function adminRestorePlasma(id){if(!adminUi())return;const reason=prompt('ระบุเหตุผลที่กู้คืนรายการ:');if(!reason?.trim())return;try{const {error}=await state.sb.from('plasma_records').update({deleted_at:null,deleted_by:null,delete_reason:null,last_admin_edit_reason:reason.trim(),last_admin_edit_id:crypto.randomUUID()}).eq('id',id);if(error)throw error;await reloadPlasmaRecords();$('#detailDialog').close();showToast('กู้คืนรายการแล้ว','good');renderPlasmaPage('records');}catch(e){showToast(errText(e),'error');}}
  function renderPlasmaGuide(){
    const s=state.plasmaSettings;
    $('#view-module').innerHTML=`
      <div class="page-head"><div><h1>คู่มือ FFP</h1><p class="muted">ขั้นตอนทำงานตั้งแต่เลือกถุงจนแพทย์ LOCK</p></div><div class="actions">${staffWriteUi()?'<button class="btn" id="guidePlasmaBatch">+ สร้างใบนำส่ง</button><button class="btn primary" id="guidePlasmaNew">+ บันทึก FFP</button>':''}</div></div>
      <div class="notice info"><strong>จำง่าย:</strong> 1 Product No. = 1 รายการ FFP QC · 1 เที่ยวส่ง = 1 ใบนำส่ง · เที่ยวเดียวรวม FFP ต่างชนิดกันได้</div>
      <div class="guide-grid ffp-guide-grid">
        <section class="guide-card"><div class="guide-no">1</div><div><h2>เลือกถุงที่จะทำ QC แล้วสร้างรายการ</h2><p>เมื่อหน่วยเลือก FFP สำหรับ QC ให้เข้า <strong>Plasma → บันทึก FFP</strong> และสร้าง Product No. ไว้ทันที ไม่จำเป็นต้องรอผล Factor VIII</p><p>กรอกชนิด FFP, Group, วันที่ผลิต, เครื่องปั่น และเวลาที่เตรียมตามข้อมูลจริงของถุง</p><div class="guide-callout">สร้างไว้ก่อนช่วยให้ติดตามได้ว่าถุงใดกำลังรอชั่งน้ำหนัก รอใบนำส่ง หรือรอผล Outlab</div></div></section>
        <section class="guide-card"><div class="guide-no">2</div><div><h2>ชั่งน้ำหนักถุง</h2><p>ชั่งผลิตภัณฑ์ทั้งถุง แล้วกรอกเฉพาะ <strong>น้ำหนักที่ชั่งได้ (g)</strong> ระบบจะใส่น้ำหนักถุงเปล่าและ Density ตามชนิดถุงให้เอง</p><div class="guide-rule-row"><span class="guide-rule good">Top&Bottom 27.7 g</span><span class="guide-rule good">NLR-Reveos 28.2 g</span><span class="guide-rule good">LR-Reveos 28.2 g</span><span class="guide-rule warn">Density 1.025</span></div><div class="guide-callout">Volume = (น้ำหนักที่ชั่งได้ - น้ำหนักถุงเปล่า) ÷ Density ระบบคำนวณให้อัตโนมัติ และเก็บชื่อผู้กรอกน้ำหนักพร้อมวันเวลา</div></div></section>
        <section class="guide-card"><div class="guide-no">3</div><div><h2>เตรียม Segment สำหรับ Factor VIII</h2><p>เตรียม Segment ของ Product No. ที่จะส่งตรวจตามวิธีปฏิบัติงานของหน่วย: <strong>แช่แข็ง → พัน Parafilm → เก็บแช่แข็ง</strong> จนถึงเวลานำส่ง</p><p>ตรวจ Product No. บน Segment ให้ตรงกับรายการในระบบก่อนจัดชุดนำส่ง</p></div></section>
        <section class="guide-card"><div class="guide-no">4</div><div><h2>สร้างใบนำส่ง</h2><p>กด <strong>+ สร้างใบนำส่ง</strong> แล้วเลือกเฉพาะ Product No. ที่จะออกไปในเที่ยวเดียวกัน สามารถรวม Top&Bottom, NLR-Reveos และ LR-Reveos ในใบเดียวได้</p><div class="guide-callout"><strong>ถ้าวันนี้ส่ง 12 ถุง:</strong> เลือกทั้ง 12 ถุงแล้วสร้าง 1 ใบ<br><strong>ถ้าอีกวันส่งเพิ่ม 1–2 ถุง:</strong> สร้างใบนำส่งใหม่อีก 1 ใบ เลือกเฉพาะถุงที่ส่งวันนั้น<br><strong>ถ้าเลือก Product No. ผิดในเที่ยวเดิม:</strong> ก่อนมีผล Factor VIII ให้กด “แก้ไขชุดนำส่ง” แก้รายการ แล้ว Export PDF ฉบับใหม่</div><p>ระบบเก็บ Audit การแก้ชุดนำส่งไว้ หากมีผล Factor VIII แล้วหรือส่งแพทย์/LOCK ระบบจะไม่ให้แก้สมาชิกชุดเพื่อป้องกันข้อมูลคลาดเคลื่อน</p></div></section>
        <section class="guide-card"><div class="guide-no">5</div><div><h2>ตรวจใบนำส่งก่อนพิมพ์</h2><p>ตรวจ Product No., รหัสบริการ <strong>${esc(s.outlab_service_code||'250089')}</strong>, ชื่อการทดสอบ <strong>${esc(s.outlab_test_name||'Factor VIII assay')}</strong>, ผู้เตรียมสิ่งส่งตรวจ, วัน-เวลา และชื่อ RFS ถ้ามี</p><p>PDF ใช้รูปแบบ A4 และรองรับหลายถุง ถ้ารายการเกิน 12 ถุง ระบบจะแบ่งหน้าต่อให้อัตโนมัติ โดยยังเป็นชุดนำส่งเดียวกัน</p></div></section>
        <section class="guide-card"><div class="guide-no">6</div><div><h2>นำส่ง Outlab และรอผล</h2><p>นำ Segment แช่แข็งไปตามกระบวนการของหน่วย พร้อมใบนำส่งที่ Export จากระบบ หลังส่งแล้วรายการจะอยู่สถานะ <strong>รอผล Factor VIII</strong></p><p>ผลส่งกลับที่ <strong>${esc(s.result_email||'transfusionbb_cnmi@mahidol.ac.th')}</strong> ตามค่าที่ Admin กำหนด</p></div></section>
        <section class="guide-card"><div class="guide-no">7</div><div><h2>เมื่อได้รับใบรายงานผล</h2><p>เปิด Product No. ที่ตรงกับใบรายงาน แล้วกรอก <strong>Factor VIII (%)</strong> และวันที่ทดสอบตามใบผล จากนั้นถ่ายรูปหรือแนบ Scan/PDF ของใบรายงานไว้ในหัวข้อเดียวกัน</p><div class="guide-callout">ชื่อ <strong>ผู้กรอกผล</strong> และ <strong>ผู้แนบหลักฐาน</strong> ถูกเก็บแยกตามบัญชีที่ทำจริง เพื่อทวนสอบย้อนหลังได้</div></div></section>
        <section class="guide-card"><div class="guide-no">8</div><div><h2>ระบบคำนวณและประเมิน QC</h2><p>ระบบคำนวณ Factor VIII เป็น IU/mL และ IU/bag ให้อัตโนมัติ แล้วเทียบกับเกณฑ์ที่หน่วยกำหนด</p><div class="guide-rule-row"><span class="guide-rule good">Volume ≥ ${fmt(s.volume_min_ml,0)} mL</span><span class="guide-rule good">Factor VIII ≥ ${fmt(s.factor_viii_min_iu_ml,2)} IU/mL</span></div><p>ถ้าข้อมูลยังไม่ครบจะขึ้น “ข้อมูลยังไม่ครบ” ถ้าค่าใดไม่เข้าเกณฑ์จะขึ้น “ต้องตรวจสอบ” ไม่ควรแก้ตัวเลขเพื่อให้ผ่าน</p></div></section>
        <section class="guide-card"><div class="guide-no">9</div><div><h2>ส่งแพทย์ทบทวน</h2><p>เมื่อข้อมูลและหลักฐานครบ กด <strong>ส่งตรวจทวน</strong> แพทย์ Reviewer จะตรวจข้อมูลและหลักฐาน</p><p>แพทย์เลือก <strong>อนุมัติและ LOCK</strong> หรือ <strong>ส่งกลับแก้ไข</strong> พร้อมเหตุผล หากส่งกลับ Staff แก้ข้อมูลแล้วส่งตรวจทวนใหม่ได้</p></div></section>
        <section class="guide-card"><div class="guide-no">10</div><div><h2>ถ้ากรอกผิดหรือมีหลักฐานใหม่</h2><p>ก่อน LOCK สามารถแก้ Draft ได้ตามสิทธิ์ หาก LOCK แล้วให้แจ้ง Admin พร้อมหลักฐานที่ถูกต้อง</p><div class="guide-callout">Admin ต้องระบุเหตุผลการแก้ไข ระบบเก็บค่าก่อน-หลัง ผู้แก้ วันเวลา และ Revision ใน Audit Log และควรคงหลักฐานเดิมไว้ พร้อมแนบหลักฐานใหม่เพิ่ม</div></div></section>
      </div>
      <div class="panel guide-terms"><h2>สถานะที่ควรรู้</h2><div class="term-grid"><div><strong>รอจัดชุด</strong><span>สร้าง FFP แล้ว แต่ยังไม่มีใบนำส่ง</span></div><div><strong>รอผล Factor VIII</strong><span>อยู่ในชุดนำส่งแล้ว ยังไม่ได้กรอกผล</span></div><div><strong>Draft</strong><span>เจ้าหน้าที่ยังกรอก/แก้ข้อมูลได้</span></div><div><strong>Submitted</strong><span>ส่งให้แพทย์ทบทวนแล้ว</span></div><div><strong>LOCK</strong><span>แพทย์ทบทวนเสร็จ</span></div><div><strong>Revision</strong><span>ครั้งที่แก้ไขหลัง LOCK</span></div></div></div>`;
    if($('#guidePlasmaNew'))$('#guidePlasmaNew').onclick=()=>{state.currentPlasmaRecordId=null;location.hash=ROUTES.plasma.record;};
    if($('#guidePlasmaBatch'))$('#guidePlasmaBatch').onclick=openPlasmaBatchBuilder;
    bindRouteButtons($('#view-module'));
  }

  function renderPlasmaSettings(){
    if(!adminUi()){location.hash=ROUTES.plasma.dashboard;return;}const s=state.plasmaSettings;$('#view-module').innerHTML=`<div class="page-head"><div><h1>ตั้งค่า Plasma QC</h1><p class="muted">FFP · Factor VIII</p></div></div><div class="panel"><h2>เกณฑ์ QC FFP</h2><div class="form-grid">${plasmaField('Volume ขั้นต่ำ (mL)','ps_volume_min',s.volume_min_ml,'number',false,false,'0.01')}${plasmaField('Factor VIII ขั้นต่ำ (IU/mL)','ps_factor_min',s.factor_viii_min_iu_ml,'number',false,false,'0.01')}${plasmaField('อายุผลิตภัณฑ์ (วัน)','ps_expiry_days',s.expiry_days,'number')}<div class="field"><label>&nbsp;</label><label class="inline-check"><input id="ps_require_ev" type="checkbox" checked disabled> บังคับหลักฐาน Factor VIII</label></div></div></div><div class="panel"><h2>Outlab</h2><div class="form-grid">${plasmaField('รหัสบริการ','ps_service_code',s.outlab_service_code)}${plasmaField('ชื่อการทดสอบ','ps_test_name',s.outlab_test_name)}${plasmaField('รหัสแบบฟอร์ม','ps_form_code',s.outlab_form_code)}${plasmaField('เวลานำส่งเริ่มต้น','ps_send_time',plasmaTimeInput(s.default_send_time),'time')}<div class="field span2"><label>ข้อความวันบังคับใช้</label><input id="ps_form_effective" value="${esc(s.outlab_form_effective_text||'วันบังคับใช้ 15 มกราคม 2565')}"></div><div class="field span2"><label>E-mail รับผล</label><input id="ps_result_email" type="email" value="${esc(s.result_email||'transfusionbb_cnmi@mahidol.ac.th')}"></div><div class="field span4"><label>ปลายทาง</label><input id="ps_destination" value="${esc(s.outlab_destination)}"></div></div></div><div class="panel"><h2>น้ำหนักถุง / Density</h2><div class="table-wrap"><table class="data-table plasma-product-settings"><thead><tr><th>ชนิด FFP</th><th>น้ำหนักถุงเปล่า (g)</th><th>Density</th><th></th></tr></thead><tbody>${state.plasmaProductSettings.map(x=>`<tr data-type="${esc(x.product_type)}"><td><strong>${esc(x.product_type)}</strong></td><td><input class="pptare" type="number" step="0.01" value="${esc(x.tare_weight_g)}"></td><td><input class="ppdensity" type="number" step="0.001" value="${esc(x.density)}"></td><td><button class="btn small-btn ppsave">บันทึก</button></td></tr>`).join('')}</tbody></table></div></div><div class="actions"><button class="btn primary" id="savePlasmaSettings">บันทึกเกณฑ์/Outlab</button></div>`;$('#savePlasmaSettings').onclick=savePlasmaSettings;$$('.ppsave').forEach(b=>b.onclick=()=>savePlasmaProductSetting(b.closest('tr').dataset.type));
  }
  async function savePlasmaSettings(){try{const payload={volume_min_ml:num($('#ps_volume_min').value),factor_viii_min_iu_ml:num($('#ps_factor_min').value),expiry_days:Number($('#ps_expiry_days').value),require_factor_evidence:true,outlab_service_code:$('#ps_service_code').value.trim(),outlab_test_name:$('#ps_test_name').value.trim(),outlab_form_code:$('#ps_form_code').value.trim(),outlab_form_effective_text:$('#ps_form_effective').value.trim(),result_email:$('#ps_result_email').value.trim(),outlab_destination:$('#ps_destination').value.trim(),default_send_time:$('#ps_send_time').value};const {error}=await state.sb.from('plasma_qc_settings').update(payload).eq('id',1);if(error)throw error;await loadPlasmaModuleData();showToast('บันทึก Plasma settings แล้ว','good');renderPlasmaSettings();}catch(e){showToast(errText(e),'error');}}
  async function savePlasmaProductSetting(type){try{const row=$$(`.plasma-product-settings tr`).find(x=>x.dataset.type===type),tare=num($('.pptare',row).value),density=num($('.ppdensity',row).value);if(tare==null||tare<0||density==null||density<=0)throw new Error('ตรวจน้ำหนักถุงและ Density');const {error}=await state.sb.from('plasma_product_settings').update({tare_weight_g:tare,density}).eq('product_type',type);if(error)throw error;await loadPlasmaModuleData();showToast(`บันทึก ${type} แล้ว`,'good');renderPlasmaSettings();}catch(e){showToast(errText(e),'error');}}

  // ===== RBC module v5.3.3 =====
  function rbcMonthKey(d=new Date()){
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(d).replace('/','-');
  }
  function rbcMonthStart(ym){ return `${ym}-01`; }
  const rbcProductSetting = type => state.rbcProductSettings.find(x=>x.product_type===type);
  const activeRbcProducts = () => state.rbcProductSettings.filter(x=>x.is_active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.product_type.localeCompare(b.product_type));
  const rbcProductOptions = selected => activeRbcProducts().map(x=>`<option value="${esc(x.product_type)}" ${selected===x.product_type?'selected':''}>${esc(x.product_type)}</option>`).join('');
  const rbcQcTH = s => ({incomplete:'ข้อมูลยังไม่ครบ',pass:'ผ่านเกณฑ์ QC',review:'ต้องตรวจสอบ'})[s]||s||'-';
  const rbcQcBadge = s => `<span class="badge ${s==='pass'?'pass':s==='review'?'review':'incomplete'}">${esc(rbcQcTH(s))}</span>`;
  const rbcProductClassTH = c => c==='ldprc'?'LDPRC':'LPRC';
  function rbcModuleReadyNotice(){
    return `<div class="page-head"><div><h1>RBC</h1><p class="muted">LPRC / LDPRC QC</p></div></div><div class="notice warning"><strong>RBC module ยังไม่พร้อม</strong><br>ให้ Admin Run <code>supabase/upgrade_v5_2_3_to_v5_3_0.sql</code> ใน Supabase Project ของ Blood QC ก่อน</div>`;
  }
  async function loadRbcModuleData(){
    try{
      const [settingsRes,productsRes,recordsRes]=await Promise.all([
        state.sb.from('rbc_qc_settings').select('*').eq('id',1).single(),
        state.sb.from('rbc_product_settings').select('*').order('sort_order').order('product_type'),
        state.sb.from('rbc_records').select('*').order('manufactured_on',{ascending:false}).order('created_at',{ascending:false}).limit(1500)
      ]);
      const firstError=[settingsRes.error,productsRes.error,recordsRes.error].find(Boolean);
      if(firstError) throw firstError;
      state.rbcSettings=settingsRes.data;
      state.rbcProductSettings=productsRes.data||[];
      state.rbcRecords=recordsRes.data||[];
      state.rbcMonthlyProduction=[];
      state.rbcReady=true;
    }catch(e){
      console.warn('RBC module not ready',e);
      state.rbcSettings=null; state.rbcProductSettings=[]; state.rbcRecords=[]; state.rbcMonthlyProduction=[]; state.rbcReady=false;
    }
  }
  async function reloadRbcRecords(){
    if(!state.rbcReady)return;
    const {data,error}=await state.sb.from('rbc_records').select('*').order('manufactured_on',{ascending:false}).order('created_at',{ascending:false}).limit(1500);
    if(error)throw error; state.rbcRecords=data||[];
  }
  function renderRbcPage(page='dashboard'){
    if(!state.rbcReady){ $('#view-module').innerHTML=rbcModuleReadyNotice(); return; }
    if(page==='record') return renderRbcRecordForm();
    if(page==='records') return renderRbcRecordsList();
    if(page==='guide') return renderRbcGuide();
    if(page==='settings') return renderRbcSettings();
    return renderRbcDashboard();
  }
  function rbcModuleCard(){
    if(!state.rbcReady)return `<article class="module-card future-module"><div class="module-card-head"><div><h2>RBC</h2><p>LPRC / LDPRC QC</p></div><span class="module-status planned">รออัปเกรดฐานข้อมูล</span></div></article>`;
    const ym=rbcMonthKey();
    const month=state.rbcRecords.filter(r=>!r.deleted_at&&String(r.manufactured_on||'').slice(0,7)===ym);
    const submitted=state.rbcRecords.filter(r=>!r.deleted_at&&r.status==='submitted').length;
    return `<article class="module-card active-module"><div class="module-card-head"><div><h2>RBC</h2><p>LPRC / LDPRC QC</p></div><span class="module-status live">ใช้งานจริง</span></div><div class="module-stats"><span><strong>${month.length}</strong> QC เดือนนี้</span><span><strong>${submitted}</strong> รอแพทย์</span></div><div class="module-actions"><button class="btn primary" data-go-route="#/rbc">ภาพรวม</button>${staffWriteUi()?'<button class="btn" data-go-route="#/rbc/new">บันทึก RBC</button>':''}<button class="btn" data-go-route="#/rbc/records">รายการ</button><button class="btn" data-go-route="#/rbc/guide">คู่มือ</button></div></article>`;
  }
  const RBC_MONTHLY_TARGET_PER_PRODUCT = 4;
  function rbcQcDone(ym,type){ return state.rbcRecords.filter(r=>!r.deleted_at&&r.product_type===type&&String(r.manufactured_on||'').slice(0,7)===ym).length; }
  function rbcTargetCard(p,ym){
    const target=RBC_MONTHLY_TARGET_PER_PRODUCT,done=rbcQcDone(ym,p.product_type),remain=Math.max(0,target-done),complete=done>=target;
    const pct=Math.min(100,Math.round((done/target)*100));
    return `<article class="rbc-progress-card ${complete?'complete':''}" data-product="${esc(p.product_type)}"><div class="rbc-progress-head"><div><strong>${esc(p.product_type)}</strong><small>${esc(rbcProductClassTH(p.product_class))}</small></div><span class="badge ${complete?'pass':''}">${complete?'ครบแล้ว':done+' / '+target}</span></div><div class="rbc-progress-track"><span style="width:${pct}%"></span></div><div class="rbc-progress-foot"><span>ทำ QC แล้ว <b>${done}</b></span><span>${complete?'ครบเป้าหมาย':`เหลือ ${remain}`}</span></div></article>`;
  }
  function renderRbcDashboard(){
    const ym=state.rbcDashboardMonth||rbcMonthKey(); state.rbcDashboardMonth=ym;
    const rec=state.rbcRecords.filter(r=>!r.deleted_at);
    const month=rec.filter(r=>String(r.manufactured_on||'').slice(0,7)===ym);
    const submitted=rec.filter(r=>r.status==='submitted').length, locked=month.filter(r=>r.status==='locked').length, review=month.filter(r=>r.qc_status==='review').length;
    const products=activeRbcProducts();
    const completedProducts=products.filter(p=>rbcQcDone(ym,p.product_type)>=RBC_MONTHLY_TARGET_PER_PRODUCT).length;
    $('#view-module').innerHTML=`<div class="page-head"><div><h1>ภาพรวม RBC</h1><p class="muted">LPRC / LDPRC QC</p></div><div class="actions"><button class="btn" data-go-route="#/rbc/guide">คู่มือ RBC</button>${staffWriteUi()?'<button class="btn primary" id="rbcNewBtn">+ บันทึก RBC</button>':''}</div></div>
      <div class="grid cards">${metric('เดือนนี้',month.length,'รายการ RBC QC')}${metric('ครบ 4 ถุง',completedProducts,`จาก ${products.length} ชนิด`)}${metric('รอแพทย์ทบทวน',submitted,'Submitted')}${metric('QC ต้องตรวจสอบ',review,'ค่าบางรายการไม่เข้าเกณฑ์')}${metric('LOCK เดือนนี้',locked,'แพทย์ทบทวนแล้ว')}</div>
      <div class="panel rbc-month-panel compact"><div class="section-title-row"><div><h2>ความครบถ้วน QC รายเดือน</h2><p class="muted">ติดตาม 4 ถุงต่อชนิด</p></div><div class="rbc-month-select"><label>เดือน</label><input id="rbcDashMonth" type="month" value="${esc(ym)}"></div></div><div class="rbc-progress-grid">${products.map(p=>rbcTargetCard(p,ym)).join('')}</div></div>
      <div class="panel"><h2>รายการล่าสุด</h2>${rbcRecordsTable(rec.slice(0,12))}</div>`;
    $('#rbcDashMonth').onchange=e=>{state.rbcDashboardMonth=e.target.value||rbcMonthKey();renderRbcDashboard();};
    if($('#rbcNewBtn'))$('#rbcNewBtn').onclick=()=>{state.currentRbcRecordId=null;location.hash=ROUTES.rbc.record;};
    bindRouteButtons($('#view-module')); bindRbcRecordLinks($('#view-module'));
  }
  function rbcRecordsTable(rows){
    if(!rows.length)return '<div class="empty">ยังไม่มีข้อมูล</div>';
    return `<div class="table-wrap"><table class="data-table rbc-records-table"><thead><tr><th>Product No.</th><th>ชนิด RBC</th><th>วันที่ผลิต</th><th>ก่อน</th><th>หลัง</th><th>Residual WBC</th><th>RBC Recovery</th><th>QC</th><th>สถานะ</th><th>ผู้สร้าง</th></tr></thead><tbody>${rows.map(r=>{const ps=rbcProductSetting(r.product_type),res=r.post1_wbc_total,rec=r.run1_rbc_recovery_pct;return `<tr class="${r.deleted_at?'deleted-row':''}"><td><button class="link-btn rbc-record-link" data-id="${r.id}">${esc(r.product_no)}</button>${r.deleted_at?' <span class="badge deleted">ลบแล้ว</span>':''}</td><td>${esc(r.product_type)}</td><td class="nowrap">${esc(r.manufactured_on||'–')}</td><td>${r.source_volume_ml==null?'–':fmt(r.source_volume_ml,2)+' mL'}</td><td>${r.final_volume_ml==null?'–':fmt(r.final_volume_ml,2)+' mL'}</td><td>${res==null?'–':fmt(res,3)+' ×10'+(ps?.product_class==='ldprc'?'⁶':'⁹')}</td><td>${rec==null?'–':fmt(rec,2)+'%'}</td><td>${rbcQcBadge(r.qc_status)}</td><td>${statusBadge(r.status)}</td><td>${esc(profileName(r.created_by))}</td></tr>`}).join('')}</tbody></table></div>`;
  }
  function bindRbcRecordLinks(root=document){ $$('.rbc-record-link',root).forEach(b=>b.onclick=()=>openRbcDetail(b.dataset.id)); }
  function renderRbcRecordsList(){
    const products=activeRbcProducts();
    const del=adminUi()?`<label class="inline-check"><input type="checkbox" id="rbcDeleted" ${state.showDeletedRbc?'checked':''}> แสดงรายการที่ลบแล้ว</label>`:'';
    $('#view-module').innerHTML=`<div class="page-head"><div><h1>รายการ RBC</h1><p class="muted">QC LPRC / LDPRC</p></div><div class="actions"><button class="btn" id="rbcCsv">Export CSV</button><button class="btn" data-go-route="#/rbc/guide">คู่มือ RBC</button>${staffWriteUi()?'<button class="btn primary" id="rbcNewList">+ บันทึก RBC</button>':''}</div></div><div class="panel"><div class="filters rbc-filters"><input id="rbcSearch" placeholder="ค้นหา Product No. / ผลิตภัณฑ์"><select id="rbcProductFilter"><option value="">ทุกผลิตภัณฑ์</option>${products.map(p=>`<option value="${esc(p.product_type)}">${esc(p.product_type)}</option>`).join('')}</select><select id="rbcStatusFilter"><option value="">ทุกสถานะ</option><option value="draft">ร่าง</option><option value="submitted">รอตรวจทวน</option><option value="locked">LOCK</option></select><select id="rbcQcFilter"><option value="">ทุกผล QC</option><option value="incomplete">ข้อมูลยังไม่ครบ</option><option value="pass">ผ่านเกณฑ์ QC</option><option value="review">ต้องตรวจสอบ QC</option></select><button class="btn" id="rbcClearFilter">ล้าง</button></div>${del}<div id="rbcRecordsHost" style="margin-top:12px"></div></div>`;
    const render=()=>{const q=$('#rbcSearch').value.trim().toLowerCase(),pt=$('#rbcProductFilter').value,st=$('#rbcStatusFilter').value,qc=$('#rbcQcFilter').value;let rows=state.rbcRecords.filter(r=>(state.showDeletedRbc||!r.deleted_at)&&(!q||`${r.product_no} ${r.product_type}`.toLowerCase().includes(q))&&(!pt||r.product_type===pt)&&(!st||r.status===st)&&(!qc||r.qc_status===qc));$('#rbcRecordsHost').innerHTML=rbcRecordsTable(rows);bindRbcRecordLinks($('#rbcRecordsHost'));};
    ['rbcSearch','rbcProductFilter','rbcStatusFilter','rbcQcFilter'].forEach(id=>$('#'+id).addEventListener(id==='rbcSearch'?'input':'change',render));
    $('#rbcClearFilter').onclick=()=>{$('#rbcSearch').value='';$('#rbcProductFilter').value='';$('#rbcStatusFilter').value='';$('#rbcQcFilter').value='';render();};
    if($('#rbcDeleted'))$('#rbcDeleted').onchange=e=>{state.showDeletedRbc=e.target.checked;render();};
    $('#rbcCsv').onclick=exportRbcCsv; if($('#rbcNewList'))$('#rbcNewList').onclick=()=>{state.currentRbcRecordId=null;location.hash=ROUTES.rbc.record;};
    bindRouteButtons($('#view-module'));render();
  }
  function exportRbcCsv(){
    const rows=state.rbcRecords.filter(r=>!r.deleted_at),heads=['Product No.','Product Type','Manufactured On','Source Volume mL','Final Volume mL','Pre1 Hct','Pre1 WBC','Pre1 RBC','Pre1 PLT','Pre2 Hct','Pre2 WBC','Pre2 RBC','Pre2 PLT','Post1 Hct','Post1 WBC CBC','Post1 RBC','Post1 PLT','Post2 Hct','Post2 WBC CBC','Post2 RBC','Post2 PLT','Post ADAM WBC /uL','Post ADAM measured at','Run1 WBC Removal %','Run1 RBC Recovery %','Run2 WBC Removal %','Run2 RBC Recovery %','QC','Status'];
    const vals=rows.map(r=>[r.product_no,r.product_type,r.manufactured_on,r.source_volume_ml,r.final_volume_ml,r.pre1_hct_pct,r.pre1_wbc,r.pre1_rbc,r.pre1_plt,r.pre2_hct_pct,r.pre2_wbc,r.pre2_rbc,r.pre2_plt,r.post1_hct_pct,r.post1_wbc,r.post1_rbc,r.post1_plt,r.post2_hct_pct,r.post2_wbc,r.post2_rbc,r.post2_plt,r.post_adam_wbc,r.post_adam_measured_at,r.run1_wbc_removal_pct,r.run1_rbc_recovery_pct,r.run2_wbc_removal_pct,r.run2_rbc_recovery_pct,r.qc_status,r.status]);
    const csv=[heads,...vals].map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`RBC_QC_${rbcMonthKey()}.csv`;a.click();URL.revokeObjectURL(a.href);logActivity('export_csv','report',null,{module:'rbc',rows:rows.length}).catch(()=>{});
  }
  function rbcField(label,id,value,type='text',readonly=false,required=false,step=''){
    return `<div class="field"><label class="${required?'required':''}">${label}</label><input id="${id}" type="${type}" value="${esc(value??'')}" ${readonly?'readonly':''} ${step?`step="${step}"`:''}></div>`;
  }
  function rbcRepeatTable(prefix,r,productClass,includeWbc=true){
    const wbcHead=includeWbc?'<th>WBC (K/µL)</th>':'';
    return `<div class="table-wrap"><table class="data-table rbc-repeat-table"><thead><tr><th></th><th>Hct (%)</th>${wbcHead}<th>RBC (M/µL)</th><th>PLT (K/µL)</th></tr></thead><tbody>${[1,2].map(i=>`<tr><th>เครื่องที่ ${i}</th><td><input id="rbc_${prefix}${i}_hct" type="number" step="0.01" value="${esc(r?.[`${prefix}${i}_hct_pct`]??'')}"></td>${includeWbc?`<td><input id="rbc_${prefix}${i}_wbc" type="number" step="0.0001" value="${esc(r?.[`${prefix}${i}_wbc`]??'')}"></td>`:''}<td><input id="rbc_${prefix}${i}_rbc" type="number" step="0.0001" value="${esc(r?.[`${prefix}${i}_rbc`]??'')}"></td><td><input id="rbc_${prefix}${i}_plt" type="number" step="0.01" value="${esc(r?.[`${prefix}${i}_plt`]??'')}"></td></tr>`).join('')}</tbody></table></div>`;
  }
  function rbcEvidenceBox(category,title,editable,locked){
    return `<div class="measurement-evidence"><div class="measurement-evidence-head"><strong>${title}</strong><span class="section-badge required-evidence">บังคับ</span></div>${editable?`<input class="hidden-file-input" type="file" id="rbc_camera_${category}" accept="image/*" capture="environment"><input class="hidden-file-input" type="file" id="rbc_file_${category}" accept="image/*,application/pdf"><div class="evidence-pick-actions"><button type="button" class="btn primary small-btn rbc-camera-pick" data-cat="${category}">ถ่ายรูป</button><button type="button" class="btn small-btn rbc-file-pick" data-cat="${category}">เลือกไฟล์</button></div>`:''}<div class="evidence-list" id="rbc_list_${category}"></div></div>`;
  }
  async function loadRbcEvidence(recordId){
    state.currentRbcEvidence=[]; if(!recordId)return;
    const {data,error}=await state.sb.from('rbc_evidence_files').select('*').eq('record_id',recordId).order('created_at'); if(error)throw error; state.currentRbcEvidence=data||[];
  }
  function renderRbcEvidenceLists(editable,locked=false){
    ['pre_cbc','post_cbc','post_adam'].forEach(cat=>{const host=$('#rbc_list_'+cat);if(!host)return;const arr=state.currentRbcEvidence.filter(x=>x.category===cat),canDelete=editable&&!locked;host.innerHTML=arr.length?arr.map(e=>`<div class="evidence-item"><span class="name evidence-name"><strong>${esc(e.original_name)}</strong><small>ผู้แนบหลักฐาน ${esc(profileName(e.uploaded_by))} · ${esc(dateTH(e.created_at))}</small>${e.change_reason?`<small class="evidence-reason">Admin: ${esc(e.change_reason)}</small>`:''}</span><span class="e-actions"><button class="btn small-btn rbc-ev-view" data-id="${e.id}">ดู</button>${canDelete?`<button class="btn small-btn danger rbc-ev-del" data-id="${e.id}">ลบ</button>`:''}</span></div>`).join(''):'<div class="muted small">ยังไม่มีหลักฐาน</div>';});
    $$('.rbc-ev-view').forEach(b=>b.onclick=()=>viewRbcEvidence(b.dataset.id)); $$('.rbc-ev-del').forEach(b=>b.onclick=()=>deleteRbcEvidence(b.dataset.id));
  }
  function rbcPreviewCalc(){
    const type=$('#rbc_product_type')?.value,ps=rbcProductSetting(type); if(!ps)return null;
    let sourceVol=null;
    if(ps.source_input_mode==='direct_volume')sourceVol=num($('#rbc_source_volume_direct')?.value);
    else {const gross=num($('#rbc_source_gross')?.value);if(gross!=null&&gross>=Number(ps.source_tare_weight_g))sourceVol=(gross-Number(ps.source_tare_weight_g))/Number(ps.source_density);}
    const finalGross=num($('#rbc_final_gross')?.value);let finalVol=null;if(finalGross!=null&&finalGross>=Number(ps.final_tare_weight_g))finalVol=(finalGross-Number(ps.final_tare_weight_g))/Number(ps.final_density);
    const run=i=>{const preW=num($(`#rbc_pre${i}_wbc`)?.value),preR=num($(`#rbc_pre${i}_rbc`)?.value),postW=ps.product_class==='ldprc'?num($('#rbc_post_adam_wbc')?.value):num($(`#rbc_post${i}_wbc`)?.value),postR=num($(`#rbc_post${i}_rbc`)?.value),postH=num($(`#rbc_post${i}_hct`)?.value);let preWT=null,preRT=null,postWT=null,postRT=null,wrem=null,rrec=null;if(sourceVol!=null&&preW!=null)preWT=preW*sourceVol/1000;if(sourceVol!=null&&preR!=null)preRT=preR*sourceVol/1000;if(finalVol!=null&&postW!=null)postWT=postW*finalVol/1000;if(finalVol!=null&&postR!=null)postRT=postR*finalVol/1000;if(preWT>0&&postWT!=null)wrem=ps.product_class==='ldprc'?((preWT*1000-postWT)/(preWT*1000))*100:((preWT-postWT)/preWT)*100;if(preRT>0&&postRT!=null)rrec=postRT/preRT*100;let pass=null;if(postWT!=null&&rrec!=null&&postH!=null){pass=ps.product_class==='ldprc'?(postWT<Number(state.rbcSettings.ldprc_residual_wbc_max_x10e6)&&rrec>Number(state.rbcSettings.ldprc_rbc_recovery_min_pct)&&postH>=Number(state.rbcSettings.hct_min_pct)&&postH<=Number(state.rbcSettings.hct_max_pct)):(postWT<Number(state.rbcSettings.lprc_residual_wbc_max_x10e9)&&rrec>Number(state.rbcSettings.lprc_rbc_recovery_min_pct)&&postH>=Number(state.rbcSettings.hct_min_pct)&&postH<=Number(state.rbcSettings.hct_max_pct));}return {preWT,postWT,wrem,rrec,postH,pass};};
    return {ps,sourceVol,finalVol,r1:run(1),r2:run(2)};
  }
  function updateRbcFormProduct(){
    const ps=rbcProductSetting($('#rbc_product_type')?.value); if(!ps)return;
    const host=$('#rbcSourceInputHost');
    if(ps.source_input_mode==='direct_volume') host.innerHTML=`${rbcField('Volume LPRC Top&Bottom จาก LIS (mL)','rbc_source_volume_direct',$('#rbc_source_volume_direct')?.value||'', 'number',false,true,'0.01')}<div class="field"><label>ที่มา</label><div class="readonly-box">กรอกจาก Volume ที่แสดงใน LIS</div></div>`;
    else host.innerHTML=`${rbcField('น้ำหนักก่อนกระบวนการ (g)','rbc_source_gross',$('#rbc_source_gross')?.value||'', 'number',false,true,'0.01')}${rbcField('น้ำหนักถุงเปล่า (g)','rbc_source_tare',ps.source_tare_weight_g,'number',true)}${rbcField('Density','rbc_source_density',ps.source_density,'number',true)}${rbcField('Volume ก่อนกระบวนการ (mL)','rbc_source_volume_preview','', 'text',true)}`;
    $('#rbcSourceTitle').textContent=ps.source_input_mode==='direct_volume'?'ก่อนกรอง · LPRC Top&Bottom':'ก่อนผลิต · '+ps.source_label;
    $('#rbcFinalTitle').textContent='หลังผลิต/กรอง · '+ps.product_type;
    $('#rbcFinalTare').value=ps.final_tare_weight_g; $('#rbcFinalDensity').value=ps.final_density;
    const isLdprc=ps.product_class==='ldprc';
    $$('.rbc-post-cbc-wbc').forEach(el=>el.classList.toggle('hidden',isLdprc));
    $$('.rbc-post-cbc-wbc input').forEach(el=>{el.disabled=isLdprc;});
    $('#rbcPostAdamPanel')?.classList.toggle('hidden',!isLdprc);
    if($('#rbc_post_adam_wbc'))$('#rbc_post_adam_wbc').disabled=!isLdprc;
    if($('#rbc_post_adam_measured_at'))$('#rbc_post_adam_measured_at').disabled=!isLdprc;
    if($('#rbcCalcSectionTitle'))$('#rbcCalcSectionTitle').textContent=(isLdprc?'7':'6')+'. ผลคำนวณ QC';
    if($('#rbcNotesSectionTitle'))$('#rbcNotesSectionTitle').textContent=(isLdprc?'8':'7')+'. หมายเหตุ';
    $$('#rbcSourceInputHost input').forEach(x=>x.addEventListener('input',updateRbcPreview)); updateRbcPreview();
  }
  function updateRbcPreview(){
    const p=rbcPreviewCalc();if(!p)return;
    if($('#rbc_source_volume_preview'))$('#rbc_source_volume_preview').value=p.sourceVol==null?'':p.sourceVol.toFixed(2);
    if($('#rbcFinalVolume'))$('#rbcFinalVolume').value=p.finalVol==null?'':p.finalVol.toFixed(2);
    const unit=p.ps.product_class==='ldprc'?'×10⁶ cells/unit':'×10⁹ cells/unit';
    [1,2].forEach(i=>{const x=p['r'+i];if($('#rbcCalc'+i))$('#rbcCalc'+i).innerHTML=`<td><strong>เครื่องที่ ${i}</strong></td><td>${x.postWT==null?'–':fmt(x.postWT,3)} <small>${unit}</small></td><td>${x.wrem==null?'–':fmt(x.wrem,2)+'%'}</td><td>${x.rrec==null?'–':fmt(x.rrec,2)+'%'}</td><td>${x.postH==null?'–':fmt(x.postH,2)+'%'}</td><td>${x.pass==null?'<span class="muted">–</span>':x.pass?'<span class="badge pass">ผ่าน</span>':'<span class="badge review">ตรวจสอบ</span>'}</td>`;});
  }
  async function renderRbcRecordForm(){
    if(!state.currentRbcRecordId&&!staffWriteUi()){location.hash=ROUTES.review;return;}
    const r=state.currentRbcRecordId?state.rbcRecords.find(x=>x.id===state.currentRbcRecordId):null;
    if(state.currentRbcRecordId&&!r){showToast('ไม่พบรายการ RBC','error');location.hash=ROUTES.rbc.records;return;}
    await loadRbcEvidence(r?.id);
    const type=r?.product_type||activeRbcProducts()[0]?.product_type||'',ps=rbcProductSetting(type),locked=r?.status==='locked',deleted=!!r?.deleted_at;
    const editable=!deleted && ((r?.status||'draft')==='draft'&&staffWriteUi() || (locked&&adminUi()));
    const correction=!!r&&adminUi()&&!deleted;
    const sourceDirect=ps?.source_input_mode==='direct_volume';
    $('#view-module').innerHTML=`<div class="page-head"><div><h1>${r?'แก้ไข':'บันทึก'} RBC QC</h1><p class="muted">LPRC / LDPRC</p></div><div class="actions"><button class="btn" data-go-route="#/rbc/guide">คู่มือ RBC</button>${r?statusBadge(r.status):''}</div></div>
      ${r?.review_note&&r.status==='draft'?`<div class="notice warning"><strong>แพทย์ส่งกลับแก้ไข:</strong> ${esc(r.review_note)}</div>`:''}
      <div class="panel"><div class="section-title-row"><h2>1. ข้อมูลรายการ</h2><span class="section-badge">QC</span></div><div class="form-grid">${rbcField('Product No.','rbc_product_no',r?.product_no||'', 'text',!editable,true)}<div class="field"><label class="required">ชนิด RBC</label><select id="rbc_product_type" ${!editable?'disabled':''}><option value="">เลือก</option>${rbcProductOptions(type)}</select></div>${rbcField('วันที่ผลิต','rbc_manufactured_on',r?.manufactured_on||'', 'date',!editable,true)}${rbcField('เครื่องปั่น','rbc_centrifuge',r?.centrifuge_no||'', 'text',!editable)}<div class="field span2"><label>ผู้สร้างรายการ</label><div class="readonly-box">${esc(profileName(r?.created_by||state.user.id))}</div></div></div></div>
      <div class="panel"><h2 id="rbcSourceTitle">2. ก่อนกระบวนการ</h2><div id="rbcSourceInputHost" class="form-grid">${sourceDirect?`${rbcField('Volume LPRC Top&Bottom จาก LIS (mL)','rbc_source_volume_direct',r?.source_volume_ml||'', 'number',!editable,true,'0.01')}<div class="field"><label>ที่มา</label><div class="readonly-box">กรอกจาก Volume ที่แสดงใน LIS</div></div>`:`${rbcField('น้ำหนักก่อนกระบวนการ (g)','rbc_source_gross',r?.source_gross_weight_g||'', 'number',!editable,true,'0.01')}${rbcField('น้ำหนักถุงเปล่า (g)','rbc_source_tare',ps?.source_tare_weight_g||'', 'number',true)}${rbcField('Density','rbc_source_density',ps?.source_density||'', 'number',true)}${rbcField('Volume ก่อนกระบวนการ (mL)','rbc_source_volume_preview',r?.source_volume_ml||'', 'text',true)}`}</div>${r?.source_recorded_by?`<div class="entry-attribution">ผู้กรอก ${esc(profileName(r.source_recorded_by))} · ${esc(dateTH(r.source_recorded_at))}</div>`:''}</div>
      <div class="panel measurement-entry-panel"><div class="section-title-row"><h2>3. CBC ก่อนกระบวนการ</h2><span class="section-badge">ก่อน</span></div><div class="form-grid">${rbcField('วัน-เวลาที่ตรวจ','rbc_pre_measured_at',inputFromISO(r?.pre_measured_at),'datetime-local',!editable,true)}<div class="field"><label>เครื่อง CBC</label><select id="rbc_pre_instrument" ${!editable?'disabled':''}><option ${(!r?.pre_cbc_instrument||r.pre_cbc_instrument==='Mindray')?'selected':''}>Mindray</option><option ${r?.pre_cbc_instrument==='Sysmex'?'selected':''}>Sysmex</option></select></div></div>${rbcRepeatTable('pre',r,ps?.product_class)}${r?.pre_recorded_by?`<div class="entry-attribution">ผู้กรอกผล ${esc(profileName(r.pre_recorded_by))} · ${esc(dateTH(r.pre_recorded_at))}</div>`:''}${rbcEvidenceBox('pre_cbc','หลักฐาน CBC ก่อนกระบวนการ',editable,locked)}</div>
      <div class="panel"><h2 id="rbcFinalTitle">4. หลังผลิต/กรอง</h2><div class="form-grid">${rbcField('น้ำหนักที่ชั่งได้ (g)','rbc_final_gross',r?.final_gross_weight_g||'', 'number',!editable,true,'0.01')}${rbcField('น้ำหนักถุงเปล่า (g)','rbcFinalTare',ps?.final_tare_weight_g||'', 'number',true)}${rbcField('Density','rbcFinalDensity',ps?.final_density||'', 'number',true)}${rbcField('Volume หลังผลิต/กรอง (mL)','rbcFinalVolume',r?.final_volume_ml||'', 'text',true)}</div>${r?.final_weight_recorded_by?`<div class="entry-attribution">ผู้กรอกน้ำหนัก ${esc(profileName(r.final_weight_recorded_by))} · ${esc(dateTH(r.final_weight_recorded_at))}</div>`:''}</div>
      <div class="panel measurement-entry-panel"><div class="section-title-row"><h2>5. CBC หลังผลิต/กรอง</h2><span class="section-badge">หลัง</span></div><div class="form-grid">${rbcField('วัน-เวลาที่ตรวจ CBC','rbc_post_measured_at',inputFromISO(r?.post_measured_at),'datetime-local',!editable,true)}<div class="field"><label>เครื่อง CBC</label><select id="rbc_post_instrument" ${!editable?'disabled':''}><option ${(!r?.post_cbc_instrument||r.post_cbc_instrument==='Mindray')?'selected':''}>Mindray</option><option ${r?.post_cbc_instrument==='Sysmex'?'selected':''}>Sysmex</option></select></div></div><div class="table-wrap"><table class="data-table rbc-repeat-table"><thead><tr><th></th><th>Hct (%)</th><th class="rbc-post-cbc-wbc ${ps?.product_class==='ldprc'?'hidden':''}">WBC (K/µL)</th><th>RBC (M/µL)</th><th>PLT (K/µL)</th></tr></thead><tbody>${[1,2].map(i=>`<tr><th>เครื่องที่ ${i}</th><td><input id="rbc_post${i}_hct" type="number" step="0.01" value="${esc(r?.[`post${i}_hct_pct`]??'')}" ${!editable?'disabled':''}></td><td class="rbc-post-cbc-wbc ${ps?.product_class==='ldprc'?'hidden':''}"><input id="rbc_post${i}_wbc" type="number" step="0.0001" value="${esc(r?.[`post${i}_wbc`]??'')}" ${!editable||ps?.product_class==='ldprc'?'disabled':''}></td><td><input id="rbc_post${i}_rbc" type="number" step="0.0001" value="${esc(r?.[`post${i}_rbc`]??'')}" ${!editable?'disabled':''}></td><td><input id="rbc_post${i}_plt" type="number" step="0.01" value="${esc(r?.[`post${i}_plt`]??'')}" ${!editable?'disabled':''}></td></tr>`).join('')}</tbody></table></div>${r?.post_recorded_by?`<div class="entry-attribution">ผู้กรอกผล CBC ${esc(profileName(r.post_recorded_by))} · ${esc(dateTH(r.post_recorded_at))}</div>`:''}${rbcEvidenceBox('post_cbc','หลักฐาน CBC หลังผลิต/กรอง',editable,locked)}</div>
      <div id="rbcPostAdamPanel" class="panel measurement-entry-panel ${ps?.product_class==='ldprc'?'':'hidden'}"><div class="section-title-row"><h2>6. WBC หลังผลิต/กรองจาก ADAM</h2><span class="section-badge">LDPRC</span></div><div class="form-grid">${rbcField('WBC (/µL)','rbc_post_adam_wbc',r?.post_adam_wbc??'', 'number',!editable,true,'0.0001')}${rbcField('วัน-เวลาที่วัด ADAM','rbc_post_adam_measured_at',inputFromISO(r?.post_adam_measured_at),'datetime-local',!editable,true)}</div>${r?.post_adam_recorded_by?`<div class="entry-attribution">ผู้กรอกผล ADAM ${esc(profileName(r.post_adam_recorded_by))} · ${esc(dateTH(r.post_adam_recorded_at))}</div>`:''}${rbcEvidenceBox('post_adam','หลักฐาน ADAM / WBC หลังผลิต/กรอง',editable,locked)}</div>
      <div class="panel"><div class="section-title-row"><h2 id="rbcCalcSectionTitle">${ps?.product_class==='ldprc'?'7':'6'}. ผลคำนวณ QC</h2>${r?rbcQcBadge(r.qc_status):''}</div><div class="table-wrap"><table class="data-table rbc-calc-table"><thead><tr><th></th><th>Residual WBC</th><th>WBC Removal</th><th>RBC Recovery</th><th>Hct หลัง</th><th>ผล</th></tr></thead><tbody><tr id="rbcCalc1"></tr><tr id="rbcCalc2"></tr></tbody></table></div></div>
      <div class="panel"><h2 id="rbcNotesSectionTitle">${ps?.product_class==='ldprc'?'8':'7'}. หมายเหตุ</h2><textarea id="rbc_notes" ${!editable?'disabled':''} placeholder="บันทึกเหตุการณ์หรือข้อมูลเพิ่มเติม">${esc(r?.notes||'')}</textarea></div>
      ${correction?`<div class="panel admin-correction-panel"><h2>การแก้ไขโดย Admin</h2><div class="field"><label>เหตุผลการแก้ไข</label><textarea id="rbc_admin_reason" placeholder="เช่น เจ้าหน้าที่แจ้งผลผิด ตรวจหลักฐานใหม่แล้วแก้ไข"></textarea></div></div>`:''}
      <div class="sticky-actions"><div><button class="btn" id="rbcBack">กลับรายการทั้งหมด</button></div><div class="right ${!r?'new-record-actions':''}">${!r&&editable?'<button class="btn clear-form-btn" id="rbcClear">ล้างฟอร์ม</button>':''}${locked&&adminUi()?'<button class="btn" id="rbcUnlock">ปลด LOCK</button>':''}${editable?'<button class="btn primary" id="rbcSave">บันทึก</button>':''}${r&&r.status==='draft'&&staffWriteUi()?'<button class="btn good" id="rbcSubmit">ส่งแพทย์ทบทวน</button>':''}</div></div>`;
    // Disable pre repeat fields that helper rendered without disabled attribute.
    if(!editable) $$('[id^="rbc_pre"]',$('#view-module')).forEach(x=>{if(x.tagName==='INPUT'||x.tagName==='SELECT')x.disabled=true;});
    $('#rbc_product_type').onchange=updateRbcFormProduct;
    $$('input,select',$('#view-module')).forEach(x=>x.addEventListener('input',updateRbcPreview));
    $('#rbc_final_gross')?.addEventListener('input',updateRbcPreview);
    $$('.rbc-camera-pick').forEach(b=>b.onclick=()=>$('#rbc_camera_'+b.dataset.cat).click()); $$('.rbc-file-pick').forEach(b=>b.onclick=()=>$('#rbc_file_'+b.dataset.cat).click());
    ['pre_cbc','post_cbc','post_adam'].forEach(cat=>{$('#rbc_camera_'+cat)?.addEventListener('change',()=>uploadRbcEvidence(cat,'rbc_camera_'+cat));$('#rbc_file_'+cat)?.addEventListener('change',()=>uploadRbcEvidence(cat,'rbc_file_'+cat));});
    renderRbcEvidenceLists(editable,locked); updateRbcPreview();
    $('#rbcBack').onclick=()=>location.hash=ROUTES.rbc.records; if($('#rbcClear'))$('#rbcClear').onclick=()=>{if(confirm('ล้างฟอร์มทั้งหมด?')){state.currentRbcRecordId=null;renderRbcRecordForm();}}; if($('#rbcSave'))$('#rbcSave').onclick=()=>saveRbcRecord(false); if($('#rbcSubmit'))$('#rbcSubmit').onclick=submitRbcRecord; if($('#rbcUnlock'))$('#rbcUnlock').onclick=unlockRbcRecord;
    bindRouteButtons($('#view-module'));
  }
  function collectRbcRecord(){
    const type=$('#rbc_product_type').value,ps=rbcProductSetting(type),adminReason=$('#rbc_admin_reason')?.value.trim()||null;
    const payload={product_no:$('#rbc_product_no').value.trim(),product_type:type,manufactured_on:$('#rbc_manufactured_on').value||null,centrifuge_no:$('#rbc_centrifuge').value.trim()||null,source_gross_weight_g:ps?.source_input_mode==='weight'?num($('#rbc_source_gross')?.value):null,source_volume_ml:ps?.source_input_mode==='direct_volume'?num($('#rbc_source_volume_direct')?.value):null,final_gross_weight_g:num($('#rbc_final_gross').value),pre_cbc_instrument:$('#rbc_pre_instrument').value||null,pre_measured_at:bangkokISO($('#rbc_pre_measured_at').value),post_cbc_instrument:$('#rbc_post_instrument').value||null,post_measured_at:bangkokISO($('#rbc_post_measured_at').value),post_adam_wbc:ps?.product_class==='ldprc'?num($('#rbc_post_adam_wbc')?.value):null,post_adam_measured_at:ps?.product_class==='ldprc'?bangkokISO($('#rbc_post_adam_measured_at')?.value):null,notes:$('#rbc_notes').value.trim()||null};
    [1,2].forEach(i=>{['hct','wbc','rbc','plt'].forEach(k=>payload[`pre${i}_${k==='hct'?'hct_pct':k}`]=num($(`#rbc_pre${i}_${k}`).value));['hct','rbc','plt'].forEach(k=>payload[`post${i}_${k==='hct'?'hct_pct':k}`]=num($(`#rbc_post${i}_${k}`).value));payload[`post${i}_wbc`]=ps?.product_class==='ldprc'?null:num($(`#rbc_post${i}_wbc`)?.value);});
    if(adminUi()&&state.currentRbcRecordId&&adminReason){payload.last_admin_edit_reason=adminReason;payload.last_admin_edit_id=crypto.randomUUID();}
    return payload;
  }
  function rbcHasEvidence(cat){return state.currentRbcEvidence.some(e=>e.category===cat);}
  function rbcPayloadHasPreResult(p){return [1,2].some(i=>['hct_pct','wbc','rbc','plt'].some(k=>p[`pre${i}_${k}`]!==null));}
  function rbcPayloadHasPostCbcResult(p,ps){return [1,2].some(i=>['hct_pct','rbc','plt'].some(k=>p[`post${i}_${k}`]!==null)||(ps?.product_class!=='ldprc'&&p[`post${i}_wbc`]!==null));}
  function stripRbcResults(p){const x={...p,pre_measured_at:null,post_measured_at:null,post_adam_wbc:null,post_adam_measured_at:null};[1,2].forEach(i=>{['hct_pct','wbc','rbc','plt'].forEach(k=>x[`pre${i}_${k}`]=null);['hct_pct','wbc','rbc','plt'].forEach(k=>x[`post${i}_${k}`]=null);});return x;}
  async function saveRbcRecord(silent=false,autoEvidence=false){
    try{
      let payload=collectRbcRecord(); if(!payload.product_no||!payload.product_type){showToast('กรุณากรอก Product No. และชนิด RBC','error');return false;}
      let id=state.currentRbcRecordId;const ps=rbcProductSetting(payload.product_type);if(autoEvidence&&!id)payload=stripRbcResults(payload);if(!autoEvidence){if(rbcPayloadHasPreResult(payload)&&!rbcHasEvidence('pre_cbc')){showToast('ผล CBC ก่อนกระบวนการต้องมีหลักฐานก่อนบันทึก','error');return false;}if(rbcPayloadHasPostCbcResult(payload,ps)&&!rbcHasEvidence('post_cbc')){showToast('ผล CBC หลังผลิต/กรองต้องมีหลักฐานก่อนบันทึก','error');return false;}if(ps?.product_class==='ldprc'&&payload.post_adam_wbc!==null&&!rbcHasEvidence('post_adam')){showToast('ผล WBC จาก ADAM ต้องมีหลักฐานก่อนบันทึก','error');return false;}}
      if(id&&adminUi()&&!payload.last_admin_edit_reason){showToast('Admin กรุณาระบุเหตุผลการแก้ไข','error');$('#rbc_admin_reason')?.focus();return false;}
      if(id){const {error}=await state.sb.from('rbc_records').update(payload).eq('id',id);if(error)throw error;}else{const {data,error}=await state.sb.from('rbc_records').insert({...payload,created_by:state.user.id}).select('id').single();if(error)throw error;id=data.id;state.currentRbcRecordId=id;}
      await reloadRbcRecords(); if(!silent)showToast('บันทึก RBC QC แล้ว','good'); if(!silent&&!autoEvidence)await renderRbcRecordForm(); return true;
    }catch(e){showToast(errText(e),'error');return false;}
  }
  async function submitRbcRecord(){
    if(!state.currentRbcRecordId)return; const ok=await saveRbcRecord(true);if(!ok)return;
    try{const {error}=await state.sb.from('rbc_records').update({status:'submitted'}).eq('id',state.currentRbcRecordId);if(error)throw error;await reloadRbcRecords();showToast('ส่งแพทย์ทบทวนแล้ว','good');location.hash=ROUTES.rbc.records;}catch(e){showToast(errText(e),'error');}
  }
  async function unlockRbcRecord(){
    const reason=prompt('ระบุเหตุผลที่ต้องปลดล็อก (จำเป็น):');if(!reason?.trim())return;
    try{const {error}=await state.sb.from('rbc_records').update({status:'draft',last_unlock_reason:reason.trim()}).eq('id',state.currentRbcRecordId);if(error)throw error;await reloadRbcRecords();showToast('ปลดล็อกแล้ว','good');await renderRbcRecordForm();}catch(e){showToast(errText(e),'error');}
  }
  async function uploadRbcEvidence(cat,inputId){
    try{const input=$('#'+inputId),file=input?.files?.[0];if(!file)return;if(file.size>10*1024*1024)throw new Error('ไฟล์ต้องไม่เกิน 10 MB');const existed=!!state.currentRbcRecordId;if(!state.currentRbcRecordId){const ok=await saveRbcRecord(true,true);if(!ok)return;}const rid=state.currentRbcRecordId;let reason=null;if(adminUi()&&existed){reason=$('#rbc_admin_reason')?.value.trim()||null;if(!reason)throw new Error('Admin กรุณาระบุเหตุผลการแก้ไขก่อนแนบหลักฐานใหม่');}const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100),path=`rbc/${rid}/${cat}/${Date.now()}_${clean}`;const {error:u}=await state.sb.storage.from('bloodqc-evidence').upload(path,file,{upsert:false,contentType:file.type||undefined});if(u)throw u;const {data,error}=await state.sb.from('rbc_evidence_files').insert({record_id:rid,category:cat,storage_path:path,original_name:file.name,mime_type:file.type,file_size:file.size,uploaded_by:state.user.id,change_reason:reason}).select('*').single();if(error){await state.sb.storage.from('bloodqc-evidence').remove([path]);throw error;}state.currentRbcEvidence.push(data);input.value='';renderRbcEvidenceLists(true,false);showToast('แนบหลักฐานแล้ว','good');}catch(e){showToast(errText(e),'error');}
  }
  async function viewRbcEvidence(id){const e=state.currentRbcEvidence.find(x=>x.id===id);if(!e)return;const {data,error}=await state.sb.storage.from('bloodqc-evidence').createSignedUrl(e.storage_path,120);if(error)showToast(errText(error),'error');else window.open(data.signedUrl,'_blank','noopener');}
  async function deleteRbcEvidence(id){const e=state.currentRbcEvidence.find(x=>x.id===id);if(!e)return;if(!confirm(`ลบหลักฐาน ${e.original_name} ?`))return;try{const {error}=await state.sb.from('rbc_evidence_files').delete().eq('id',id);if(error)throw error;const {error:s}=await state.sb.storage.from('bloodqc-evidence').remove([e.storage_path]);if(s)console.warn('storage cleanup failed',s);state.currentRbcEvidence=state.currentRbcEvidence.filter(x=>x.id!==id);renderRbcEvidenceLists(true,false);showToast('ลบหลักฐานแล้ว');}catch(e2){showToast(errText(e2),'error');}}
  function rbcDetailEvidence(cat){const rows=state.currentRbcEvidence.filter(e=>e.category===cat);return rows.length?`<div class="detail-section-evidence"><div class="detail-evidence-title">หลักฐาน</div>${rows.map(e=>`<div class="evidence-item"><span class="name evidence-name"><strong>${esc(e.original_name)}</strong><small>ผู้แนบหลักฐาน ${esc(profileName(e.uploaded_by))} · ${esc(dateTH(e.created_at))}</small>${e.change_reason?`<small class="evidence-reason">Admin: ${esc(e.change_reason)}</small>`:''}</span><button class="btn small-btn rbc-detail-ev" data-id="${e.id}">ดู</button></div>`).join('')}</div>`:'<div class="measurement-evidence-empty">ยังไม่มีหลักฐาน</div>';}
  function rbcCalcDetail(r,ps,i){const postWT=r[`post${i}_wbc_total`],unit=ps.product_class==='ldprc'?'×10⁶ cells/unit':'×10⁹ cells/unit';return `<tr><th>เครื่องที่ ${i}</th><td>${postWT==null?'–':fmt(postWT,3)+' '+unit}</td><td>${r[`run${i}_wbc_removal_pct`]==null?'–':fmt(r[`run${i}_wbc_removal_pct`],2)+'%'}</td><td>${r[`run${i}_rbc_recovery_pct`]==null?'–':fmt(r[`run${i}_rbc_recovery_pct`],2)+'%'}</td><td>${r[`post${i}_hct_pct`]==null?'–':fmt(r[`post${i}_hct_pct`],2)+'%'}</td></tr>`;}
  async function openRbcDetail(id){
    const r=state.rbcRecords.find(x=>x.id===id);if(!r)return;state.currentRbcRecordId=id;await loadRbcEvidence(id);const ps=rbcProductSetting(r.product_type),direct=ps?.source_input_mode==='direct_volume';
    const sourceMeta=r.source_recorded_by?`<span class="detail-meta-chip"><b>ผู้กรอก${direct?' Volume':'น้ำหนัก'}</b> ${esc(profileName(r.source_recorded_by))}</span><span class="detail-meta-chip"><b>บันทึก</b> ${esc(dateTH(r.source_recorded_at))}</span>`:'';
    const preMeta=r.pre_recorded_by?`<span class="detail-meta-chip"><b>ผู้กรอกผล</b> ${esc(profileName(r.pre_recorded_by))}</span><span class="detail-meta-chip"><b>บันทึกล่าสุด</b> ${esc(dateTH(r.pre_recorded_at))}</span>`:'';
    const postMeta=r.post_recorded_by?`<span class="detail-meta-chip"><b>ผู้กรอกผล</b> ${esc(profileName(r.post_recorded_by))}</span><span class="detail-meta-chip"><b>บันทึกล่าสุด</b> ${esc(dateTH(r.post_recorded_at))}</span>`:'';
    const finalMeta=r.final_weight_recorded_by?`<span class="detail-meta-chip"><b>ผู้กรอกน้ำหนัก</b> ${esc(profileName(r.final_weight_recorded_by))}</span><span class="detail-meta-chip"><b>บันทึก</b> ${esc(dateTH(r.final_weight_recorded_at))}</span>`:'';
    $('#detailDialog').innerHTML=`<div class="dialog-head"><div><h2>${esc(r.product_no)}</h2><p>${esc(r.product_type)} · Revision ${r.revision}</p></div><button class="icon-btn" id="rbcDetailClose">×</button></div><div class="detail-scroll">
      <div class="status-line">${rbcQcBadge(r.qc_status)} ${statusBadge(r.status)} ${r.deleted_at?'<span class="badge deleted">ลบแล้ว</span>':''}</div>
      <section class="detail-section"><div class="detail-section-head"><div><h3>ข้อมูลรายการ</h3><p>RBC QC</p></div><div class="detail-section-meta"><span class="detail-meta-chip"><b>ผู้สร้าง</b> ${esc(profileName(r.created_by))}</span><span class="detail-meta-chip"><b>สร้าง</b> ${esc(dateTH(r.created_at))}</span></div></div><div class="detail-grid"><div><span>ชนิด RBC</span><strong>${esc(r.product_type)}</strong></div><div><span>วันที่ผลิต</span><strong>${esc(r.manufactured_on||'–')}</strong></div><div><span>เครื่องปั่น</span><strong>${esc(r.centrifuge_no||'–')}</strong></div></div></section>
      <section class="detail-section"><div class="detail-section-head"><div><h3>${direct?'ก่อนกรอง':'ก่อนผลิต'} · ${esc(ps?.source_label||'')}</h3></div><div class="detail-section-meta">${sourceMeta}</div></div><div class="detail-grid">${direct?`<div><span>Volume จาก LIS</span><strong>${r.source_volume_ml==null?'–':fmt(r.source_volume_ml,2)+' mL'}</strong></div>`:`<div><span>น้ำหนักที่ชั่งได้</span><strong>${r.source_gross_weight_g==null?'–':fmt(r.source_gross_weight_g,2)+' g'}</strong></div><div><span>น้ำหนักถุงเปล่า</span><strong>${fmt(r.source_tare_weight_g,2)} g</strong></div><div><span>Density</span><strong>${fmt(r.source_density,3)}</strong></div><div><span>Volume</span><strong>${r.source_volume_ml==null?'–':fmt(r.source_volume_ml,2)+' mL'}</strong></div>`}</div></section>
      <section class="detail-section measurement-section"><div class="detail-section-head"><div><h3>CBC ก่อนกระบวนการ</h3><p>${r.pre_measured_at?'วันที่ตรวจ '+dateTH(r.pre_measured_at):'ยังไม่มีผล'}</p></div><div class="detail-section-meta">${preMeta}</div></div><div class="table-wrap"><table class="data-table rbc-repeat-table"><thead><tr><th></th><th>Hct</th><th>WBC K/µL</th><th>RBC M/µL</th><th>PLT K/µL</th></tr></thead><tbody>${[1,2].map(i=>`<tr><th>เครื่องที่ ${i}</th><td>${fmt(r[`pre${i}_hct_pct`],2)}</td><td>${fmt(r[`pre${i}_wbc`],4)}</td><td>${fmt(r[`pre${i}_rbc`],4)}</td><td>${fmt(r[`pre${i}_plt`],2)}</td></tr>`).join('')}</tbody></table></div>${rbcDetailEvidence('pre_cbc')}</section>
      <section class="detail-section"><div class="detail-section-head"><div><h3>หลังผลิต/กรอง · ${esc(r.product_type)}</h3></div><div class="detail-section-meta">${finalMeta}</div></div><div class="detail-grid"><div><span>น้ำหนักที่ชั่งได้</span><strong>${r.final_gross_weight_g==null?'–':fmt(r.final_gross_weight_g,2)+' g'}</strong></div><div><span>น้ำหนักถุงเปล่า</span><strong>${fmt(r.final_tare_weight_g,2)} g</strong></div><div><span>Density</span><strong>${fmt(r.final_density,3)}</strong></div><div><span>Volume</span><strong>${r.final_volume_ml==null?'–':fmt(r.final_volume_ml,2)+' mL'}</strong></div></div></section>
      <section class="detail-section measurement-section"><div class="detail-section-head"><div><h3>CBC หลังผลิต/กรอง</h3><p>${r.post_measured_at?'วันที่ตรวจ '+dateTH(r.post_measured_at):'ยังไม่มีผล'}</p></div><div class="detail-section-meta">${postMeta}</div></div><div class="table-wrap"><table class="data-table rbc-repeat-table"><thead><tr><th></th><th>Hct</th>${ps?.product_class==='ldprc'?'':'<th>WBC K/µL</th>'}<th>RBC M/µL</th><th>PLT K/µL</th></tr></thead><tbody>${[1,2].map(i=>`<tr><th>เครื่องที่ ${i}</th><td>${fmt(r[`post${i}_hct_pct`],2)}</td>${ps?.product_class==='ldprc'?'':`<td>${fmt(r[`post${i}_wbc`],4)}</td>`}<td>${fmt(r[`post${i}_rbc`],4)}</td><td>${fmt(r[`post${i}_plt`],2)}</td></tr>`).join('')}</tbody></table></div>${rbcDetailEvidence('post_cbc')}</section>
      ${ps?.product_class==='ldprc'?`<section class="detail-section measurement-section"><div class="detail-section-head"><div><h3>ADAM / WBC หลังผลิต/กรอง</h3><p>${r.post_adam_measured_at?'วันที่วัด '+dateTH(r.post_adam_measured_at):'ยังไม่มีผล'}</p></div><div class="detail-section-meta">${r.post_adam_recorded_by?`<span class="detail-meta-chip"><strong>ผู้กรอกผล</strong> ${esc(profileName(r.post_adam_recorded_by))}</span><span class="detail-meta-chip"><strong>บันทึกล่าสุด</strong> ${esc(dateTH(r.post_adam_recorded_at))}</span>`:'<span class="detail-meta-chip muted-chip">ยังไม่มีผล</span>'}</div></div><div class="detail-grid">${dcell('WBC ADAM',r.post_adam_wbc==null?'–':fmt(r.post_adam_wbc,4)+' /µL')}${dcell('Residual WBC',r.post1_wbc_total==null?'–':fmt(r.post1_wbc_total,3)+' ×10⁶ cells/unit')}</div>${rbcDetailEvidence('post_adam')}</section>`:''}
      <section class="detail-section"><div class="detail-section-head"><div><h3>ผลคำนวณ QC</h3><p>${ps?.product_class==='ldprc'?'LDPRC':'LPRC'}</p></div><div>${rbcQcBadge(r.qc_status)}</div></div><div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>Residual WBC</th><th>WBC Removal</th><th>RBC Recovery</th><th>Hct หลัง</th></tr></thead><tbody>${rbcCalcDetail(r,ps,1)}${rbcCalcDetail(r,ps,2)}</tbody></table></div></section>
      ${r.notes?`<section class="detail-section"><h3>หมายเหตุ</h3><div class="detail-note">${esc(r.notes)}</div></section>`:''}
      <section class="detail-section"><h3>ลำดับการบันทึก</h3><div class="workflow-grid"><div class="workflow-step done"><span class="workflow-dot"></span><div><strong>สร้างรายการ</strong><small>${esc(profileName(r.created_by))} · ${esc(dateTH(r.created_at))}</small></div></div><div class="workflow-step ${r.submitted_at?'done':''}"><span class="workflow-dot"></span><div><strong>ส่งตรวจทวน</strong><small>${r.submitted_at?esc(profileName(r.submitted_by))+' · '+esc(dateTH(r.submitted_at)):'–'}</small></div></div><div class="workflow-step ${r.locked_at?'done':''}"><span class="workflow-dot"></span><div><strong>แพทย์ทบทวน / LOCK</strong><small>${r.locked_at?esc(profileName(r.locked_by))+' · '+esc(dateTH(r.locked_at)):'–'}</small></div></div></div></section>
      ${reviewerUi()&&r.status==='submitted'?`<section class="detail-section reviewer-action-panel"><h3>แพทย์ทบทวน</h3><textarea id="rbc_review_note" placeholder="หมายเหตุ (จำเป็นเมื่อส่งกลับแก้ไข)"></textarea><div class="actions"><button class="btn danger" id="rbcReturn">ส่งกลับแก้ไข</button><button class="btn good" id="rbcApprove">อนุมัติและ LOCK</button></div></section>`:''}
      <div class="dialog-actions"><button class="btn" id="rbcDetailCloseBottom">ปิด</button>${staffWriteUi()&&!r.deleted_at&&r.status!=='submitted'?`<button class="btn primary" id="rbcEdit">เปิดแก้ไข</button>`:''}${adminUi()?r.deleted_at?'<button class="btn good" id="rbcRestore">กู้คืนรายการ</button>':'<button class="btn danger" id="rbcDelete">ลบรายการ</button>':''}</div></div>`;
    $$('.rbc-detail-ev').forEach(b=>b.onclick=()=>viewRbcEvidence(b.dataset.id)); const close=()=>$('#detailDialog').close();$('#rbcDetailClose').onclick=close;$('#rbcDetailCloseBottom').onclick=close;if($('#rbcEdit'))$('#rbcEdit').onclick=()=>{close();state.currentRbcRecordId=id;location.hash=ROUTES.rbc.record;};if($('#rbcReturn'))$('#rbcReturn').onclick=()=>returnRbcForCorrection(id,$('#rbc_review_note').value);if($('#rbcApprove'))$('#rbcApprove').onclick=()=>approveRbcAndLock(id,$('#rbc_review_note').value);if($('#rbcDelete'))$('#rbcDelete').onclick=()=>adminDeleteRbc(id);if($('#rbcRestore'))$('#rbcRestore').onclick=()=>adminRestoreRbc(id);$('#detailDialog').showModal();logActivity('view_record','rbc_record',id,{module:'rbc',product_no:r.product_no}).catch(()=>{});
  }
  async function approveRbcAndLock(id,note=''){if(!reviewerUi())return;if(!confirm('ยืนยันว่าตรวจทวนผลและหลักฐานแล้ว และอนุมัติให้ LOCK?'))return;try{const {error}=await state.sb.from('rbc_records').update({status:'locked',review_note:note.trim()||null}).eq('id',id);if(error)throw error;await reloadRbcRecords();$('#detailDialog').close();showToast('ทบทวนและ LOCK แล้ว','good');renderReviewQueue();}catch(e){showToast(errText(e),'error');}}
  async function returnRbcForCorrection(id,note=''){if(!reviewerUi())return;note=note.trim();if(!note){showToast('กรุณาระบุเหตุผลที่ส่งกลับแก้ไข','error');return;}try{const {error}=await state.sb.from('rbc_records').update({status:'draft',review_note:note}).eq('id',id);if(error)throw error;await reloadRbcRecords();$('#detailDialog').close();showToast('ส่งกลับให้แก้ไขแล้ว','good');renderReviewQueue();}catch(e){showToast(errText(e),'error');}}
  async function adminDeleteRbc(id){if(!adminUi())return;const reason=prompt('ระบุเหตุผลที่ลบรายการ (จำเป็น):');if(!reason?.trim())return;try{const {error}=await state.sb.from('rbc_records').update({deleted_at:new Date().toISOString(),delete_reason:reason.trim()}).eq('id',id);if(error)throw error;await reloadRbcRecords();$('#detailDialog').close();showToast('ลบรายการแล้วและเก็บ Audit ไว้','good');renderRbcPage('records');}catch(e){showToast(errText(e),'error');}}
  async function adminRestoreRbc(id){if(!adminUi())return;const reason=prompt('ระบุเหตุผลที่กู้คืนรายการ (จำเป็น):');if(!reason?.trim())return;try{const {error}=await state.sb.from('rbc_records').update({deleted_at:null,deleted_by:null,delete_reason:null,last_admin_edit_reason:reason.trim(),last_admin_edit_id:crypto.randomUUID()}).eq('id',id);if(error)throw error;await reloadRbcRecords();$('#detailDialog').close();showToast('กู้คืนรายการแล้ว','good');renderRbcPage('records');}catch(e){showToast(errText(e),'error');}}
  function renderRbcGuide(){
    const s=state.rbcSettings;
    $('#view-module').innerHTML=`<div class="page-head"><div><h1>คู่มือ RBC</h1><p class="muted">สำหรับเจ้าหน้าที่เริ่มทำ QC LPRC / LDPRC</p></div><div class="actions">${staffWriteUi()?'<button class="btn primary" id="guideRbcNew">+ บันทึก RBC</button>':''}</div></div>
      <div class="notice info"><strong>หลักการ:</strong> RBC module ใช้สำหรับ QC ทุกรายการ · ตอนนี้ใช้เป้าหมายเบื้องต้น <strong>4 ถุงต่อชนิดต่อเดือน</strong> และยังบันทึกเพิ่มเกิน 4 ถุงได้</div>
      <div class="notice warning"><strong>หลักฐานเป็นข้อบังคับ:</strong> เมื่อกรอกผล Factor VIII ต้องแนบรูปหรือ PDF ของใบผลก่อนบันทึกค่าผล</div><div class="notice warning"><strong>หลักฐานเป็นข้อบังคับ:</strong> CBC ก่อน, CBC หลัง และ ADAM (LDPRC) ต้องมีรูปหรือ PDF หลักฐานก่อนบันทึกค่าผล</div><div class="guide-grid">
        <section class="guide-card"><div class="guide-no">1</div><div><h2>ดูจำนวน QC ของเดือน</h2><p>เข้า <strong>RBC → ภาพรวม</strong> ระบบนับจำนวน QC ของทั้ง 4 ชนิดให้แยกกัน โดยตั้งเป้าหมายไว้ชนิดละ 4 ถุงต่อเดือนก่อน</p><p>เมื่อครบ 4 ระบบจะแสดงว่า “ครบเดือนนี้” แต่ยังเพิ่มรายการได้หากหน่วยต้องการทำ QC มากกว่า 4 ถุง</p></div></section>
        <section class="guide-card"><div class="guide-no">2</div><div><h2>เลือกชนิด RBC</h2><p>มี 4 ชนิดเริ่มต้น: LPRC Top&Bottom, LPRC NLR-Reveos, LDPRC Pre-Storage LR-Reveos และ LDPRC Post-Storage Immugard</p><p>กรอก Product No., วันที่ผลิต และเครื่องปั่นตามข้อมูลจริง</p></div></section>
        <section class="guide-card"><div class="guide-no">3</div><div><h2>ก่อนผลิต: 3 ชนิดแรก</h2><p>ชั่ง Whole Blood แล้วกรอกน้ำหนักเป็น g ระบบคำนวณ Volume ให้อัตโนมัติ</p><div class="guide-rule-row"><span class="guide-rule good">WB Top&Bottom 236.8 g</span><span class="guide-rule good">WB NLR 332.1 g</span><span class="guide-rule good">WB LR 353.4 g</span><span class="guide-rule warn">Density WB 1.057</span></div></div></section>
        <section class="guide-card"><div class="guide-no">4</div><div><h2>Post-Storage Immugard: ก่อนกรอง</h2><p>ถุงก่อนกรองเป็น LPRC Top&Bottom ที่อาจสุ่มมาจาก stock รอใช้ จึง <strong>ไม่ต้องชั่งใหม่</strong></p><div class="guide-callout">เปิด LIS → อ่าน Volume (mL) ของ LPRC Top&Bottom → กรอกช่อง “Volume จาก LIS” โดยตรง</div></div></section>
        <section class="guide-card"><div class="guide-no">5</div><div><h2>กรอก CBC ก่อนกระบวนการ</h2><p>กรอกผลจากเครื่องที่ 1 และเครื่องที่ 2 ได้แก่ Hct, WBC, RBC และ PLT พร้อมวัน-เวลาที่ตรวจจริง</p><p>แนบรูป/ไฟล์ผลไว้ในหัวข้อ CBC ก่อนกระบวนการ ระบบเก็บผู้กรอกผลและผู้แนบหลักฐานแยกกัน</p></div></section>
        <section class="guide-card"><div class="guide-no">6</div><div><h2>ชั่งผลิตภัณฑ์หลังผลิต/กรอง</h2><div class="guide-rule-row"><span class="guide-rule good">LPRC T&B 36.2 g</span><span class="guide-rule good">LPRC NLR 39.2 g</span><span class="guide-rule good">LDPRC Pre 45.3 g</span><span class="guide-rule good">LDPRC Post 34.3 g</span></div><p>Density: LPRC = 1.06, LDPRC = 1.09 ระบบใช้ตามชนิดผลิตภัณฑ์และคำนวณ Volume หลังให้อัตโนมัติ</p></div></section>
        <section class="guide-card"><div class="guide-no">7</div><div><h2>กรอกผลหลังผลิต/กรอง</h2><p><strong>LPRC:</strong> กรอก CBC เครื่องที่ 1 และเครื่องที่ 2 รวม Hct, WBC, RBC และ PLT ตามผลจากเครื่อง CBC</p><p><strong>LDPRC:</strong> CBC หลังกรองกรอก Hct, RBC และ PLT ส่วน <strong>WBC ให้วัดจาก ADAM แบบเดียวกับ Platelet</strong> แล้วกรอกค่า WBC (/µL) ในหัวข้อ ADAM แยก พร้อมวัน-เวลาและหลักฐานของ ADAM</p></div></section>
        <section class="guide-card"><div class="guide-no">8</div><div><h2>ระบบคำนวณ QC</h2><p>ระบบคำนวณ Total WBC, Total RBC, Total PLT, %WBC Removal และ %RBC Recovery ให้อัตโนมัติ</p><div class="guide-callout"><strong>LPRC:</strong> Residual WBC &lt; ${fmt(s.lprc_residual_wbc_max_x10e9,1)} ×10⁹, RBC Recovery &gt; ${fmt(s.lprc_rbc_recovery_min_pct,0)}%, Hct ${fmt(s.hct_min_pct,0)}–${fmt(s.hct_max_pct,0)}%<br><strong>LDPRC:</strong> Residual WBC &lt; ${fmt(s.ldprc_residual_wbc_max_x10e6,1)} ×10⁶, RBC Recovery &gt; ${fmt(s.ldprc_rbc_recovery_min_pct,0)}%, Hct ${fmt(s.hct_min_pct,0)}–${fmt(s.hct_max_pct,0)}%</div></div></section>
        <section class="guide-card"><div class="guide-no">9</div><div><h2>บันทึกต่างวัน/ต่างคนได้</h2><p>คนหนึ่งสร้างรายการหรือกรอกน้ำหนัก อีกคนกรอก CBC ก่อน อีกคนกรอก CBC หลัง และใน LDPRC อีกคนสามารถกรอก ADAM ภายหลังได้ ระบบบันทึกชื่อและเวลาของแต่ละส่วนตาม Account ที่ทำจริง</p></div></section>
        <section class="guide-card"><div class="guide-no">10</div><div><h2>ส่งแพทย์ทบทวน</h2><p>เมื่อข้อมูลและหลักฐานครบ กด <strong>ส่งแพทย์ทบทวน</strong> Reviewer ตรวจผลและหลักฐาน แล้วเลือก Approve/LOCK หรือส่งกลับแก้ไขพร้อมเหตุผล</p><p>ถ้าต้องแก้หลัง LOCK ให้ Admin แก้พร้อมเหตุผลและหลักฐานใหม่ ระบบเก็บ Revision และ Audit Log</p></div></section>
      </div>`;
    if($('#guideRbcNew'))$('#guideRbcNew').onclick=()=>{state.currentRbcRecordId=null;location.hash=ROUTES.rbc.record;};bindRouteButtons($('#view-module'));
  }
  function renderRbcSettings(){
    if(!adminUi()){location.hash=ROUTES.rbc.dashboard;return;}const s=state.rbcSettings;
    $('#view-module').innerHTML=`<div class="page-head"><div><h1>ตั้งค่า RBC QC</h1><p class="muted">LPRC / LDPRC</p></div></div><div class="panel"><h2>เกณฑ์ QC</h2><div class="form-grid">${rbcField('LPRC Residual WBC สูงสุด (×10⁹)','rs_lprc_wbc',s.lprc_residual_wbc_max_x10e9,'number',false,false,'0.1')}${rbcField('LPRC RBC Recovery ขั้นต่ำ (%)','rs_lprc_rec',s.lprc_rbc_recovery_min_pct,'number',false,false,'0.1')}${rbcField('LDPRC Residual WBC สูงสุด (×10⁶)','rs_ldprc_wbc',s.ldprc_residual_wbc_max_x10e6,'number',false,false,'0.1')}${rbcField('LDPRC RBC Recovery ขั้นต่ำ (%)','rs_ldprc_rec',s.ldprc_rbc_recovery_min_pct,'number',false,false,'0.1')}${rbcField('Hct ขั้นต่ำ (%)','rs_hct_min',s.hct_min_pct,'number',false,false,'0.1')}${rbcField('Hct สูงสุด (%)','rs_hct_max',s.hct_max_pct,'number',false,false,'0.1')}<div class="field span2"><label>&nbsp;</label><label class="inline-check"><input id="rs_two" type="checkbox" ${s.require_two_measurements?'checked':''}> ต้องมีผลครบ 2 ครั้ง</label><label class="inline-check"><input id="rs_pre_ev" type="checkbox" checked disabled> บังคับหลักฐาน CBC ก่อน</label><label class="inline-check"><input id="rs_post_ev" type="checkbox" checked disabled> บังคับหลักฐาน CBC หลัง</label><label class="inline-check"><input id="rs_post_adam_ev" type="checkbox" checked disabled> บังคับหลักฐาน ADAM หลัง (LDPRC)</label></div></div><div class="actions"><button class="btn primary" id="saveRbcSettings">บันทึกเกณฑ์</button></div></div>
      <div class="panel"><h2>น้ำหนักถุง / Density</h2><div class="table-wrap"><table class="data-table rbc-product-settings"><thead><tr><th>ผลิตภัณฑ์</th><th>ก่อนกระบวนการ</th><th>Tare ก่อน</th><th>Density ก่อน</th><th>Tare หลัง</th><th>Density หลัง</th><th></th></tr></thead><tbody>${state.rbcProductSettings.map(p=>`<tr data-type="${esc(p.product_type)}"><td><strong>${esc(p.product_type)}</strong><small>${esc(rbcProductClassTH(p.product_class))}</small></td><td>${esc(p.source_label)}${p.source_input_mode==='direct_volume'?'<br><span class="badge">Volume จาก LIS</span>':''}</td><td>${p.source_input_mode==='direct_volume'?'–':`<input class="rps-source-tare" type="number" step="0.01" value="${esc(p.source_tare_weight_g)}">`}</td><td>${p.source_input_mode==='direct_volume'?'–':`<input class="rps-source-density" type="number" step="0.001" value="${esc(p.source_density)}">`}</td><td><input class="rps-final-tare" type="number" step="0.01" value="${esc(p.final_tare_weight_g)}"></td><td><input class="rps-final-density" type="number" step="0.001" value="${esc(p.final_density)}"></td><td><button class="btn small-btn rps-save">บันทึก</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#saveRbcSettings').onclick=saveRbcSettings;$$('.rps-save').forEach(b=>b.onclick=()=>saveRbcProductSetting(b.closest('tr')));
  }
  async function saveRbcSettings(){
    try{const payload={lprc_residual_wbc_max_x10e9:num($('#rs_lprc_wbc').value),lprc_rbc_recovery_min_pct:num($('#rs_lprc_rec').value),ldprc_residual_wbc_max_x10e6:num($('#rs_ldprc_wbc').value),ldprc_rbc_recovery_min_pct:num($('#rs_ldprc_rec').value),hct_min_pct:num($('#rs_hct_min').value),hct_max_pct:num($('#rs_hct_max').value),require_two_measurements:$('#rs_two').checked,require_pre_evidence:true,require_post_evidence:true,require_post_adam_evidence:true};if(payload.hct_min_pct>payload.hct_max_pct)throw new Error('Hct ขั้นต่ำต้องไม่มากกว่าค่าสูงสุด');const {error}=await state.sb.from('rbc_qc_settings').update(payload).eq('id',1);if(error)throw error;await loadRbcModuleData();showToast('บันทึก RBC settings แล้ว','good');renderRbcSettings();}catch(e){showToast(errText(e),'error');}
  }
  async function saveRbcProductSetting(row){
    try{const type=row.dataset.type,p=rbcProductSetting(type),payload={final_tare_weight_g:num($('.rps-final-tare',row).value),final_density:num($('.rps-final-density',row).value)};if(p.source_input_mode==='weight'){payload.source_tare_weight_g=num($('.rps-source-tare',row).value);payload.source_density=num($('.rps-source-density',row).value);}if(payload.final_tare_weight_g==null||payload.final_tare_weight_g<0||payload.final_density==null||payload.final_density<=0)throw new Error('ตรวจค่าหลังผลิต/กรอง');if(p.source_input_mode==='weight'&&(payload.source_tare_weight_g==null||payload.source_tare_weight_g<0||payload.source_density==null||payload.source_density<=0))throw new Error('ตรวจค่าก่อนผลิต');const {error}=await state.sb.from('rbc_product_settings').update(payload).eq('product_type',type);if(error)throw error;await loadRbcModuleData();showToast(`บันทึก ${type} แล้ว`,'good');renderRbcSettings();}catch(e){showToast(errText(e),'error');}
  }


  init().catch(e=>{console.error(e);showToast(errText(e),'error');showLogin();});
})();
