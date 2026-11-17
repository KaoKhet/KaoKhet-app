// ============================================================================
// 📸 photoModule.js — Stride Photo Studio (Full-Screen + 4 Modular Templates)
// ============================================================================

const MAX_STUDIO_STATS = 4; // โควตาสถิติย่อยสูงสุด 4 รายการ (+ 1 เส้นทางวิ่ง)

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

let studioState = {
    layout: 'classic', // 'classic' | 'center' | 'split' | 'glass'
    selectedStats: ['time', 'pace', 'steps', 'calories'], // สูงสุด 4 รายการ
    showRoute: true,
    showLogo: true
};

let studioBgImageObj = null;

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

    const saveDbBtn = document.getElementById('btn-studio-save-db');
    if (saveDbBtn) saveDbBtn.style.display = 'none';

    syncStudioChipsUI();
    renderStudioPreview();
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

    const saveDbBtn = document.getElementById('btn-studio-save-db');
    if (saveDbBtn) saveDbBtn.style.display = 'none';

    syncStudioChipsUI();
    renderStudioPreview();
    if (typeof openTopLayer === 'function') openTopLayer('share-modal', 'flex');
}

function closeShareModal() {
    if (typeof closeTopLayer === 'function') closeTopLayer('share-modal');
}

// ============================================================================
// 2. การควบคุม Floating Chips & จำกัดโควตา 4 สถิติ + 1 เส้นทาง
// ============================================================================

function selectStudioLayout(layoutKey) {
    studioState.layout = layoutKey;
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

    const routeBtn = document.getElementById('chip-toggle-route');
    if (routeBtn) {
        routeBtn.style.border = studioState.showRoute ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.15)';
        routeBtn.style.background = studioState.showRoute ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)';
        routeBtn.style.color = studioState.showRoute ? '#4ade80' : '#94a3b8';
    }

    const logoBtn = document.getElementById('chip-toggle-logo');
    if (logoBtn) {
        logoBtn.style.border = studioState.showLogo ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.15)';
        logoBtn.style.background = studioState.showLogo ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)';
        logoBtn.style.color = studioState.showLogo ? '#d8b4fe' : '#94a3b8';
    }
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
// 3. Helper สร้างข้อมูลสถิติ & เส้นทางวิ่ง SVG/Canvas
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
    if (!studioState.showRoute) return '';
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

