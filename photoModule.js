// ==========================================
// 📸 photoModule.js — Stride Photo Studio (Portrait Edition)
// ==========================================

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
    isHistoryMode: false
};

let studioBgImageObj = null;

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
        isHistoryMode: false
    };
}

function openShareModal() {
    if (typeof closeTopLayer === 'function') closeTopLayer('summary-modal');
    collectLiveActivityData();
    studioBgImageObj = null;
    resetStudioBackground();

    const saveDbBtn = document.getElementById('btn-studio-save-db');
    if (saveDbBtn) saveDbBtn.style.display = 'block';

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
        isHistoryMode: true
    };

    studioBgImageObj = null;
    resetStudioBackground();

    const saveDbBtn = document.getElementById('btn-studio-save-db');
    if (saveDbBtn) saveDbBtn.style.display = 'none';

    renderStudioPreview();
    if (typeof openTopLayer === 'function') openTopLayer('share-modal', 'flex');
}

function closeShareModal() {
    if (typeof closeTopLayer === 'function') closeTopLayer('share-modal');
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
            if (typeof showToast === 'function') showToast('🖼️ โหลดรูปภาพพื้นหลังเรียบร้อย!');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function resetStudioBackground() {
    studioBgImageObj = null;
    const previewBox = document.getElementById('share-preview-box');
    if (previewBox) {
        previewBox.style.backgroundImage = 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';
    }
}

function renderStudioPreview() {
    const brandBadge = document.getElementById('preview-brand-badge');
    const showLogo = document.getElementById('toggle-brand-logo')?.checked ?? true;
    if (brandBadge) brandBadge.style.visibility = showLogo ? 'visible' : 'hidden';

    const dateEl = document.getElementById('preview-date-text');
    const titleEl = document.getElementById('preview-activity-title');
    const distEl = document.getElementById('preview-main-dist');
    const gridEl = document.getElementById('preview-stats-grid');

    if (dateEl) dateEl.textContent = currentStudioData.date;
    if (titleEl) titleEl.textContent = currentStudioData.title;
    if (distEl) distEl.textContent = `${currentStudioData.distance} กม.`;

    if (!gridEl) return;

    const statDefinitions = {
        time: { label: 'เวลา', value: currentStudioData.time },
        pace: { label: 'เพซเฉลี่ย', value: `${currentStudioData.pace} /กม.` },
        steps: { label: 'ก้าวเดิน', value: currentStudioData.steps },
        calories: { label: 'แคลอรี', value: `${currentStudioData.calories} kcal` },
        cadence: { label: 'รอบขา', value: `${currentStudioData.cadence} spm` },
        heart: { label: 'ชีพจร', value: `${currentStudioData.heart} bpm` }
    };

    const checkedBoxes = Array.from(document.querySelectorAll('.studio-stat-toggle:checked')).map(cb => cb.value);

    gridEl.innerHTML = checkedBoxes.map(key => {
        const item = statDefinitions[key];
        if (!item) return '';
        return `
      <div>
        <div style="opacity:0.75; font-size:10px;">${item.label}</div>
        <div style="font-weight:800; font-size:12px; color:#ffffff;">${item.value}</div>
      </div>
    `;
    }).join('');
}

function generateStudioCanvasBlob() {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1350; // อัตราส่วนแนวตั้ง 4:5
        const ctx = canvas.getContext('2d');

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
            const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1350);
            bgGrad.addColorStop(0, '#0f172a');
            bgGrad.addColorStop(1, '#1e293b');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, 1080, 1350);
        }

        const overlayGrad = ctx.createLinearGradient(0, 0, 0, 1350);
        overlayGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
        overlayGrad.addColorStop(0.4, 'rgba(0,0,0,0.1)');
        overlayGrad.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = overlayGrad;
        ctx.fillRect(0, 0, 1080, 1350);

        const showLogo = document.getElementById('toggle-brand-logo')?.checked ?? true;
        if (showLogo) {
            ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(70, 70, 260, 68, 34);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#4ade80';
            ctx.font = 'bold 34px sans-serif';
            ctx.fillText('🏃 STRIDE', 105, 116);
        }

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '600 32px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(currentStudioData.date, 1010, 115);
        ctx.textAlign = 'left';

        // ตรงกลางภาพแนวตั้ง
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 42px sans-serif';
        ctx.fillText(currentStudioData.title, 70, 600);

        ctx.fillStyle = '#22c55e';
        ctx.font = '900 140px sans-serif';
        ctx.fillText(`${currentStudioData.distance} กม.`, 70, 740);

        // เส้นคั่น
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(70, 820);
        ctx.lineTo(1010, 820);
        ctx.stroke();

        const statDefinitions = {
            time: { label: 'เวลาที่ใช้', value: currentStudioData.time },
            pace: { label: 'เพซเฉลี่ย', value: `${currentStudioData.pace} /กม.` },
            steps: { label: 'ก้าวเดิน', value: currentStudioData.steps },
            calories: { label: 'แคลอรี', value: `${currentStudioData.calories} kcal` },
            cadence: { label: 'รอบขา', value: `${currentStudioData.cadence} spm` },
            heart: { label: 'ชีพจรเฉลี่ย', value: `${currentStudioData.heart} bpm` }
        };

        const checkedBoxes = Array.from(document.querySelectorAll('.studio-stat-toggle:checked')).map(cb => cb.value);
        checkedBoxes.forEach((key, index) => {
            const item = statDefinitions[key];
            if (!item) return;

            const col = index % 3;
            const row = Math.floor(index / 3);
            const x = 70 + (col * 320);
            const y = 900 + (row * 120);

            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '600 28px sans-serif';
            ctx.fillText(item.label, x, y);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 44px sans-serif';
            ctx.fillText(item.value, x, y + 52);
        });

        canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
    });
}

async function downloadStudioImage() {
    if (typeof showToast === 'function') showToast('🎨 กำลังสร้างไฟล์ภาพแนวตั้งความละเอียดสูง...');
    const blob = await generateStudioCanvasBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Stride-Portrait-${Date.now()}.png`;
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
                text: `ผลงานวิ่ง ${currentStudioData.distance} กม. บน Stride! 🏃🔥`,
                files: [file]
            });
        } catch (err) {
            if (err.name !== 'AbortError') downloadStudioImage();
        }
    } else {
        downloadStudioImage();
    }
}