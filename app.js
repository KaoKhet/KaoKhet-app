// ==========================================
// ⚡ Supabase Client & Global State
// ==========================================
const SUPABASE_URL = 'https://gnkfvgikmbbudvkblcnx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_y7mJl9_LvLkKPOrInpoucg_BN7xR3UI';

let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let currentUser = null;
let currentClan = localStorage.getItem('strive_clan') || 'green';
let currentProfile = {
  clan: currentClan,
  points: 250,
  xp: 450,
  level: 3
};

let stamina = 100;

// ==========================================
// 🛡️ ระบบจัดการเลเยอร์กลาง (Dynamic Layer Manager)
// ==========================================
let globalZIndexCounter = 3000;

function openTopLayer(modalId, displayStyle = 'flex') {
  const targetElement = document.getElementById(modalId);
  if (!targetElement) {
    console.warn(`ไม่พบ Element ID: ${modalId}`);
    return;
  }
  globalZIndexCounter += 10;
  targetElement.style.zIndex = globalZIndexCounter;
  targetElement.style.display = displayStyle;
}

function closeTopLayer(modalId) {
  const targetElement = document.getElementById(modalId);
  if (targetElement) {
    targetElement.style.display = 'none';
  }
}

// ==========================================
// 🔐 ระบบล็อกอิน & โปรไฟล์ผู้ใช้จริง (Supabase Auth)
// ==========================================
async function handleAuthLogin(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();

  if (!supabaseClient) {
    showToast('❌ ไม่พบการเชื่อมต่อฐานข้อมูล Supabase');
    return;
  }

  try {
    let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      let signUpRes = await supabaseClient.auth.signUp({ email, password });
      if (signUpRes.error) {
        showToast('❌ ล็อกอินไม่สำเร็จ: ' + signUpRes.error.message);
        return;
      }
      data = signUpRes;
    }

    if (data?.user) {
      await initUserProfile(data.user);
      loginSuccess(data.user.email);
    }
  } catch (err) {
    showToast('❌ เกิดข้อผิดพลาดในการเชื่อมต่อระบบสมาชิก');
  }
}

async function restoreSessionOnLoad() {
  if (!supabaseClient || !supabaseClient.auth) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
      const authScreen = document.getElementById('screen-auth');
      if (authScreen) authScreen.style.display = 'none';

      await initUserProfile(session.user);
      loginSuccess(session.user.email);
    }
  } catch (err) {
    console.error('Error restoring session:', err);
  }
}

async function initUserProfile(user) {
  currentUser = user;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    const newProfile = {
      id: user.id,
      email: user.email,
      clan: 'green',
      points: 250,
      xp: 450,
      level: 3
    };
    await supabaseClient.from('profiles').insert([newProfile]);
    currentProfile = newProfile;
  } else {
    currentProfile = data;
  }

  currentClan = currentProfile.clan || 'green';
  localStorage.setItem('strive_clan', currentClan);
  updateProfileUI();
  if (typeof loadMyCoupons === 'function') {
    await loadMyCoupons(currentUser?.id);
  }
}

function updateProfileUI() {
  const emailDisplay = document.getElementById('profile-email-display');
  if (emailDisplay && currentUser) emailDisplay.textContent = currentUser.email;

  const lvlEl = document.getElementById('profile-level-display');
  const xpEl = document.getElementById('profile-xp-display');
  const pointsEl = document.getElementById('user-points-val');
  const sponsorPointsEl = document.getElementById('sponsor-user-points');
  const clanDisplay = document.getElementById('user-clan-display');
  const detailPoints = document.getElementById('detail-points');

  if (lvlEl) lvlEl.textContent = `🔰 เลเวล ${currentProfile.level}: เจ้าเมืองผู้ชำนาญการ`;
  if (xpEl) xpEl.textContent = `⭐ สะสม ${currentProfile.xp} / ${currentProfile.level * 200} XP`;
  if (pointsEl) pointsEl.textContent = `${currentProfile.points.toLocaleString()} Points`;
  if (sponsorPointsEl) sponsorPointsEl.textContent = `${currentProfile.points.toLocaleString()} Points`;
  if (detailPoints) detailPoints.textContent = `${currentProfile.points.toLocaleString()} คะแนน`;

  const clanNames = { green: '🟢 Green Forest', blue: '🔵 Blue Ocean', red: '🔴 Red Blaze' };
  if (clanDisplay) clanDisplay.textContent = clanNames[currentClan] || '🟢 Green Forest';
}

function loginSuccess(email) {
  document.getElementById('screen-auth').style.display = 'none';
  document.getElementById('screen-map').classList.add('active');
  initMap();
  showToast(`🎉 ยินดีต้อนรับคุณ ${email}`);
  checkTerritoryDefenseAlert();
}

function handleLogout() {
  currentUser = null;
  if (supabaseClient) supabaseClient.auth.signOut();
  document.getElementById('screen-auth').style.display = 'flex';
  document.getElementById('screen-map').classList.remove('active');
}

function showToast(msg) {
  const toast = document.getElementById('toast-notification');
  if (toast) {
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3400);
  }
}

function checkTerritoryDefenseAlert() {
  setTimeout(() => {
    const alerts = [
      "⚠️ เตือนภัย! พื้นที่โซนของคุณกำลังถูกแคลนอื่นรุกราน!",
      "📢 ตรวจพบการเคลื่อนไหวแย่งชิงอาณาเขตในพื้นที่ของคุณ!"
    ];
    showToast(alerts[Math.floor(Math.random() * alerts.length)]);
  }, 4000);
}

// ==========================================
// 📱 แผงสไลด์ล่าง 2 ระดับ
// ==========================================
let isSheetExpanded = false;

function applyBottomSheetState(expanded) {
  isSheetExpanded = Boolean(expanded);
  const panel = document.getElementById('bottomPanel');
  const container = document.getElementById('stats-bottom-sheet');
  if (!panel) return;

  panel.classList.toggle('panel-collapsed', !isSheetExpanded);
  panel.classList.toggle('panel-expanded', isSheetExpanded);
  if (container) {
    container.classList.toggle('is-expanded', isSheetExpanded);
  }
}

