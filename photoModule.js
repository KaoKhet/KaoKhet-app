// ============================================================================
// 📸 photoModule.js — KaoKhet Studio (Direct Customization + Pinch/Drag/Filter)
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

let studioState = {
    layout: 'classic', // 'classic' | 'center' | 'split' | 'glass'
    selectedStats: ['time', 'pace', 'steps', 'calories'],
    showRoute: true,
    showLogo: true,
    stickers: [],
    selectedStickerId: null,
    filterCss: 'none',
    hasPhoto: false,
    activeCategory: 'panel-templates',

    // ตำแหน่งและการย่อขยายแยกอิสระ (พื้นหลัง + ชิ้นส่วนต่างๆ)
    transforms: {
        bgPhoto: { x: 0, y: 0, scale: 1 },
        brand: { x: 0, y: 0, scale: 1 },
        route: { x: 0, y: 0, scale: 1 },
        distance: { x: 0, y: 0, scale: 1 },
        stats: { x: 0, y: 0, scale: 1 }
    }
};

let studioBgImageObj = null;
let studioHintShownOnce = false;
let activeTargetKey = null;
let activeStickerId = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialPinchDistance = null;
let initialPinchScale = 1;

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

function triggerFirstVisitHintIfNeeded() {
    if (studioHintShownOnce) return;
    studioHintShownOnce = true;

    const hintEl = document.getElementById('studio-first-visit-hint');
    if (!hintEl) return;

    hintEl.classList.remove('fade-out');
    hintEl.style.display = 'flex';

    clearTimeout(hintEl._hideTimer);
    hintEl._hideTimer = setTimeout(() => {
        hintEl.classList.add('fade-out');
        setTimeout(() => {
            if (hintEl && hintEl.parentNode) {
                hintEl.parentNode.removeChild(hintEl);
            }
        }, 450);
    }, 3200);
}

function openStudioModal() {
    if (typeof closeTopLayer === 'function') closeTopLayer('summary-modal');
    collectLiveActivityData();
    studioBgImageObj = null;
    resetStudioBackground();
    resetCustomWidgetsTransform();
    updateMandatoryFooterDate();

    syncStudioChipsUI();
    renderStudioPreview();
    initStudioTouchGestures();
    triggerFirstVisitHintIfNeeded();

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
    updateMandatoryFooterDate();

    syncStudioChipsUI();
    renderStudioPreview();
    initStudioTouchGestures();
    triggerFirstVisitHintIfNeeded();

    if (typeof openTopLayer === 'function') openTopLayer('share-modal', 'flex');
}

function finishActivity() {
    if (typeof closeTopLayer === 'function') closeTopLayer('share-modal');
    if (typeof resetModal === 'function') resetModal();
}

function closeShareModal() {
    finishActivity();
}

function updateMandatoryFooterDate() {
    const dateEl = document.getElementById('studio-mandatory-date');
    if (dateEl) {
        dateEl.textContent = currentStudioData.date || '';
    }
}

// ============================================================================
// 2. ระบบควบคุมการลาก (Drag) และย่อ-ขยาย 2 นิ้ว (Pinch-to-Zoom)
// ============================================================================

function getSelectedStickerItem() {
    if (!Array.isArray(studioState.stickers) || studioState.stickers.length === 0) return null;
    const targetId = activeStickerId || studioState.selectedStickerId;
    return studioState.stickers.find(s => s.id === targetId) || studioState.stickers[studioState.stickers.length - 1];
}

function resetCustomWidgetsTransform() {
    isDragging = false;
    activeTargetKey = null;
    activeStickerId = null;
    initialPinchDistance = null;

    if (studioState) {
        studioState.stickers = [];
        studioState.selectedStickerId = null;
        if (studioState.transforms) {
            Object.keys(studioState.transforms).forEach(key => {
                studioState.transforms[key] = { x: 0, y: 0, scale: 1 };
            });
        }
    }
    applyAllStudioTransforms();
}

function resetStudioPositionAndScale() {
    resetCustomWidgetsTransform();
    renderStudioPreview();
    if (typeof showToast === 'function') showToast('รีเซ็ตตำแหน่งและขนาดเรียบร้อย');
}