function drawCanvasRoute(ctx, boxX, boxY, boxW, boxH, strokeWidth = 14) {
    if (!studioState.showRoute) return;
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
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(34, 197, 94, 0.85)';
    ctx.shadowBlur = 24;

    ctx.beginPath();
    coords.forEach((pt, idx) => {
        const lat = Array.isArray(pt) ? pt[0] : pt.lat;
        const lng = Array.isArray(pt) ? pt[1] : pt.lng;
        const nx = (lng - minLng) / span;
        const ny = (maxLat - lat) / span;
        const x = boxX + (boxW * 0.1) + (nx * (boxW * 0.8));
        const y = boxY + (boxH * 0.1) + (ny * (boxH * 0.8));
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
}

function drawCanvasBrandHeader(ctx, align = 'left') {
    if (studioState.showLogo) {
        const x = align === 'center' ? 390 : 80;
        ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(x, 85, 300, 76, 38);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#4ade80';
        ctx.font = 'bold 38px sans-serif';
        ctx.fillText('🏃 STRIDE', x + 42, 136);
    }

    if (align !== 'center') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '600 34px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(currentStudioData.date, 1000, 134);
        ctx.textAlign = 'left';
    }
}

// ============================================================================
// 4. บล็อก TEMPLATES แยกอิสระ 4 รูปแบบ (ปรับสัดส่วนตัวเลขสถิติให้สมดุลอ่านง่าย)
// ============================================================================

/**
 * ----------------------------------------------------------------------------
 * [TEMPLATE BLOCK 1]: CLASSIC BOTTOM (คลาสสิกชิดล่าง + เส้นทางมุมบนขวา)
 * ----------------------------------------------------------------------------
 */
function renderTemplateClassicBottom() {
    const stats = getActiveStatsList();
    const cols = Math.min(2, Math.max(1, stats.length));
    const logoBadge = studioState.showLogo
        ? `<div style="display:inline-flex; align-items:center; gap:5px; background:rgba(34,197,94,0.25); border:1px solid #22c55e; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:800; color:#4ade80;">🏃 STRIDE</div>`
        : `<div></div>`;

    return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:4px;">
      <div>
        ${logoBadge}
        <div style="font-size:11px; color:rgba(255,255,255,0.8); margin-top:4px;">${currentStudioData.date}</div>
      </div>
      <div>${buildRouteSVGMarkup(76, 76)}</div>
    </div>

    <div style="margin-top:auto;">
      <div style="font-size:12px; font-weight:700; color:#cbd5e1;">${currentStudioData.title}</div>
      <div style="font-size:32px; font-weight:900; color:#22c55e; line-height:1.1; margin-bottom:10px;">${currentStudioData.distance} กม.</div>
      <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:10px 14px; border-top:1px solid rgba(255,255,255,0.25); padding-top:10px;">
        ${stats.map(s => `
          <div>
            <div style="font-size:10.5px; color:rgba(255,255,255,0.75);">${s.label}</div>
            <div style="font-size:16px; font-weight:800; color:#fff;">${s.value}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function drawCanvasClassicBottom(ctx) {
    drawCanvasBrandHeader(ctx, 'left');
    drawCanvasRoute(ctx, 730, 190, 270, 270, 12);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText(currentStudioData.title, 80, 1280);

    ctx.fillStyle = '#22c55e';
    ctx.font = '900 128px sans-serif';
    ctx.fillText(`${currentStudioData.distance} กม.`, 80, 1410);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(80, 1465);
    ctx.lineTo(1000, 1465);
    ctx.stroke();

    const stats = getActiveStatsList();
    stats.forEach((s, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const x = 80 + (col * 460);
        const y = 1545 + (row * 155);

        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '600 32px sans-serif';
        ctx.fillText(s.label, x, y);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 58px sans-serif';
        ctx.fillText(s.value, x, y + 66);
    });
}

/**
 * ----------------------------------------------------------------------------
 * [TEMPLATE BLOCK 2]: STRAVA CENTER (เด่นกลางภาพ + เส้นทางขนาดใหญ่ตรงกลาง)
 * ----------------------------------------------------------------------------
 */
function renderTemplateStravaCenter() {
    const stats = getActiveStatsList();
    const cols = Math.min(2, Math.max(1, stats.length));
    const logoBadge = studioState.showLogo
        ? `<div style="display:inline-flex; align-items:center; gap:5px; background:rgba(34,197,94,0.25); border:1px solid #22c55e; padding:3px 12px; border-radius:20px; font-size:10px; font-weight:800; color:#4ade80;">🏃 STRIDE</div>`
        : '';

    return `
    <div style="text-align:center; margin-top:4px;">
      ${logoBadge}
      <div style="font-size:11px; color:rgba(255,255,255,0.8); margin-top:4px;">${currentStudioData.date}</div>
    </div>

    <div style="margin:auto 0; text-align:center; display:flex; flex-direction:column; align-items:center;">
      <div style="margin-bottom:8px;">${buildRouteSVGMarkup(105, 105)}</div>
      <div style="font-size:12px; font-weight:700; color:#e2e8f0;">${currentStudioData.title}</div>
      <div style="font-size:34px; font-weight:900; color:#22c55e; line-height:1.1; margin-bottom:12px;">${currentStudioData.distance} กม.</div>
      
      <div style="width:90%; display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:12px; border-top:1px solid rgba(255,255,255,0.25); padding-top:10px;">
        ${stats.map(s => `
          <div>
            <div style="font-size:10.5px; color:rgba(255,255,255,0.75);">${s.label}</div>
            <div style="font-size:16px; font-weight:800; color:#fff;">${s.value}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function drawCanvasStravaCenter(ctx) {
    drawCanvasBrandHeader(ctx, 'center');
    drawCanvasRoute(ctx, 325, 310, 430, 430, 16);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 34px sans-serif';
    ctx.fillText(currentStudioData.date, 540, 220);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(currentStudioData.title, 540, 825);

    ctx.fillStyle = '#22c55e';
    ctx.font = '900 132px sans-serif';
    ctx.fillText(`${currentStudioData.distance} กม.`, 540, 965);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(160, 1030);
    ctx.lineTo(920, 1030);
    ctx.stroke();

    const stats = getActiveStatsList();
    stats.forEach((s, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const x = col === 0 ? 330 : 750;
        const y = 1125 + (row * 175);

        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = '600 34px sans-serif';
        ctx.fillText(s.label, x, y);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 62px sans-serif';
        ctx.fillText(s.value, x, y + 70);
    });
    ctx.textAlign = 'left';
}

/**
 * ----------------------------------------------------------------------------
 * [TEMPLATE BLOCK 3]: TOP & BOTTOM SPLIT (แยกบน-ล่าง เปิดพื้นที่ตรงกลางโชว์รูป)
 * ----------------------------------------------------------------------------
 */
function renderTemplateSplitFrame() {
    const stats = getActiveStatsList();
    const cols = Math.min(2, Math.max(1, stats.length));
    const logoBadge = studioState.showLogo
        ? `<span style="background:rgba(34,197,94,0.25); border:1px solid #22c55e; padding:2px 8px; border-radius:14px; font-size:9.5px; font-weight:800; color:#4ade80;">🏃 STRIDE</span>`
        : '';

    return `
    <!-- ส่วนบน -->
    <div style="margin-top:4px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        ${logoBadge}
        <span style="font-size:10.5px; color:rgba(255,255,255,0.85);">${currentStudioData.date}</span>
      </div>
      <div style="font-size:32px; font-weight:900; color:#22c55e; line-height:1.1;">${currentStudioData.distance} กม.</div>
      <div style="font-size:11.5px; font-weight:700; color:#e2e8f0;">${currentStudioData.title}</div>
    </div>

    <!-- เปิดพื้นที่ตรงกลางโล่งทั้งหมด -->

    <!-- ส่วนล่าง: เส้นทางวิ่งเล็กด้านซ้าย + สถิติชิดขอบล่าง -->
    <div style="margin-top:auto;">
      <div style="margin-bottom:8px;">${buildRouteSVGMarkup(62, 62)}</div>
      <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:10px 14px; border-top:1px solid rgba(255,255,255,0.25); padding-top:10px;">
        ${stats.map(s => `
          <div>
            <div style="font-size:10.5px; color:rgba(255,255,255,0.75);">${s.label}</div>
            <div style="font-size:15.5px; font-weight:800; color:#fff;">${s.value}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function drawCanvasSplitFrame(ctx) {
    drawCanvasBrandHeader(ctx, 'left');

    // ระยะทางพาดส่วนบน (ลดขนาดลงให้พอดีไม่เวอร์เกิน)
    ctx.fillStyle = '#22c55e';
    ctx.font = '900 128px sans-serif';
    ctx.fillText(`${currentStudioData.distance} กม.`, 80, 305);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText(currentStudioData.title, 80, 375);

    // เส้นทางวิ่งมุมซ้ายเหนือแถบสถิติล่าง
    drawCanvasRoute(ctx, 80, 1210, 220, 220, 12);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(80, 1465);
    ctx.lineTo(1000, 1465);
    ctx.stroke();

    const stats = getActiveStatsList();
    stats.forEach((s, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const x = 80 + (col * 460);
        const y = 1545 + (row * 155);

        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '600 32px sans-serif';
        ctx.fillText(s.label, x, y);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 58px sans-serif';
        ctx.fillText(s.value, x, y + 66);
    });
}

/**
 * ----------------------------------------------------------------------------
 * [TEMPLATE BLOCK 4]: GLASS CARD (การ์ดกระจกโปร่งแสงมุมซ้ายล่าง)
 * ----------------------------------------------------------------------------
 */
function renderTemplateGlassCard() {
    const stats = getActiveStatsList();
    const logoBadge = studioState.showLogo
        ? `<div style="display:inline-flex; align-items:center; gap:5px; background:rgba(34,197,94,0.25); border:1px solid #22c55e; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:800; color:#4ade80;">🏃 STRIDE</div>`
        : `<div></div>`;

    return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
      ${logoBadge}
      <span style="font-size:10.5px; color:rgba(255,255,255,0.85);">${currentStudioData.date}</span>
    </div>

    <div style="margin-top:auto; width:84%; background:rgba(15,23,42,0.72); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.22); border-radius:18px; padding:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div>
          <div style="font-size:10.5px; color:#cbd5e1;">${currentStudioData.title}</div>
          <div style="font-size:25px; font-weight:900; color:#22c55e; line-height:1.15;">${currentStudioData.distance} กม.</div>
        </div>
        <div>${buildRouteSVGMarkup(54, 54)}</div>
      </div>
      
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px 10px; border-top:1px solid rgba(255,255,255,0.18); padding-top:10px;">
        ${stats.map(s => `
          <div>
            <div style="font-size:9.5px; color:rgba(255,255,255,0.7);">${s.label}</div>
            <div style="font-size:14px; font-weight:800; color:#fff;">${s.value}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function drawCanvasGlassCard(ctx) {
    drawCanvasBrandHeader(ctx, 'left');

    // กล่องการ์ดโปร่งแสงมุมซ้ายล่าง
    const cardX = 70, cardY = 1190, cardW = 780, cardH = 630;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.74)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 44);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // เส้นทางวิ่งอยู่มุมขวาบนในการ์ด
    drawCanvasRoute(ctx, cardX + 520, cardY + 35, 200, 200, 10);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(currentStudioData.title, cardX + 45, cardY + 95);

    ctx.fillStyle = '#22c55e';
    ctx.font = '900 94px sans-serif';
    ctx.fillText(`${currentStudioData.distance} กม.`, cardX + 45, cardY + 195);

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cardX + 45, cardY + 245);
    ctx.lineTo(cardX + cardW - 45, cardY + 245);
    ctx.stroke();

    const stats = getActiveStatsList();
    stats.forEach((s, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const x = cardX + 45 + (col * 350);
        const y = cardY + 315 + (row * 145);

        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '600 28px sans-serif';
        ctx.fillText(s.label, x, y);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText(s.value, x, y + 56);
    });
}

// ============================================================================
// 5. ตัวจัดการเรนเดอร์หลัก & Export ไฟล์ภาพความละเอียดสูง (1080x1920)
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
}

function generateStudioCanvasBlob() {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1920; // Full Portrait 9:16
        const ctx = canvas.getContext('2d');

        // 1. วาดพื้นหลัง
        if (studioBgImageObj) {
            const imgRatio = studioBgImageObj.width / studioBgImageObj.height;
            const canvasRatio = canvas.width / canvas.height;
            let drawW = canvas.width, drawH = canvas.height, offsetX = 0, offsetY = 0;

            if (imgRatio > canvasRatio) {
                drawW = canvas.height * imgRatio;
                offsetX = -(drawW - canvas.width) / 2;
            } else {
                drawH = canvas.width / imgRatio;
                offsetY = -(drawH - canvas.height) / 2;
            }
            ctx.drawImage(studioBgImageObj, offsetX, offsetY, drawW, drawH);
        } else {
            const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
            bgGrad.addColorStop(0, '#0f172a');
            bgGrad.addColorStop(1, '#1e293b');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, 1080, 1920);
        }

        // 2. เงา Gradient ทับ
        const overlayGrad = ctx.createLinearGradient(0, 0, 0, 1920);
        overlayGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
        overlayGrad.addColorStop(0.4, 'rgba(0,0,0,0.12)');
        overlayGrad.addColorStop(1, 'rgba(0,0,0,0.88)');
        ctx.fillStyle = overlayGrad;
        ctx.fillRect(0, 0, 1080, 1920);

        // 3. วาด Template ตามบล็อกที่เลือก
        if (studioState.layout === 'center') {
            drawCanvasStravaCenter(ctx);
        } else if (studioState.layout === 'split') {
            drawCanvasSplitFrame(ctx);
        } else if (studioState.layout === 'glass') {
            drawCanvasGlassCard(ctx);
        } else {
            drawCanvasClassicBottom(ctx);
        }

        canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
    });
}

async function downloadStudioImage() {
    if (typeof showToast === 'function') showToast('🎨 กำลังสร้างไฟล์ภาพความละเอียดสูง...');
    const blob = await generateStudioCanvasBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Stride-${studioState.layout}-${Date.now()}.png`;
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
            await navigator.share({
                title: 'Stride Activity',
                text: `บันทึกการวิ่ง ${currentStudioData.distance} กม. บน Stride! 🏃🔥`,
                files: [file]
            });
        } catch (err) {
            if (err.name !== 'AbortError') downloadStudioImage();
        }
    } else {
        downloadStudioImage();
    }
}

// ============================================================================
// 6. รองรับปุ่มกล้องทางลัดบนหน้าแผนที่ (Camera Shortcut)
// ============================================================================

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
    if (typeof closeTopLayer === 'function') closeTopLayer('camera-modal');
}

function handleCameraPhotoSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const previewBox = document.getElementById('camera-preview-box');
        if (previewBox) {
            previewBox.style.backgroundImage = `url('${e.target.result}')`;
            previewBox.style.backgroundSize = 'cover';
            previewBox.style.backgroundPosition = 'center';
        }
        if (typeof showToast === 'function') showToast('📸 โหลดรูปภาพสำเร็จ!');
    };
    reader.readAsDataURL(file);
}