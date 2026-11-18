// ============================================================================
// 📸 photoModule.js — Stride Photo Studio (Direct Modular Customization)
// ============================================================================

const MAX_STUDIO_STATS = 4;

let currentStudioData = {
    distance: '0.00',
    time: '00:00',
    pace: '—',
    steps: '0',
    calories: '0',
    cadence: '0',
    heart: '125',
    title: '🏃 วิ่งออกกำลังกายทั่วไป',
    date: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
    pathCoordinates: [],
    isHistoryMode: false
};

// 🎛️ สถานะการควบคุมสตูดิโอ (ยุบรวมโหมดเหลือ Direct Customization)
let studioState = {
    layout: 'classic', // 'classic' | 'center' | 'split' | 'glass'
    selectedStats: ['time', 'pace', 'steps', 'calories'],
    showRoute: true,
    showLogo: true,

    // ตำแหน่งและการย่อขยายของชิ้นส่วนอิสระ (Custom Widgets)
    customWidgets: {
        brand: { x: 0, y: 0, scale: 1 },
        distance: { x: 0, y: 0, scale: 1 },
        route: { x: 0, y: 0, scale: 1 },
        stats: { x: 0, y: 0, scale: 1 }
    }
};

let studioBgImageObj = null;
let activeDragWidget = null;
let isDragging = false;
let startX = 0, startY = 0;
let initialPinchDist = null;

// ============================================================================
// 1. การจัดการข้อมูลเข้า & เปิด/ปิด Studio
// ============================================================================

function collectLiveActivityData() {
    const distText = document.getElementById('detail-distance')?.textContent?.replace(' กม.', '') || '0.00';
    const timeText = document.getElementById('detail-time')?.textContent || '00:00';
    const paceText = document.getElementById('detail-pace')?.textContent?.replace(' min/km', '') || '—';
    const stepsText = document.getElementById('detail-steps')?.textContent?.replace(' ก้าว', '') || '0';
    const calText = document.getElementById('detail-cal')?.textContent?.replace(' kcal', '') || '0';
    const cadenceText = document.getElementById('detail-cadence')?.textContent?.replace(' spm', '') || '0';
    const heartText = document.getElementById('detail-heart')?.textContent?.replace(' bpm', '') || '125';

    currentStudioData = {
        distance: distText,
        time: timeText,
        pace: paceText,
        steps: stepsText,
        calories: calText,
        cadence: cadenceText,
        heart: heartText === '—' ? '125' : heartText,
        title: typeof isCapturedSuccess !== 'undefined' && isCapturedSuccess ? '👑 วิ่งยึดพื้นที่สำเร็จ!' : '🏃 วิ่งออกกำลังกายทั่วไป',
        date: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
        pathCoordinates: typeof pathCoordinates !== 'undefined' ? [...pathCoordinates] : [],
        isHistoryMode: false
    };
}

function openStudioModal() {
    if (typeof closeTopLayer === 'function') closeTopLayer('summary-modal');
    collectLiveActivityData();
    studioBgImageObj = null;
    resetStudioBackground();
    resetCustomWidgetsTransform();

    syncStudioChipsUI();
    renderStudioPreview();
    initStudioTouchGestures();

    if (typeof openTopLayer === 'function') openTopLayer('share-modal', 'flex');
}

