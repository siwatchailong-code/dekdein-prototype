/* =========================================================================
   dekdein. — app interactions
   Auth + profile are wired to Supabase (see supabase/schema.sql).
   Everything else (jobs, chat, ranking, challenges, matching) is still
   static prototype data — not connected to a backend. See the project
   README / delivery notes for exactly which parts are real vs. prototype.
   ========================================================================= */

(function () {
  'use strict';

  var screens = Array.prototype.slice.call(document.querySelectorAll('.screen-page'));
  var navBar = document.getElementById('navBar');
  var chatBar = document.getElementById('chatBar');
  var toastEl = document.getElementById('toast');
  var history_ = ['splash'];
  var current = 'splash';

  /* ---------------- Supabase client ---------------- */
  var ENV = window.__ENV__ || {};
  var sb = null;
  if (window.supabase && ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY) {
    sb = window.supabase.createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);
  } else {
    console.error(
      'Missing Supabase config. Copy env.example.js to env.js and fill in ' +
      'your project URL + anon key (local dev), or set SUPABASE_URL / ' +
      'SUPABASE_ANON_KEY as environment variables in Vercel (production).'
    );
  }

  /* ---------------- auth state ---------------- */
  var currentUser = null;     // supabase auth user object
  var currentProfile = null;  // row from public.profiles
  var authMode = 'login';     // 'login' | 'signup'
  var signupRole = 'customer'; // 'customer' | 'rider' (freelancer)
  var selectedLocation = null;
  var locationMapInstance = null;
  var locationMarker = null;
  var currentMatch = null;
  var chatChannel = null;
  var viewingSelfProfile = false;
  var awaitingCallback = false; // true while /auth/callback is resolving an OAuth session
  var PUBLIC_SCREENS = ['splash', 'login'];

  /* ---------------- toast ---------------- */
  var toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ---------------- router ---------------- */
  function screenById(id) {
    return screens.filter(function (s) { return s.dataset.screen === id; })[0];
  }

  function render(id) {
    screens.forEach(function (s) { s.classList.toggle('active', s.dataset.screen === id); });

    var el = screenById(id);
    var navId = el ? el.dataset.nav : null;

    if (navId) {
      navBar.style.display = 'flex';
      Array.prototype.slice.call(navBar.querySelectorAll('a')).forEach(function (a) {
        a.classList.toggle('active', a.dataset.navid === navId);
      });
    } else {
      navBar.style.display = 'none';
    }

    chatBar.style.display = (id === 'chat') ? 'flex' : 'none';

    var stage = screenById(id);
    if (stage) stage.scrollTop = 0;

    current = id;
    if (id === 'location') {
      setTimeout(function () { initLocationMap(); if (locationMapInstance) locationMapInstance.invalidateSize(); }, 0);
    }
    if (id === 'match') loadProviders();
    if (id === 'provider-request') loadProviderRequests();
    if (id === 'freelancer-verify') renderVerificationStatus();
    if (id === 'my-jobs') loadMyMatches();
    if (id === 'chat') loadChat();
  }

  function go(id, opts) {
    opts = opts || {};
    if (!screenById(id)) return;

    // route guard: every screen except splash/login requires a real session
    if (PUBLIC_SCREENS.indexOf(id) === -1 && !currentUser) {
      toast('กรุณาเข้าสู่ระบบก่อนใช้งาน');
      id = 'login';
      opts = { replace: opts.replace };
    }

    if (id === 'provider-profile' && !opts.keepSelfProfile) restoreDemoProfile();

    if (!opts.replace) history_.push(id);
    else history_[history_.length - 1] = id;
    render(id);
  }

  function goBack() {
    if (history_.length > 1) {
      history_.pop();
      render(history_[history_.length - 1]);
    } else {
      render('home');
    }
  }

  /* ---------------- chips (generic toggle-active-among-siblings) ---------------- */
  function initChips() {
    document.querySelectorAll('[data-chipgroup]').forEach(function (group) {
      group.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip || !group.contains(chip)) return;
        Array.prototype.slice.call(group.querySelectorAll('.chip')).forEach(function (c) {
          c.classList.remove('active');
        });
        chip.classList.add('active');

        // My Jobs chips additionally filter which section is visible
        if (group.dataset.chipgroup === 'myjobs') {
          var filter = chip.dataset.filter;
          document.getElementById('myJobsActive').style.display = (filter === 'active') ? '' : 'none';
          document.getElementById('myJobsDone').style.display = (filter === 'done') ? '' : 'none';
          document.getElementById('myJobsCancelled').style.display = (filter === 'cancelled') ? '' : 'none';
        }
      });
    });
  }

  /* ---------------- home search: live filter of job list by title ---------------- */
  function initHomeSearch() {
    var input = document.getElementById('homeSearch');
    var list = document.getElementById('homeJobList');
    if (!input || !list) return;
    var cards = Array.prototype.slice.call(list.querySelectorAll('.job'));
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      cards.forEach(function (card) {
        var title = card.querySelector('b').textContent.toLowerCase();
        card.style.display = title.indexOf(q) !== -1 ? '' : 'none';
      });
    });
  }

  /* ---------------- post-job image upload (client-side preview only) ---------------- */
  function initImageUpload() {
    var trigger = document.getElementById('picUploadTrigger');
    var input = document.getElementById('picUploadInput');
    if (!trigger || !input) return;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var gallery = document.getElementById('postJobGallery');
      var emptySlot = Array.prototype.slice.call(gallery.querySelectorAll('.pic'))
        .filter(function (p) { return p !== trigger && !p.querySelector('img'); })[0];
      if (!emptySlot) { toast('เพิ่มรูปได้สูงสุด 2 รูปใน prototype นี้'); input.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = document.createElement('img');
        img.src = ev.target.result;
        emptySlot.textContent = '';
        emptySlot.style.background = 'none';
        emptySlot.appendChild(img);
      };
      reader.readAsDataURL(file);
      input.value = '';
    });
  }

  /* ---------------- post-job flow bottom sheet ---------------- */
  var flowOptions = [
    { title: 'ให้คนรับงานเสนอราคา', desc: 'เหมาะกับงานที่ยังไม่แน่ใจราคา' },
    { title: 'ระบุงบประมาณเอง', desc: 'เหมาะกับงานที่กำหนดงบไว้แล้ว' }
  ];
  function openFlow() {
    var modal = document.getElementById('flowModal');
    var opts = document.getElementById('flowOptions');
    var next = document.getElementById('flowNext');
    opts.innerHTML = '';
    flowOptions.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'flow-option';
      b.innerHTML = '<span><strong>' + o.title + '</strong><span>' + o.desc + '</span></span><b>›</b>';
      b.addEventListener('click', function () {
        Array.prototype.slice.call(opts.querySelectorAll('.flow-option')).forEach(function (x) {
          x.style.borderColor = '#eceff2';
        });
        b.style.borderColor = '#ff7a1a';
        next.disabled = false;
      });
      opts.appendChild(b);
    });
    next.disabled = true;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }
  function closeFlow() {
    var modal = document.getElementById('flowModal');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
  document.getElementById('flowNext').addEventListener('click', function () {
    closeFlow();
    toast('บันทึกตัวเลือกแล้ว กรุณากรอกรายละเอียดงานต่อ');
    go('post-job');
  });
  document.getElementById('flowModal').addEventListener('click', function (e) {
    if (e.target.id === 'flowModal') closeFlow();
  });

  /* ---------------- real location / map ---------------- */
  function updateLocationUI() {
    var nameEl = document.getElementById('selectedLocationName');
    var coordsEl = document.getElementById('selectedLocationCoords');
    var mapLabel = document.getElementById('locationMapLabel');
    if (!selectedLocation) {
      if (nameEl) nameEl.textContent = 'ยังไม่ได้เลือกสถานที่';
      if (coordsEl) coordsEl.textContent = 'ค้นหาสถานที่ ใช้ตำแหน่งปัจจุบัน หรือเลือกจากแผนที่';
      return;
    }
    var lat = Number(selectedLocation.lat).toFixed(6);
    var lng = Number(selectedLocation.lng).toFixed(6);
    if (nameEl) nameEl.textContent = selectedLocation.name || 'ตำแหน่งที่เลือก';
    if (coordsEl) coordsEl.textContent = lat + ', ' + lng;
    if (mapLabel) mapLabel.textContent = selectedLocation.name || (lat + ', ' + lng);
  }

  function setSelectedLocation(lat, lng, name, zoom) {
    selectedLocation = { lat: Number(lat), lng: Number(lng), name: name || 'ตำแหน่งที่เลือก' };
    updateLocationUI();
    initLocationMap();
    if (locationMapInstance) {
      locationMapInstance.setView([selectedLocation.lat, selectedLocation.lng], zoom || 15);
      if (!locationMarker) locationMarker = L.marker([selectedLocation.lat, selectedLocation.lng]).addTo(locationMapInstance);
      else locationMarker.setLatLng([selectedLocation.lat, selectedLocation.lng]);
    }
  }

  function initLocationMap() {
    var mapEl = document.getElementById('locationMap');
    if (!mapEl || locationMapInstance || !window.L) return;
    locationMapInstance = L.map(mapEl, { zoomControl: true }).setView([15.2448, 104.8473], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(locationMapInstance);
    locationMapInstance.on('click', function (e) {
      setSelectedLocation(e.latlng.lat, e.latlng.lng, 'ตำแหน่งที่เลือกจากแผนที่', 16);
    });
    setTimeout(function () { locationMapInstance.invalidateSize(); }, 50);
  }

  function reverseGeocode(lat, lng) {
    return fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng), {
      headers: { 'Accept': 'application/json' }
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      var name = data && (data.display_name || data.name);
      setSelectedLocation(lat, lng, name || 'ตำแหน่งปัจจุบัน', 16);
      return selectedLocation;
    });
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { toast('เบราว์เซอร์นี้ไม่รองรับตำแหน่งปัจจุบัน'); return; }
    toast('กำลังค้นหาตำแหน่ง...');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      setSelectedLocation(lat, lng, 'ตำแหน่งปัจจุบัน', 16);
      reverseGeocode(lat, lng).catch(function () { /* coordinates still usable */ });
    }, function (err) {
      toast('ใช้ตำแหน่งปัจจุบันไม่ได้: ' + (err.message || 'กรุณาอนุญาตสิทธิ์ตำแหน่ง'));
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function searchLocation() {
    var input = document.getElementById('locationSearchInput');
    var q = input && input.value.trim();
    if (!q) { toast('กรุณาพิมพ์ชื่อสถานที่'); return; }
    toast('กำลังค้นหาสถานที่...');
    fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(q), {
      headers: { 'Accept': 'application/json' }
    }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      if (!rows || !rows.length) { toast('ไม่พบสถานที่ ลองค้นหาคำอื่น'); return; }
      var row = rows[0];
      setSelectedLocation(row.lat, row.lon, row.display_name || q, 16);
    }).catch(function () { toast('ค้นหาสถานที่ไม่สำเร็จ กรุณาลองใหม่'); });
  }

  /* ---------------- matching / chat: production schema ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];
    });
  }

  function renderProviders(rows) {
    var stage = screenById('match');
    if (!stage) return;
    var old = stage.querySelectorAll('.match-card');
    old.forEach(function (n) { n.remove(); });
    var anchor = stage.querySelector('p.small');
    var frag = document.createDocumentFragment();
    rows.forEach(function (row) {
      var card = document.createElement('div'); card.className = 'match-card card';
      var name = row.name || row.full_name || 'ผู้ให้บริการ';
      card.innerHTML = '<div class="row gap10"><div class="avatar"></div><div><b>' + escapeHtml(name) + '</b><div class="small">ผู้ให้บริการ</div><div class="rating">พร้อมรับงาน</div></div><span class="status" style="margin-left:auto">● ออนไลน์</span></div><div class="row between" style="margin-top:10px"><span class="small">เลือกเพื่อเริ่มพูดคุย</span><button class="secondary" data-action="match-provider" data-provider-id="' + escapeHtml(row.id) + '" data-name="' + escapeHtml(name) + '">แมตช์</button></div>';
      frag.appendChild(card);
    });
    if (!rows.length) {
      var empty = document.createElement('div'); empty.className = 'card match-card';
      empty.innerHTML = '<b>ยังไม่มีฟรีแลนซ์ที่พร้อมรับงาน</b><p class="small">ลองใหม่อีกครั้งภายหลัง</p>';
      frag.appendChild(empty);
    }
    anchor.after(frag);
  }

  function loadProviders() {
    if (!sb || !currentUser) return;
    sb.from('profiles').select('id,name,full_name,role,is_freelancer,availability_status,identity_verified').eq('is_freelancer',true).eq('availability_status','available').eq('identity_verified',true).neq('id', currentUser.id)
      .then(function (res) {
        if (res.error) { toast('โหลดรายชื่อผู้ให้บริการไม่สำเร็จ: ' + res.error.message); return; }
        renderProviders(res.data || []);
      });
  }

  function createMatch(el) {
    if (!sb || !currentUser) return;
    var providerId = el.dataset.providerId;
    if (!providerId) { toast('ไม่พบรหัสผู้ให้บริการ'); return; }
    el.disabled = true; el.textContent = 'กำลังส่ง...';
    sb.rpc('create_match_request', { p_provider_id: providerId }).then(function (res) {
      if (res.error) throw res.error;
      currentMatch = res.data;
      go('chat');
    }).catch(function (err) {
      toast('สร้าง MATCH ไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด'));
    }).finally(function () { el.disabled = false; el.textContent = 'แมตช์'; });
  }

  function matchTerminal(status) { return ['completed','cancelled','declined'].indexOf(status) !== -1; }

  function loadMyMatches() {
    if (!sb || !currentUser) return;
    sb.from('matches').select('*').or('customer_id.eq.' + currentUser.id + ',provider_id.eq.' + currentUser.id).order('updated_at',{ascending:false})
      .then(function (res) {
        if (res.error) { toast('โหลดงานไม่สำเร็จ: ' + res.error.message); return; }
        var active = document.getElementById('myJobsActive');
        var done = document.getElementById('myJobsDone');
        var cancelled = document.getElementById('myJobsCancelled');
        var rows = res.data || [];
        var activeRows = rows.filter(function (m) { return !matchTerminal(m.status); });
        var doneRows = rows.filter(function (m) { return m.status === 'completed'; });
        var cancelledRows = rows.filter(function (m) { return m.status === 'cancelled' || m.status === 'declined'; });
        function card(m) { return '<div class="card" style="margin-top:8px" data-action="open-match" data-match-id="' + m.id + '"><div class="row between"><span class="tag">' + escapeHtml(m.status || 'pending') + '</span><span class="small">' + new Date(m.updated_at || m.created_at).toLocaleString('th-TH') + '</span></div><div class="job" style="margin-top:11px"><div class="thumb"></div><div><b>MATCH</b><p>' + escapeHtml(m.status || 'pending') + '</p></div><span class="price">' + (m.agreed_price != null ? '฿' + m.agreed_price : (m.proposed_price != null ? '฿' + m.proposed_price : 'รอราคา')) + '</span></div></div>'; }
        active.innerHTML = activeRows.length ? activeRows.map(card).join('') : '<p class="small" style="text-align:center;margin-top:24px">ยังไม่มีงานที่กำลังดำเนินการ</p>';
        done.innerHTML = doneRows.length ? '<div class="section-title">เพิ่งจบงาน</div>' + doneRows.map(card).join('') : '<p class="small" style="text-align:center;margin-top:24px">ยังไม่มีงานที่จบแล้ว</p>';
        cancelled.innerHTML = cancelledRows.length ? cancelledRows.map(card).join('') : '<p class="small" style="text-align:center;margin-top:24px">ยังไม่มีงานที่ยกเลิก</p>';
      });
  }

  function openMatch(matchId) {
    if (!sb) return;
    sb.from('matches').select('*').eq('id',matchId).single().then(function (res) {
      if (res.error) { toast('เปิด MATCH ไม่สำเร็จ: ' + res.error.message); return; }
      currentMatch = res.data; go('chat');
    });
  }

  function renderChatMessage(msg) {
    var messages = document.getElementById('chatMessages');
    if (!messages || document.getElementById('msg-' + msg.id)) return;
    if (msg.kind === 'price_proposal') {
      var price = msg.meta && msg.meta.price;
      var status = msg.meta && msg.meta.status || 'pending';
      var mine = currentUser && msg.sender_id === currentUser.id;
      var box = document.createElement('div'); box.className = 'offer'; box.id = 'msg-' + msg.id;
      box.innerHTML = '<div class="small">เสนอราคา</div><b>฿' + escapeHtml(price) + '</b><p class="small">สถานะ: ' + escapeHtml(status) + '</p>' + (!mine && currentMatch && currentMatch.customer_id === currentUser.id && status === 'pending' ? '<div class="row gap8"><button class="primary" style="height:40px;flex:1" data-action="respond-price" data-message-id="' + msg.id + '" data-accept="true">รับราคา</button><button class="secondary" style="flex:1" data-action="respond-price" data-message-id="' + msg.id + '" data-accept="false">ปฏิเสธ</button></div>' : '');
      messages.appendChild(box); return;
    }
    var bubble = document.createElement('div');
    bubble.className = 'bubble' + (currentUser && msg.sender_id === currentUser.id ? ' me' : '');
    bubble.id = 'msg-' + msg.id;
    var t = msg.created_at ? new Date(msg.created_at) : new Date();
    bubble.innerHTML = escapeHtml(msg.text) + '<div class="time">' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + '</div>';
    messages.appendChild(bubble);
  }

  function loadChat() {
    if (!sb || !currentMatch) { if (current === 'chat') toast('ยังไม่ได้เลือก MATCH'); return; }
    var messages = document.getElementById('chatMessages'); messages.innerHTML = '<div class="system">กำลังโหลดแชท...</div>';
    sb.from('chat_messages').select('*').eq('match_id',currentMatch.id).order('created_at',{ascending:true}).then(function (res) {
      if (res.error) { messages.innerHTML = ''; toast('โหลดแชทไม่สำเร็จ: ' + res.error.message); return; }
      messages.innerHTML = '<div class="system">แชท MATCH</div>';
      (res.data || []).forEach(renderChatMessage);
      subscribeChat();
      messages.scrollTop = messages.scrollHeight;
    });
  }

  function subscribeChat() {
    if (!sb || !currentMatch) return;
    if (chatChannel) { sb.removeChannel(chatChannel); chatChannel = null; }
    chatChannel = sb.channel('match-chat-' + currentMatch.id).on('postgres_changes',{event:'*',schema:'public',table:'chat_messages',filter:'match_id=eq.' + currentMatch.id},function (payload) {
      if (payload.eventType === 'INSERT') renderChatMessage(payload.new);
      else if (payload.eventType === 'UPDATE') { var old = document.getElementById('msg-' + payload.new.id); if (old) old.remove(); renderChatMessage(payload.new); }
    }).subscribe();
  }

  function sendChatMessage() {
    var input = document.getElementById('chatInput'); var text = input.value.trim();
    if (!text || !currentMatch || !sb || !currentUser) { if (!currentMatch) toast('ยังไม่ได้เลือก MATCH'); return; }
    var senderRole = currentMatch.customer_id === currentUser.id ? 'customer' : (currentMatch.provider_id === currentUser.id ? 'rider' : null);
    if (!senderRole) { toast('ไม่มีสิทธิ์ส่งข้อความใน MATCH นี้'); return; }
    input.disabled = true;
    sb.from('chat_messages').insert({match_id:currentMatch.id,sender_role:senderRole,sender_id:currentUser.id,text:text,kind:'text'}).select().single().then(function (res) {
      if (res.error) throw res.error;
      renderChatMessage(res.data); input.value='';
    }).catch(function (err) { toast('ส่งข้อความไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด')); }).finally(function(){ input.disabled=false; input.focus(); });
  }

  function proposePrice() {
    if (!currentMatch || !sb) { toast('ยังไม่ได้เลือก MATCH'); return; }
    var raw = window.prompt('เสนอราคา (บาท)'); if (raw == null) return;
    var price = Number(raw); if (!Number.isFinite(price) || price <= 0) { toast('กรุณาระบุราคาที่ถูกต้อง'); return; }
    sb.rpc('propose_match_price',{p_match_id:currentMatch.id,p_price:price}).then(function(res){ if(res.error) throw res.error; renderChatMessage(res.data); }).catch(function(err){ toast('เสนอราคาไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด')); });
  }

  function respondPrice(el) {
    // 'accept-offer' is also bound to this (the legacy/demo chatOffer
    // card's static button, which carries no data-message-id) — without
    // this guard, clicking it whenever sb is unconfigured or no real
    // match is loaded throws (sb is null) instead of failing safely like
    // every other real action here does.
    if (!sb || !currentMatch || !el.dataset.messageId) { toast('ยังไม่ได้เลือก MATCH'); return; }
    sb.rpc('respond_price_proposal',{p_message_id:el.dataset.messageId,p_accept:el.dataset.accept === 'true'}).then(function(res){ if(res.error) throw res.error; var old=document.getElementById('msg-'+el.dataset.messageId); if(old) old.remove(); renderChatMessage(res.data); return openMatch(currentMatch.id); }).catch(function(err){ toast('ตอบข้อเสนอไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด')); });
  }

  function loadProviderRequests() {
    if (!sb || !currentUser) return;
    sb.from('matches').select('*').eq('provider_id',currentUser.id).eq('status','pending').order('created_at',{ascending:true}).limit(1).maybeSingle().then(function(res){
      if (res.error) { toast('โหลดคำของานไม่สำเร็จ: ' + res.error.message); return; }
      currentMatch = res.data || null;
      var stage = screenById('provider-request');
      var card = stage.querySelector('.card');
      if (!currentMatch) {
        card.innerHTML='<div class="title" style="font-size:21px">ยังไม่มีคำขอใหม่</div><p class="small">เมื่อมีลูกค้าส่ง MATCH มา งานจะปรากฏที่นี่</p>';
        return;
      }
      card.innerHTML='<div class="row between"><span class="tag">คำขอใหม่</span><span class="small">รอการตอบรับ</span></div><div class="title" style="font-size:21px">คำขอ MATCH ใหม่</div><div class="row gap8 small">ลูกค้าต้องการเริ่มพูดคุยรายละเอียดงาน</div><div class="row between" style="margin-top:14px"><div><div class="small">ข้อเสนอราคา</div><b class="orange" style="font-size:23px">' + (currentMatch.proposed_price != null ? '฿' + escapeHtml(currentMatch.proposed_price) : 'ยังไม่เสนอ') + '</b></div><div class="small" style="text-align:right">สถานะ<br><b>' + escapeHtml(currentMatch.status) + '</b></div></div><div class="row gap8" style="margin-top:14px"><button class="secondary" style="flex:1;background:#f1f2f4;color:#656b74" data-action="skip-request">ปฏิเสธ</button><button class="primary" style="flex:1" data-action="accept-request">รับงาน</button></div>';
    });
  }

  function acceptMatch() {
    if (!currentMatch || !sb) { toast('ยังไม่มีคำขอที่เลือก'); return; }
    sb.rpc('accept_match',{p_match_id:currentMatch.id}).then(function(res){ if(res.error) throw res.error; currentMatch=res.data; toast('รับงานสำเร็จ'); go('chat'); }).catch(function(err){ toast('รับงานไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด')); });
  }
  function declineMatch() {
    if (!currentMatch || !sb) { toast('ยังไม่มีคำขอที่เลือก'); return; }
    sb.rpc('decline_match',{p_match_id:currentMatch.id}).then(function(res){ if(res.error) throw res.error; currentMatch=null; toast('ปฏิเสธคำขอแล้ว'); loadProviderRequests(); }).catch(function(err){ toast('ปฏิเสธคำขอไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด')); });
  }

  /* ---------------- auth: UI helpers ---------------- */
  var authErrorEl = document.getElementById('authError');
  var authSuccessEl = document.getElementById('authSuccess');

  function hideAuthMessages() {
    authErrorEl.style.display = 'none';
    authSuccessEl.style.display = 'none';
  }
  function showAuthError(text) {
    authSuccessEl.style.display = 'none';
    authErrorEl.textContent = text;
    authErrorEl.style.display = '';
  }
  function showAuthSuccess(text) {
    authErrorEl.style.display = 'none';
    authSuccessEl.textContent = text;
    authSuccessEl.style.display = '';
  }

  function setAuthMode(mode) {
    authMode = mode;
    var isSignup = mode === 'signup';
    document.getElementById('authNameField').style.display = isSignup ? '' : 'none';
    var rolePicker = document.getElementById('signupRolePicker');
    if (rolePicker) rolePicker.style.display = isSignup ? '' : 'none';
    document.getElementById('authSubmitBtn').textContent = isSignup ? 'สร้างบัญชี' : 'เข้าสู่ระบบ';
    document.getElementById('authToggleText').textContent = isSignup ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?';
    document.getElementById('authToggleLink').textContent = isSignup ? 'เข้าสู่ระบบ' : 'สร้างบัญชี';
    hideAuthMessages();
    setSignupRole(signupRole);
  }

  function setSignupRole(role) {
    signupRole = role === 'rider' ? 'rider' : 'customer';
    Array.prototype.slice.call(document.querySelectorAll('[data-action="select-signup-role"]')).forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.role === signupRole);
    });
    var note = document.getElementById('freelancerVerificationNote');
    if (note) note.style.display = signupRole === 'rider' ? '' : 'none';
  }

  var NOT_CONFIGURED_MSG =
    'ยังไม่ได้ตั้งค่า Supabase — ตรวจสอบ env.js (local) หรือ Environment Variables ' +
    'ใน Vercel (production) แล้ว deploy ใหม่';

  // translate the handful of Supabase Auth errors users actually hit
  function mapAuthError(error) {
    var msg = (error && error.message) || '';
    if (/Invalid login credentials/i.test(msg)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (/User already registered/i.test(msg)) return 'อีเมลนี้ถูกใช้สมัครสมาชิกแล้ว';
    if (/Password should be at least/i.test(msg)) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
    if (/Unable to validate email address/i.test(msg)) return 'รูปแบบอีเมลไม่ถูกต้อง';
    if (/Email not confirmed/i.test(msg)) return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
    return msg || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }

  /* ---------------- auth: profile ---------------- */
  function loadProfile(userId) {
    return sb.from('profiles').select('*').eq('id', userId).single().then(function (res) {
      if (!res.error && res.data) { currentProfile = res.data; return res.data; }
      // the profiles row is created by a DB trigger right after signUp —
      // on a slow trigger there can be a brief race, so retry once.
      return new Promise(function (resolve) { setTimeout(resolve, 800); }).then(function () {
        return sb.from('profiles').select('*').eq('id', userId).single();
      }).then(function (retry) {
        currentProfile = (!retry.error && retry.data) ? retry.data : null;
        return currentProfile;
      });
    });
  }

  function routeAfterAuth() {
    // Sign-up is explicitly split into customer and freelancer. A rider
    // account must pass the verification gate before it can open availability.
    // We keep customer accounts on Home; verified freelancers can also use Home
    // and manually open availability from there.
    if (currentProfile && currentProfile.role === 'rider' &&
        (!isTruthyVerified(currentProfile.phone_verified) || !isTruthyVerified(currentProfile.identity_verified))) {
      go('freelancer-verify', { replace: true });
      return;
    }
    go('home', { replace: true });
  }

  function onSignedIn(user) {
    currentUser = user;
    return loadProfile(user.id).then(function () {
      document.getElementById('authEmail').value = '';
      document.getElementById('authPassword').value = '';
      var nameField = document.getElementById('authFullName');
      if (nameField) nameField.value = '';
      history_ = [];
      routeAfterAuth();
    });
  }

  function handleAuthSubmit() {
    if (!sb) { showAuthError(NOT_CONFIGURED_MSG); return; }
    hideAuthMessages();

    var email = document.getElementById('authEmail').value.trim();
    var password = document.getElementById('authPassword').value;
    if (!email || !password) { showAuthError('กรุณากรอกอีเมลและรหัสผ่าน'); return; }

    var btn = document.getElementById('authSubmitBtn');
    btn.disabled = true;
    // derive the resting label from authMode (not a captured snapshot) —
    // a successful "confirmation required" signup switches mode back to
    // login before this resolves, and the button must reflect that.
    function restoreLabel() { return authMode === 'signup' ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'; }

    if (authMode === 'signup') {
      var fullName = document.getElementById('authFullName').value.trim();
      if (!fullName) { showAuthError('กรุณากรอกชื่อ-นามสกุล'); btn.disabled = false; return; }

      // Account type is explicit at signup. Identity documents are NOT stored
      // in auth metadata; freelancer verification must be completed by the
      // server-side verification workflow before opening availability.
      // The selected role is sent so the existing profile trigger can create
      // the correct customer/rider account type without a client-side profile
      // update after signup.
      //
      // The real production handle_new_user() trigger reads the person's
      // name from metadata key 'name' (production public.profiles has a
      // 'name' column, not 'full_name'). We send both 'name' and
      // 'full_name' with the same value so this keeps working whichever
      // trigger version is live during the migration, without guessing
      // which one is actually deployed.
      btn.textContent = 'กำลังสร้างบัญชี...';
      sb.auth.signUp({
        email: email,
        password: password,
        options: { data: { name: fullName, full_name: fullName, role: signupRole } }
      }).then(function (res) {
        if (res.error) { showAuthError(mapAuthError(res.error)); return; }
        if (res.data && res.data.session) {
          return onSignedIn(res.data.user);
        }
        // email confirmation is required before a session exists
        setAuthMode('login');
        showAuthSuccess('สมัครสมาชิกสำเร็จ กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ');
      }).catch(function () {
        showAuthError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }).finally(function () {
        btn.disabled = false;
        btn.textContent = restoreLabel();
      });
    } else {
      btn.textContent = 'กำลังเข้าสู่ระบบ...';
      sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (res.error) { showAuthError(mapAuthError(res.error)); return; }
        return onSignedIn(res.data.user);
      }).catch(function () {
        showAuthError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }).finally(function () {
        btn.disabled = false;
        btn.textContent = restoreLabel();
      });
    }
  }

  /* ---------------- auth: OAuth (Google / Facebook) ---------------- */
  function handleOAuth(provider, btn) {
    if (!sb) { showAuthError(NOT_CONFIGURED_MSG); return; }
    hideAuthMessages();
    if (btn) btn.disabled = true;

    var redirectTo = window.location.origin + '/auth/callback';
    sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: redirectTo } })
      .then(function (res) {
        if (res.error) {
          showAuthError(mapAuthError(res.error));
          if (btn) btn.disabled = false;
          return;
        }
        // success: supabase-js immediately redirects the browser to the
        // provider's consent screen — nothing else to do on this page.
      })
      .catch(function () {
        showAuthError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        if (btn) btn.disabled = false;
      });
  }

  function handleLogout() {
    if (!sb) return;
    sb.auth.signOut().then(function () {
      currentUser = null;
      currentProfile = null;
      restoreDemoProfile();
      hideAuthMessages();
      setAuthMode('login');
      history_ = ['splash'];
      render('splash');
      toast('ออกจากระบบแล้ว');
    });
  }

  /* ---------------- self profile view (reuses the provider-profile screen) ---------------- */
  var defaultProviderProfile = {
    name: document.getElementById('profileHeroName').textContent,
    tagline: document.getElementById('profileHeroTagline').textContent
  };

  function restoreDemoProfile() {
    if (!viewingSelfProfile) return;
    document.getElementById('profileHeroName').textContent = defaultProviderProfile.name;
    document.getElementById('profileHeroTagline').textContent = defaultProviderProfile.tagline;
    document.getElementById('profileMatchBtn').style.display = '';
    document.getElementById('profileLogoutRow').style.display = 'none';
    viewingSelfProfile = false;
  }

  // Label from the real dual-capability columns (is_customer/is_freelancer).
  // Falls back to the legacy single 'role' column, and finally to customer,
  // so this keeps working whether the row hasn't been migrated yet, has
  // been migrated, or is missing entirely (defensive — schema.sql in this
  // repo does not yet declare these columns; see README).
  function roleLabelFor(profile) {
    if (!profile) return 'ลูกค้า';
    var hasCustomer = profile.is_customer !== undefined || profile.is_freelancer !== undefined
      ? profile.is_customer !== false
      : profile.role !== 'rider';
    var hasFreelancer = profile.is_customer !== undefined || profile.is_freelancer !== undefined
      ? !!profile.is_freelancer
      : profile.role === 'rider';
    if (hasCustomer && hasFreelancer) return 'ลูกค้า · ผู้ให้บริการ';
    if (hasFreelancer) return 'ผู้ให้บริการ';
    return 'ลูกค้า';
  }

  // Production public.profiles uses column 'name', not 'full_name' (the
  // legacy column this repo's schema.sql/original code assumed). Prefer
  // 'name' first, fall back to 'full_name' for any row still on the old
  // shape, then the account email as a last resort. Do not drop the
  // full_name fallback — some rows may still only have that populated.
  function profileNameFor(profile) {
    if (!profile) return currentUser && currentUser.email || 'ผู้ใช้งาน';
    return profile.name || profile.full_name || (currentUser && currentUser.email) || 'ผู้ใช้งาน';
  }

  function showOwnProfile() {
    if (!currentUser) { go('login'); return; }
    viewingSelfProfile = true;
    var roleLabel = roleLabelFor(currentProfile);
    document.getElementById('profileHeroName').textContent = profileNameFor(currentProfile);
    document.getElementById('profileHeroTagline').textContent =
      (currentUser.email || '') + ' · ' + roleLabel;
    document.getElementById('profileMatchBtn').style.display = 'none';
    document.getElementById('profileLogoutRow').style.display = '';
    go('provider-profile', { keepSelfProfile: true });
  }

  /* ---------------- freelancer verification gate ---------------- */
  function isTruthyVerified(v) { return v === true || v === 'true' || v === 1; }

  function renderVerificationStatus() {
    var phone = isTruthyVerified(currentProfile && currentProfile.phone_verified);
    var identity = isTruthyVerified(currentProfile && currentProfile.identity_verified);
    var phoneRow = document.getElementById('verifyPhoneRow');
    var identityRow = document.getElementById('verifyIdentityRow');
    var phoneStatus = document.getElementById('verifyPhoneStatus');
    var identityStatus = document.getElementById('verifyIdentityStatus');
    var help = document.getElementById('verifyHelpText');
    if (phoneRow) phoneRow.className = 'verify-row ' + (phone ? 'verified' : 'pending');
    if (identityRow) identityRow.className = 'verify-row ' + (identity ? 'verified' : 'pending');
    if (phoneStatus) phoneStatus.textContent = phone ? 'ยืนยันแล้ว' : 'รอยืนยัน';
    if (identityStatus) identityStatus.textContent = identity ? 'ยืนยันแล้ว' : 'รอตรวจสอบ';
    if (help) help.textContent = phone && identity
      ? 'ยืนยันครบแล้ว คุณสามารถเปิดโหมดรับงานได้'
      : 'ยังยืนยันไม่ครบ จึงยังไม่สามารถเปิดรับงานได้';
  }

  function refreshVerification() {
    if (!sb || !currentUser) { go('login'); return; }
    loadProfile(currentUser.id).then(function () {
      renderVerificationStatus();
      var ok = isTruthyVerified(currentProfile && currentProfile.phone_verified) && isTruthyVerified(currentProfile && currentProfile.identity_verified);
      toast(ok ? 'ยืนยันครบแล้ว ✓' : 'สถานะล่าสุดยังรอการยืนยัน');
    }).catch(function () { toast('ตรวจสอบสถานะไม่สำเร็จ'); });
  }

  /* ---------------- freelancer capability (same account, dual role) ----------
     Reuses the existing "◉ toggle-provider-mode" icon on Home and the
     existing "exit-provider-mode" tap (brand logo on the provider-request
     screen) — no new UI. What changed is that these now call the real
     Supabase functions instead of just switching screens:
       - entering provider mode  -> public.enable_availability()
         (grants freelancer capability AND opens it for job requests,
         per the function's own description: is_freelancer=true,
         availability_status='available')
       - exiting provider mode   -> public.disable_freelancer()
         (pauses job requests: availability_status='unavailable';
         freelancer capability itself is kept, matching how the DB
         function is described — this is "stop for now", not "revoke")
     Both are called as zero-argument RPCs (security definer, keyed off
     auth.uid() on the server) per how they were described to me. If the
     real functions take parameters, these two calls need updating. ------ */
  function enterProviderMode(btn) {
    if (!sb || !currentUser) { go('login'); return; }
    // Customer and freelancer sign-up are separate. Only a rider account can
    // open availability, and its verification flags are server-owned.
    if (!currentProfile || currentProfile.role !== 'rider') {
      toast('บัญชีนี้เป็นบัญชีลูกค้า หากต้องการรับงานให้สมัครบัญชีฟรีแลนซ์');
      return;
    }
    if (!isTruthyVerified(currentProfile.phone_verified) || !isTruthyVerified(currentProfile.identity_verified)) {
      go('freelancer-verify');
      toast('กรุณายืนยันข้อมูลให้ครบก่อนเปิดรับงาน');
      return;
    }
    if (btn) btn.disabled = true;
    sb.rpc('enable_availability').then(function (res) {
      if (res.error) {
        toast('เปิดโหมดผู้ให้บริการไม่สำเร็จ: ' + (res.error.message || 'เกิดข้อผิดพลาด'));
        return;
      }
      return loadProfile(currentUser.id);
    }).then(function () {
      go('provider-request');
    }).catch(function () {
      toast('เปิดโหมดผู้ให้บริการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }).finally(function () {
      if (btn) btn.disabled = false;
    });
  }

  function exitProviderMode() {
    if (sb && currentUser) {
      sb.rpc('disable_freelancer').then(function (res) {
        if (res.error) toast('หยุดรับงานไม่สำเร็จ: ' + (res.error.message || 'เกิดข้อผิดพลาด'));
        return loadProfile(currentUser.id);
      }).catch(function () {
        toast('หยุดรับงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      });
    }
    go('home');
  }

  /* ---------------- session bootstrap ---------------- */

  // Strip ?code=..., ?error=..., etc. from the address bar once we're done
  // with them, and drop back to the site root (leaves /auth/callback for
  // the next OAuth round-trip).
  function cleanCallbackUrl() {
    try { window.history.replaceState({}, document.title, window.location.origin + '/'); }
    catch (e) { /* ignore in older browsers / sandboxed contexts */ }
  }

  // Single, idempotent finish line for an OAuth sign-in — reached either
  // from the getSession() check right after load, or from the SIGNED_IN
  // event fired once supabase-js finishes exchanging the ?code= for a
  // session in the background (PKCE flow, default detectSessionInUrl:true).
  function finishOAuthCallback(session) {
    if (!awaitingCallback) return;
    awaitingCallback = false;
    cleanCallbackUrl();
    currentUser = session.user;
    loadProfile(session.user.id).then(function () {
      history_ = [];
      routeAfterAuth();
    });
  }

  function initAuth() {
    if (!sb) {
      // surface this immediately on the login screen (not just after a
      // click) so a missing/misconfigured env.js is obvious right away
      // instead of looking like "the login button does nothing".
      showAuthError(NOT_CONFIGURED_MSG);
      history_ = ['splash'];
      render('splash');
      return;
    }

    sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT') {
        currentUser = null;
        currentProfile = null;
      }
      if (event === 'SIGNED_IN' && session) {
        finishOAuthCallback(session);
      }
    });

    var params = new URLSearchParams(window.location.search);
    var oauthError = params.get('error_description') || params.get('error');
    var onCallbackPath = /\/auth\/callback\/?$/.test(window.location.pathname);

    // the provider (or Supabase) sent the user back with an error —
    // e.g. they cancelled the consent screen, or the provider isn't
    // configured correctly on the Supabase side.
    if (oauthError) {
      cleanCallbackUrl();
      history_ = ['splash'];
      render('splash');
      go('login');
      showAuthError(decodeURIComponent(oauthError.replace(/\+/g, ' ')));
      return;
    }

    if (onCallbackPath) {
      history_ = ['splash'];
      render('splash');
      awaitingCallback = true;

      // supabase-js auto-exchanges the ?code=... for a session in the
      // background; check immediately in case it already finished...
      sb.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (session) finishOAuthCallback(session);
      });

      // ...and fall back to a clear error if nothing arrives (bad/expired
      // code, misconfigured redirect URL, network issue, etc).
      setTimeout(function () {
        if (!awaitingCallback) return;
        awaitingCallback = false;
        cleanCallbackUrl();
        history_ = ['splash'];
        render('splash');
        go('login');
        showAuthError('เข้าสู่ระบบไม่สำเร็จ (หมดเวลารอ) กรุณาลองใหม่อีกครั้ง');
      }, 8000);
      return;
    }

    sb.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (session) {
        currentUser = session.user;
        return loadProfile(session.user.id).then(function () {
          history_ = [];
          routeAfterAuth();
        });
      }
      history_ = ['splash'];
      render('splash');
    }).catch(function () {
      history_ = ['splash'];
      render('splash');
    });
  }

  /* ---------------- action handlers ---------------- */
  var actions = {
    'auth-submit': function () { handleAuthSubmit(); },
    'toggle-auth-mode': function () { setAuthMode(authMode === 'login' ? 'signup' : 'login'); },
    'select-signup-role': function (el) { setSignupRole(el.dataset.role); },
    'oauth-google': function (el) { handleOAuth('google', el); },
    'oauth-facebook': function (el) { handleOAuth('facebook', el); },
    'logout': function () { handleLogout(); },
    'view-my-profile': function () { showOwnProfile(); },
    'open-flow': function () { openFlow(); },
    'close-flow': function () { closeFlow(); },
    'postjob-next': function () {
      toast('บันทึกd. ถัดไป: location & budget ›');
      go('location');
    },
    'location-confirm': function () {
      if (!selectedLocation) { toast('กรุณาเลือกสถานที่ก่อน'); return; }
      toast('ยืนยันสถานที่แล้ว ✓');
      go('match');
    },
    'pick-on-map': function () { initLocationMap(); if (locationMapInstance) { locationMapInstance.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('แตะบนแผนที่เพื่อเลือกตำแหน่ง'); } },
    'use-current-location': function () { useCurrentLocation(); },
    'match-provider': function (el) { createMatch(el); },
    'accept-offer': function (el) { respondPrice(el); },
    'respond-price': function (el) { respondPrice(el); },
    'propose-price': function () { proposePrice(); },
    'open-match': function (el) { openMatch(el.dataset.matchId); },
    'chat-send': function () { sendChatMessage(); },
    'upload-image': function () { document.getElementById('picUploadInput').click(); },
    'skip-request': function () { declineMatch(); },
    'accept-request': function () { acceptMatch(); },
    'toggle-provider-mode': function (el) { enterProviderMode(el); },
    'exit-provider-mode': function () { exitProviderMode(); },
    'refresh-verification': function () { refreshVerification(); }
  };

  /* ---------------- global click delegation ---------------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action],[data-go],[data-back],[data-toast]');
    if (!el) return;

    if (el.dataset.action) {
      var fn = actions[el.dataset.action];
      if (fn) fn(el);
      return;
    }
    if (el.dataset.go) { go(el.dataset.go); return; }
    if (el.hasAttribute('data-back')) { goBack(); return; }
    if (el.dataset.toast) { toast(el.dataset.toast); return; }
  });

  /* keep chat input from bubbling Enter key to no-op; send on Enter */
  document.getElementById('chatInput') && document.getElementById('chatInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendChatMessage();
  });

  document.getElementById('locationSearchInput') && document.getElementById('locationSearchInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); searchLocation(); }
  });

  /* ---------------- init ---------------- */
  initChips();
  initHomeSearch();
  initImageUpload();
  setAuthMode('login');
  initAuth();

  /* QA hook (does not affect end-user behavior; still subject to the auth route guard) */
  window.__go = go;
})();