function applyAllStudioTransforms() {
    const bgLayer = document.getElementById('studio-bg-photo-layer');
    if (bgLayer) {
        const bgT = studioState.transforms.bgPhoto || { x: 0, y: 0, scale: 1 };
        bgLayer.style.transformOrigin = 'center center';
        bgLayer.style.transform = `translate(${bgT.x}px, ${bgT.y}px) scale(${bgT.scale})`;
        bgLayer.style.filter = studioState.filterCss || 'none';
    }

    const bgImg = document.getElementById('studio-bg-photo-img');
    if (bgImg && studioState.hasPhoto) {
        bgImg.style.width = '100%';
        bgImg.style.height = '100%';
        bgImg.style.objectFit = 'cover';
        bgImg.style.display = 'block';
    }

    const stage = document.getElementById('studio-template-stage');
    if (!stage) return;

    stage.querySelectorAll('.custom-widget-box:not(.kk-studio-sticker-box)').forEach(el => {
        const key = el.dataset.widgetKey || 'stats';
        const w = studioState.transforms[key] || { x: 0, y: 0, scale: 1 };
        el.style.transform = `translate(${w.x}px, ${w.y}px) scale(${w.scale})`;
        el.style.transformOrigin = 'center center';
        el.style.touchAction = 'none';
    });

    syncStickersTransformsInDOM();
}

function syncStickersTransformsInDOM() {
    const stage = document.getElementById('studio-template-stage');
    if (!stage || !Array.isArray(studioState.stickers)) return;

    const stageRect = stage.getBoundingClientRect();
    const hasValidRect = stageRect.width > 0 && stageRect.height > 0;
    const centerX = hasValidRect ? stageRect.width / 2 : 0;
    const centerY = hasValidRect ? stageRect.height / 2 : 0;

    stage.querySelectorAll('.kk-studio-sticker-box[data-sticker-id]').forEach(el => {
        const sid = el.getAttribute('data-sticker-id');
        const item = studioState.stickers.find(s => s.id === sid);
        if (!item) return;

        const posX = centerX + (item.x || 0);
        const posY = centerY + (item.y || 0);
        const scale = item.scale || 1;

        el.style.position = 'absolute';
        el.style.left = hasValidRect ? `${posX}px` : '50%';
        el.style.top = hasValidRect ? `${posY}px` : '50%';
        el.style.transform = hasValidRect
            ? `translate(-50%, -50%) scale(${scale})`
            : `translate(calc(-50% + ${item.x || 0}px), calc(-50% + ${item.y || 0}px)) scale(${scale})`;
        el.style.transformOrigin = 'center center';
        el.style.touchAction = 'none';
        el.classList.toggle('is-selected', item.id === studioState.selectedStickerId);
    });
}

function resolveStudioTarget(targetEl) {
    const stickerBox = targetEl ? targetEl.closest('.kk-studio-sticker-box') : null;
    if (stickerBox && stickerBox.dataset.stickerId) {
        return { key: 'sticker', stickerId: stickerBox.dataset.stickerId };
    }

    const widget = targetEl ? targetEl.closest('.custom-widget-box') : null;
    if (widget && widget.dataset.widgetKey && studioState.transforms[widget.dataset.widgetKey]) {
        return { key: widget.dataset.widgetKey, stickerId: null };
    }

    return { key: 'bgPhoto', stickerId: null };
}

