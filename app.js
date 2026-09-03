/* =========================================================================
   dekdein. — Frontend Prototype interactions
   No backend, no API, no auth — client-side state only.
   ========================================================================= */

(function () {
  'use strict';

  var screens = Array.prototype.slice.call(document.querySelectorAll('.screen-page'));
  var navBar = document.getElementById('navBar');
  var chatBar = document.getElementById('chatBar');
  var toastEl = document.getElementById('toast');
  var history_ = ['splash'];
  var current = 'splash';

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

  /* ---------------- action handlers ---------------- */
  var actions = {
    'login-submit': function () {
      toast('ใครก็ได้ช่วยเดย์!');
      setTimeout(function () { go('home', { replace: true }); history_ = ['home']; }, 550);
    },
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
  render('splash');

  /* QA hook (does not affect end-user behavior) */
  window.__go = go;
})();
