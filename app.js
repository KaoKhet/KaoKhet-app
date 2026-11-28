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
  const email = document.getElementById('auth-email')?.value.trim() || '';
  const password = document.getElementById('auth-password')?.value.trim() || '';
  const rawDisplayName = document.getElementById('auth-display-name')?.value.trim() || '';

  if (!supabaseClient) {
    showToast('❌ ไม่พบการเชื่อมต่อฐานข้อมูล Supabase');
    return;
  }

  try {
    let { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (!signInError && signInData?.user) {
      await initUserProfile(signInData.user, rawDisplayName);
      loginSuccess(signInData.user.email);
      return;
    }

    const signUpPayload = { email, password };
    if (rawDisplayName) {
      signUpPayload.options = {
        data: { display_name: rawDisplayName }
      };
    }

    const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp(signUpPayload);
    if (signUpError) {
      showToast('❌ ล็อกอินหรือสมัครสมาชิกไม่สำเร็จ: ' + signUpError.message);
      return;
    }

    if (signUpData?.user && signUpData?.session) {
      await initUserProfile(signUpData.user, rawDisplayName);
      loginSuccess(signUpData.user.email);
    } else if (signUpData?.user) {
      showToast('📩 สมัครสมาชิกแล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบครับ');
    }
  } catch (err) {
    showToast('❌ เกิดข้อผิดพลาดในการเชื่อมต่อระบบสมาชิก');
  }
}