function initStudioTouchGestures() {
    const previewBox = document.getElementById('share-preview-box');
    if (!previewBox || previewBox.dataset.hasListener === 'true') return;
    previewBox.dataset.hasListener = 'true';

    previewBox.addEventListener('pointerdown', (e) => {
        if (e.target && e.target.closest('.kk-sticker-delete-btn')) return;
        if (e.pointerType === 'touch' && !e.isPrimary) return;

        const resolved = resolveStudioTarget(e.target);
        activeTargetKey = resolved.key;
        activeStickerId = resolved.stickerId;
        isDragging = true;

        if (activeTargetKey === 'sticker' && activeStickerId) {
            studioState.selectedStickerId = activeStickerId;
            syncStickersTransformsInDOM();
            const stk = getSelectedStickerItem();
            if (stk) {
                dragStartX = e.clientX - stk.x;
                dragStartY = e.clientY - stk.y;
            }
        } else {
            if (studioState.selectedStickerId !== null || activeStickerId !== null) {
                studioState.selectedStickerId = null;
                activeStickerId = null;
                syncStickersTransformsInDOM();
            }

            const t = studioState.transforms[activeTargetKey];
            if (t) {
                dragStartX = e.clientX - t.x;
                dragStartY = e.clientY - t.y;
            }
        }
    });

    previewBox.addEventListener('pointermove', (e) => {
        if (!isDragging || !activeTargetKey || initialPinchDistance !== null) return;

        if (activeTargetKey === 'sticker') {
            const stk = getSelectedStickerItem();
            if (!stk) return;
            stk.x = e.clientX - dragStartX;
            stk.y = e.clientY - dragStartY;
            syncStickersTransformsInDOM();
            return;
        }

        const t = studioState.transforms[activeTargetKey];
        if (!t) return;
        t.x = e.clientX - dragStartX;
        t.y = e.clientY - dragStartY;
        applyAllStudioTransforms();
    });

    const stopDrag = () => {
        isDragging = false;
    };
    previewBox.addEventListener('pointerup', stopDrag);
    previewBox.addEventListener('pointercancel', stopDrag);

    previewBox.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            isDragging = false;
            const resolved = resolveStudioTarget(e.target);
            activeTargetKey = resolved.key;
            activeStickerId = resolved.stickerId;

            if (activeTargetKey === 'sticker' && activeStickerId) {
                studioState.selectedStickerId = activeStickerId;
                syncStickersTransformsInDOM();
            }

            initialPinchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );

            if (activeTargetKey === 'sticker') {
                const stk = getSelectedStickerItem();
                initialPinchScale = stk?.scale || 1;
            } else {
                initialPinchScale = studioState.transforms[activeTargetKey]?.scale || 1;
            }
        }
    }, { passive: true });

    previewBox.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDistance !== null && activeTargetKey) {
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const ratio = currentDistance / initialPinchDistance;

            if (activeTargetKey === 'sticker') {
                const stk = getSelectedStickerItem();
                if (stk) {
                    stk.scale = Math.min(3.0, Math.max(0.4, initialPinchScale * ratio));
                    syncStickersTransformsInDOM();
                }
                return;
            }

            const minScale = 0.5;
            const maxScale = activeTargetKey === 'bgPhoto' ? 3.5 : 2.5;
            const t = studioState.transforms[activeTargetKey];
            if (t) {
                t.scale = Math.min(maxScale, Math.max(minScale, initialPinchScale * ratio));
                applyAllStudioTransforms();
            }
        }
    }, { passive: true });

    previewBox.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            initialPinchDistance = null;
        }
    });

    previewBox.addEventListener('wheel', (e) => {
        e.preventDefault();
        const resolved = resolveStudioTarget(e.target);
        const delta = e.deltaY < 0 ? 0.08 : -0.08;

        if (resolved.key === 'sticker' && resolved.stickerId) {
            studioState.selectedStickerId = resolved.stickerId;
            activeStickerId = resolved.stickerId;
            const stk = getSelectedStickerItem();
            if (stk) {
                stk.scale = Math.min(3.0, Math.max(0.4, stk.scale + delta));
                syncStickersTransformsInDOM();
            }
            return;
        }

        const t = studioState.transforms[resolved.key];
        if (t) {
            t.scale = Math.min(3.5, Math.max(0.5, t.scale + delta));
            applyAllStudioTransforms();
        }
    }, { passive: false });
}

// ============================================================================
// 3. การควบคุมเมนู 2 สเต็ป, Templates, Toggles, สติกเกอร์ และฟิลเตอร์
// ============================================================================

function selectStudioCategory(targetPanelId, hintText, navBtnEl) {
    studioState.activeCategory = targetPanelId;

    document.querySelectorAll('.kk-studio-nav-item').forEach(btn => btn.classList.remove('active'));
    if (navBtnEl) navBtnEl.classList.add('active');

    document.querySelectorAll('.kk-studio-options-row').forEach(row => row.classList.remove('active'));
    const targetRow = document.getElementById(targetPanelId);
    if (targetRow) targetRow.classList.add('active');

    const statusEl = document.getElementById('studio-panel-status-text');
    if (statusEl && hintText) statusEl.textContent = hintText;
}

function selectStudioLayout(layoutKey) {
    studioState.layout = layoutKey;
    resetCustomWidgetsTransform();
    syncStudioChipsUI();
    renderStudioPreview();
}