function toggleBottomSheet() {
  applyBottomSheetState(!isSheetExpanded);
}

function expandBottomSheet() {
  if (!isSheetExpanded) applyBottomSheetState(true);
}

function initBottomSheetGestures() {
  const panel = document.getElementById('bottomPanel');
  const handle = document.getElementById('dragHandle');
  const detailsContainer = panel ? panel.querySelector('.expanded-details') : null;
  if (!panel) return;

  if (handle) {
    handle.addEventListener('click', toggleBottomSheet);
  }

  let touchStartY = 0;
  let touchEndY = 0;

  panel.addEventListener('touchstart', (e) => {
    if (e.changedTouches && e.changedTouches.length > 0) {
      touchStartY = e.changedTouches[0].screenY;
    }
  }, { passive: true });

  panel.addEventListener('touchend', (e) => {
    if (e.changedTouches && e.changedTouches.length > 0) {
      touchEndY = e.changedTouches[0].screenY;
      const diff = touchStartY - touchEndY;
      if (Math.abs(diff) < 25) return;

      // ถ้าแผงขยายอยู่ และผู้ใช้พยายามปัดลง
      if (isSheetExpanded && diff < -30) {
        // อนุญาตให้ปิดแผงได้ก็ต่อเมื่อแตะลากที่แฮนด์ดึง หรือเนื้อหาด้านในเลื่อนขึ้นไปอยู่ที่จุดบนสุด (scrollTop === 0) แล้วเท่านั้น
        const isTouchingHandle = handle && handle.contains(e.target);
        const isAtTop = detailsContainer ? detailsContainer.scrollTop === 0 : true;

        if (isTouchingHandle || isAtTop) {
          applyBottomSheetState(false);
        }
      } else if (!isSheetExpanded && diff > 30) {
        applyBottomSheetState(true);
      }
    }
  }, { passive: true });
}

// ==========================================
// ☰ เมนูโหมดบนแผนที่แบบปุ่มเดียวขยายออก
// ==========================================
let activeSideMode = 'map';

function executeSideMode(mode) {
  activeSideMode = mode;

  if (mode === 'my-area') {
    filterMapTerritories('mine');
  } else if (mode === 'friends') {
    showToast('👥 โหมดเพื่อน: กำลังแสดงตำแหน่งและเส้นทางเพื่อน');
  } else if (mode === 'sponsors') {
    filterMapTerritories('sponsors');
  } else if (mode === 'fog') {
    toggleFogOfWar();
  } else if (mode === 'map') {
    filterMapTerritories('all');
  } else if (mode === 'boss') {
    filterMapTerritories('boss');
  } else if (mode === 'code') {
    showToast('📱 โหมดโค้ด: เปิดใช้งานโหมดสแกน/กรอกโค้ด');
  }
}

function initSideModeMenu() {
  const menuToggle = document.getElementById('menuToggle');
  const menuOverlay = document.getElementById('menuOverlay');
  const menuContainer = document.getElementById('menuContainer');
  const menuItems = document.querySelectorAll('.menu-item');

  if (!menuToggle || !menuContainer) return;

  let menuOpen = false;

  function toggleMenu() {
    menuOpen = !menuOpen;
    menuToggle.classList.toggle('open', menuOpen);
    if (menuOverlay) menuOverlay.classList.toggle('open', menuOpen);
    menuContainer.classList.toggle('open', menuOpen);
  }

  menuToggle.addEventListener('click', toggleMenu);
  if (menuOverlay) menuOverlay.addEventListener('click', toggleMenu);

  menuItems.forEach(item => {
    const label = item.querySelector('.menu-item-label');
    const icon = item.querySelector('.menu-item-icon');
    const mode = item.getAttribute('data-mode');

    const selectThisMode = (e) => {
      e.stopPropagation();
      menuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      executeSideMode(mode);
      if (menuOpen) toggleMenu();
    };

    if (label) label.addEventListener('click', selectThisMode);
    if (icon) icon.addEventListener('click', selectThisMode);
  });
}

// ==========================================
// 🛡️ ระบบแคลน & ทีม (Clan & Guild War)
// ==========================================
function openClanSelectModal() {
  openTopLayer('clan-modal', 'flex');
}
function closeClanModal() {
  closeTopLayer('clan-modal');
}

async function setClan(clanKey) {
  currentClan = clanKey;
  localStorage.setItem('strive_clan', clanKey);
  const clanNames = { green: '🟢 Green Forest', blue: '🔵 Blue Ocean', red: '🔴 Red Blaze' };
  document.getElementById('user-clan-display').textContent = clanNames[clanKey] || clanKey;

  if (currentUser && supabaseClient) {
    await supabaseClient.from('profiles').update({ clan: clanKey }).eq('id', currentUser.id);
  }

  showToast('🛡️ เปลี่ยนแคลนสำเร็จ: ' + clanNames[clanKey]);
  closeClanModal();
}

// ==========================================
// 🎵 ระบบ Music Widget (Piped API Stream)
// ==========================================
let currentAudio = null;
let playlist = [];
let currentIndex = 0;
let isPlaying = false;

function openMusicWidget() {
  openTopLayer('music-widget', 'block');
}
function closeMusicWidget() {
  closeTopLayer('music-widget');
}
function minimizeMusicWidget() {
  closeTopLayer('music-widget');
  const pill = document.getElementById('music-pill');
  if (pill) pill.style.display = 'flex';
}
function restoreMusicWidget() {
  openTopLayer('music-widget', 'block');
  const pill = document.getElementById('music-pill');
  if (pill) pill.style.display = 'none';
}
function initMusicSystem() { console.log("Music system initialized."); }

function searchAndPlayMusic() {
  const searchInput = document.getElementById('widget-search-input');
  if (searchInput && searchInput.value.trim()) {
    searchRealMusic(searchInput.value.trim());
  }
}

