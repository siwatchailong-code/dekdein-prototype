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
  var viewingSelfProfile = false;
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

  /* ---------------- chat ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function nowHHMM() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function sendChatMessage() {
    var input = document.getElementById('chatInput');
    var text = input.value.trim();
    if (!text) return;
    var messages = document.getElementById('chatMessages');
    var bubble = document.createElement('div');
    bubble.className = 'bubble me';
    bubble.innerHTML = text.replace(/</g, '&lt;') + '<div class="time">' + nowHHMM() + '</div>';
    messages.appendChild(bubble);
    input.value = '';
    var stage = screenById('chat');
    stage.scrollTop = stage.scrollHeight;
    toast('Message sent');
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
    document.getElementById('authRoleField').style.display = isSignup ? '' : 'none';
    document.getElementById('authSubmitBtn').textContent = isSignup ? 'สร้างบัญชี' : 'เข้าสู่ระบบ';
    document.getElementById('authToggleText').textContent = isSignup ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?';
    document.getElementById('authToggleLink').textContent = isSignup ? 'เข้าสู่ระบบ' : 'สร้างบัญชี';
    hideAuthMessages();
  }

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
    var role = currentProfile && currentProfile.role;
    go(role === 'provider' ? 'provider-request' : 'home', { replace: true });
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
    if (!sb) { showAuthError('ยังไม่ได้ตั้งค่า Supabase (ดู env.example.js)'); return; }
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
      var roleChip = document.querySelector('#authRoleChips .chip.active');
      var role = roleChip ? roleChip.dataset.role : 'customer';
      if (!fullName) { showAuthError('กรุณากรอกชื่อ-นามสกุล'); btn.disabled = false; return; }

      btn.textContent = 'กำลังสร้างบัญชี...';
      sb.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: fullName, role: role } }
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

  function showOwnProfile() {
    if (!currentUser) { go('login'); return; }
    viewingSelfProfile = true;
    var roleLabel = currentProfile && currentProfile.role === 'provider' ? 'ผู้ให้บริการ' : 'ลูกค้า';
    document.getElementById('profileHeroName').textContent =
      (currentProfile && currentProfile.full_name) || (currentUser.email || 'ผู้ใช้งาน');
    document.getElementById('profileHeroTagline').textContent =
      (currentUser.email || '') + ' · ' + roleLabel;
    document.getElementById('profileMatchBtn').style.display = 'none';
    document.getElementById('profileLogoutRow').style.display = '';
    go('provider-profile', { keepSelfProfile: true });
  }

  /* ---------------- session bootstrap ---------------- */
  function initAuth() {
    if (!sb) { history_ = ['splash']; render('splash'); return; }

    sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT') {
        currentUser = null;
        currentProfile = null;
      }
    });

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
    'logout': function () { handleLogout(); },
    'view-my-profile': function () { showOwnProfile(); },
    'open-flow': function () { openFlow(); },
    'close-flow': function () { closeFlow(); },
    'postjob-next': function () {
      toast('บันทึกd. ถัดไป: location & budget ›');
      go('location');
    },
    'location-confirm': function () {
      toast('สถานที่ confirmed ✓');
      go('match');
    },
    'match-provider': function (el) {
      var name = el.dataset.name || 'ผู้ให้บริการ';
      toast('แชท room opened with ' + name);
      go('chat');
    },
    'accept-offer': function (el) {
      toast('Price accepted. Work can start!');
      el.textContent = 'รับราคาแล้ว ✓';
      el.disabled = true;
    },
    'chat-send': function () { sendChatMessage(); },
    'upload-image': function () { document.getElementById('picUploadInput').click(); },
    'skip-request': function () { toast('ข้ามงานนี้แล้ว'); },
    'accept-request': function () {
      toast('รับงานสำเร็จ กำลังเปิดแชท');
      setTimeout(function () { go('chat'); }, 500);
    },
    'toggle-provider-mode': function () { go('provider-request'); },
    'exit-provider-mode': function () { go('home'); }
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

  /* ---------------- init ---------------- */
  initChips();
  initHomeSearch();
  initImageUpload();
  setAuthMode('login');
  initAuth();

  /* QA hook (does not affect end-user behavior; still subject to the auth route guard) */
  window.__go = go;
})();