function toggleStudioStatChip(chipElement) {
    const statKey = chipElement.getAttribute('data-stat');
    if (!statKey) return;

    const idx = studioState.selectedStats.indexOf(statKey);
    if (idx > -1) {
        studioState.selectedStats.splice(idx, 1);
    } else {
        if (studioState.selectedStats.length >= MAX_STUDIO_STATS) {
            if (typeof showToast === 'function') {
                showToast(`เลือกสถิติย่อยได้สูงสุด ${MAX_STUDIO_STATS} รายการครับ`);
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

function removeStudioStickerById(stickerId, event) {
    if (event) {
        event.stopPropagation();
    }
    if (!Array.isArray(studioState.stickers)) return;

    studioState.stickers = studioState.stickers.filter(item => item.id !== stickerId);
    if (studioState.selectedStickerId === stickerId || activeStickerId === stickerId) {
        const lastItem = studioState.stickers[studioState.stickers.length - 1];
        studioState.selectedStickerId = lastItem ? lastItem.id : null;
        activeStickerId = lastItem ? lastItem.id : null;
    }
    renderStickersLayer(document.getElementById('studio-template-stage'));
}

function selectStudioSticker(stickerVal, itemEl) {
    document.querySelectorAll('.kk-studio-sticker-item').forEach(el => el.classList.remove('active'));
    if (itemEl) itemEl.classList.add('active');

    if (!Array.isArray(studioState.stickers)) {
        studioState.stickers = [];
    }

    if (!stickerVal) {
        studioState.stickers = [];
        studioState.selectedStickerId = null;
        activeStickerId = null;
        renderStickersLayer(document.getElementById('studio-template-stage'));
        if (typeof showToast === 'function') showToast('ล้างสติกเกอร์ทั้งหมดแล้ว');
        return;
    }

    const idx = studioState.stickers.length;
    const spreadX = ((idx % 5) - 2) * 20;
    const spreadY = ((Math.floor(idx / 5) % 3) - 1) * 18;

    const newSticker = {
        id: 'stk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        emoji: stickerVal,
        x: spreadX,
        y: spreadY,
        scale: 1
    };

    studioState.stickers.push(newSticker);
    studioState.selectedStickerId = newSticker.id;
    activeStickerId = newSticker.id;
    activeTargetKey = 'sticker';

    const stage = document.getElementById('studio-template-stage');
    if (stage && !stage.innerHTML.trim()) {
        renderStudioPreview();
    } else {
        renderStickersLayer(stage);
    }
}

function renderStickersLayer(stage) {
    const targetStage = stage || document.getElementById('studio-template-stage');
    if (!targetStage) return;

    targetStage.querySelectorAll('.kk-studio-sticker-box').forEach(el => el.remove());

    if (!Array.isArray(studioState.stickers) || studioState.stickers.length === 0) return;

    const wrapperHtml = studioState.stickers.map(item => {
        const isSelected = item.id === studioState.selectedStickerId;
        return `
            <div class="custom-widget-box kk-studio-sticker-box ${isSelected ? 'is-selected' : ''}"
                 data-widget-key="sticker"
                 data-sticker-id="${item.id}">
                <span class="kk-sticker-emoji">${item.emoji}</span>
                <button type="button"
                        class="kk-sticker-delete-btn"
                        onclick="removeStudioStickerById('${item.id}', event)"
                        title="ลบสติกเกอร์ชิ้นนี้">✕</button>
            </div>
        `;
    }).join('');

    targetStage.insertAdjacentHTML('beforeend', wrapperHtml);
    syncStickersTransformsInDOM();
}

function selectStudioFilter(filterVal, itemEl) {
    studioState.filterCss = filterVal || 'none';
    document.querySelectorAll('.kk-studio-filter-item').forEach(el => el.classList.remove('active'));
    if (itemEl) itemEl.classList.add('active');
    applyAllStudioTransforms();
}

function syncStudioChipsUI() {
    const quotaEl = document.getElementById('studio-quota-indicator');
    if (quotaEl) {
        quotaEl.textContent = `สถิติ: ${studioState.selectedStats.length}/${MAX_STUDIO_STATS}`;
    }

    document.querySelectorAll('.kk-studio-template-card').forEach(card => {
        card.classList.toggle('active', card.getAttribute('data-layout') === studioState.layout);
    });

    document.querySelectorAll('.kk-studio-stat-chip').forEach(chip => {
        const key = chip.getAttribute('data-stat');
        chip.classList.toggle('active', studioState.selectedStats.includes(key));
    });

    const logoChip = document.getElementById('studio-toggle-logo');
    if (logoChip) logoChip.classList.toggle('active', Boolean(studioState.showLogo));

    const routeChip = document.getElementById('studio-toggle-route');
    if (routeChip) routeChip.classList.toggle('active', Boolean(studioState.showRoute));
}

function handleStudioPhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            studioBgImageObj = img;
            const imgEl = document.getElementById('studio-bg-photo-img');
            const emptyHint = document.getElementById('studio-empty-photo-hint');
            if (imgEl) {
                imgEl.src = e.target.result;
                imgEl.style.width = '100%';
                imgEl.style.height = '100%';
                imgEl.style.objectFit = 'cover';
                imgEl.style.display = 'block';
            }
            if (emptyHint) emptyHint.style.display = 'none';
            studioState.hasPhoto = true;
            studioState.transforms.bgPhoto = { x: 0, y: 0, scale: 1 };
            applyAllStudioTransforms();
            if (typeof showToast === 'function') showToast('อัปเดตรูปพื้นหลังแล้ว สามารถใช้ 2 นิ้วย่อ-ขยายได้');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function resetStudioBackground() {
    studioBgImageObj = null;
    studioState.hasPhoto = false;
    const imgEl = document.getElementById('studio-bg-photo-img');
    const emptyHint = document.getElementById('studio-empty-photo-hint');
    if (imgEl) {
        imgEl.src = '';
        imgEl.style.display = 'none';
    }
    if (emptyHint) emptyHint.style.display = 'flex';
    if (studioState.transforms && studioState.transforms.bgPhoto) {
        studioState.transforms.bgPhoto = { x: 0, y: 0, scale: 1 };
    }
    applyAllStudioTransforms();
}

// ============================================================================
// 4. Helper สร้างโลโก้ สถิติ และเส้นทางวิ่ง SVG
// ============================================================================

function getStudioLogoMarkup(heightPx = 30) {
    return `
        <img src="./kaokhetlogo0.png" alt="KaoKhet" class="kk-studio-logo-img" style="height:${heightPx}px;"
             onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-flex';">
        <div class="kk-studio-logo-fallback" style="display:none;">KaoKhet</div>
    `;
}

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

function buildRouteSVGMarkup(widthPx = 80, heightPx = 80) {
    const coords = (currentStudioData.pathCoordinates && currentStudioData.pathCoordinates.length >= 2)
        ? currentStudioData.pathCoordinates
        : [[13.736, 100.523], [13.738, 100.524], [13.739, 100.526], [13.737, 100.527], [13.736, 100.525], [13.736, 100.523]];

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

    const mappedPoints = coords.map(pt => {
        const lat = Array.isArray(pt) ? pt[0] : pt.lat;
        const lng = Array.isArray(pt) ? pt[1] : pt.lng;
        const x = 15 + ((lng - minLng) / span) * 70;
        const y = 15 + ((maxLat - lat) / span) * 70;
        return { x, y };
    });

    const pointsStr = mappedPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const startPt = mappedPoints[0];
    const endPt = mappedPoints[mappedPoints.length - 1];

    return `
        <svg viewBox="0 0 100 100" style="width:${widthPx}px; height:${heightPx}px; overflow:visible; filter:drop-shadow(0 0 8px rgba(34,197,94,0.8));">
            <polyline points="${pointsStr}" fill="none" stroke="#22c55e" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="${startPt.x}" cy="${startPt.y}" r="4.5" fill="#4ade80" stroke="#fff" stroke-width="1.5" />
            <circle cx="${endPt.x}" cy="${endPt.y}" r="4.5" fill="#16a34a" stroke="#fff" stroke-width="1.5" />
        </svg>
    `;
}

// ============================================================================
// 5. เรนเดอร์หน้าจอพรีวิว (ไม่มีเส้นแบ่งข้อมูล + แยกโลโก้และเส้นทางอิสระ)
// ============================================================================

function renderStudioPreview() {
    const stage = document.getElementById('studio-template-stage');
    if (!stage) return;

    if (studioState.layout === 'center') {
        stage.innerHTML = renderTemplateCenter();
    } else if (studioState.layout === 'split') {
        stage.innerHTML = renderTemplateSplit();
    } else if (studioState.layout === 'glass') {
        stage.innerHTML = renderTemplateGlass();
    } else {
        stage.innerHTML = renderTemplateClassic();
    }

    renderStickersLayer(stage);
    applyAllStudioTransforms();
}

function renderTemplateClassic() {
    const stats = getActiveStatsList();
    const cols = Math.min(2, Math.max(1, stats.length));
    return `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div class="custom-widget-box" data-widget-key="brand">
                ${studioState.showLogo ? getStudioLogoMarkup(30) : ''}
            </div>
            <div class="custom-widget-box" data-widget-key="route">
                ${studioState.showRoute ? buildRouteSVGMarkup(76, 76) : ''}
            </div>
        </div>
        <div class="custom-widget-box" data-widget-key="stats" style="margin-top:auto;">
            <div style="font-size:11.5px; font-weight:700; color:#e2e8f0; text-shadow:0 1px 4px rgba(0,0,0,0.65);">${currentStudioData.title}</div>
            <div style="font-size:32px; font-weight:900; color:#22c55e; line-height:1.1; margin-bottom:8px; text-shadow:0 2px 10px rgba(0,0,0,0.65);">${currentStudioData.distance} กม.</div>
            <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:8px 14px; padding-top:4px;">
                ${stats.map(s => `
                    <div>
                        <div style="font-size:10px; color:rgba(255,255,255,0.8); text-shadow:0 1px 3px rgba(0,0,0,0.6);">${s.label}</div>
                        <div style="font-size:15.5px; font-weight:800; color:#fff; text-shadow:0 1px 4px rgba(0,0,0,0.65);">${s.value}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderTemplateCenter() {
    const stats = getActiveStatsList();
    const cols = Math.min(2, Math.max(1, stats.length));
    return `
        <div style="display:flex; justify-content:flex-start; align-items:center;">
            <div class="custom-widget-box" data-widget-key="brand">
                ${studioState.showLogo ? getStudioLogoMarkup(28) : ''}
            </div>
        </div>
        <div style="margin:auto 0; text-align:center; display:flex; flex-direction:column; align-items:center;">
            <div class="custom-widget-box" data-widget-key="route" style="margin-bottom:8px;">
                ${studioState.showRoute ? buildRouteSVGMarkup(96, 96) : ''}
            </div>
            <div class="custom-widget-box" data-widget-key="distance">
                <div style="font-size:11.5px; font-weight:700; color:#e2e8f0; text-shadow:0 1px 4px rgba(0,0,0,0.6);">${currentStudioData.title}</div>
                <div style="font-size:34px; font-weight:900; color:#22c55e; line-height:1.1; text-shadow:0 2px 10px rgba(0,0,0,0.65);">${currentStudioData.distance} กม.</div>
            </div>
        </div>
        <div class="custom-widget-box" data-widget-key="stats" style="width:100%; display:flex; justify-content:center;">
            <div style="width:92%; padding-top:4px;">
                <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:8px 12px; text-align:center;">
                    ${stats.map(s => `
                        <div>
                            <div style="font-size:10px; color:rgba(255,255,255,0.8); text-shadow:0 1px 3px rgba(0,0,0,0.6);">${s.label}</div>
                            <div style="font-size:15px; font-weight:800; color:#fff; text-shadow:0 1px 4px rgba(0,0,0,0.65);">${s.value}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderTemplateSplit() {
    const stats = getActiveStatsList();
    const cols = Math.min(2, Math.max(1, stats.length));
    return `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
                <div class="custom-widget-box" data-widget-key="brand" style="margin-bottom:8px;">
                    ${studioState.showLogo ? getStudioLogoMarkup(26) : ''}
                </div>
                <div class="custom-widget-box" data-widget-key="distance">
                    <div style="font-size:30px; font-weight:900; color:#22c55e; line-height:1.05; text-shadow:0 2px 10px rgba(0,0,0,0.65);">${currentStudioData.distance} กม.</div>
                    <div style="font-size:11px; font-weight:700; color:#e2e8f0; text-shadow:0 1px 4px rgba(0,0,0,0.6);">${currentStudioData.title}</div>
                </div>
            </div>
            <div class="custom-widget-box" data-widget-key="route">
                ${studioState.showRoute ? buildRouteSVGMarkup(68, 68) : ''}
            </div>
        </div>
        <div class="custom-widget-box" data-widget-key="stats" style="margin-top:auto;">
            <div style="padding-top:4px;">
                <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:8px 12px;">
                    ${stats.map(s => `
                        <div>
                            <div style="font-size:10px; color:rgba(255,255,255,0.8); text-shadow:0 1px 3px rgba(0,0,0,0.6);">${s.label}</div>
                            <div style="font-size:15px; font-weight:800; color:#fff; text-shadow:0 1px 4px rgba(0,0,0,0.65);">${s.value}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderTemplateGlass() {
    const stats = getActiveStatsList();
    return `
        <div style="display:flex; justify-content:flex-start; align-items:center;">
            <div class="custom-widget-box" data-widget-key="brand">
                ${studioState.showLogo ? getStudioLogoMarkup(28) : ''}
            </div>
        </div>
        <div class="custom-widget-box" data-widget-key="stats" style="margin-top:auto; width:100%; background:rgba(15,23,42,0.62); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.22); border-radius:16px; padding:12px 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div>
                    <div style="font-size:10.5px; color:#cbd5e1;">${currentStudioData.title}</div>
                    <div style="font-size:26px; font-weight:900; color:#22c55e; line-height:1.1;">${currentStudioData.distance} กม.</div>
                </div>
                <div class="custom-widget-box" data-widget-key="route">
                    ${studioState.showRoute ? buildRouteSVGMarkup(54, 54) : ''}
                </div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:7px 10px; padding-top:4px;">
                ${stats.map(s => `
                    <div>
                        <div style="font-size:9.5px; color:rgba(255,255,255,0.72);">${s.label}</div>
                        <div style="font-size:14px; font-weight:800; color:#fff;">${s.value}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ============================================================================
// 6. Canvas Export & Camera Shortcut Modal
// ============================================================================

function generateStudioCanvasBlob() {
    return new Promise(async (resolve) => {
        const previewBox = document.getElementById('share-preview-box');
        if (!previewBox) {
            resolve(null);
            return;
        }

        const prevSelectedId = studioState.selectedStickerId;
        const prevActiveId = activeStickerId;
        const hintEl = document.getElementById('studio-first-visit-hint');
        const prevHintDisplay = hintEl ? hintEl.style.display : '';

        try {
            if (typeof html2canvas !== 'undefined') {
                if (hintEl) hintEl.style.display = 'none';

                studioState.selectedStickerId = null;
                activeStickerId = null;
                syncStickersTransformsInDOM();

                const rect = previewBox.getBoundingClientRect();
                const boxWidth = Math.max(1, Math.round(rect.width || previewBox.clientWidth || 360));
                const boxHeight = Math.max(1, Math.round(rect.height || previewBox.clientHeight || 480));
                const exportScale = Math.min(3, Math.max(2, window.devicePixelRatio || 2));

                const canvas = await html2canvas(previewBox, {
                    scale: exportScale,
                    width: boxWidth,
                    height: boxHeight,
                    windowWidth: document.documentElement.clientWidth,
                    windowHeight: document.documentElement.clientHeight,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#0f172a'
                });

                if (hintEl) hintEl.style.display = prevHintDisplay;
                studioState.selectedStickerId = prevSelectedId;
                activeStickerId = prevActiveId;
                syncStickersTransformsInDOM();

                canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
                return;
            }
        } catch (err) {
            console.error('html2canvas error:', err);
        }

        if (hintEl) hintEl.style.display = prevHintDisplay;
        studioState.selectedStickerId = prevSelectedId;
        activeStickerId = prevActiveId;
        syncStickersTransformsInDOM();
        resolve(null);
    });
}

async function downloadStudioImage() {
    if (typeof showToast === 'function') showToast('กำลังสร้างไฟล์ภาพความละเอียดสูง...');
    const blob = await generateStudioCanvasBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KaoKhet-Studio-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast('บันทึกรูปภาพลงเครื่องเรียบร้อย!');
}

async function shareStudioImageNative() {
    const blob = await generateStudioCanvasBlob();
    if (!blob) return;
    const file = new File([blob], `KaoKhet-Studio-${Date.now()}.png`, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                title: 'KaoKhet Studio',
                text: `บันทึกการวิ่ง ${currentStudioData.distance} กม. บน KaoKhet!`,
                files: [file]
            });
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