async function initUserProfile(user, preferredDisplayName = '') {
  currentUser = user;

  const { data } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const resolvedName =
    (preferredDisplayName || '').trim() ||
    user.user_metadata?.display_name ||
    data?.display_name ||
    (user.email ? user.email.split('@')[0] : 'ผู้ใช้งาน');

  if (!data) {
    const newProfile = {
      id: user.id,
      email: user.email ?? null,
      display_name: resolvedName,
      clan: 'none',
      points: 0,
      xp: 0,
      level: 1
    };
    const { data: inserted } = await supabaseClient
      .from('profiles')
      .upsert(newProfile, { onConflict: 'id' })
      .select()
      .maybeSingle();
    currentProfile = inserted || newProfile;
  } else {
    currentProfile = data;
    if ((preferredDisplayName || '').trim() && !data.display_name) {
      await supabaseClient
        .from('profiles')
        .update({ display_name: preferredDisplayName.trim() })
        .eq('id', user.id);
      currentProfile.display_name = preferredDisplayName.trim();
    }
  }

  if (typeof initClanSystem === 'function') {
    await initClanSystem();
  }
  updateProfileUI();
  if (typeof loadMyCoupons === 'function') {
    await loadMyCoupons(currentUser?.id);
  }

  updateProfileUI();
  if (typeof loadMyCoupons === 'function') {
    await loadMyCoupons(currentUser?.id);
  }
  if (typeof loadPrivacyZoneFromSupabase === 'function') {
    await loadPrivacyZoneFromSupabase();
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

function updateProfileUI() {
  const lvlEl = document.getElementById('profile-level-display');
  const xpEl = document.getElementById('profile-xp-display');
  const pointsEl = document.getElementById('user-points-val');
  const sponsorPointsEl = document.getElementById('sponsor-user-points');
  const detailPoints = document.getElementById('detail-points');

  if (lvlEl) lvlEl.textContent = `🔰 เลเวล ${currentProfile.level}: เจ้าเมืองผู้ชำนาญการ`;
  if (xpEl) xpEl.textContent = `⭐ สะสม ${currentProfile.xp} / ${currentProfile.level * 200} XP`;
  if (pointsEl) pointsEl.textContent = `${(currentProfile.points || 0).toLocaleString()} Points`;
  if (sponsorPointsEl) sponsorPointsEl.textContent = `${(currentProfile.points || 0).toLocaleString()} Points`;
  if (detailPoints) detailPoints.textContent = `${(currentProfile.points || 0).toLocaleString()} คะแนน`;

  if (typeof loadProfileModuleData === 'function') {
    loadProfileModuleData();
  }

  if (typeof syncUserClanSummaryBanner === 'function') {
    syncUserClanSummaryBanner();
  }
}

function loginSuccess(emailOrName) {
  const authScreen = document.getElementById('screen-auth');
  const mapScreen = document.getElementById('screen-map');
  if (authScreen) {
    authScreen.style.display = 'none';
    authScreen.classList.remove('active');
  }
  if (mapScreen) {
    mapScreen.style.display = '';
    mapScreen.classList.add('active');
  }

  initMap();
  if (typeof loadProfileModuleData === 'function') {
    loadProfileModuleData();
  }

  const label = currentProfile?.display_name || emailOrName || 'ผู้ใช้งาน';
  showToast(`🎉 ยินดีต้อนรับคุณ ${label}`);
  checkTerritoryDefenseAlert();
}

async function handleLogout() {
  currentUser = null;
  currentProfile = {
    clan: currentClan,
    points: 0,
    xp: 0,
    level: 1
  };

  if (sponsorRealtimeChannel && supabaseClient && typeof supabaseClient.removeChannel === 'function') {
    try {
      await supabaseClient.removeChannel(sponsorRealtimeChannel);
    } catch (_) { }
    sponsorRealtimeChannel = null;
  }

  if (supabaseClient && supabaseClient.auth) {
    try {
      await supabaseClient.auth.signOut();
    } catch (_) { }
  }

  const authScreen = document.getElementById('screen-auth');
  const mapScreen = document.getElementById('screen-map');
  if (mapScreen) {
    mapScreen.classList.remove('active');
  }
  if (authScreen) {
    authScreen.style.display = 'flex';
    authScreen.classList.add('active');
  }
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

      if (isSheetExpanded && diff < -30) {
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
    switchScreen('screen-sponsors');
    showToast('📱 เปิดหน้าตรวจสอบ/สแกนโค้ดคูปอง');
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
let sponsorNodesLayerGroup = null;
let ghostPolyline = null;
let isGhostModeActive = false;

// สถานะสำหรับ Supabase Realtime และการรักษาป๊อปอัปที่เปิดอยู่
let sponsorRealtimeChannel = null;
let sponsorRealtimeDebounceTimer = null;
let activeSponsorPopupKey = null;
let currentSponsorFilterType = 'all';

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

  loadCapturedTerritories('all');
  renderStrategicLandmarks();
  loadSponsorNodesOnMap('all');
  subscribeSponsorNodesRealtime('all');
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

function computePaceText(distKm, elapsedSec) {
  if (distKm > 0.01 && elapsedSec > 0) {
    const paceTotalSec = elapsedSec / distKm;
    const paceMin = Math.floor(paceTotalSec / 60);
    const paceSec = Math.floor(paceTotalSec % 60).toString().padStart(2, '0');
    return `${paceMin}:${paceSec} min/km`;
  }
  return '— min/km';
}

function updateStats() {
  const distNumberText = totalDistance.toFixed(2);
  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const timeText = formatTime(elapsed);
  const calories = Math.round(steps * 0.04);
  const avgSpeed = elapsed > 0 && totalDistance > 0
    ? `${(totalDistance / (elapsed / 3600)).toFixed(1)} กม./ชม.`
    : '— กม./ชม.';
  const paceText = computePaceText(totalDistance, elapsed);
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

async function contributeDistanceToRaidBoss(distKm) {
  if (!supabaseClient || !currentUser || !(distKm > 0)) return;

  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const { data: raidBosses, error } = await supabaseClient
      .from('campaigns')
      .select('id, title, boss_name, current_distance_km, target_distance_km, min_distance_km, checked_in_at, defeated_at, is_raid_boss, campaign_type, is_active')
      .eq('is_active', true)
      .or('is_raid_boss.eq.true,campaign_type.eq.raid_boss');

    if (error || !raidBosses || raidBosses.length === 0) return;

    for (const boss of raidBosses) {
      const checkedKey = `checked_node_${currentUser.id}_${boss.id}_${todayKey}`;
      const hasCheckedIn = Boolean(localStorage.getItem(checkedKey)) || Boolean(boss.checked_in_at);
      if (!hasCheckedIn) continue;

      const targetKm = Number(boss.target_distance_km) > 0 ? Number(boss.target_distance_km) : 10;
      const currentKm = Number(boss.current_distance_km) || 0;
      if (currentKm >= targetKm) continue;

      const nextKm = Number(Math.min(targetKm, currentKm + distKm).toFixed(3));
      const isNowDefeated = nextKm >= targetKm;
      const updatePayload = { current_distance_km: nextKm };
      if (isNowDefeated && !boss.defeated_at) {
        updatePayload.defeated_at = new Date().toISOString();
      }

      const { error: updateErr } = await supabaseClient
        .from('campaigns')
        .update(updatePayload)
        .eq('id', boss.id);

      if (!updateErr) {
        const playerContribKey = `raid_contrib_${currentUser.id}_${boss.id}_${todayKey}`;
        const prevPlayerKm = Number(localStorage.getItem(playerContribKey) || 0);
        localStorage.setItem(playerContribKey, (prevPlayerKm + distKm).toFixed(3));

        const bossLabel = boss.boss_name || boss.title || 'บอสประจำแมพ';
        if (isNowDefeated) {
          if (!boss.defeated_at) {
            await recordCampaignDefeatedTimestamp(boss.id);
          }
          showToast(`🏆 ร่วมพิชิต "${bossLabel}" สำเร็จครบ ${targetKm} กม. แล้ว!`);
        } else {
          showToast(`⚔️ โจมตี "${bossLabel}" +${distKm.toFixed(2)} กม. (${nextKm.toFixed(1)}/${targetKm} กม.)`);
        }
      }
    }
  } catch (err) {
    console.error('Error updating raid boss distance:', err);
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

function filterMapTerritories(type) {
  const filterType = type || 'all';
  if (filterType === 'mine') {
    loadCapturedTerritories('mine');
    if (sponsorNodesLayerGroup && map) map.removeLayer(sponsorNodesLayerGroup);
    showToast('👤 กำลังแสดงพื้นที่ยึดครองของคุณ');
  } else if (filterType === 'sponsors') {
    if (territoryLayerGroup && map) map.removeLayer(territoryLayerGroup);
    loadSponsorNodesOnMap('sponsors');
    subscribeSponsorNodesRealtime('sponsors');
    showToast('🏪 กำลังแสดงป้อมปราการร้านค้าและสปอนเซอร์');
  } else if (filterType === 'boss') {
    if (territoryLayerGroup && map) map.removeLayer(territoryLayerGroup);
    loadSponsorNodesOnMap('boss');
    subscribeSponsorNodesRealtime('boss');
    showToast('👑 กำลังแสดงจุด Raid Boss บนแผนที่');
  } else {
    loadCapturedTerritories('all');
    loadSponsorNodesOnMap('all');
    subscribeSponsorNodesRealtime('all');
    showToast('🗺️ กำลังแสดงแผนที่ทั้งหมด');
  }
}

async function loadCapturedTerritories(filterMode = 'all') {
  if (!map || !supabaseClient) return;

  if (!territoryLayerGroup) {
    territoryLayerGroup = L.layerGroup();
  } else {
    territoryLayerGroup.clearLayers();
  }
  if (!map.hasLayer(territoryLayerGroup)) {
    territoryLayerGroup.addTo(map);
  }

  try {
    let query = supabaseClient
      .from('journeys')
      .select('*')
      .eq('is_captured', true);

    if (filterMode === 'mine' && currentUser?.id) {
      query = query.eq('user_id', currentUser.id);
    }

    const { data: territories, error } = await query;
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
  const distNum = typeof totalDistance !== 'undefined' ? Number(totalDistance) || 0 : 0;
  const distKm = distNum.toFixed(2);
  const paceStr = computePaceText(distNum, elapsed);
  const stepsVal = typeof steps !== 'undefined' ? Number(steps) || 0 : 0;
  const calVal = Math.round(stepsVal * 0.04);
  const cadenceVal = elapsed > 0 ? Math.round((stepsVal / elapsed) * 60) : 0;
  const heartVal = typeof avgHeartRate !== 'undefined' ? avgHeartRate : 125;

  const elDist = document.getElementById('summary-distance');
  if (elDist) elDist.textContent = `${distKm} กม.`;

  const elTime = document.getElementById('summary-time');
  if (elTime) elTime.textContent = formatTime(elapsed);

  const elPace = document.getElementById('summary-pace');
  if (elPace) elPace.textContent = paceStr;

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
    if (typeof contributeDistanceToRaidBoss === 'function' && currentDistKm > 0) {
      await contributeDistanceToRaidBoss(currentDistKm);
    }
    if (typeof recordClanWarContribution === 'function') {
      await recordClanWarContribution({
        distanceMeters: distanceInMeters,
        steps: stepsVal,
        isCaptured: Boolean(isCapturedSuccess)
      });
    }
    if (typeof loadCapturedTerritories === 'function') {
      loadCapturedTerritories(activeSideMode === 'mine' ? 'mine' : 'all');
    }
    if (typeof loadSponsorNodesOnMap === 'function') {
      await loadSponsorNodesOnMap(
        activeSideMode === 'sponsors' || activeSideMode === 'boss' ? activeSideMode : 'all',
        { preserveOpenPopup: true }
      );
    }
    if (typeof loadSponsorNodesOnMap === 'function') {
      await loadSponsorNodesOnMap(
        activeSideMode === 'sponsors' || activeSideMode === 'boss' ? activeSideMode : 'all',
        { preserveOpenPopup: true }
      );
    }
    if (typeof scheduleFogRefresh === 'function') {
      scheduleFogRefresh();
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

  if (typeof closeTopLayer === 'function') {
    closeTopLayer('summary-modal');
  }

  const success = await executeDatabaseInsert();
  if (!success) {
    console.warn("⚠️ [DEBUG] การบันทึกไม่สำเร็จ ยกเลิกการเปิด Studio");
    return;
  }

  if (typeof openStudioModal === 'function') {
    openStudioModal();
  }
}

// ✖️ ปิดหน้าต่าง Studio และเคลียร์ค่าพร้อมวิ่งรอบใหม่
function finishActivity() {
  console.log("✨ [DEBUG] ปิดหน้า Studio และรีเซ็ตค่าสถานะระบบ");

  if (typeof closeTopLayer === 'function') {
    closeTopLayer('share-modal');
  }

  if (typeof resetModal === 'function') {
    resetModal();
  }

  showToast('✨ เสร็จสิ้นกระบวนการ พร้อมลุยรอบใหม่!');
}

function openSummaryModal() {
  const distText = document.getElementById('detail-distance')?.textContent || '0.00 กม.';
  const timeText = document.getElementById('detail-time')?.textContent || '00:00';
  const paceText = document.getElementById('detail-pace')?.textContent || '— min/km';
  const stepsText = document.getElementById('detail-steps')?.textContent || '0 ก้าว';
  const calText = document.getElementById('detail-cal')?.textContent || '0 kcal';
  const cadenceText = document.getElementById('detail-cadence')?.textContent || '0 spm';
  const heartText = document.getElementById('detail-heart')?.textContent || '125 bpm';

  document.getElementById('summary-distance').textContent = distText;
  document.getElementById('summary-time').textContent = timeText;
  document.getElementById('summary-pace').textContent = paceText;
  document.getElementById('summary-steps').textContent = stepsText;
  document.getElementById('summary-calories').textContent = calText;
  document.getElementById('summary-cadence').textContent = cadenceText;
  document.getElementById('summary-heart').textContent = heartText;

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
  if (screenId === 'screen-profile') updateProfileUI();
  if (screenId === 'screen-leaderboard' && typeof switchClanSectionTab === 'function') {
    switchClanSectionTab('leaderboard');
  }
  if (screenId === 'screen-profile') {
    updateProfileUI();
    if (typeof loadProfileModuleData === 'function') {
      loadProfileModuleData();
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

// ==========================================
// MANUAL NODE CHECK-IN (ป้อมปราการ & เรดบอส)
// ==========================================
function isNodeCheckedInToday(campaignId, userId) {
  if (!campaignId) return false;
  const uid = userId || (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || 'guest';
  const todayKey = new Date().toISOString().slice(0, 10);
  const checkedKey = `checked_node_${uid}_${campaignId}_${todayKey}`;
  return Boolean(localStorage.getItem(checkedKey));
}

function getCurrentPositionPromise(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('อุปกรณ์นี้ไม่รองรับ GPS'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
      ...options
    });
  });
}

async function handleManualNodeCheckIn(campaignId) {
  if (!campaignId) return;

  if (typeof ensureCurrentUser === 'function') {
    await ensureCurrentUser();
  }

  const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || null;
  if (!uid) {
    if (typeof showToast === 'function') showToast('⚠️ กรุณาล็อกอินก่อนกดเช็กอินครับ');
    return;
  }

  const client = typeof getCampaignClient === 'function' ? getCampaignClient() : supabaseClient;
  if (!client) {
    if (typeof showToast === 'function') showToast('❌ ไม่พบการเชื่อมต่อระบบแคมเปญ');
    return;
  }

  try {
    if (typeof showToast === 'function') showToast('📡 กำลังตรวจสอบตำแหน่ง GPS...');

    const { data: camp, error } = await client
      .from('campaigns')
      .select('id, title, lat, lng, node_radius, campaign_type, is_secret_node, is_raid_boss, is_active, checked_in_at')
      .eq('id', campaignId)
      .single();

    if (error || !camp) {
      throw new Error('ไม่พบข้อมูลจุดกิจกรรมนี้');
    }

    if (camp.is_active === false) {
      if (typeof showToast === 'function') showToast('⚠️ แคมเปญนี้ปิดรับกิจกรรมแล้วครับ');
      return;
    }

    const latNum = Number(camp.lat);
    const lngNum = Number(camp.lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      throw new Error('จุดกิจกรรมนี้ยังไม่ได้ตั้งค่าพิกัดบนแผนที่');
    }

    const radius = Number(camp.node_radius) > 0 ? Number(camp.node_radius) : 50;
    const pos = await getCurrentPositionPromise();
    const userLat = pos.coords.latitude;
    const userLng = pos.coords.longitude;

    let distanceMeters = Infinity;
    if (typeof map !== 'undefined' && map && typeof map.distance === 'function') {
      distanceMeters = map.distance([userLat, userLng], [latNum, lngNum]);
    } else if (typeof L !== 'undefined' && L.latLng) {
      distanceMeters = L.latLng(userLat, userLng).distanceTo(L.latLng(latNum, lngNum));
    }

    if (distanceMeters > radius) {
      const diffMeters = Math.ceil(distanceMeters - radius);
      if (typeof showToast === 'function') {
        showToast(
          `📍 คุณอยู่ห่างจากจุด "${camp.title || 'กิจกรรม'}" ${Math.round(distanceMeters)} ม. (รัศมี ${radius} ม. — ขาดอีก ~${diffMeters} ม.)`
        );
      }
      return;
    }

    const checkedAtIso = new Date().toISOString();
    const todayKey = checkedAtIso.slice(0, 10);
    const checkedKey = `checked_node_${uid}_${camp.id}_${todayKey}`;
    localStorage.setItem(
      checkedKey,
      JSON.stringify({
        checkedAt: checkedAtIso,
        lat: userLat,
        lng: userLng,
        distanceMeters: Math.round(distanceMeters)
      })
    );

    // บันทึกเวลาเช็กอินลงคอลัมน์ checked_in_at ในตาราง campaigns
    await recordCampaignCheckInTimestamp(camp.id, checkedAtIso);

    const isRaid = camp.campaign_type === 'raid_boss' || Boolean(camp.is_raid_boss);
    if (typeof showToast === 'function') {
      showToast(
        isRaid
          ? `✅ เช็กอินจุดเรดบอส "${camp.title || 'บอส'}" สำเร็จ! กดเริ่มเดิน/วิ่งเพื่อสะสมระยะทางได้เลย`
          : `✅ เช็กอินป้อมปราการ "${camp.title || 'หน้าร้าน'}" สำเร็จ! พร้อมกดรับสิทธิ์แล้ว`
      );
    }

    if (typeof loadSponsorNodesOnMap === 'function') {
      await loadSponsorNodesOnMap(
        activeSideMode === 'sponsors' || activeSideMode === 'boss' ? activeSideMode : 'all',
        { preserveOpenPopup: true }
      );
    }
  } catch (err) {
    console.error('Manual node check-in error:', err);
    if (typeof showToast === 'function') {
      showToast('❌ เช็กอินไม่สำเร็จ: ' + (err.message || 'กรุณาอนุญาตการเข้าถึงตำแหน่ง GPS'));
    }
  }
}

// ==========================================
// ⚡ Supabase Realtime & Popup Persistence สำหรับ Sponsor / Red Boss
// ==========================================
function buildSponsorNodeKey(camp) {
  const lat = Number(camp.lat);
  const lng = Number(camp.lng);
  return `${camp.id ?? ''}::${lat.toFixed(6)}::${lng.toFixed(6)}`;
}

function bindSponsorPopupPersistence(marker, nodeKey) {
  marker.on('popupopen', () => {
    activeSponsorPopupKey = nodeKey;
  });

  marker.on('popupclose', (e) => {
    if (e && e.popup && sponsorNodesLayerGroup && map && map.hasLayer(sponsorNodesLayerGroup)) {
      if (activeSponsorPopupKey === nodeKey) {
        activeSponsorPopupKey = null;
      }
    }
  });
}

function scheduleSponsorNodesRealtimeReload(filterType = 'all', delayMs = 350) {
  if (sponsorRealtimeDebounceTimer) {
    clearTimeout(sponsorRealtimeDebounceTimer);
  }
  sponsorRealtimeDebounceTimer = setTimeout(() => {
    sponsorRealtimeDebounceTimer = null;
    loadSponsorNodesOnMap(filterType || currentSponsorFilterType || 'all', {
      preserveOpenPopup: true
    });
  }, delayMs);
}

async function subscribeSponsorNodesRealtime(filterType = 'all') {
  currentSponsorFilterType = filterType || 'all';
  const client = typeof getCampaignClient === 'function' ? getCampaignClient() : supabaseClient;
  if (!client || typeof client.channel !== 'function') return;

  if (typeof ensureCurrentUser === 'function') {
    await ensureCurrentUser();
  }
  const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || null;

  if (sponsorRealtimeChannel) {
    try {
      await client.removeChannel(sponsorRealtimeChannel);
    } catch (err) {
      console.warn('ถอด Realtime channel เดิมไม่สำเร็จ:', err);
    }
    sponsorRealtimeChannel = null;
  }

  const channelName = `sponsor-nodes-realtime-${uid || 'guest'}-${currentSponsorFilterType}`;
  const channel = client.channel(channelName);

  // รับอัปเดตสดจากตาราง campaigns (ความคืบหน้ารวม, สถานะบอสแตก, checked_in_at, defeated_at)
  channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'campaigns'
    },
    () => {
      scheduleSponsorNodesRealtimeReload(currentSponsorFilterType);
    }
  );

  // รับอัปเดตสดจากตาราง journeys เฉพาะของผู้ใช้คนนี้ (ระยะส่วนตัว)
  if (uid) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'journeys',
        filter: `user_id=eq.${uid}`
      },
      () => {
        scheduleSponsorNodesRealtimeReload(currentSponsorFilterType);
      }
    );
  }

  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('สถานะ Sponsor Realtime:', status);
    }
  });

  sponsorRealtimeChannel = channel;
}

// ==========================================
// 👑 โหลดหมุดแคมเปญ & Red Boss บนแผนที่
// ==========================================
function getRedBossState(camp) {
  const current = Number(camp.current_distance_km || 0);
  const target = Math.max(0.1, Number(camp.target_distance_km || 10));
  const pct = Math.min(100, Math.max(0, (current / target) * 100));

  // สถานะ 3: พิชิตสำเร็จ / ปลดล็อกรางวัล
  if (pct >= 100 || camp.status === 'completed') {
    return {
      code: 3,
      className: 'redboss-state-3',
      icon: '🏆',
      mapLabel: 'RED BOSS (สำเร็จ! รับรางวัลได้)',
      statusLabel: '🟢 พิชิตสำเร็จ / ปลดล็อกรางวัล',
      pct: 100,
      current,
      target
    };
  }

  // สถานะ 2: กำลังต่อสู้ / กำลังสะสมคะแนน
  if (current > 0) {
    return {
      code: 2,
      className: 'redboss-state-2',
      icon: '🐲',
      mapLabel: `RED BOSS (กำลังโจมตี! ${pct.toFixed(0)}%)`,
      statusLabel: '🟠 กำลังต่อสู้ / กำลังสะสมคะแนน',
      pct,
      current,
      target
    };
  }

  // สถานะ 1: รอเควสต์ / ยังไม่เริ่มสะสมเป้าหมาย
  return {
    code: 1,
    className: 'redboss-state-1',
    icon: '👾',
    mapLabel: 'RED BOSS (รอพลังชุมชน)',
    statusLabel: '🔴 รอเควสต์ / ยังไม่เริ่มสะสมเป้าหมาย',
    pct: 0,
    current,
    target
  };
}

function createRedBossMarkerIcon(camp, state) {
  return L.divIcon({
    className: '',
    html: `
      <div class="redboss-marker-wrap ${state.className}">
        <div class="redboss-avatar">${state.icon}</div>
        <div class="redboss-badge">
          <div>${state.mapLabel}</div>
          <div class="redboss-mini-bar">
            <div class="redboss-mini-fill" style="width:${state.pct.toFixed(1)}%;"></div>
          </div>
        </div>
      </div>
    `,
    iconSize: [150, 72],
    iconAnchor: [75, 24],
    popupAnchor: [0, -24]
  });
}

async function loadSponsorNodesOnMap(filterType = 'all', options = {}) {
  const preserveOpenPopup = Boolean(options.preserveOpenPopup);
  const previousOpenKey = preserveOpenPopup ? activeSponsorPopupKey : null;

  if (typeof map === 'undefined' || !map) return;

  if (!sponsorNodesLayerGroup) {
    sponsorNodesLayerGroup = L.layerGroup();
  } else {
    sponsorNodesLayerGroup.clearLayers();
  }
  if (!map.hasLayer(sponsorNodesLayerGroup)) {
    sponsorNodesLayerGroup.addTo(map);
  }

  const client = typeof getCampaignClient === 'function' ? getCampaignClient() : supabaseClient;
  if (!client) return;

  if (typeof ensureCurrentUser === 'function') {
    await ensureCurrentUser();
  }
  const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || null;

  const { data: campaigns, error } = await client
    .from('campaigns')
    .select('*')
    .eq('is_active', true);

  if (error || !Array.isArray(campaigns)) return;

  const escapeAttr = (val) =>
    String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const formatKm = (num) => {
    const n = Number(num) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };

  let userJourneys = [];
  if (uid) {
    const { data: journeysData, error: journeysError } = await client
      .from('journeys')
      .select('distance_meters, started_at, created_at')
      .eq('user_id', uid);

    if (!journeysError && Array.isArray(journeysData)) {
      userJourneys = journeysData;
    }
  }

  const getPersonalDistanceKmAfterCheckIn = (camp) => {
    if (!uid || !camp.checked_in_at) return 0;
    const checkInMs = new Date(camp.checked_in_at).getTime();
    if (!Number.isFinite(checkInMs)) return 0;

    const totalMeters = userJourneys.reduce((sum, row) => {
      const journeyTimeRaw = row.started_at || row.created_at;
      if (!journeyTimeRaw) return sum;
      const journeyMs = new Date(journeyTimeRaw).getTime();
      if (!Number.isFinite(journeyMs) || journeyMs < checkInMs) return sum;

      const meters = Number(row.distance_meters || 0);
      return sum + (Number.isFinite(meters) ? meters : 0);
    }, 0);

    return totalMeters / 1000;
  };

  const evaluateBossClaimEligibility = (camp, bossState, checkedIn, personalDistKm, effectiveDefeatedAt) => {
    const minKm = Number(camp.min_distance_km || 0);
    const claimHours = Number(camp.claim_window_hours || 24);

    const defeatedRaw = effectiveDefeatedAt || camp.defeated_at || camp.boss_defeated_at || bossState.defeatedAt || null;
    let isExpired = false;
    if (defeatedRaw && claimHours > 0) {
      const defeatedMs = new Date(defeatedRaw).getTime();
      if (Number.isFinite(defeatedMs)) {
        const deadlineMs = defeatedMs + claimHours * 60 * 60 * 1000;
        isExpired = Date.now() > deadlineMs;
      }
    }

    if (!checkedIn || !camp.checked_in_at) {
      return { eligible: false, reason: 'ต้องเช็กอินในรัศมีร้านค้าก่อนรับสิทธิ์' };
    }
    if (personalDistKm < minKm) {
      return {
        eligible: false,
        reason: `ระยะส่วนตัว ${formatKm(personalDistKm)} / ${formatKm(minKm)} กม. (ยังไม่ถึงเกณฑ์)`
      };
    }
    if (isExpired) {
      return { eligible: false, reason: `เลยกรอบเวลารับสิทธิ์ (${claimHours} ชม. หลังบอสแตก)` };
    }

    return { eligible: true, reason: '' };
  };

  let markerToReopen = null;

  for (const camp of campaigns) {
    const latNum = Number(camp.lat);
    const lngNum = Number(camp.lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) continue;

    const mode =
      camp.campaign_type ||
      (camp.is_raid_boss ? 'raid_boss' : camp.is_secret_node ? 'fortress' : 'normal');

    if (filterType === 'boss' && mode !== 'raid_boss') continue;
    if (filterType === 'sponsors' && mode === 'raid_boss') continue;

    const requiresManualCheckIn = mode === 'fortress' || mode === 'raid_boss';
    const radius = Number(camp.node_radius) > 0 ? Number(camp.node_radius) : 50;
    const alreadyChecked = requiresManualCheckIn
      ? isNodeCheckedInToday(camp.id, uid) || Boolean(camp.checked_in_at)
      : false;

    const radiusCircle = L.circle([latNum, lngNum], {
      radius,
      color: mode === 'raid_boss' ? '#dc2626' : mode === 'fortress' ? '#d97706' : '#2563eb',
      fillOpacity: 0.12,
      weight: 2
    });

    const rawTitle = camp.title || 'แคมเปญกิจกรรม';
    const rawMerchant = camp.merchant_name || camp.shop_name || rawTitle || 'ร้านค้าพันธมิตร';
    const safeTitle = escapeAttr(rawTitle);
    const safeMerchant = escapeAttr(rawMerchant);
    const safeId = escapeAttr(camp.id);
    const nodeKey = buildSponsorNodeKey(camp);

    if (mode === 'raid_boss') {
      const bossState = getRedBossState(camp);
      let effectiveDefeatedAt = camp.defeated_at || null;

      // หากบอสแตกแล้ว (สถานะ 3) แต่ยังไม่มีเวลา defeated_at ในตาราง ให้บันทึกอัตโนมัติ
      if (bossState.code === 3 && !effectiveDefeatedAt) {
        effectiveDefeatedAt = new Date().toISOString();
        recordCampaignDefeatedTimestamp(camp.id, effectiveDefeatedAt);
      }

      const bossIcon = createRedBossMarkerIcon(camp, bossState);
      const marker = L.marker([latNum, lngNum], { icon: bossIcon });

      const minKm = Number(camp.min_distance_km || 0);
      const claimHours = Number(camp.claim_window_hours || 24);
      const pointsCost = Number(camp.points_cost ?? 0);

      // แถบเป้าหมายชุมชน (รวมทุกคน)
      const targetText = formatKm(bossState.target);
      const currentText = formatKm(bossState.current);
      const pctNum = Math.max(0, Math.min(100, Number(bossState.pct || 0)));

      // แถบความก้าวหน้าเฉพาะบุคคล (ดึงจาก journeys หลัง checked_in_at)
      const personalDistKm = getPersonalDistanceKmAfterCheckIn(camp);
      const personalText = formatKm(personalDistKm);
      const minKmText = formatKm(minKm);
      const personalPct =
        minKm > 0
          ? Math.max(0, Math.min(100, (personalDistKm / minKm) * 100))
          : alreadyChecked
            ? 100
            : 0;
      const personalDone = personalDistKm >= minKm && alreadyChecked;
      const personalBarBg = personalDone
        ? 'linear-gradient(90deg,#16a34a,#22c55e)'
        : 'linear-gradient(90deg,#0284c7,#38bdf8)';
      const personalColor = personalDone ? '#86efac' : '#7dd3fc';

      let actionSectionHtml = '';

      if (bossState.code === 3) {
        const claimCheck = evaluateBossClaimEligibility(
          camp,
          bossState,
          alreadyChecked,
          personalDistKm,
          effectiveDefeatedAt
        );
        if (claimCheck.eligible) {
          actionSectionHtml = `
            <button type="button" onclick="handleClaimCampaign('${safeId}', '${safeTitle}')" style="margin-top:8px;padding:8px 10px;border:none;border-radius:8px;background:#16a34a;color:#fff;font-size:12px;font-weight:700;cursor:pointer;width:100%;">
              🎁 รับคูปองเข้ากระเป๋า (${pointsCost} Pts)
            </button>
            <div style="margin-top:4px;font-size:10px;color:#a1a1aa;text-align:center;">
              รับแล้วเก็บในกระเป๋า เพื่อนำไปใช้ที่ร้านค้า
            </div>
          `;
        } else {
          actionSectionHtml = `
            <div style="margin-top:8px;padding:6px 8px;border-radius:8px;background:rgba(239,68,68,0.14);border:1px solid rgba(248,113,113,0.35);color:#fca5a5;font-size:11px;font-weight:600;text-align:center;">
              🔒 ยังรับสิทธิ์ไม่ได้: ${escapeAttr(claimCheck.reason)}
            </div>
          `;
        }
      } else {
        actionSectionHtml = alreadyChecked
          ? `<div style="margin-top:8px;padding:6px 8px;border-radius:8px;background:rgba(34,197,94,0.16);color:#86efac;font-size:11px;font-weight:700;text-align:center;">
               ✅ เช็กอินในรัศมีจุดร้านค้าแล้ว
             </div>`
          : `<button type="button" onclick="handleManualNodeCheckIn('${safeId}')" style="margin-top:8px;padding:7px 10px;border:none;border-radius:8px;background:#0284c7;color:#fff;font-size:12px;font-weight:700;cursor:pointer;width:100%;">
               ✅ เช็กอินจุดนี้
             </button>`;
      }

      const bossPopupHtml = `
        <div style="min-width:225px;max-width:255px;background:#18181b;color:#f4f4f5;border:1.5px solid #ef4444;border-radius:12px;padding:11px;font-family:inherit;line-height:1.4;">
          <div style="font-size:10px;font-weight:700;color:#fca5a5;">${escapeAttr(bossState.statusLabel || '')}</div>
          <div style="font-size:14px;font-weight:800;margin-top:2px;color:#fff;">🔴 RED BOSS · ${safeTitle}</div>
          <div style="margin-top:4px;font-size:11px;color:#d4d4d8;">
            📍 ร้าน <b>${safeMerchant}</b> · รัศมี ${radius} ม.
          </div>

          <div style="margin-top:8px;background:rgba(255,255,255,0.06);padding:7px 8px;border-radius:8px;display:flex;flex-direction:column;gap:7px;">
            <div>
              <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
                <span>🔥 เป้าหมายชุมชน</span>
                <b style="color:#fde047;">${currentText} / ${targetText} กม. (${pctNum.toFixed(0)}%)</b>
              </div>
              <div style="width:100%;height:6px;background:#3f3f46;border-radius:999px;overflow:hidden;">
                <div style="width:${pctNum.toFixed(1)}%;height:100%;background:linear-gradient(90deg,#f97316,#ef4444);"></div>
              </div>
            </div>

            <div>
              <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
                <span>🏃 ระยะของคุณ</span>
                <b style="color:${personalColor};">${personalText} / ${minKmText} กม. (${personalPct.toFixed(0)}%)</b>
              </div>
              <div style="width:100%;height:6px;background:#3f3f46;border-radius:999px;overflow:hidden;">
                <div style="width:${personalPct.toFixed(1)}%;height:100%;background:${personalBarBg};"></div>
              </div>
            </div>
          </div>

          <div style="margin-top:7px;font-size:10.5px;color:#a1a1aa;text-align:center;">
            เช็กอินโซน · ขั้นต่ำ ${minKmText} กม. · รับใน ${claimHours} ชม.
          </div>

          ${actionSectionHtml}
        </div>
      `;

      marker.bindPopup(bossPopupHtml);
      bindSponsorPopupPersistence(marker, nodeKey);
      if (previousOpenKey && previousOpenKey === nodeKey) {
        markerToReopen = marker;
      }

      radiusCircle.addTo(sponsorNodesLayerGroup);
      marker.addTo(sponsorNodesLayerGroup);
      continue;
    }

    const badgeText =
      mode === 'fortress'
        ? '🏰 ป้อมปราการหน้าร้าน'
        : '🎁 แคมเปญพิเศษ';

    const marker = L.marker([latNum, lngNum]);
    const claimBtnHtml = `<button type="button" onclick="handleClaimCampaign('${safeId}', '${safeTitle}')" style="margin-top:6px;padding:6px 10px;border:none;border-radius:8px;background:#16a34a;color:#fff;font-weight:600;cursor:pointer;width:100%;">🎟️ แลกรับสิทธิ์ (${camp.points_cost ?? 0} Pts)</button>`;

    const checkInBtnHtml = requiresManualCheckIn
      ? alreadyChecked
        ? `<div style="margin-top:6px;padding:6px 10px;border-radius:8px;background:#dcfce7;color:#166534;font-weight:600;text-align:center;">✅ เช็กอินวันนี้แล้ว</div>`
        : `<button type="button" onclick="handleManualNodeCheckIn('${safeId}')" style="margin-top:6px;padding:6px 10px;border:none;border-radius:8px;background:#0284c7;color:#fff;font-weight:600;cursor:pointer;width:100%;">📍 กดเช็กอินจุดนี้ (รัศมี ${radius} ม.)</button>`
      : '';

    const popupHtml = `
      <div style="min-width:190px;font-family:inherit;">
        <div style="font-size:11px;font-weight:700;color:#4b5563;">${badgeText}</div>
        <div style="font-size:14px;font-weight:700;margin-top:2px;">${safeTitle}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">🏪 ${safeMerchant}</div>
        ${checkInBtnHtml}
        ${claimBtnHtml}
      </div>
    `;

    marker.bindPopup(popupHtml);
    bindSponsorPopupPersistence(marker, nodeKey);
    if (previousOpenKey && previousOpenKey === nodeKey) {
      markerToReopen = marker;
    }

    radiusCircle.addTo(sponsorNodesLayerGroup);
    marker.addTo(sponsorNodesLayerGroup);
  }

  if (markerToReopen) {
    markerToReopen.openPopup();
    activeSponsorPopupKey = previousOpenKey;
  }
}

async function recordCampaignCheckInTimestamp(campaignId, customIso = null) {
  const client = typeof getCampaignClient === 'function' ? getCampaignClient() : supabaseClient;
  if (!client || !campaignId) return;

  const nowIso = customIso || new Date().toISOString();
  const { error } = await client
    .from('campaigns')
    .update({ checked_in_at: nowIso })
    .eq('id', campaignId)
    .is('checked_in_at', null);

  if (error) {
    console.warn('อัปเดต checked_in_at ไม่สำเร็จ:', error.message);
  }
}

async function recordCampaignDefeatedTimestamp(campaignId, customIso = null) {
  const client = typeof getCampaignClient === 'function' ? getCampaignClient() : supabaseClient;
  if (!client || !campaignId) return;

  const nowIso = customIso || new Date().toISOString();
  const { error } = await client
    .from('campaigns')
    .update({ defeated_at: nowIso })
    .eq('id', campaignId)
    .is('defeated_at', null);

  if (error) {
    console.warn('อัปเดต defeated_at ไม่สำเร็จ:', error.message);
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