function openHistoryShareModal(journeyItem) {
    if (!journeyItem) return;

    const distKm = ((journeyItem.distance_meters || 0) / 1000).toFixed(2);
    let durationStr = '00:00';
    if (journeyItem.started_at && journeyItem.ended_at) {
        const sec = Math.max(0, Math.floor((new Date(journeyItem.ended_at) - new Date(journeyItem.started_at)) / 1000));
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        durationStr = `${m}:${s}`;
    }

    const dateStr = journeyItem.started_at
        ? new Date(journeyItem.started_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'บันทึกย้อนหลัง';

    currentStudioData = {
        distance: distKm,
        time: durationStr,
        pace: journeyItem.pace || '—',
        steps: (journeyItem.steps || 0).toLocaleString(),
        calories: (journeyItem.calories || Math.round((journeyItem.steps || 0) * 0.04)).toString(),
        cadence: (journeyItem.cadence || 0).toString(),
        heart: (journeyItem.avg_heart_rate || 125).toString(),
        title: journeyItem.activity_title || (journeyItem.is_captured ? '👑 วิ่งยึดพื้นที่สำเร็จ!' : '🏃 วิ่งออกกำลังกายทั่วไป'),
        date: dateStr,
        pathCoordinates: journeyItem.path_coordinates || [],
        isHistoryMode: true
    };

    studioBgImageObj = null;
    resetStudioBackground();
    resetCustomWidgetsTransform();

    syncStudioChipsUI();
    renderStudioPreview();
    initStudioTouchGestures();

    if (typeof openTopLayer === 'function') openTopLayer('share-modal', 'flex');
}

function finishActivity() {
    if (typeof closeTopLayer === 'function') closeTopLayer('share-modal');
    if (typeof resetModal === 'function') resetModal();
}

function closeShareModal() {
    finishActivity();
}

// ============================================================================
// 2. ระบบควบคุมการลาก (Drag) และย่อ-ขยาย (Zoom) แยกชิ้นส่วนอิสระ
// ============================================================================

function resetCustomWidgetsTransform() {
    // รีเซ็ตพิกัดของตัวแปรหลัก (global studioState) ให้กลับเป็นค่าเริ่มต้นทั้งหมด
    if (studioState && studioState.customWidgets) {
        Object.keys(studioState.customWidgets).forEach(key => {
            studioState.customWidgets[key] = { x: 0, y: 0, scale: 1 };
        });
    }
    applyCustomWidgetsToDOM();
}

function applyCustomWidgetsToDOM() {
    const stage = document.getElementById('studio-template-stage');
    if (!stage) return;

    stage.querySelectorAll('.custom-widget-box').forEach(el => {
        const key = el.dataset.widgetKey || 'stats';
        const w = studioState.customWidgets[key] || { x: 0, y: 0, scale: 1 };
        el.style.transform = `translate(${w.x}px, ${w.y}px) scale(${w.scale})`;
        el.style.transformOrigin = 'center center';
        el.style.touchAction = 'none';
    });
}

function initStudioTouchGestures() {
    const previewBox = document.getElementById('share-preview-box');
    if (!previewBox || previewBox.dataset.hasListener === 'true') return;
    previewBox.dataset.hasListener = 'true';

    previewBox.addEventListener('pointerdown', (e) => {
        const widgetTarget = e.target.closest('.custom-widget-box');
        if (widgetTarget) {
            activeDragWidget = widgetTarget.dataset.widgetKey;
            isDragging = true;
            if (studioState.customWidgets[activeDragWidget]) {
                startX = e.clientX - studioState.customWidgets[activeDragWidget].x;
                startY = e.clientY - studioState.customWidgets[activeDragWidget].y;
            }
        }
        try { previewBox.setPointerCapture(e.pointerId); } catch (err) { }
    });

    previewBox.addEventListener('pointermove', (e) => {
        if (!isDragging || !activeDragWidget || !studioState.customWidgets[activeDragWidget]) return;
        studioState.customWidgets[activeDragWidget].x = e.clientX - startX;
        studioState.customWidgets[activeDragWidget].y = e.clientY - startY;
        applyCustomWidgetsToDOM();
    });

    previewBox.addEventListener('pointerup', (e) => {
        isDragging = false;
        activeDragWidget = null;
        try { previewBox.releasePointerCapture(e.pointerId); } catch (err) { }
    });

    previewBox.addEventListener('pointercancel', () => {
        isDragging = false;
        activeDragWidget = null;
    });

    previewBox.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    }, { passive: true });

    previewBox.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDist !== null && activeDragWidget && studioState.customWidgets[activeDragWidget]) {
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const factor = currentDist / initialPinchDist;
            const w = studioState.customWidgets[activeDragWidget];
            w.scale = Math.min(Math.max(0.5, w.scale * (factor > 1 ? 1.02 : 0.98)), 2.0);
            applyCustomWidgetsToDOM();
        }
    }, { passive: true });

    previewBox.addEventListener('touchend', () => {
        initialPinchDist = null;
    });
}

// ============================================================================
// 3. การควบคุม Layouts และ Toggles
// ============================================================================

function selectStudioLayout(layoutKey) {
    studioState.layout = layoutKey;

    // 1. เคลียร์สถานะการลากที่อาจจะยังค้างอยู่
    isDragging = false;
    activeDragWidget = null;

    // 2. สั่งรีเซ็ตพิกัด Custom Widgets กลับเป็น 0 และอัปเดต DOM ทันที
    resetCustomWidgetsTransform();

    // 3. ซิงค์ UI และเรนเดอร์พรีวิวใหม่
    syncStudioChipsUI();
    renderStudioPreview();
}

