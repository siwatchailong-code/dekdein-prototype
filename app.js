/* =========================================================================
   dekdein. — app interactions
   Auth + profile are wired to Supabase (see supabase/schema.sql).
   Everything else (jobs, chat, ranking, challenges, matching) is still
   static prototype data — not connected to a backend.
   ========================================================================= */

/* ---------------- auth state ---------------- */
var currentUser = null;
var currentProfile = null;
var authMode = 'login';
var signupRole = 'customer';
var selectedLocation = null;
var locationMapInstance = null;
var locationMarker = null;
var currentMatch = null;
var chatChannel = null;
var viewingSelfProfile = false;
var awaitingCallback = false;
var PUBLIC_SCREENS = ['splash', 'login'];

/* ---------------- toast ---------------- */
var toastTimer = null;

function toast(text) {
  var toastEl = document.getElementById('toast');
  if (!toastEl) {
    console.warn(text);
    return;
  }

  toastEl.textContent = text;
  toastEl.classList.add('show');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(function () {
    toastEl.classList.remove('show');
  }, 2200);
}

/* ---------------- router ---------------- */
function screenById(id) {
  return Array.prototype.slice.call(
    document.querySelectorAll('.screen-page')
  ).filter(function (s) {
    return s.dataset.screen === id;
  })[0];
}

function render(id) {
  var screens = Array.prototype.slice.call(
    document.querySelectorAll('.screen-page')
  );

  var navBar = document.getElementById('navBar');
  var chatBar = document.getElementById('chatBar');

  screens.forEach(function (s) {
    s.classList.toggle('active', s.dataset.screen === id);
  });

  var el = screenById(id);
  var navId = el ? el.dataset.nav : null;

  if (navBar) {
    if (navId) {
      navBar.style.display = 'flex';

      Array.prototype.slice.call(
        navBar.querySelectorAll('a')
      ).forEach(function (a) {
        a.classList.toggle('active', a.dataset.navid === navId);
      });
    } else {
      navBar.style.display = 'none';
    }
  }

  if (chatBar) {
    chatBar.style.display = id === 'chat' ? 'flex' : 'none';
  }

  var stage = screenById(id);

  if (stage) {
    stage.scrollTop = 0;
  }

  current = id;

  if (id === 'location') {
    setTimeout(function () {
      initLocationMap();

      if (locationMapInstance) {
        locationMapInstance.invalidateSize();
      }
    }, 0);
  }

  if (id === 'match') {
    loadProviders();
  }

  if (id === 'provider-request') {
    loadProviderRequests();
  }

  if (id === 'freelancer-verify') {
    loadFreelancerApplication();
  }

  if (id === 'my-jobs') {
    loadMyMatches();
  }

  if (id === 'chat') {
    loadChat();
  }
}

function go(id, opts) {
  opts = opts || {};

  if (!screenById(id)) return;

  if (
    PUBLIC_SCREENS.indexOf(id) === -1 &&
    !currentUser
  ) {
    toast('กรุณาเข้าสู่ระบบก่อนใช้งาน');

    id = 'login';
    opts = {
      replace: opts.replace
    };
  }

  if (
    id === 'provider-profile' &&
    !opts.keepSelfProfile &&
    typeof restoreDemoProfile === 'function'
  ) {
    restoreDemoProfile();
  }

  if (!opts.replace) {
    history_.push(id);
  } else {
    history_[history_.length - 1] = id;
  }

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

/* ---------------- chips ---------------- */
function initChips() {
  document
    .querySelectorAll('[data-chipgroup]')
    .forEach(function (group) {

      group.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');

        if (!chip || !group.contains(chip)) return;

        Array.prototype.slice.call(
          group.querySelectorAll('.chip')
        ).forEach(function (c) {
          c.classList.remove('active');
        });

        chip.classList.add('active');

        if (group.dataset.chipgroup === 'myjobs') {
          var filter = chip.dataset.filter;

          var active =
            document.getElementById('myJobsActive');

          var done =
            document.getElementById('myJobsDone');

          var cancelled =
            document.getElementById('myJobsCancelled');

          if (active) {
            active.style.display =
              filter === 'active' ? '' : 'none';
          }

          if (done) {
            done.style.display =
              filter === 'done' ? '' : 'none';
          }

          if (cancelled) {
            cancelled.style.display =
              filter === 'cancelled' ? '' : 'none';
          }
        }
      });
    });
}