async function searchRealMusic(query) {
  try {
    const res = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=music_videos`);
    const data = await res.json();
    if (data && data.items && data.items.length > 0) {
      playlist = data.items.slice(0, 10).map(item => ({
        title: item.title,
        artist: item.uploaderName || "Unknown Artist",
        videoId: item.url.replace('/watch?v=', '')
      }));
      renderSearchResults(playlist);
    } else {
      showToast("ไม่พบเพลงที่คุณต้องการ");
    }
  } catch (err) { console.error(err); }
}

function renderSearchResults(songs) {
  const container = document.getElementById('search-results-list');
  if (!container) return;
  container.innerHTML = '';
  songs.forEach((song, index) => {
    const item = document.createElement('div');
    item.style.cssText = "display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #e5e7eb; cursor:pointer;";
    item.innerHTML = `
            <div style="width:36px; height:36px; background:#10b981; color:white; border-radius:8px; display:flex; justify-content:center; align-items:center;">🎵</div>
            <div style="flex:1; overflow:hidden;">
                <div style="font-size:13px; font-weight:600; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${song.title}</div>
                <div style="font-size:11px; color:#6b7280;">${song.artist}</div>
            </div>
        `;
    item.onclick = () => selectSongFromList(index);
    container.appendChild(item);
  });
  container.style.display = 'block';
}

async function selectSongFromList(index) {
  currentIndex = index;
  const song = playlist[currentIndex];
  document.getElementById('search-results-list').style.display = 'none';
  updateWidgetUI();

  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  try {
    const res = await fetch(`https://pipedapi.kavin.rocks/streams/${song.videoId}`);
    const data = await res.json();
    if (data.audioStreams && data.audioStreams.length > 0) {
      currentAudio = new Audio(data.audioStreams[0].url);
      currentAudio.play().then(() => { isPlaying = true; updatePlayButtonUI(); });
      currentAudio.onended = () => nextSong();
    }
  } catch (err) { console.error(err); }
}

function togglePlayMusic() {
  if (!currentAudio) { if (playlist.length > 0) selectSongFromList(currentIndex); return; }
  if (isPlaying) { currentAudio.pause(); isPlaying = false; }
  else { currentAudio.play(); isPlaying = true; }
  updatePlayButtonUI();
}

function updatePlayButtonUI() {
  const btn = document.getElementById('widget-play-btn');
  if (btn) btn.innerText = isPlaying ? '⏸' : '▶';
}

function nextSong() {
  if (playlist.length === 0) return;
  currentIndex = (currentIndex + 1) % playlist.length;
  selectSongFromList(currentIndex);
}

function prevSong() {
  if (playlist.length === 0) return;
  currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
  selectSongFromList(currentIndex);
}

function updateWidgetUI() {
  if (playlist.length === 0) return;
  const song = playlist[currentIndex];
  document.getElementById('widget-song-title').innerText = song.title;
  document.getElementById('widget-artist').innerText = song.artist;
}

// ==========================================
// 🗺️ ระบบแผนที่และการติดตาม (KaoKhet Tracking)
// ==========================================
let map;
let isTracking = false;
let startTime = null;
let startTimeISO = null;
let timerInterval = null;
let totalDistance = 0;
let lastPosition = null;
let steps = 0;
let watchId = null;

let pathCoordinates = [];
let routePolyline = null;
let startingPoint = null;
let isCapturedSuccess = false;
let userMarker = null;

let territoryLayerGroup = null;
let landmarkLayerGroup = null;
let ghostPolyline = null;
let isGhostModeActive = false;
let isFogActive = false;

window.getTotalStats = () => ({ distance: totalDistance, steps: steps });

function initMap() {
  if (map) {
    setTimeout(() => map.invalidateSize(), 150);
    return;
  }
  map = L.map('map').setView([13.736717, 100.523186], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  loadCapturedTerritories();
  renderStrategicLandmarks();
  loadSponsorNodesOnMap();
  setTimeout(() => map.invalidateSize(), 150);
}

function locateUser() {
  if (!navigator.geolocation) { alert('ไม่รองรับตำแหน่ง'); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      if (map) map.setView([lat, lng], 16);
      updateUserMarker(lat, lng);
      const locText = document.getElementById('top-location-text');
      if (locText) locText.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    },
    (err) => alert('หาตำแหน่งไม่สำเร็จ: ' + err.message)
  );
}