function toggleStudioStatChip(btnElement) {
    const statKey = btnElement.getAttribute('data-stat');
    if (!statKey) return;

    const idx = studioState.selectedStats.indexOf(statKey);
    if (idx > -1) {
        studioState.selectedStats.splice(idx, 1);
    } else {
        if (studioState.selectedStats.length >= MAX_STUDIO_STATS) {
            if (typeof showToast === 'function') {
                showToast(`⚠️ เลือกสถิติย่อยได้สูงสุด ${MAX_STUDIO_STATS} รายการครับ`);
            }
            return;
        }
        studioState.selectedStats.push(statKey);
    }

    syncStudioChipsUI();
    renderStudioPreview();
}

function toggleStudioExtraChip(type) {
    if (type === 'route') studioState.showRoute = !studioState.showRoute;
    if (type === 'logo') studioState.showLogo = !studioState.showLogo;
    syncStudioChipsUI();
    renderStudioPreview();
}

function syncStudioChipsUI() {
    const quotaEl = document.getElementById('studio-quota-indicator');
    if (quotaEl) {
        quotaEl.textContent = `สถิติ: ${studioState.selectedStats.length}/${MAX_STUDIO_STATS}`;
    }

    document.querySelectorAll('.studio-layout-chip').forEach(btn => {
        const active = btn.getAttribute('data-layout') === studioState.layout;
        btn.style.border = active ? '1.5px solid #22c55e' : '1px solid rgba(255,255,255,0.15)';
        btn.style.background = active ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)';
        btn.style.color = active ? '#4ade80' : '#cbd5e1';
    });

    document.querySelectorAll('.studio-stat-chip').forEach(btn => {
        const key = btn.getAttribute('data-stat');
        const active = studioState.selectedStats.includes(key);
        btn.style.border = active ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.15)';
        btn.style.background = active ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)';
        btn.style.color = active ? '#7dd3fc' : '#94a3b8';
    });
}

function handleStudioPhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            studioBgImageObj = img;
            const previewBox = document.getElementById('share-preview-box');
            if (previewBox) {
                previewBox.style.backgroundImage = `url('${e.target.result}')`;
            }
            if (typeof showToast === 'function') showToast('🖼️ อัปเดตรูปพื้นหลังแล้ว');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function resetStudioBackground() {
    studioBgImageObj = null;
    const previewBox = document.getElementById('share-preview-box');
    if (previewBox) {
        previewBox.style.backgroundImage = 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)';
    }
}

// ============================================================================
// 4. Helper สร้างข้อมูลสถิติ & เส้นทางวิ่ง SVG
// ============================================================================

function getActiveStatsList() {
    const map = {
        time: { label: 'เวลาที่ใช้', value: currentStudioData.time },
        pace: { label: 'เพซเฉลี่ย', value: `${currentStudioData.pace} /กม.` },
        steps: { label: 'ก้าวเดิน', value: currentStudioData.steps },
        calories: { label: 'แคลอรี', value: `${currentStudioData.calories} kcal` },
        cadence: { label: 'รอบขา', value: `${currentStudioData.cadence} spm` },
        heart: { label: 'ชีพจร', value: `${currentStudioData.heart} bpm` }
    };
    return studioState.selectedStats.map(k => map[k]).filter(Boolean);
}

