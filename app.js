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
    document.getElementById('authSubmitBtn').textContent = isSignup ? 'สร้างบัญชี' : 'เข้าสู่ระบบ';
    document.getElementById('authToggleText').textContent = isSignup ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?';
    document.getElementById('authToggleLink').textContent = isSignup ? 'เข้าสู่ระบบ' : 'สร้างบัญชี';
    hideAuthMessages();
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
    // Every account has customer capability (is_customer defaults true),
    // and Home already carries the entry point into freelancer mode
    // ("เปิดโหมดผู้ให้บริการ"), so there is no longer a separate role to
    // branch the landing screen on — everyone lands on Home.
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

      // Every new account starts as a customer only (is_customer=true,
      // is_freelancer=false — set by the handle_new_user() DB trigger).
      // 'role' is still sent for backward compatibility with the legacy
      // role column/trigger logic, but the UI no longer lets the person
      // pick it at signup — becoming a freelancer happens later, from the
      // same account, via the existing "เปิดโหมดผู้ให้บริการ" action.
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
        options: { data: { name: fullName, full_name: fullName, role: 'customer' } }
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
      : profile.role !== 'provider';
    var hasFreelancer = profile.is_customer !== undefined || profile.is_freelancer !== undefined
      ? !!profile.is_freelancer
      : profile.role === 'provider';
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
    'toggle-provider-mode': function (el) { enterProviderMode(el); },
    'exit-provider-mode': function () { exitProviderMode(); }
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