function updateUserMarker(lat, lng) {
  if (!map) return;
  if (!userMarker) {
    userMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: 'user-pin', html: '📍', iconSize: [30, 30] })
    }).addTo(map);
  } else {
    userMarker.setLatLng([lat, lng]);
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateStats() {
  const distNumberText = totalDistance.toFixed(2);
  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const timeText = formatTime(elapsed);
  const calories = Math.round(steps * 0.04);
  const avgSpeed = elapsed > 0 && totalDistance > 0
    ? `${(totalDistance / (elapsed / 3600)).toFixed(1)} กม./ชม.`
    : '— กม./ชม.';

  let paceText = '— min/km';
  if (totalDistance > 0.01 && elapsed > 0) {
    const paceTotalSec = elapsed / totalDistance;
    const paceMin = Math.floor(paceTotalSec / 60);
    const paceSec = Math.floor(paceTotalSec % 60).toString().padStart(2, '0');
    paceText = `${paceMin}:${paceSec} min/km`;
  }
  const cadenceVal = elapsed > 0 ? Math.round((steps / elapsed) * 60) : 0;

  const statDistEl = document.getElementById('stat-distance');
  const statTimeEl = document.getElementById('stat-time');
  const statStepsEl = document.getElementById('stat-steps');
  const statCalEl = document.getElementById('stat-cal');
  if (statDistEl) statDistEl.textContent = distNumberText;
  if (statTimeEl) statTimeEl.textContent = timeText;
  if (statStepsEl) statStepsEl.textContent = steps.toLocaleString();
  if (statCalEl) statCalEl.textContent = calories;

  const staminaTextEl = document.getElementById('stat-stamina-text');
  const staminaPercentEl = document.getElementById('stat-stamina-percent');
  const staminaFillEl = document.getElementById('stat-stamina-fill');
  if (staminaTextEl) staminaTextEl.textContent = `ความคืบหน้า: ${stamina}/100 คะแนน`;
  if (staminaPercentEl) staminaPercentEl.textContent = `${stamina}%`;
  if (staminaFillEl) staminaFillEl.style.width = `${stamina}%`;

  const detailDistEl = document.getElementById('detail-distance');
  const detailTimeEl = document.getElementById('detail-time');
  const detailPaceEl = document.getElementById('detail-pace');
  const detailSpeedEl = document.getElementById('detail-speed');
  const detailCadenceEl = document.getElementById('detail-cadence');
  const detailStepsEl = document.getElementById('detail-steps');
  const detailCalEl = document.getElementById('detail-cal');
  const detailPointsEl = document.getElementById('detail-points');

  if (detailDistEl) detailDistEl.textContent = `${distNumberText} กม.`;
  if (detailTimeEl) detailTimeEl.textContent = timeText;
  if (detailPaceEl) detailPaceEl.textContent = paceText;
  if (detailSpeedEl) detailSpeedEl.textContent = avgSpeed;
  if (detailCadenceEl) detailCadenceEl.textContent = `${cadenceVal} spm`;
  if (detailStepsEl) detailStepsEl.textContent = `${steps.toLocaleString()} ก้าว`;
  if (detailCalEl) detailCalEl.textContent = `${calories} kcal`;
  if (detailPointsEl) detailPointsEl.textContent = `${(currentProfile.points || 0).toLocaleString()} คะแนน`;
}

function startTracking() {
  if (stamina <= 0) {
    showToast('⚠️ พลังงาน (Stamina) ของคุณหมดแล้ว!');
    return;
  }

  isTracking = true;
  startTime = Date.now();
  startTimeISO = new Date().toISOString();
  totalDistance = 0;
  lastPosition = null;
  steps = 0;
  pathCoordinates = [];
  startingPoint = null;
  isCapturedSuccess = false;

  if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }

  const startBtn = document.getElementById('start-btn');
  startBtn.textContent = 'STOP';
  startBtn.classList.add('tracking');

  timerInterval = setInterval(updateStats, 1000);

  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => { processNewCoordinate(pos.coords.latitude, pos.coords.longitude); },
      (err) => console.log('GPS error:', err.message),
      { enableHighAccuracy: true, maximumAge: 1000, distanceFilter: 1 }
    );
  }
}

function processNewCoordinate(lat, lng) {
  updateUserMarker(lat, lng);
  checkSponsorNodesProximity(lat, lng);
  const currentLatLng = [lat, lng];

  if (!startingPoint) {
    startingPoint = { lat, lng };
    L.circleMarker(currentLatLng, { color: '#3b82f6', radius: 6, fillOpacity: 0.8 })
      .addTo(map).bindPopup('จุดเริ่มต้นออกตัว 🚀');
  }

  if (lastPosition) {
    const dist = map.distance([lastPosition.lat, lastPosition.lng], currentLatLng) / 1000;
    totalDistance += dist;
    if (dist > 0.0005) {
      steps += Math.floor(dist * 1300);
      stamina = Math.max(0, stamina - 1);
    }

    if (totalDistance > 0.1 && startingPoint) {
      const distanceToStart = map.distance(currentLatLng, [startingPoint.lat, startingPoint.lng]);
      if (distanceToStart < 15 && !isCapturedSuccess) {
        isCapturedSuccess = true;
        addPlayerXP(100);
        showToast('🎉 ยินดีด้วย! คุณเดินวนครบรอบและยึดครองพื้นที่สำเร็จ! (+100 XP)');
      }
    }
  }

  lastPosition = { lat, lng };
  pathCoordinates.push(currentLatLng);

  const clanColors = { green: '#22c55e', blue: '#3b82f6', red: '#ef4444' };
  if (!routePolyline) {
    routePolyline = L.polyline(pathCoordinates, { color: clanColors[currentClan] || '#22c55e', weight: 5, opacity: 0.8 }).addTo(map);
  } else {
    routePolyline.setLatLngs(pathCoordinates);
  }

  map.setView(currentLatLng, map.getZoom());
}

async function checkSponsorNodesProximity(userLat, userLng) {
  if (!supabaseClient || !currentUser) return;

  try {
    const { data: campaigns } = await supabaseClient
      .from('campaigns')
      .select('id, title, lat, lng, node_radius, is_secret_node, reward_details')
      .not('lat', 'is', null)
      .not('lng', 'is', null);

    if (!campaigns) return;

    campaigns.forEach(async camp => {
      const distanceMeters = map.distance([userLat, userLng], [camp.lat, camp.lng]);
      const radius = camp.node_radius || 50;

      if (distanceMeters <= radius) {
        const cacheKey = `checked_node_${currentUser.id}_${camp.id}`;
        if (localStorage.getItem(cacheKey)) return;

        localStorage.setItem(cacheKey, 'true');
        showToast(`🎉 คุณเดินมาถึงป้อมปราการ "${camp.title}" แล้ว! ปลดล็อกสิทธิ์พิเศษสำเร็จ!`);
      }
    });
  } catch (err) {
    console.error('Error checking proximity:', err);
  }
}

async function addPlayerXP(amount) {
  currentProfile.xp += amount;
  currentProfile.level = Math.floor(currentProfile.xp / 200) + 1;
  updateProfileUI();

  if (currentUser && supabaseClient) {
    await supabaseClient.from('profiles').update({
      xp: currentProfile.xp,
      level: currentProfile.level
    }).eq('id', currentUser.id);
  }
}