function buildRouteSVGMarkup(widthPx = 90, heightPx = 90) {
    const coords = (currentStudioData.pathCoordinates && currentStudioData.pathCoordinates.length >= 2)
        ? currentStudioData.pathCoordinates
        : [[13.736, 100.523], [13.738, 100.524], [13.739, 100.526], [13.737, 100.527], [13.736, 100.525]];

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    coords.forEach(pt => {
        const lat = Array.isArray(pt) ? pt[0] : pt.lat;
        const lng = Array.isArray(pt) ? pt[1] : pt.lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
    });

    const span = Math.max(maxLat - minLat || 0.00001, maxLng - minLng || 0.00001);
    const pointsStr = coords.map(pt => {
        const lat = Array.isArray(pt) ? pt[0] : pt.lat;
        const lng = Array.isArray(pt) ? pt[1] : pt.lng;
        const x = 12 + ((lng - minLng) / span) * 76;
        const y = 12 + ((maxLat - lat) / span) * 76;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return `
    <svg viewBox="0 0 100 100" style="width:${widthPx}px; height:${heightPx}px; overflow:visible; filter:drop-shadow(0 0 6px rgba(34,197,94,0.85));">
      <polyline points="${pointsStr}" fill="none" stroke="#22c55e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

// ============================================================================
// 5. เรนเดอร์หน้าจอพรีวิว (Direct Customization พร้อมมาตรฐานคีย์ Widget ตรงกันทุก Template)
// ============================================================================

function renderStudioPreview() {
    const stage = document.getElementById('studio-template-stage');
    if (!stage) return;

    if (studioState.layout === 'center') {
        stage.innerHTML = renderTemplateStravaCenter();
    } else if (studioState.layout === 'split') {
        stage.innerHTML = renderTemplateSplitFrame();
    } else if (studioState.layout === 'glass') {
        stage.innerHTML = renderTemplateGlassCard();
    } else {
        stage.innerHTML = renderTemplateClassicBottom();
    }

    applyCustomWidgetsToDOM();
}

function renderTemplateClassicBottom() {
    const stats = getActiveStatsList();
    const cols = Math.min(2, Math.max(1, stats.length));
    return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:4px;">
      <div class="custom-widget-box" data-widget-key="brand" style="pointer-events:auto; cursor:grab;">
        ${studioState.showLogo ? `<div style="display:inline-flex; align-items:center; gap:5px; background:rgba(34,197,94,0.25); border:1px solid #22c55e; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:800; color:#4ade80;">🏃 STRIDE</div>` : ''}
      </div>
      <div class="custom-widget-box" data-widget-key="date" style="pointer-events:auto; cursor:grab; font-size:11px; color:rgba(255,255,255,0.9); background:rgba(0,0,0,0.3); padding:2px 8px; border-radius:10px;">${currentStudioData.date}</div>
      <div class="custom-widget-box" data-widget-key="route" style="pointer-events:auto; cursor:grab;">${studioState.showRoute ? buildRouteSVGMarkup(76, 76) : ''}</div>
    </div>
    <div class="custom-widget-box" data-widget-key="stats" style="margin-top:auto; pointer-events:auto; cursor:grab;">
      <div style="font-size:12px; font-weight:700; color:#cbd5e1;">${currentStudioData.title}</div>
      <div style="font-size:32px; font-weight:900; color:#22c55e; line-height:1.1; margin-bottom:10px;">${currentStudioData.distance} กม.</div>
      <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:10px 14px; border-top:1px solid rgba(255,255,255,0.25); padding-top:10px;">
        ${stats.map(s => `<div><div style="font-size:10.5px; color:rgba(255,255,255,0.75);">${s.label}</div><div style="font-size:16px; font-weight:800; color:#fff;">${s.value}</div></div>`).join('')}
      </div>
    </div>
  `;
}

function renderTemplateStravaCenter() {
    const stats = getActiveStatsList();
    const cols = Math.min(2, Math.max(1, stats.length));
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
      <div class="custom-widget-box" data-widget-key="brand" style="pointer-events:auto; cursor:grab;">
        ${studioState.showLogo ? `<div style="display:inline-flex; align-items:center; gap:5px; background:rgba(34,197,94,0.25); border:1px solid #22c55e; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:800; color:#4ade80;">🏃 STRIDE</div>` : ''}
      </div>
      <div class="custom-widget-box" data-widget-key="date" style="pointer-events:auto; cursor:grab; font-size:11px; color:rgba(255,255,255,0.9); background:rgba(0,0,0,0.3); padding:2px 8px; border-radius:10px;">${currentStudioData.date}</div>
    </div>
    <div class="custom-widget-box" data-widget-key="distance" style="margin:auto 0; text-align:center; display:flex; flex-direction:column; align-items:center; pointer-events:auto; cursor:grab;">
      <div style="margin-bottom:8px;" class="custom-widget-box" data-widget-key="route">${studioState.showRoute ? buildRouteSVGMarkup(105, 105) : ''}</div>
      <div style="font-size:12px; font-weight:700; color:#e2e8f0;">${currentStudioData.title}</div>
      <div style="font-size:34px; font-weight:900; color:#22c55e; line-height:1.1; margin-bottom:12px;">${currentStudioData.distance} กม.</div>
    </div>
    <div class="custom-widget-box" data-widget-key="stats" style="width:100%; display:flex; justify-content:center; pointer-events:auto; cursor:grab;">
      <div style="width:90%; padding:12px;">
        <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:12px; text-align:center; border-top:1px solid rgba(255,255,255,0.25); padding-top:10px;">
          ${stats.map(s => `<div><div style="font-size:10.5px; color:rgba(255,255,255,0.75);">${s.label}</div><div style="font-size:16px; font-weight:800; color:#fff;">${s.value}</div></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderTemplateSplitFrame() {
    const stats = getActiveStatsList();
    const cols = Math.min(2, Math.max(1, stats.length));
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
      <div class="custom-widget-box" data-widget-key="brand" style="pointer-events:auto; cursor:grab;">
        ${studioState.showLogo ? `<span style="background:rgba(34,197,94,0.25); border:1px solid #22c55e; padding:2px 8px; border-radius:14px; font-size:9.5px; font-weight:800; color:#4ade80;">🏃 STRIDE</span>` : '<span></span>'}
      </div>
      <div class="custom-widget-box" data-widget-key="date" style="pointer-events:auto; cursor:grab; font-size:10.5px; color:rgba(255,255,255,0.85); background:rgba(0,0,0,0.3); padding:2px 8px; border-radius:10px;">${currentStudioData.date}</div>
    </div>
    <div class="custom-widget-box" data-widget-key="distance" style="pointer-events:auto; cursor:grab;">
      <div style="font-size:32px; font-weight:900; color:#22c55e; line-height:1.1;">${currentStudioData.distance} กม.</div>
      <div style="font-size:11.5px; font-weight:700; color:#e2e8f0;">${currentStudioData.title}</div>
    </div>
    <div class="custom-widget-box" data-widget-key="route" style="margin-top:10px; pointer-events:auto; cursor:grab;">
      ${studioState.showRoute ? buildRouteSVGMarkup(62, 62) : ''}
    </div>
    <div class="custom-widget-box" data-widget-key="stats" style="margin-top:auto; pointer-events:auto; cursor:grab;">
      <div style="padding:12px;">
        <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:10px 14px; border-top:1px solid rgba(255,255,255,0.25); padding-top:10px;">
          ${stats.map(s => `<div><div style="font-size:10.5px; color:rgba(255,255,255,0.75);">${s.label}</div><div style="font-size:15.5px; font-weight:800; color:#fff;">${s.value}</div></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderTemplateGlassCard() {
    const stats = getActiveStatsList();
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
      <div class="custom-widget-box" data-widget-key="brand" style="pointer-events:auto; cursor:grab;">
        ${studioState.showLogo ? `<div style="display:inline-flex; align-items:center; gap:5px; background:rgba(34,197,94,0.25); border:1px solid #22c55e; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:800; color:#4ade80;">🏃 STRIDE</div>` : '<div></div>'}
      </div>
      <div class="custom-widget-box" data-widget-key="date" style="pointer-events:auto; cursor:grab; font-size:10.5px; color:rgba(255,255,255,0.85); background:rgba(0,0,0,0.3); padding:2px 8px; border-radius:10px;">${currentStudioData.date}</div>
    </div>
    <div class="custom-widget-box" data-widget-key="stats" style="margin-top:auto; width:84%; background:rgba(15,23,42,0.65); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.22); border-radius:18px; padding:14px; pointer-events:auto; cursor:grab;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div><div style="font-size:10.5px; color:#cbd5e1;">${currentStudioData.title}</div><div style="font-size:25px; font-weight:900; coordinate; color:#22c55e; line-height:1.15;">${currentStudioData.distance} กม.</div></div>
        <div class="custom-widget-box" data-widget-key="route">${studioState.showRoute ? buildRouteSVGMarkup(54, 54) : ''}</div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px 10px; border-top:1px solid rgba(255,255,255,0.18); padding-top:10px;">
        ${stats.map(s => `<div><div style="font-size:9.5px; color:rgba(255,255,255,0.7);">${s.label}</div><div style="font-size:14px; font-weight:800; color:#fff;">${s.value}</div></div>`).join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// 6. Canvas Export (แปลงหน้าจอพรีวิวเป็นภาพ พร้อมซ่อนปุ่ม/ไอคอนควบคุมชั่วคราว)
// ============================================================================

function generateStudioCanvasBlob() {
    return new Promise(async (resolve) => {
        const previewBox = document.getElementById('share-preview-box');
        if (!previewBox) {
            resolve(null);
            return;
        }

        try {
            if (typeof html2canvas !== 'undefined') {
                // 1. ค้นหาและซ่อนปุ่ม / ไอคอน / แถบควบคุมชั่วคราว (เช่น ปุ่มกากบาท, ไอคอนกล้อง, ปุ่มแชร์ ฯลฯ)
                const controlElements = previewBox.querySelectorAll('button, .share-action-bar, .close-btn, svg[onclick], .studio-ui-controls');
                controlElements.forEach(el => el.style.visibility = 'hidden');

                // 2. แคปเจอร์ภาพผ่าน html2canvas เฉพาะส่วนพรีวิวที่สะอาดไร้ปุ่มกวนใจ
                const canvas = await html2canvas(previewBox, {
                    scale: 3, // ความละเอียดคมชัดสูง
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null
                });

                // 3. คืนค่าการแสดงผลปุ่มและไอคอนกลับมาเหมือนเดิมทันที
                controlElements.forEach(el => el.style.visibility = 'visible');

                canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
                return;
            }
        } catch (err) {
            console.error('html2canvas error:', err);
        }

        resolve(null);
    });
}

function drawCanvasRoute(ctx, boxX, boxY, boxW, boxH, strokeWidth = 14) {
    const coords = (currentStudioData.pathCoordinates && currentStudioData.pathCoordinates.length >= 2)
        ? currentStudioData.pathCoordinates
        : [[13.736, 100.523], [13.738, 100.524], [13.739, 100.526], [13.737, 100.527], [13.736, 100.525]];

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    coords.forEach(pt => {
        const lat = Array.isArray(pt) ? pt[0] : pt.lat;
        const lng = Array.isArray(pt) ? pt[1] : pt.lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
    });
    const span = Math.max(maxLat - minLat || 0.00001, maxLng - minLng || 0.00001);

    ctx.save();
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = strokeWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(34, 197, 94, 0.85)'; ctx.shadowBlur = 24;
    ctx.beginPath();
    coords.forEach((pt, idx) => {
        const lat = Array.isArray(pt) ? pt[0] : pt.lat;
        const lng = Array.isArray(pt) ? pt[1] : pt.lng;
        const nx = (lng - minLng) / span; const ny = (maxLat - lat) / span;
        const x = boxX + (boxW * 0.1) + (nx * (boxW * 0.8));
        const y = boxY + (boxH * 0.1) + (ny * (boxH * 0.8));
        if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
}

function drawCanvasBrandHeader(ctx, align = 'left') {
    const x = align === 'center' ? 390 : 80;
    ctx.fillStyle = 'rgba(34, 197, 94, 0.25)'; ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(x, 85, 300, 76, 38); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4ade80'; ctx.font = 'bold 38px sans-serif'; ctx.fillText('🏃 STRIDE', x + 42, 136);
    if (align !== 'center') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '600 34px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(currentStudioData.date, 1000, 134); ctx.textAlign = 'left';
    }
}

async function downloadStudioImage() {
    if (typeof showToast === 'function') showToast('🎨 กำลังสร้างไฟล์ภาพความละเอียดสูง...');
    const blob = await generateStudioCanvasBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Stride-Custom-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast('✅ บันทึกรูปภาพลงเครื่องเรียบร้อย!');
}

async function shareStudioImageNative() {
    const blob = await generateStudioCanvasBlob();
    if (!blob) return;
    const file = new File([blob], `Stride-Run-${Date.now()}.png`, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ title: 'Stride Activity', text: `บันทึกการวิ่ง ${currentStudioData.distance} กม. บน Stride! 🏃🔥`, files: [file] });
        } catch (err) {
            if (err.name !== 'AbortError') downloadStudioImage();
        }
    } else {
        downloadStudioImage();
    }
}

function openCameraShortcutModal() {
    collectLiveActivityData();
    const distEl = document.getElementById('cam-stat-dist');
    const stepsEl = document.getElementById('cam-stat-steps');
    const dateEl = document.getElementById('cam-live-date');
    if (distEl) distEl.textContent = `${currentStudioData.distance} กม.`;
    if (stepsEl) stepsEl.textContent = `${currentStudioData.steps} ก้าว | ${currentStudioData.calories} kcal`;
    if (dateEl) dateEl.textContent = currentStudioData.date;
    if (typeof openTopLayer === 'function') openTopLayer('camera-modal', 'flex');
}

function closeCameraShortcutModal() {
    if (typeof openTopLayer === 'function') openTopLayer('camera-modal', 'close');
}