/* ---------------- home search ---------------- */
function initHomeSearch() {
  var input = document.getElementById('homeSearch');
  var list = document.getElementById('homeJobList');

  if (!input || !list) return;

  var cards = Array.prototype.slice.call(
    list.querySelectorAll('.job')
  );

  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();

    cards.forEach(function (card) {
      var titleEl = card.querySelector('b');

      if (!titleEl) return;

      var title = titleEl.textContent.toLowerCase();

      card.style.display =
        title.indexOf(q) !== -1 ? '' : 'none';
    });
  });
}

/* ---------------- post-job image upload ---------------- */
function initImageUpload() {
  var trigger =
    document.getElementById('picUploadTrigger');

  var input =
    document.getElementById('picUploadInput');

  if (!trigger || !input) return;

  input.addEventListener('change', function () {
    var file = input.files && input.files[0];

    if (!file) return;

    var gallery =
      document.getElementById('postJobGallery');

    if (!gallery) return;

    var emptySlot = Array.prototype.slice.call(
      gallery.querySelectorAll('.pic')
    ).filter(function (p) {
      return p !== trigger && !p.querySelector('img');
    })[0];

    if (!emptySlot) {
      toast('เพิ่มรูปได้สูงสุด 2 รูปใน prototype นี้');
      input.value = '';
      return;
    }

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

/* ---------------- post-job flow ---------------- */
var flowOptions = [
  {
    title: 'ให้คนรับงานเสนอราคา',
    desc: 'เหมาะกับงานที่ยังไม่แน่ใจราคา'
  },
  {
    title: 'ระบุงบประมาณเอง',
    desc: 'เหมาะกับงานที่กำหนดงบไว้แล้ว'
  }
];

function openFlow() {
  var modal = document.getElementById('flowModal');
  var opts = document.getElementById('flowOptions');
  var next = document.getElementById('flowNext');

  if (!modal || !opts || !next) return;

  opts.innerHTML = '';

  flowOptions.forEach(function (o) {
    var b = document.createElement('button');

    b.className = 'flow-option';

    b.innerHTML =
      '<span>' +
        '<strong>' + o.title + '</strong>' +
        '<span>' + o.desc + '</span>' +
      '</span>' +
      '<b>›</b>';

    b.addEventListener('click', function () {
      Array.prototype.slice.call(
        opts.querySelectorAll('.flow-option')
      ).forEach(function (x) {
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

  if (!modal) return;

  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}

var flowNext = document.getElementById('flowNext');

if (flowNext) {
  flowNext.addEventListener('click', function () {
    closeFlow();
    toast('บันทึกตัวเลือกแล้ว กรุณากรอกรายละเอียดงานต่อ');
    go('post-job');
  });
}

var flowModal = document.getElementById('flowModal');

if (flowModal) {
  flowModal.addEventListener('click', function (e) {
    if (e.target.id === 'flowModal') {
      closeFlow();
    }
  });
}

/* ---------------- location ---------------- */
function updateLocationUI() {
  var nameEl =
    document.getElementById('selectedLocationName');

  var coordsEl =
    document.getElementById('selectedLocationCoords');

  var mapLabel =
    document.getElementById('locationMapLabel');

  if (!selectedLocation) {
    if (nameEl) {
      nameEl.textContent = 'ยังไม่ได้เลือกสถานที่';
    }

    if (coordsEl) {
      coordsEl.textContent =
        'ค้นหาสถานที่ ใช้ตำแหน่งปัจจุบัน หรือเลือกจากแผนที่';
    }

    return;
  }

  var lat =
    Number(selectedLocation.lat).toFixed(6);

  var lng =
    Number(selectedLocation.lng).toFixed(6);

  if (nameEl) {
    nameEl.textContent =
      selectedLocation.name || 'ตำแหน่งที่เลือก';
  }

  if (coordsEl) {
    coordsEl.textContent = lat + ', ' + lng;
  }

  if (mapLabel) {
    mapLabel.textContent =
      selectedLocation.name || (lat + ', ' + lng);
  }
}

function setSelectedLocation(lat, lng, name, zoom) {
  selectedLocation = {
    lat: Number(lat),
    lng: Number(lng),
    name: name || 'ตำแหน่งที่เลือก'
  };

  updateLocationUI();
  initLocationMap();

  if (locationMapInstance) {
    locationMapInstance.setView(
      [
        selectedLocation.lat,
        selectedLocation.lng
      ],
      zoom || 15
    );

    if (!locationMarker) {
      locationMarker = L.marker(
        [
          selectedLocation.lat,
          selectedLocation.lng
        ]
      ).addTo(locationMapInstance);
    } else {
      locationMarker.setLatLng(
        [
          selectedLocation.lat,
          selectedLocation.lng
        ]
      );
    }
  }
}

function initLocationMap() {
  var mapEl = document.getElementById('locationMap');

  if (
    !mapEl ||
    locationMapInstance ||
    !window.L
  ) {
    return;
  }

  locationMapInstance = L.map(
    mapEl,
    {
      zoomControl: true
    }
  ).setView(
    [15.2448, 104.8473],
    13
  );

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution:
        '&copy; OpenStreetMap contributors'
    }
  ).addTo(locationMapInstance);

  locationMapInstance.on(
    'click',
    function (e) {
      setSelectedLocation(
        e.latlng.lat,
        e.latlng.lng,
        'ตำแหน่งที่เลือกจากแผนที่',
        16
      );
    }
  );

  setTimeout(function () {
    locationMapInstance.invalidateSize();
  }, 50);
}

function reverseGeocode(lat, lng) {
  return fetch(
    'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' +
      encodeURIComponent(lat) +
      '&lon=' +
      encodeURIComponent(lng),
    {
      headers: {
        Accept: 'application/json'
      }
    }
  )
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (data) {
      var name =
        data &&
        (
          data.display_name ||
          (
            data.address &&
            (
              data.address.road ||
              data.address.suburb ||
              data.address.city
            )
          )
        );

      return name || 'ตำแหน่งปัจจุบัน';
    });
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    toast('เบราว์เซอร์นี้ไม่รองรับการใช้ตำแหน่ง');
    return;
  }

  toast('กำลังค้นหาตำแหน่ง...');

  navigator.geolocation.getCurrentPosition(
    function (position) {
      var lat = position.coords.latitude;
      var lng = position.coords.longitude;

      reverseGeocode(lat, lng)
        .then(function (name) {
          setSelectedLocation(
            lat,
            lng,
            name,
            16
          );

          toast('เลือกตำแหน่งเรียบร้อยแล้ว');
        })
        .catch(function () {
          setSelectedLocation(
            lat,
            lng,
            'ตำแหน่งปัจจุบัน',
            16
          );
        });
    },
    function () {
      toast('ไม่สามารถใช้ตำแหน่งปัจจุบันได้');
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

function searchLocation() {
  var input =
    document.getElementById('locationSearch');

  if (!input) return;

  var q = input.value.trim();

  if (!q) {
    toast('กรุณาพิมพ์ชื่อสถานที่');
    return;
  }

  fetch(
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' +
      encodeURIComponent(q),
    {
      headers: {
        Accept: 'application/json'
      }
    }
  )
    .then(function (r) {
      return r.ok ? r.json() : [];
    })
    .then(function (rows) {
      if (!rows || !rows.length) {
        toast('ไม่พบสถานที่ ลองค้นหาคำอื่น');
        return;
      }

      var row = rows[0];

      setSelectedLocation(
        row.lat,
        row.lon,
        row.display_name || q,
        16
      );
    })
    .catch(function () {
      toast('ค้นหาสถานที่ไม่สำเร็จ กรุณาลองใหม่');
    });
}

/* ---------------- helpers ---------------- */
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function escapeHtml(value) {
  return String(
    value == null ? '' : value
  ).replace(/[&<>'"]/g, function (c) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[c];
  });
}

/* ---------------- providers ---------------- */
function renderProviders(rows) {
  var stage = screenById('match');

  if (!stage) return;

  var old =
    stage.querySelectorAll('.match-card');

  old.forEach(function (n) {
    n.remove();
  });

  var anchor =
    stage.querySelector('p.small');

  if (!anchor) return;

  var frag =
    document.createDocumentFragment();

  rows.forEach(function (row) {
    var card =
      document.createElement('div');

    card.className = 'match-card card';

    var name =
      row.name ||
      row.full_name ||
      'ผู้ให้บริการ';

    card.innerHTML =
      '<div class="row gap10">' +
        '<div class="avatar"></div>' +
        '<div>' +
          '<b>' + escapeHtml(name) + '</b>' +
          '<div class="small">ผู้ให้บริการ</div>' +
          '<div class="rating">พร้อมรับงาน</div>' +
        '</div>' +
        '<span class="status" style="margin-left:auto">● ออนไลน์</span>' +
      '</div>' +
      '<div class="row between" style="margin-top:10px">' +
        '<span class="small">เลือกเพื่อเริ่มพูดคุย</span>' +
        '<button class="secondary" ' +
          'data-action="match-provider" ' +
          'data-provider-id="' + escapeHtml(row.id) + '" ' +
          'data-name="' + escapeHtml(name) + '">' +
          'แมตช์' +
        '</button>' +
      '</div>';

    frag.appendChild(card);
  });

  if (!rows.length) {
    var empty =
      document.createElement('div');

    empty.className = 'card match-card';

    empty.innerHTML =
      '<b>ยังไม่มีฟรีแลนซ์ที่พร้อมรับงาน</b>' +
      '<p class="small">ลองใหม่อีกครั้งภายหลัง</p>';

    frag.appendChild(empty);
  }

  anchor.after(frag);
}

function loadProviders() {
  if (!sb || !currentUser) return;

  sb
    .from('profiles')
    .select(
      'id,name,full_name,role,is_freelancer,availability_status,identity_verified'
    )
    .eq('is_freelancer', true)
    .eq('availability_status', 'available')
    .eq('identity_verified', true)
    .neq('id', currentUser.id)
    .then(function (res) {
      if (res.error) {
        toast(
          'โหลดรายชื่อผู้ให้บริการไม่สำเร็จ: ' +
          res.error.message
        );
        return;
      }

      renderProviders(res.data || []);
    });
}

function createMatch(el) {
  if (!sb || !currentUser) return;

  var providerId = el.dataset.providerId;

  if (!providerId) {
    toast('ไม่พบรหัสผู้ให้บริการ');
    return;
  }

  el.disabled = true;
  el.textContent = 'กำลังส่ง...';

  sb
    .rpc(
      'create_match_request',
      {
        p_provider_id: providerId
      }
    )
    .then(function (res) {
      if (res.error) throw res.error;

      currentMatch = res.data;
      go('chat');
    })
    .catch(function (err) {
      toast(
        'สร้าง MATCH ไม่สำเร็จ: ' +
        (
          err.message ||
          'เกิดข้อผิดพลาด'
        )
      );
    })
    .finally(function () {
      el.disabled = false;
      el.textContent = 'แมตช์';
    });
}

function matchTerminal(status) {
  return [
    'completed',
    'cancelled',
    'declined'
  ].indexOf(status) !== -1;
}
/* ---------------- matches ---------------- */
function renderMyMatches(rows) {
  var active = document.getElementById('myJobsActive');
  var done = document.getElementById('myJobsDone');
  var cancelled = document.getElementById('myJobsCancelled');

  if (active) active.innerHTML = '';
  if (done) done.innerHTML = '';
  if (cancelled) cancelled.innerHTML = '';

  if (!rows.length && active) {
    active.innerHTML =
      '<div class="card">' +
        '<b>ยังไม่มีงาน</b>' +
        '<p class="small">เมื่อคุณแมตช์กับผู้ให้บริการ งานจะแสดงที่นี่</p>' +
      '</div>';
    return;
  }

  rows.forEach(function (row) {
    var target = active;

    if (row.status === 'completed') {
      target = done;
    }

    if (
      row.status === 'cancelled' ||
      row.status === 'declined'
    ) {
      target = cancelled;
    }

    if (!target) return;

    var card = document.createElement('div');
    card.className = 'card job-card';

    var otherName =
      row.provider_name ||
      row.customer_name ||
      'ผู้ใช้งาน';

    card.innerHTML =
      '<div class="row between">' +
        '<div>' +
          '<b>' + escapeHtml(otherName) + '</b>' +
          '<div class="small">สถานะ: ' +
            escapeHtml(row.status || 'pending') +
          '</div>' +
        '</div>' +
        '<button class="secondary" ' +
          'data-action="open-match" ' +
          'data-match-id="' + escapeHtml(row.id) + '">' +
          'ดูแชต' +
        '</button>' +
      '</div>';

    target.appendChild(card);
  });
}

function loadMyMatches() {
  if (!sb || !currentUser) return;

  sb
    .from('matches')
    .select('*')
    .or(
      'customer_id.eq.' +
      currentUser.id +
      ',provider_id.eq.' +
      currentUser.id
    )
    .order('created_at', { ascending: false })
    .then(function (res) {
      if (res.error) {
        console.error('load matches error:', res.error);
        return;
      }

      renderMyMatches(res.data || []);
    });
}

function openMatch(id) {
  if (!id) return;

  currentMatch = {
    id: id
  };

  go('chat');
}

/* ---------------- chat ---------------- */
function renderChatMessages(rows) {
  var list =
    document.getElementById('chatMessages');

  if (!list) return;

  list.innerHTML = '';

  rows.forEach(function (row) {
    var mine =
      row.sender_id === currentUser.id;

    var bubble =
      document.createElement('div');

    bubble.className =
      'chat-bubble ' +
      (mine ? 'mine' : 'theirs');

    bubble.innerHTML =
      '<div>' +
      escapeHtml(row.message || row.content || '') +
      '</div>';

    list.appendChild(bubble);
  });

  list.scrollTop = list.scrollHeight;
}

function loadChat() {
  if (!sb || !currentUser || !currentMatch) return;

  sb
    .from('messages')
    .select('*')
    .eq('match_id', currentMatch.id)
    .order('created_at', { ascending: true })
    .then(function (res) {
      if (res.error) {
        console.error('load chat error:', res.error);
        return;
      }

      renderChatMessages(res.data || []);
    });
}

function sendChatMessage() {
  if (!sb || !currentUser || !currentMatch) return;

  var input =
    document.getElementById('chatInput');

  if (!input) return;

  var message = input.value.trim();

  if (!message) return;

  input.disabled = true;

  sb
    .from('messages')
    .insert({
      match_id: currentMatch.id,
      sender_id: currentUser.id,
      message: message
    })
    .then(function (res) {
      if (res.error) throw res.error;

      input.value = '';
      loadChat();
    })
    .catch(function (err) {
      toast(
        'ส่งข้อความไม่สำเร็จ: ' +
        (
          err.message ||
          'เกิดข้อผิดพลาด'
        )
      );
    })
    .finally(function () {
      input.disabled = false;
      input.focus();
    });
}

/* ---------------- provider requests ---------------- */
function renderProviderRequests(rows) {
  var list =
    document.getElementById('providerRequestList');

  if (!list) return;

  list.innerHTML = '';

  if (!rows.length) {
    list.innerHTML =
      '<div class="card">' +
        '<b>ยังไม่มีคำขอใหม่</b>' +
        '<p class="small">คำขอรับงานจะแสดงที่นี่</p>' +
      '</div>';
    return;
  }

  rows.forEach(function (row) {
    var card =
      document.createElement('div');

    card.className = 'card job-card';

    card.innerHTML =
      '<div class="row between">' +
        '<div>' +
          '<b>คำขอใหม่</b>' +
          '<div class="small">' +
            escapeHtml(row.status || 'pending') +
          '</div>' +
        '</div>' +
        '<button class="secondary" ' +
          'data-action="open-match" ' +
          'data-match-id="' + escapeHtml(row.id) + '">' +
          'เปิดดู' +
        '</button>' +
      '</div>';

    list.appendChild(card);
  });
}

function loadProviderRequests() {
  if (!sb || !currentUser) return;

  sb
    .from('matches')
    .select('*')
    .eq('provider_id', currentUser.id)
    .order('created_at', { ascending: false })
    .then(function (res) {
      if (res.error) {
        console.error(
          'load provider requests error:',
          res.error
        );
        return;
      }

      renderProviderRequests(res.data || []);
    });
}

/* ---------------- profile ---------------- */
function updateProfileUI(profile) {
  if (!profile) return;

  currentProfile = profile;

  var name =
    profile.name ||
    profile.full_name ||
    '';

  var profileName =
    document.getElementById('profileName');

  if (profileName) {
    profileName.textContent = name;
  }

  var profileBio =
    document.getElementById('profileBio');

  if (profileBio) {
    profileBio.textContent =
      profile.bio ||
      'ยังไม่ได้เพิ่มคำแนะนำตัว';
  }

  var profileArea =
    document.getElementById('profileArea');

  if (profileArea) {
    profileArea.textContent =
      profile.service_area ||
      '-';
  }

  var profileServices =
    document.getElementById('profileServices');

  if (profileServices) {
    profileServices.textContent =
      profile.services ||
      '-';
  }

  var profilePrice =
    document.getElementById('profileStartingPrice');

  if (profilePrice) {
    profilePrice.textContent =
      profile.starting_price != null
        ? '฿' + profile.starting_price
        : '-';
  }
}

function loadProfile(userId) {
  if (!sb || !userId) {
    return Promise.resolve(null);
  }

  return sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
    .then(function (res) {
      if (res.error) {
        console.error(
          'load profile error:',
          res.error
        );
        return null;
      }

      if (res.data && userId === currentUser.id) {
        updateProfileUI(res.data);
      }

      return res.data;
    });
}

function saveProfile() {
  if (!sb || !currentUser) return;

  var nameEl =
    document.getElementById('editProfileName');

  var bioEl =
    document.getElementById('editProfileBio');

  if (!nameEl || !bioEl) return;

  var name = nameEl.value.trim();
  var bio = bioEl.value.trim();

  if (!name) {
    toast('กรุณากรอกชื่อ');
    return;
  }

  sb
    .from('profiles')
    .update({
      name: name,
      bio: bio,
      updated_at: new Date().toISOString()
    })
    .eq('id', currentUser.id)
    .then(function (res) {
      if (res.error) throw res.error;

      toast('บันทึกโปรไฟล์แล้ว');

      return loadProfile(currentUser.id);
    })
    .then(function () {
      go('profile');
    })
    .catch(function (err) {
      toast(
        'บันทึกไม่สำเร็จ: ' +
        (
          err.message ||
          'เกิดข้อผิดพลาด'
        )
      );
    });
}

/* ---------------- freelancer mode ---------------- */
function enterProviderMode(btn) {
  if (!sb || !currentUser) {
    go('login');
    return;
  }

  if (btn) {
    btn.disabled = true;
  }

  loadProfile(currentUser.id)
    .then(function (profile) {
      if (
        profile &&
        profile.identity_verified === true
      ) {
        return sb
          .rpc('enable_availability')
          .then(function (res) {
            if (res.error) throw res.error;

            return loadProfile(currentUser.id);
          })
          .then(function () {
            go('provider-request');
          });
      }

      go('freelancer-verify');
    })
    .catch(function (error) {
      console.error(
        'enter provider mode error:',
        error
      );

      toast(
        'ไม่สามารถเปิดโหมดผู้ให้บริการได้: ' +
        (
          error.message ||
          'เกิดข้อผิดพลาด'
        )
      );
    })
    .finally(function () {
      if (btn) {
        btn.disabled = false;
      }
    });
}

function exitProviderMode(btn) {
  if (!sb || !currentUser) return;

  if (btn) {
    btn.disabled = true;
  }

  sb
    .rpc('disable_freelancer')
    .then(function (res) {
      if (res.error) throw res.error;

      toast('ปิดโหมดผู้ให้บริการแล้ว');

      return loadProfile(currentUser.id);
    })
    .then(function () {
      go('home');
    })
    .catch(function (error) {
      toast(
        'ไม่สามารถปิดโหมดได้: ' +
        (
          error.message ||
          'เกิดข้อผิดพลาด'
        )
      );
    })
    .finally(function () {
      if (btn) {
        btn.disabled = false;
      }
    });
}
async function loadFreelancerApplication() {
  if (!sb || !currentUser) return;

  const statusBox = document.getElementById(
    'freelancerApplicationStatus'
  );

  const formBox = document.getElementById(
    'freelancerApplicationForm'
  );

  if (!statusBox || !formBox) return;

  const { data, error } = await sb
    .from('freelancer_applications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(error);
    return;
  }

  // ยังไม่เคยสมัคร
  if (!data) {
    statusBox.innerHTML = '';
    formBox.style.display = 'block';
    return;
  }

  // รออนุมัติ
  if (data.status === 'pending') {
    statusBox.innerHTML = `
      <div class="application-status pending">
        <strong>⏳ ใบสมัครกำลังรอการตรวจสอบ</strong>
        ตอนนี้คุณส่งข้อมูลเรียบร้อยแล้ว กรุณารอผู้ดูแลระบบอนุมัติ
      </div>
    `;

    formBox.style.display = 'none';
    return;
  }

  // อนุมัติแล้ว
  if (data.status === 'approved') {
    statusBox.innerHTML = `
      <div class="application-status approved">
        <strong>✓ คุณได้รับการอนุมัติแล้ว</strong>
        ตอนนี้คุณสามารถเปิดโหมดผู้ให้บริการและรับงานได้
      </div>
    `;

    formBox.style.display = 'none';
    return;
  }

  // ไม่อนุมัติ
  if (data.status === 'rejected') {
    statusBox.innerHTML = `
      <div class="application-status rejected">
        <strong>✕ ใบสมัครยังไม่ได้รับการอนุมัติ</strong>
        ${data.rejection_reason || 'กรุณาตรวจสอบข้อมูลและสมัครใหม่'}
      </div>
    `;

    formBox.style.display = 'block';
  }
}


async function submitFreelancerApplication() {
  if (!sb || !currentUser) {
    go('login');
    return;
  }

  const serviceArea =
    document.getElementById('freelancerServiceArea').value.trim();

  const services =
    document.getElementById('freelancerServices').value.trim();

  const bio =
    document.getElementById('freelancerBio').value.trim();

  const startingPrice =
    Number(
      document.getElementById('freelancerStartingPrice').value
    );

  const portfolioNote =
    document.getElementById('freelancerPortfolioNote').value.trim();

  const identityDocumentPath =
    document.getElementById(
      'freelancerIdentityDocument'
    ).value.trim();

  if (
    !serviceArea ||
    !services ||
    !bio ||
    !startingPrice ||
    startingPrice < 0 ||
    !portfolioNote ||
    !identityDocumentPath
  ) {
    toast('กรุณากรอกข้อมูลให้ครบ');
    return;
  }

  const button = document.getElementById(
    'submitFreelancerApplication'
  );

  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = 'กำลังส่งใบสมัคร...';

  try {

    const { data, error } = await sb.rpc(
      'submit_freelancer_application',
      {
        p_service_area: serviceArea,
        p_services: services,
        p_bio: bio,
        p_starting_price: startingPrice,
        p_portfolio_note: portfolioNote,
        p_identity_document_path: identityDocumentPath
      }
    );

    if (error) throw error;

    console.log(
      'Freelancer application submitted:',
      data
    );

    toast('ส่งใบสมัครเรียบร้อยแล้ว');

    await loadFreelancerApplication();

  } catch (error) {

    console.error(
      'submit freelancer application error:',
      error
    );

    toast(
      error.message ||
      'ไม่สามารถส่งใบสมัครได้'
    );

  } finally {

    button.disabled = false;
    button.textContent = originalText;

  }
}


document.addEventListener('click', function (event) {
  if (
    event.target &&
    event.target.id === 'submitFreelancerApplication'
  ) {
    submitFreelancerApplication();
  }
});