function renderStrategicLandmarks() {
  if (!map) return;
  if (landmarkLayerGroup) map.removeLayer(landmarkLayerGroup);
  landmarkLayerGroup = L.layerGroup();

  const mockLandmarks = [
    { lat: 13.738, lng: 100.525, name: '🏰 หอคอยโบนัสแต้ม x2' },
    { lat: 13.734, lng: 100.520, name: '⚡ จุดฟื้นฟูพลังงาน Stamina' }
  ];

  mockLandmarks.forEach(lm => {
    const marker = L.marker([lm.lat, lm.lng], {
      icon: L.divIcon({ className: 'landmark-pin', html: '⭐', iconSize: [28, 28] })
    }).bindPopup(`<b>${lm.name}</b><br>ยึดพื้นที่ทับจุดนี้รับโบนัสพิเศษ!`);
    landmarkLayerGroup.addLayer(marker);
  });
  landmarkLayerGroup.addTo(map);
}

function toggleGhostMode() {
  isGhostModeActive = !isGhostModeActive;
  if (isGhostModeActive) {
    showToast('👻 เปิดโหมด Ghost (แสดงเส้นทางอ้างอิง)');
    const ghostCoords = [[13.7367, 100.5231], [13.7380, 100.5231], [13.7380, 100.5250], [13.7367, 100.5250]];
    ghostPolyline = L.polyline(ghostCoords, { color: '#9ca3af', weight: 4, dashArray: '5, 5', opacity: 0.8 }).addTo(map);
  } else {
    showToast('ปิดโหมด Ghost แล้ว');
    if (ghostPolyline) { map.removeLayer(ghostPolyline); ghostPolyline = null; }
  }
}

function toggleFogOfWar() {
  isFogActive = !isFogActive;
  showToast(isFogActive ? '🌫️ เปิดใช้งานหมอกสำรวจพื้นที่' : 'ปิดหมอกสำรวจ');
}

function filterMapTerritories(type) { showToast('🌐 ตัวกรองแผนที่: ' + type); }

async function loadCapturedTerritories() {
  if (!map || !supabaseClient) return;

  if (!territoryLayerGroup) {
    territoryLayerGroup = L.layerGroup().addTo(map);
  } else {
    territoryLayerGroup.clearLayers();
  }

  try {
    const { data: territories, error } = await supabaseClient
      .from('journeys')
      .select('*')
      .eq('is_captured', true);

    if (error || !territories) return;

    territories.forEach((item) => {
      if (item.path_coordinates && item.path_coordinates.length > 2) {
        L.polygon(item.path_coordinates, {
          color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.35, weight: 2
        }).addTo(territoryLayerGroup);
      }
    });
  } catch (err) { console.error(err); }
}

// 📋 1. กด Stop: แค่หยุดเวลาและเปิด Summary Modal (ยังไม่ INSERT ลง DB)
function stopTracking() {
  isTracking = false;
  clearInterval(timerInterval);
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }

  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.textContent = 'KAOKHET';
    startBtn.classList.remove('tracking');
  }

  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const distKm = (typeof totalDistance !== 'undefined' ? totalDistance : 0).toFixed(2);
  const paceStr = (typeof currentPace !== 'undefined' ? currentPace : '—');
  const stepsVal = (typeof steps !== 'undefined' ? steps : 0);
  const calVal = Math.round(stepsVal * 0.04);
  const cadenceVal = (typeof cadence !== 'undefined' ? cadence : 0);
  const heartVal = (typeof avgHeartRate !== 'undefined' ? avgHeartRate : 125);

  const elDist = document.getElementById('summary-distance');
  if (elDist) elDist.textContent = `${distKm} กม.`;

  const elTime = document.getElementById('summary-time');
  if (elTime) elTime.textContent = formatTime ? formatTime(elapsed) : `${Math.floor(elapsed / 60)}:${elapsed % 60}`;

  const elPace = document.getElementById('summary-pace');
  if (elPace) elPace.textContent = `${paceStr} /กม.`;

  const elSteps = document.getElementById('summary-steps');
  if (elSteps) elSteps.textContent = stepsVal.toLocaleString();

  const elCal = document.getElementById('summary-calories');
  if (elCal) elCal.textContent = `${calVal} kcal`;

  const elCadence = document.getElementById('summary-cadence');
  if (elCadence) elCadence.textContent = `${cadenceVal} spm`;

  const elHeart = document.getElementById('summary-heart');
  if (elHeart) elHeart.textContent = `${heartVal} bpm`;

  if (typeof openTopLayer === 'function') {
    openTopLayer('summary-modal', 'flex');
  }
}

// 🗑️ ปุ่มรีเซ็ตทิ้งเริ่มต้นใหม่ (ล้างข้อมูลทั้งหมด ไม่บันทึก)
function resetModal() {
  closeTopLayer('summary-modal');
  closeTopLayer('share-modal');
  totalDistance = 0;
  steps = 0;
  startTime = null;
  startTimeISO = null;
  lastPosition = null;
  startingPoint = null;
  pathCoordinates = [];
  isCapturedSuccess = false;

  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }
  updateStats();
  showToast('🗑️ รีเซ็ตข้อมูลเรียบร้อย');
}

// ▶️ ปุ่มไปต่อ (Resume): วิ่งต่อจากเดิม ไม่บันทึกและไม่ลบข้อมูล
function resumeTracking() {
  closeTopLayer('summary-modal');
  isTracking = true;
  startTime = startTime || Date.now();
  timerInterval = setInterval(updateStats, 1000);

  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.textContent = 'STOP';
    startBtn.classList.add('tracking');
  }

  // เปิดใช้งาน GPS Watch ต่อเนื่อง
  if (navigator.geolocation && watchId === null) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => { processNewCoordinate(pos.coords.latitude, pos.coords.longitude); },
      (err) => console.log('GPS error:', err.message),
      { enableHighAccuracy: true, maximumAge: 1000, distanceFilter: 1 }
    );
  }
  showToast('▶️ ดำเนินกิจกรรมต่อ...');
}

// 💾 บันทึกข้อมูลลง Supabase เมื่อกดปุ่มจาก Summary Modal (พร้อม Debug Log)
async function executeDatabaseInsert() {
  console.log("🚀 [DEBUG] เริ่มต้นกระบวนการบันทึกข้อมูลลง Supabase...");

  if (!supabaseClient || !currentUser) {
    console.warn("⚠️ [DEBUG] ไม่พบ Supabase Client หรือ User ที่ล็อกอิน");
    showToast('⚠️ กรุณาล็อกอินก่อนบันทึกข้อมูล');
    return false;
  }

  // ดึงค่าสถิติปัจจุบันให้แน่ใจว่าเป็นตัวเลขที่ถูกต้อง
  const currentDistKm = typeof totalDistance !== 'undefined' ? Number(totalDistance) || 0 : 0;
  const distanceInMeters = Math.round(currentDistKm * 1000);
  const stepsVal = typeof steps !== 'undefined' ? Number(steps) || 0 : 0;
  const calories = Math.round(stepsVal * 0.04);
  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

  console.log("📊 [DEBUG] สถิติที่จะบันทึก:", { currentDistKm, distanceInMeters, stepsVal, calories, elapsed });

  let paceDbStr = '0:00';
  if (currentDistKm > 0.01 && elapsed > 0) {
    const paceTotalSec = elapsed / currentDistKm;
    const paceMin = Math.floor(paceTotalSec / 60);
    const paceSec = Math.floor(paceTotalSec % 60).toString().padStart(2, '0');
    paceDbStr = `${paceMin}:${paceSec}`;
  }
  const cadenceVal = elapsed > 0 ? Math.round((stepsVal / elapsed) * 60) : 0;

  const endedAtISO = new Date().toISOString();
  const tripData = {
    user_id: currentUser.id,
    started_at: startTimeISO || endedAtISO,
    ended_at: endedAtISO,
    distance_meters: distanceInMeters,
    steps: stepsVal,
    calories: calories,
    pace: paceDbStr,
    cadence: cadenceVal,
    elevation_gain: 0,
    avg_heart_rate: 125,
    path_coordinates: typeof pathCoordinates !== 'undefined' ? [...pathCoordinates] : [],
    is_captured: typeof isCapturedSuccess !== 'undefined' ? isCapturedSuccess : false,
    activity_title: (typeof isCapturedSuccess !== 'undefined' && isCapturedSuccess)
      ? 'วิ่งยึดพื้นที่สำเร็จ 👑'
      : 'วิ่งออกกำลังกายทั่วไป 🏃'
  };

  console.log("📦 [DEBUG] Payload ที่ส่งเข้าตาราง journeys:", tripData);

  try {
    const { data, error } = await supabaseClient
      .from('journeys')
      .insert([tripData])
      .select();

    if (error) {
      console.error('❌ [DEBUG] Supabase insert error:', error);
      showToast('❌ บันทึกไม่สำเร็จ: ' + error.message);
      return false;
    }

    console.log('✅ [DEBUG] บันทึกสำเร็จ ได้รับข้อมูลตอบกลับ:', data);
    showToast('✅ บันทึกข้อมูลเรียบร้อย! กำลังเปิดหน้าแต่งรูป...');

    if (typeof addPlayerXP === 'function') {
      await addPlayerXP(Math.floor(currentDistKm * 50));
    }
    if (typeof loadCapturedTerritories === 'function') {
      loadCapturedTerritories();
    }
    return true;
  } catch (err) {
    console.error('❌ [DEBUG] Unexpected insert error:', err);
    showToast('❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    return false;
  }
}

// 📸 กดปุ่มบันทึกจาก Summary Modal: บันทึกลง DB สำเร็จ -> เปิด Studio -> รีเซ็ตหน้าจอหลักเบื้องหลัง
async function openShareModal() {
  console.log("📸 [DEBUG] ผู้ใช้กดบันทึกจาก Summary Modal");

  // 1. ปิดหน้า Summary Modal ก่อน
  if (typeof closeTopLayer === 'function') {
    closeTopLayer('summary-modal');
  }

  // 2. สั่งบันทึกลง Supabase
  const success = await executeDatabaseInsert();
  if (!success) {
    console.warn("⚠️ [DEBUG] การบันทึกไม่สำเร็จ ยกเลิกการเปิด Studio");
    return;
  }

  // 3. ถ้าบันทึกสำเร็จ เปิดหน้า KaoKhet Photo Studio ต่อ
  if (typeof openStudioModal === 'function') {
    openStudioModal();
  }
}

// ✖️ ปิดหน้าต่าง Studio และเคลียร์ค่าพร้อมวิ่งรอบใหม่
function finishActivity() {
  console.log("✨ [DEBUG] ปิดหน้า Studio และรีเซ็ตค่าสถานะระบบ");

  // 1. ปิดหน้าต่าง Studio
  if (typeof closeTopLayer === 'function') {
    closeTopLayer('share-modal');
  }

  // 2. สั่งรีเซ็ตค่าทางเดินและสถิติหน้าจอหลักให้กลับเป็น 0 ทันที
  if (typeof resetModal === 'function') {
    resetModal();
  }

  showToast('✨ เสร็จสิ้นกระบวนการ พร้อมลุยรอบใหม่!');
}

function openSummaryModal() {
  // ดึงค่าสถิติล่าสุดจากจอหลักหรือตัวแปรสถานะ
  const distText = document.getElementById('detail-distance')?.textContent || '0.00 กม.';
  const timeText = document.getElementById('detail-time')?.textContent || '00:00';
  const paceText = document.getElementById('detail-pace')?.textContent || '— /กม.';
  const stepsText = document.getElementById('detail-steps')?.textContent || '0';
  const calText = document.getElementById('detail-cal')?.textContent || '0 kcal';
  const cadenceText = document.getElementById('detail-cadence')?.textContent || '0 spm';
  const heartText = document.getElementById('detail-heart')?.textContent || '125 bpm';

  // นำไปใส่ใน Element ของ Summary Modal
  document.getElementById('summary-distance').textContent = distText;
  document.getElementById('summary-time').textContent = timeText;
  document.getElementById('summary-pace').textContent = paceText;
  document.getElementById('summary-steps').textContent = stepsText;
  document.getElementById('summary-calories').textContent = calText;
  document.getElementById('summary-cadence').textContent = cadenceText;
  document.getElementById('summary-heart').textContent = heartText;

  // เปิด Modal สรุปผล
  if (typeof openTopLayer === 'function') {
    openTopLayer('summary-modal', 'flex');
  }
}

// ==========================================
// 📱 Navigation & Screen Loaders
// ==========================================
function switchScreen(screenId) {
  const targetScreen = document.getElementById(screenId);
  if (!targetScreen) return;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  targetScreen.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navBtn = document.querySelector(`[data-screen="${screenId}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (screenId === 'screen-map' && map) setTimeout(() => map.invalidateSize(), 200);
  if (screenId === 'screen-history') loadHistoryData();
  if (screenId === 'screen-leaderboard') loadLeaderboardData('area');
  if (screenId === 'screen-profile') updateProfileUI();
  if (screenId === 'screen-sponsors') {
    if (typeof initShopModule === 'function') {
      initShopModule();
    }
  }
}

async function loadHistoryData() {
  const container = document.getElementById('history-list-container');
  if (!container || !supabaseClient || !currentUser) return;

  container.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:30px 0;">⏳ กำลังโหลดประวัติจากคลาวด์...</div>';

  try {
    const { data: journeys, error } = await supabaseClient
      .from('journeys')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('started_at', { ascending: false });

    if (error || !journeys || journeys.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:40px 0;">ยังไม่มีประวัติการเดินทาง</div>';
      return;
    }

    let totalDistMeters = 0, totalStepsCount = 0, totalCapturedCount = 0, html = '';

    journeys.forEach(item => {
      const distKm = (item.distance_meters / 1000) || 0;
      const stepVal = item.steps || 0;
      totalDistMeters += item.distance_meters || 0;
      totalStepsCount += stepVal;
      if (item.is_captured) totalCapturedCount++;

      const dateObj = new Date(item.started_at);
      const dateStr = dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
      const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      const badge = item.is_captured
        ? `<span style="background:#dcfce7; color:#15803d; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:600;">👑 ยึดพื้นที่สำเร็จ</span>`
        : `<span style="background:#f3f4f6; color:#6b7280; font-size:11px; padding:3px 8px; border-radius:12px;">🚶 บันทึกการเดิน</span>`;

      const encodedItem = encodeURIComponent(JSON.stringify(item));

      html += `
        <div style="background:#fff; border-radius:16px; padding:16px; margin-bottom:12px; box-shadow:0 2px 10px rgba(0,0,0,0.03); border:1px solid #f3f4f6;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div><span style="font-size:14px; font-weight:700; color:#1f2937;">📅 ${dateStr}</span><span style="font-size:12px; color:#9ca3af; margin-left:6px;">${timeStr} น.</span></div>
            ${badge}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; background:#f9fafb; padding:10px; border-radius:12px; text-align:center; margin-bottom:10px;">
            <div><div style="font-size:10px; color:#6b7280;">ระยะทาง</div><div style="font-size:14px; font-weight:700; color:#1f2937;">${distKm.toFixed(2)} กม.</div></div>
            <div><div style="font-size:10px; color:#6b7280;">ก้าวเดิน</div><div style="font-size:14px; font-weight:700; color:#1f2937;">${stepVal.toLocaleString()}</div></div>
            <div><div style="font-size:10px; color:#6b7280;">เพซเฉลี่ย</div><div style="font-size:14px; font-weight:700; color:#16a34a;">${item.pace || '—'}</div></div>
          </div>
          <button type="button" onclick="openHistoryShareModal(JSON.parse(decodeURIComponent('${encodedItem}')))"
            style="width:100%; padding:8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
            📸 สร้างการ์ดภาพแชร์สถิติรอบนี้
          </button>
        </div>
      `;
    });

    document.getElementById('total-stat-distance').textContent = (totalDistMeters / 1000).toFixed(2) + ' กม.';
    document.getElementById('total-stat-steps').textContent = totalStepsCount.toLocaleString();
    document.getElementById('total-stat-captured').textContent = totalCapturedCount + ' โซน';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<div style="text-align:center; color:#ef4444; padding:20px;">❌ โหลดข้อมูลประวัติไม่สำเร็จ</div>';
  }
}

async function loadLeaderboardData(type) {
  const container = document.getElementById('leaderboard-list-container');
  if (!container || !supabaseClient) return;

  try {
    const { data: profiles, error } = await supabaseClient
      .from('profiles')
      .select('email, clan, xp, level')
      .order('xp', { ascending: false })
      .limit(10);

    if (error || !profiles) return;

    let html = '';
    profiles.forEach((p, idx) => {
      const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
      html += `
        <div style="background:#fff; border-radius:14px; padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border:1px solid #f3f4f6; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-weight:bold; color:#eab308;">${rankBadge}</span>
            <span style="font-size:13px; font-weight:600;">${p.email} [${(p.clan || 'green').toUpperCase()}]</span>
          </div>
          <span style="font-weight:700; color:#22c55e;">${p.xp} XP (Lv.${p.level || 1})</span>
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (err) { console.error(err); }
}

function switchLeaderboardTab(type) {
  document.getElementById('lb-tab-area').style.background = type === 'area' ? '#22c55e' : '#fff';
  document.getElementById('lb-tab-area').style.color = type === 'area' ? '#fff' : '#4b5563';
  document.getElementById('lb-tab-dist').style.background = type === 'distance' ? '#22c55e' : '#fff';
  document.getElementById('lb-tab-dist').style.color = type === 'distance' ? '#fff' : '#4b5563';
  loadLeaderboardData(type);
}

let sponsorNodesLayerGroup = null;

async function loadSponsorNodesOnMap() {
  if (!map || !supabaseClient) return;

  if (!sponsorNodesLayerGroup) {
    sponsorNodesLayerGroup = L.layerGroup().addTo(map);
  } else {
    sponsorNodesLayerGroup.clearLayers();
  }

  try {
    const { data: campaigns, error } = await supabaseClient
      .from('campaigns')
      .select('*')
      .eq('is_active', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null);

    if (error || !campaigns) return;

    const groupedCampaigns = {};
    campaigns.forEach(camp => {
      const key = `${camp.lat}_${camp.lng}`;
      if (!groupedCampaigns[key]) {
        groupedCampaigns[key] = {
          lat: camp.lat,
          lng: camp.lng,
          storeId: camp.sponsor_id || camp.created_by || '',
          merchantName: camp.merchant_name || 'KaoKhet Partner',
          items: []
        };
      }
      groupedCampaigns[key].items.push(camp);
    });

    Object.values(groupedCampaigns).forEach(group => {
      const isBossGroup = group.items.some(i => i.is_raid_boss);
      const isSecretGroup = group.items.some(i => i.is_secret_node);

      let pinIcon = '🏪';
      let pinClass = 'sponsor-pin';
      if (isBossGroup) {
        pinIcon = '👹';
        pinClass = 'boss-pin';
      } else if (isSecretGroup) {
        pinIcon = '🥷';
        pinClass = 'secret-pin';
      }

      const marker = L.marker([group.lat, group.lng], {
        icon: L.divIcon({
          className: pinClass,
          html: `<div style="background:white; border-radius:50%; width:34px; height:34px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.3); font-size:18px;">${pinIcon}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        })
      });

      let popupHtml = `
        <div style="text-align:center; min-width:200px;">
          <div style="font-size:13px; font-weight:800; color:#3b82f6; margin-bottom:4px;">${group.merchantName}</div>
          <div style="border-top:1px solid #e5e7eb; margin-bottom:8px;"></div>
      `;

      group.items.forEach(camp => {
        const safeRewardAttr = encodeURIComponent(camp.reward_details || 'สิทธิ์พิเศษ');
        const safeCampaignId = String(camp.id || '').replace(/'/g, "\\'");
        const isBoss = camp.is_raid_boss;
        const isSecret = camp.is_secret_node;

        popupHtml += `
          <div style="background:#f9fafb; padding:8px; border-radius:8px; margin-bottom:8px; text-align:left; border-left:4px solid #22c55e;">
            <div style="font-size:13px; font-weight:700; color:#1f2937;">${camp.title || ''}</div>
            <div style="font-size:11px; color:#16a34a; font-weight:600; margin:2px 0;">🎁 ${camp.reward_details || 'สิทธิ์พิเศษ'}</div>
        `;

        if (isBoss) {
          const progress = Number(camp.current_distance_km || 0);
          const target = Number(camp.target_distance_km || 500);
          popupHtml += `
            <div style="background:#fffbeb; border:1px solid #fde68a; padding:4px; border-radius:6px; font-size:10px; margin-top:4px;">
              <b>👹 บอส: ${camp.boss_name || 'บอสประจำถิ่น'}</b><br>
              ความคืบหน้า: ${progress.toFixed(1)} / ${target} กม.
            </div>
          `;
        } else if (isSecret) {
          popupHtml += `
            <div style="font-size:10px; color:#d97706; background:#fef3c7; padding:2px 4px; border-radius:4px; margin-top:4px;">
              🥷 คูปองลับ: ต้องเช็กอินหน้าร้านเท่านั้น!
            </div>
          `;
        }

        popupHtml += `
            <button onclick="handleClaimCampaign('${safeCampaignId}', decodeURIComponent('${safeRewardAttr}'))" style="margin-top:6px; background:#22c55e; color:white; border:none; padding:5px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; width:100%;">
              🪙 แลกรับ (${camp.points_cost || 0} Pts)
            </button>
          </div>
        `;
      });

      if (group.storeId) {
        const safeStoreId = String(group.storeId).replace(/'/g, "\\'");
        popupHtml += `
          <button onclick="goToStoreProfile('${safeStoreId}')" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:6px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer; width:100%; margin-top:4px;">
            🏪 ดูโปรไฟล์ร้านค้า
          </button>
        `;
      }

      popupHtml += `</div>`;

      marker.bindPopup(popupHtml);
      sponsorNodesLayerGroup.addLayer(marker);

      const maxRadius = Math.max(...group.items.map(i => i.node_radius || 50));
      L.circle([group.lat, group.lng], {
        radius: maxRadius,
        interactive: false,
        color: isBossGroup ? '#ef4444' : (isSecretGroup ? '#d97706' : '#3b82f6'),
        fillColor: isBossGroup ? '#ef4444' : (isSecretGroup ? '#d97706' : '#3b82f6'),
        fillOpacity: 0.15,
        weight: 1
      }).addTo(sponsorNodesLayerGroup);
    });
  } catch (err) {
    console.error('Error loading sponsor nodes on map:', err);
  }
}

// ==========================================
// 📱 Safe Initialization & Event Binding
// ==========================================
let _KaoKhetAppInitialized = false;

function initKaoKhetApp() {
  if (_KaoKhetAppInitialized) return;
  _KaoKhetAppInitialized = true;

  initMusicSystem();
  initBottomSheetGestures();
  initSideModeMenu();
  restoreSessionOnLoad();

  const btnLoc = document.getElementById('btn-location');
  if (btnLoc) btnLoc.addEventListener('click', locateUser);

  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (isTracking) stopTracking();
      else startTracking();
    });
  }

  const modalReset = document.getElementById('modal-reset');
  if (modalReset) {
    modalReset.addEventListener('click', (e) => {
      e.preventDefault();
      resetModal();
    });
  }

  const modalResume = document.getElementById('modal-resume');
  if (modalResume) {
    modalResume.addEventListener('click', (e) => {
      e.preventDefault();
      resumeTracking();
    });
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.currentTarget.blur();
      const screenId = item.getAttribute('data-screen');
      if (screenId) {
        switchScreen(screenId);
      }

      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const icon = item.querySelector('.nav-icon');
      if (icon) {
        icon.style.transform = 'scale(1.25)';
        setTimeout(() => {
          icon.style.transform = item.classList.contains('active') ? 'scale(1.12)' : '';
        }, 150);
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initKaoKhetApp);
} else {
  initKaoKhetApp();
}