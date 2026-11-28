// ==========================================
// 👑 merchantModule.js — ระบบผู้ประกอบการ จัดการแคมเปญ สแกน QR และประวัติ
// ==========================================

let cachedMerchantStoreInfo = null;
let merchantVideoStream = null;
let merchantScanInterval = null;
let merchantAuthListenerBound = false;

const CAMPAIGN_MODE_META = {
    normal: {
        title: '✨ เพิ่มแคมเปญธรรมดาทั่วไป',
        helperHtml: '<strong>แคมเปญธรรมดา:</strong> แสดงหมุดโปรโมชันบนแผนที่พร้อมปุ่มเข้าหน้าร้าน ผู้เล่นใช้พอยต์แลกคูปองทั่วไปได้ทันที',
        bgColor: '#eff6ff',
        borderColor: '#bfdbfe',
        textColor: '#1e40af',
        btnBorder: '2px solid #2563eb',
        btnBg: '#eff6ff',
        btnColor: '#1d4ed8'
    },
    fortress: {
        title: '🏰 เพิ่มป้อมปราการหน้าร้าน',
        helperHtml: '<strong>ป้อมปราการหน้าร้าน:</strong> แสดงจุดบนแผนที่ตั้งแต่แรก ผู้เล่นเดินทางมาเช็กอินในรัศมีเพื่อปลดล็อกสิทธิ์หรือคูปองลับหน้าร้าน',
        bgColor: '#fffbeb',
        borderColor: '#fde68a',
        textColor: '#92400e',
        btnBorder: '2px solid #d97706',
        btnBg: '#fffbeb',
        btnColor: '#b45309'
    },
    raid_boss: {
        title: '🐲 เพิ่มแคมเปญเรดบอส (Boss Map)',
        helperHtml: '<strong>เรดบอส (Boss Map):</strong> เปิดได้ทุกวันภายใต้กฎระยะห่าง/คูลดาวน์ ผู้เล่นเช็กอินในรัศมีแล้วเดิน/วิ่งสะสมระยะทางให้ถึงเป้าและผ่านเกณฑ์ขั้นต่ำ',
        bgColor: '#fef2f2',
        borderColor: '#fecaca',
        textColor: '#991b1b',
        btnBorder: '2px solid #dc2626',
        btnBg: '#fef2f2',
        btnColor: '#dc2626'
    }
};

function notifyMerchant(msg, fallbackAlert = false) {
    if (typeof showToast === 'function') {
        showToast(msg);
    } else if (fallbackAlert) {
        alert(msg);
    }
}

async function resolveMerchantUserId() {
    if (typeof currentUser !== 'undefined' && currentUser?.id) {
        return currentUser.id;
    }
    if (typeof ensureCurrentUser === 'function') {
        try {
            await ensureCurrentUser();
            if (typeof currentUser !== 'undefined' && currentUser?.id) {
                return currentUser.id;
            }
        } catch (_) { }
    }
    if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth) {
        try {
            const { data } = await supabaseClient.auth.getSession();
            return data?.session?.user?.id || null;
        } catch (_) { }
    }
    return null;
}

async function checkMerchantPermission(userId = null) {
    const merchantPanel = document.getElementById('merchant-control-panel');
    if (!merchantPanel) return false;

    const targetUserId = userId || await resolveMerchantUserId();
    if (!targetUserId || typeof supabaseClient === 'undefined' || !supabaseClient) {
        merchantPanel.style.display = 'none';
        return false;
    }

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', targetUserId)
            .single();

        if (error) throw error;

        const userRole = data?.role ? String(data.role).trim().toLowerCase() : '';
        const isMerchant = userRole === 'merchant';
        merchantPanel.style.display = isMerchant ? 'block' : 'none';
        return isMerchant;
    } catch (err) {
        console.error('Error checking permission:', err);
        merchantPanel.style.display = 'none';
        return false;
    }
}

function bindMerchantAuthAutoCheck() {
    if (merchantAuthListenerBound) return;
    merchantAuthListenerBound = true;

    if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth?.onAuthStateChange) {
        supabaseClient.auth.onAuthStateChange(async (_event, session) => {
            const uid = session?.user?.id || (typeof currentUser !== 'undefined' ? currentUser?.id : null);
            await checkMerchantPermission(uid);
        });
    }
}

// ==========================================
// 🎯 ระบบแยกโหมดแคมเปญ 3 รูปแบบ ('normal' | 'fortress' | 'raid_boss')
// ==========================================

function detectCampaignMode(camp = {}) {
    if (camp.campaign_type && ['normal', 'fortress', 'raid_boss'].includes(camp.campaign_type)) {
        return camp.campaign_type;
    }
    if (camp.is_raid_boss) return 'raid_boss';
    if (camp.is_secret_node || (camp.node_radius && Number(camp.node_radius) !== 50)) return 'fortress';
    return 'normal';
}

function updateModeSwitcherUI(mode = 'normal') {
    const selectedMode = ['normal', 'fortress', 'raid_boss'].includes(mode) ? mode : 'normal';

    ['normal', 'fortress', 'raid_boss'].forEach((m) => {
        const btn = document.getElementById(`mode-btn-${m}`);
        if (!btn) return;
        if (m === selectedMode) {
            const meta = CAMPAIGN_MODE_META[m];
            btn.style.border = meta.btnBorder;
            btn.style.background = meta.btnBg;
            btn.style.color = meta.btnColor;
            btn.style.fontWeight = '800';
        } else {
            btn.style.border = '1px solid #e5e7eb';
            btn.style.background = '#fff';
            btn.style.color = '#4b5563';
            btn.style.fontWeight = '700';
        }
    });

    const helperBanner = document.getElementById('campaign-mode-helper-banner');
    if (helperBanner) {
        const meta = CAMPAIGN_MODE_META[selectedMode];
        helperBanner.innerHTML = meta.helperHtml;
        helperBanner.style.background = meta.bgColor;
        helperBanner.style.borderColor = meta.borderColor;
        helperBanner.style.color = meta.textColor;
    }

    const isEditing = Boolean(document.getElementById('editing-campaign-id')?.value);
    const modeTitleEl = document.getElementById('form-mode-title');
    if (modeTitleEl && !isEditing) {
        modeTitleEl.innerText = CAMPAIGN_MODE_META[selectedMode].title;
    }
}

function selectCampaignModeInForm(mode = 'normal') {
    const selectedMode = ['normal', 'fortress', 'raid_boss'].includes(mode) ? mode : 'normal';
    const typeSelect = document.getElementById('sponsor-campaign-type');
    if (typeSelect) typeSelect.value = selectedMode;
    switchCampaignModeFields(selectedMode);
}

function switchCampaignModeFields(mode = 'normal') {
    const selectedMode = ['normal', 'fortress', 'raid_boss'].includes(mode) ? mode : 'normal';
    const typeSelect = document.getElementById('sponsor-campaign-type');
    if (typeSelect && typeSelect.value !== selectedMode) {
        typeSelect.value = selectedMode;
    }

    updateModeSwitcherUI(selectedMode);

    const isFortress = selectedMode === 'fortress';
    const isRaidBoss = selectedMode === 'raid_boss';
    const needsCheckinRadius = isFortress || isRaidBoss;

    const fortressBox = document.getElementById('fortress-node-fields');
    const secretRow = document.getElementById('secret-node-option-row');
    const raidWrapper = document.getElementById('raid-boss-fields-wrapper');
    const raidCb = document.getElementById('sponsor-is-raid');
    const raidFields = document.getElementById('raid-boss-fields');

    if (fortressBox) fortressBox.style.display = needsCheckinRadius ? 'block' : 'none';
    if (secretRow) secretRow.style.display = isFortress ? 'flex' : 'none';
    if (raidWrapper) raidWrapper.style.display = isRaidBoss ? 'block' : 'none';
    if (raidCb) raidCb.checked = isRaidBoss;

    if (raidFields) {
        raidFields.style.display = isRaidBoss ? 'flex' : 'none';
    } else if (typeof toggleRaidBossFields === 'function') {
        toggleRaidBossFields();
    }

    if (typeof merchantMiniMap !== 'undefined' && merchantMiniMap && typeof merchantMiniMap.invalidateSize === 'function') {
        setTimeout(() => merchantMiniMap.invalidateSize(), 60);
    }
}

// ==========================================
// 📍 ศูนย์รวมข้อมูลร้านค้าและพิกัดตั้งต้นของผู้ประกอบการ
// ==========================================

async function loadMerchantStoreProfile(forceRefresh = false) {
    if (!forceRefresh && cachedMerchantStoreInfo) {
        return cachedMerchantStoreInfo;
    }

    const fallback = {
        storeName: '',
        bannerUrl: '',
        lat: 13.7367,
        lng: 100.5231
    };

    const userId = await resolveMerchantUserId();
    if (!userId || typeof supabaseClient === 'undefined' || !supabaseClient) {
        return fallback;
    }

    let info = { ...fallback };

    try {
        const { data: storeData } = await supabaseClient
            .from('store_profiles')
            .select('banner_url, store_name, lat, lng')
            .eq('merchant_id', userId)
            .maybeSingle();

        if (storeData) {
            info.storeName = storeData.store_name || '';
            info.bannerUrl = storeData.banner_url || '';
            if (Number.isFinite(Number(storeData.lat)) && Number.isFinite(Number(storeData.lng))) {
                info.lat = Number(storeData.lat);
                info.lng = Number(storeData.lng);
            }
        }
    } catch (err) {
        console.warn('ไม่สามารถดึงข้อมูลจาก store_profiles:', err);
    }

    if (info.lat === fallback.lat && info.lng === fallback.lng) {
        try {
            const { data: latestCamp } = await supabaseClient
                .from('campaigns')
                .select('lat, lng')
                .eq('created_by', userId)
                .not('lat', 'is', null)
                .not('lng', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestCamp && Number.isFinite(Number(latestCamp.lat)) && Number.isFinite(Number(latestCamp.lng))) {
                info.lat = Number(latestCamp.lat);
                info.lng = Number(latestCamp.lng);
            }
        } catch (err) {
            console.warn('ไม่สามารถดึงพิกัดตั้งต้นจากแคมเปญล่าสุด:', err);
        }
    }

    cachedMerchantStoreInfo = info;
    return info;
}

function setMerchantCoordsAndMap(lat, lng) {
    const latInput = document.getElementById('sponsor-lat');
    const lngInput = document.getElementById('sponsor-lng');
    if (latInput) latInput.value = lat;
    if (lngInput) lngInput.value = lng;

    if (typeof initMerchantMiniMap === 'function') {
        setTimeout(() => initMerchantMiniMap(lat, lng), 80);
    }
}

async function applyStoreDefaultLocation(notifyUser = false) {
    const info = await loadMerchantStoreProfile();
    setMerchantCoordsAndMap(info.lat, info.lng);
    if (notifyUser) {
        notifyMerchant('🏪 ตั้งค่าพิกัดร้านตั้งต้นเรียบร้อยแล้ว');
    }
    return { lat: info.lat, lng: info.lng };
}

function getCurrentLocationForSponsor() {
    if (!navigator.geolocation) {
        notifyMerchant('⚠️ อุปกรณ์ไม่รองรับการระบุตำแหน่ง GPS');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(6));
            const lng = Number(pos.coords.longitude.toFixed(6));
            setMerchantCoordsAndMap(lat, lng);
            notifyMerchant('📍 อัปเดตพิกัดจากตำแหน่งปัจจุบันแล้ว');
        },
        (err) => {
            notifyMerchant('❌ ระบุตำแหน่งไม่สำเร็จ: ' + err.message);
        }
    );
}

async function resetMerchantMiniMap() {
    await applyStoreDefaultLocation(true);
}

function buildCampaignPayload(selectedMode, formValues) {
    const isFortress = selectedMode === 'fortress';
    const isRaidBoss = selectedMode === 'raid_boss';

    return {
        title: formValues.title,
        category: formValues.category,
        reward_details: formValues.reward,
        points_cost: formValues.pointsCost,
        total_limit: formValues.totalLimit,
        start_date: formValues.startDate,
        end_date: formValues.endDate,
        description: formValues.description,
        merchant_name: formValues.merchantName !== '' ? formValues.merchantName : null,
        sponsor_id: formValues.sponsorId,
        campaign_type: selectedMode,
        lat: Number.isFinite(formValues.lat) ? formValues.lat : null,
        lng: Number.isFinite(formValues.lng) ? formValues.lng : null,
        node_radius: (isFortress || isRaidBoss) ? (formValues.nodeRadius || 50) : 50,
        is_secret_node: isFortress ? Boolean(formValues.isSecretNode) : false,
        is_raid_boss: isRaidBoss,
        boss_name: isRaidBoss ? (formValues.bossName || formValues.title) : null,
        target_distance_km: isRaidBoss ? (formValues.targetDistKm || 10) : null,
        min_distance_km: isRaidBoss ? (Number.isFinite(formValues.minDistKm) ? formValues.minDistKm : 1) : null,
        claim_window_hours: isRaidBoss ? (Number.isFinite(formValues.claimWindowHours) && formValues.claimWindowHours > 0 ? formValues.claimWindowHours : 2) : null
    };
}

// ==========================================
// 📋 รายการแคมเปญของผู้ประกอบการ
// ==========================================

async function openSponsorForm() {
    const modal = document.getElementById('sponsor-form-modal');
    if (modal) modal.style.display = 'flex';

    const listView = document.getElementById('campaign-list-view');
    const formView = document.getElementById('campaign-form-view');
    if (listView) listView.style.display = 'block';
    if (formView) formView.style.display = 'none';

    await loadMerchantCampaigns();
}

function closeSponsorForm() {
    const modal = document.getElementById('sponsor-form-modal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('add-sponsor-form');
    if (form) form.reset();
}

function backToCampaignList() {
    const formView = document.getElementById('campaign-form-view');
    const listView = document.getElementById('campaign-list-view');
    if (formView) formView.style.display = 'none';
    if (listView) listView.style.display = 'block';
    loadMerchantCampaigns();
}

async function loadMerchantCampaigns() {
    const container = document.getElementById('merchant-campaigns-container');
    if (!container) return;

    const userId = await resolveMerchantUserId();
    if (!userId) {
        container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">กรุณาล็อกอินก่อนจัดการแคมเปญ</div>`;
        return;
    }

    container.innerHTML = `<div style="text-align:center; color:#9ca3af; padding:20px;">⏳ กำลังโหลดแคมเปญของคุณ...</div>`;

    try {
        const { data: campaigns, error } = await supabaseClient
            .from('campaigns')
            .select('*')
            .eq('created_by', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!campaigns || campaigns.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; color:#9ca3af; padding:30px 0;">
                    <div style="font-size:32px; margin-bottom:8px;">🏷️</div>
                    <div style="font-size:13px;">คุณยังไม่มีแคมเปญในระบบ</div>
                    <div style="font-size:11px; margin-top:4px;">เลือกปุ่มประเภทแคมเปญด้านบนเพื่อสร้างได้เลย</div>
                </div>`;
            return;
        }

        container.innerHTML = campaigns.map((camp) => {
            const title = camp.title || 'แคมเปญไม่มีชื่อ';
            const reward = camp.reward_details || '-';
            const limit = camp.total_limit || 10;
            const claimed = camp.claimed_count || 0;
            const points = camp.points_cost || 0;
            const mode = detectCampaignMode(camp);

            const modeBadge = mode === 'raid_boss'
                ? `<span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:700;">🐲 เรดบอส</span>`
                : mode === 'fortress'
                    ? `<span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:700;">🏰 ป้อมปราการ</span>`
                    : `<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:700;">🏷️ แคมเปญปกติ</span>`;

            const campString = encodeURIComponent(JSON.stringify(camp));

            return `
                <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <div style="flex:1; overflow:hidden;">
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                            ${modeBadge}
                            <div style="font-size:14px; font-weight:700; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
                        </div>
                        <div style="font-size:11px; color:#4b5563; margin-top:2px;">🎁 สิทธิ์: ${reward}</div>
                        <div style="font-size:11px; color:#6b7280; margin-top:2px;">🪙 ใช้ ${points} Points | 📊 ใช้ไป ${claimed}/${limit} สิทธิ์</div>
                    </div>
                    <div style="display:flex; gap:6px; flex-shrink:0;">
                        <button type="button" onclick='openEditCampaignForm("${campString}")' style="background:#3b82f6; color:white; border:none; padding:6px 10px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer;">✏️ แก้ไข</button>
                        <button type="button" onclick='confirmDeleteCampaign("${camp.id}")' style="background:#ef4444; color:white; border:none; padding:6px 10px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer;">🗑️ ลบ</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading merchant campaigns:', err);
        container.innerHTML = `<div style="text-align:center; color:red; padding:20px;">ไม่สามารถโหลดรายการแคมเปญได้</div>`;
    }
}

// ==========================================
// 🛠️ อัปโหลดแบนเนอร์และจัดการฟอร์มสร้าง/แก้ไขแคมเปญ
// ==========================================

async function uploadStoreBanner(storeId, fileInput) {
    const userId = await resolveMerchantUserId();
    if (!userId) {
        notifyMerchant('⚠️ กรุณาล็อกอินก่อนอัปโหลดแบนเนอร์');
        return;
    }

    const file = fileInput?.files?.[0];
    if (!file) {
        alert('กรุณาเลือกไฟล์รูปภาพแบนเนอร์ก่อนครับ');
        return;
    }

    try {
        notifyMerchant('⏳ กำลังอัปโหลดแบนเนอร์...');
        const fileExt = file.name.split('.').pop();
        const filePath = `${userId}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabaseClient.storage
            .from('store-banners')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabaseClient.storage
            .from('store-banners')
            .getPublicUrl(filePath);

        const bannerUrl = publicUrlData.publicUrl;
        const storeNameVal = document.getElementById('sponsor-merchant-name')?.value.trim() || '';

        const upsertData = {
            id: storeId || userId,
            merchant_id: userId,
            banner_url: bannerUrl
        };
        if (storeNameVal) upsertData.store_name = storeNameVal;

        const { error: updateError } = await supabaseClient
            .from('store_profiles')
            .upsert(upsertData);

        if (updateError) throw updateError;

        cachedMerchantStoreInfo = {
            ...(cachedMerchantStoreInfo || {}),
            bannerUrl,
            storeName: storeNameVal || cachedMerchantStoreInfo?.storeName || ''
        };

        const previewImg = document.getElementById('current-banner-img');
        if (previewImg) previewImg.src = bannerUrl;

        notifyMerchant('✅ อัปโหลดแบนเนอร์สำเร็จ!');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการอัปโหลดแบนเนอร์:', error.message);
        alert('อัปโหลดไม่สำเร็จ: ' + error.message);
    }
}

function syncStoreInfoToForm(storeInfo, fallbackMerchantName = '') {
    if (storeInfo?.bannerUrl) {
        const previewImg = document.getElementById('current-banner-img');
        if (previewImg) previewImg.src = storeInfo.bannerUrl;
    }
    const storeNameInput = document.getElementById('sponsor-merchant-name');
    if (storeNameInput && !storeNameInput.value) {
        storeNameInput.value = fallbackMerchantName || storeInfo?.storeName || '';
    }
}

async function openCreateCampaignForm(mode = 'normal') {
    const selectedMode = ['normal', 'fortress', 'raid_boss'].includes(mode) ? mode : 'normal';

    document.getElementById('campaign-list-view').style.display = 'none';
    document.getElementById('campaign-form-view').style.display = 'block';

    const form = document.getElementById('add-sponsor-form');
    if (form) form.reset();

    document.getElementById('editing-campaign-id').value = '';
    if (document.getElementById('sponsor-radius')) document.getElementById('sponsor-radius').value = 50;
    if (document.getElementById('sponsor-is-secret')) document.getElementById('sponsor-is-secret').checked = (selectedMode === 'fortress');
    if (document.getElementById('sponsor-boss-name')) document.getElementById('sponsor-boss-name').value = '';
    if (document.getElementById('sponsor-target-dist')) document.getElementById('sponsor-target-dist').value = 10;
    if (document.getElementById('sponsor-min-dist')) document.getElementById('sponsor-min-dist').value = 1;
    if (document.getElementById('sponsor-claim-hours')) document.getElementById('sponsor-claim-hours').value = 2;

    selectCampaignModeInForm(selectedMode);

    const storeInfo = await loadMerchantStoreProfile();
    syncStoreInfoToForm(storeInfo);
    setMerchantCoordsAndMap(storeInfo.lat, storeInfo.lng);
}

async function openEditCampaignForm(campEncodedStr) {
    const camp = JSON.parse(decodeURIComponent(campEncodedStr));
    const detectedMode = detectCampaignMode(camp);

    document.getElementById('campaign-list-view').style.display = 'none';
    document.getElementById('campaign-form-view').style.display = 'block';
    document.getElementById('form-mode-title').innerText = '✏️ แก้ไขแคมเปญ';

    document.getElementById('editing-campaign-id').value = camp.id;
    document.getElementById('sponsor-merchant-name').value = camp.merchant_name || '';
    document.getElementById('sponsor-title').value = camp.title || '';
    document.getElementById('sponsor-category').value = camp.category || 'drink';
    document.getElementById('sponsor-reward').value = camp.reward_details || '';
    document.getElementById('sponsor-points-cost').value = camp.points_cost || 50;
    document.getElementById('sponsor-total-limit').value = camp.total_limit || 10;
    document.getElementById('sponsor-start-date').value = camp.start_date ? camp.start_date.split('T')[0] : '';
    document.getElementById('sponsor-end-date').value = camp.end_date ? camp.end_date.split('T')[0] : '';
    document.getElementById('sponsor-desc').value = camp.description || '';
    document.getElementById('sponsor-radius').value = camp.node_radius || 50;

    if (document.getElementById('sponsor-is-secret')) {
        document.getElementById('sponsor-is-secret').checked = Boolean(camp.is_secret_node);
    }
    if (document.getElementById('sponsor-is-raid')) {
        document.getElementById('sponsor-is-raid').checked = Boolean(camp.is_raid_boss);
    }
    if (document.getElementById('sponsor-boss-name')) {
        document.getElementById('sponsor-boss-name').value = camp.boss_name || '';
    }
    if (document.getElementById('sponsor-target-dist')) {
        document.getElementById('sponsor-target-dist').value = camp.target_distance_km ?? 10;
    }
    if (document.getElementById('sponsor-min-dist')) {
        document.getElementById('sponsor-min-dist').value = camp.min_distance_km ?? 1;
    }
    if (document.getElementById('sponsor-claim-hours')) {
        document.getElementById('sponsor-claim-hours').value = camp.claim_window_hours ?? 2;
    }

    selectCampaignModeInForm(detectedMode);

    const storeInfo = await loadMerchantStoreProfile();
    syncStoreInfoToForm(storeInfo, camp.merchant_name || '');

    const lat = Number.isFinite(Number(camp.lat)) ? Number(camp.lat) : storeInfo.lat;
    const lng = Number.isFinite(Number(camp.lng)) ? Number(camp.lng) : storeInfo.lng;
    setMerchantCoordsAndMap(lat, lng);
}

async function handleSaveCampaign(event) {
    event.preventDefault();
    const sponsorId = await resolveMerchantUserId();
    if (!sponsorId) {
        notifyMerchant('⚠️ กรุณาล็อกอินก่อนบันทึกข้อมูล');
        return;
    }

    try {
        const campaignId = document.getElementById('editing-campaign-id').value;
        const isEditing = campaignId !== '';
        const selectedMode = document.getElementById('sponsor-campaign-type')?.value || 'normal';

        const title = document.getElementById('sponsor-title').value.trim();
        const category = document.getElementById('sponsor-category').value;
        const reward = document.getElementById('sponsor-reward').value.trim();
        const pointsCost = parseInt(document.getElementById('sponsor-points-cost')?.value, 10) || 0;
        const totalLimit = parseInt(document.getElementById('sponsor-total-limit').value, 10) || 10;
        const startDate = document.getElementById('sponsor-start-date').value;
        const endDate = document.getElementById('sponsor-end-date').value;
        const description = document.getElementById('sponsor-desc').value.trim();
        const merchantName = document.getElementById('sponsor-merchant-name')?.value.trim() || '';

        const storeInfo = await loadMerchantStoreProfile();
        let lat = parseFloat(document.getElementById('sponsor-lat').value);
        let lng = parseFloat(document.getElementById('sponsor-lng').value);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            lat = storeInfo.lat;
            lng = storeInfo.lng;
        }

        const nodeRadius = parseInt(document.getElementById('sponsor-radius').value, 10) || 50;
        const isSecretNode = Boolean(document.getElementById('sponsor-is-secret')?.checked);
        const bossName = document.getElementById('sponsor-boss-name')?.value.trim() || '';
        const targetDistKm = parseFloat(document.getElementById('sponsor-target-dist')?.value);
        const minDistKm = parseFloat(document.getElementById('sponsor-min-dist')?.value);
        const claimWindowHours = parseInt(document.getElementById('sponsor-claim-hours')?.value, 10);

        if (selectedMode === 'raid_boss') {
            if (!bossName) {
                notifyMerchant('⚠️ กรุณากรอกชื่อตัวบอส / กิจกรรม');
                return;
            }
            if (!Number.isFinite(targetDistKm) || targetDistKm <= 0) {
                notifyMerchant('⚠️ กรุณาระบุระยะทางเป้าหมายรวม (กม.) ให้มากกว่า 0');
                return;
            }
            if (!Number.isFinite(minDistKm) || minDistKm < 0) {
                notifyMerchant('⚠️ กรุณาระบุระยะทางขั้นต่ำของผู้เล่น (กม.) ให้ถูกต้อง');
                return;
            }
        }

        notifyMerchant(isEditing ? '⏳ กำลังอัปเดตแคมเปญ...' : '⏳ กำลังสร้างแคมเปญ...');

        const imageFile = document.getElementById('sponsor-image-file')?.files?.[0];
        const imageUrl = imageFile ? await compressImageFile(imageFile) : '';

        const userEmail = (typeof currentUser !== 'undefined' && currentUser?.email) ? currentUser.email : 'ร้านค้าสปอนเซอร์';
        const { error: sponsorUpsertError } = await supabaseClient
            .from('sponsors')
            .upsert([{
                id: sponsorId,
                name: merchantName || userEmail,
                description: description || 'รายละเอียดร้านค้า',
                banner_url: imageUrl || null,
                status: 'active'
            }], { onConflict: 'id' });

        if (sponsorUpsertError) {
            throw new Error(sponsorUpsertError.message || 'ไม่สามารถอัปเดตข้อมูลสปอนเซอร์ได้');
        }

        cachedMerchantStoreInfo = {
            ...(cachedMerchantStoreInfo || {}),
            storeName: merchantName || cachedMerchantStoreInfo?.storeName || '',
            lat,
            lng
        };

        const campaignData = buildCampaignPayload(selectedMode, {
            sponsorId,
            title,
            category,
            reward,
            pointsCost,
            totalLimit,
            startDate,
            endDate,
            description,
            merchantName,
            lat,
            lng,
            nodeRadius,
            isSecretNode,
            bossName,
            targetDistKm,
            minDistKm,
            claimWindowHours
        });

        if (imageUrl) {
            campaignData.image_url = imageUrl;
        }

        if (isEditing) {
            const { error } = await supabaseClient
                .from('campaigns')
                .update(campaignData)
                .eq('id', campaignId);
            if (error) throw error;
            notifyMerchant('🎉 อัปเดตแคมเปญสำเร็จ!');
        } else {
            campaignData.created_by = sponsorId;
            campaignData.claimed_count = 0;
            campaignData.status = 'active';
            campaignData.is_active = true;

            const { error } = await supabaseClient
                .from('campaigns')
                .insert([campaignData]);
            if (error) throw error;
            notifyMerchant('🎉 สร้างแคมเปญสปอนเซอร์สำเร็จ!');
        }

        backToCampaignList();
        if (typeof loadShopDataToUI === 'function') await loadShopDataToUI('all');
        if (typeof loadSponsorNodesOnMap === 'function') await loadSponsorNodesOnMap();
    } catch (err) {
        console.error('Error saving campaign:', err);
        notifyMerchant('❌ ไม่สามารถบันทึกข้อมูลได้: ' + (err.message || 'เกิดข้อผิดพลาด'));
    }
}

async function confirmDeleteCampaign(campaignId) {
    if (!confirm('🗑️ คุณแน่ใจหรือไม่ว่าต้องการลบแคมเปญนี้? ระบบจะคืนพอยต์และแจ้งเตือนผู้ใช้ที่รับสิทธิ์ไปแล้วโดยอัตโนมัติ การกระทำนี้ไม่สามารถย้อนกลับได้')) {
        return;
    }

    const userId = await resolveMerchantUserId();
    if (!userId) {
        notifyMerchant('⚠️ กรุณาล็อกอินก่อนลบแคมเปญ');
        return;
    }

    try {
        notifyMerchant('⏳ กำลังลบแคมเปญและดำเนินการคืนพอยต์...');

        const { error } = await supabaseClient
            .from('campaigns')
            .delete()
            .eq('id', campaignId)
            .eq('created_by', userId);

        if (error) throw error;

        notifyMerchant('🗑️ ลบแคมเปญและคืนพอยต์ให้ผู้ใช้งานเรียบร้อยแล้ว');

        await loadMerchantCampaigns();
        if (typeof loadShopDataToUI === 'function') await loadShopDataToUI('all');
        if (typeof loadSponsorNodesOnMap === 'function') await loadSponsorNodesOnMap();
    } catch (err) {
        console.error('Error deleting campaign:', err);
        notifyMerchant('❌ ไม่สามารถลบแคมเปญได้: ' + (err.message || 'เกิดข้อผิดพลาด'));
    }
}

function compressImageFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_WIDTH = 800;
                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
        };
    });
}

// ==========================================
// 📷 ตรวจสอบ/สแกน QR คูปอง และประวัติการใช้สิทธิ์
// ==========================================

async function merchantRedeemCoupon(couponCode) {
    const userId = await resolveMerchantUserId();
    if (!userId) {
        notifyMerchant('⚠️ กรุณาล็อกอินก่อนใช้งานระบบผู้ประกอบการ');
        return { success: false, message: 'กรุณาล็อกอินก่อนใช้งาน' };
    }

    try {
        notifyMerchant('⏳ กำลังตรวจสอบรหัสคูปอง...');
        const codeToSearch = couponCode.trim().toUpperCase();

        const { data: couponData, error: fetchError } = await supabaseClient
            .from('user_coupons')
            .select('id, coupon_code, is_redeemed, campaign_id')
            .eq('coupon_code', codeToSearch)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!couponData) {
            const msg = 'ไม่พบรหัสคูปองนี้ในระบบ';
            notifyMerchant('❌ ' + msg);
            return { success: false, message: msg };
        }
        if (couponData.is_redeemed === true) {
            const msg = 'รหัสคูปองนี้ถูกใช้งานไปแล้วเรียบร้อยครับ';
            notifyMerchant('⚠️ ' + msg);
            return { success: false, message: msg };
        }

        const { error: updateError } = await supabaseClient
            .from('user_coupons')
            .update({ is_redeemed: true, redeemed_at: new Date().toISOString() })
            .eq('id', couponData.id);

        if (updateError) throw updateError;

        const successMsg = `ใช้สิทธิ์สำเร็จ! รหัส ${codeToSearch} ถูกใช้งานเรียบร้อย`;
        notifyMerchant('✅ ' + successMsg);
        return { success: true, message: successMsg };
    } catch (err) {
        console.error('Error redeeming coupon:', err);
        const errorMsg = err.message || 'ไม่สามารถใช้งานได้ในขณะนี้';
        notifyMerchant('❌ เกิดข้อผิดพลาด: ' + errorMsg);
        return { success: false, message: errorMsg };
    }
}

async function handleMerchantRedeemClick() {
    const inputElement = document.getElementById('merchant-coupon-input');
    const couponCode = inputElement ? inputElement.value.trim() : '';

    if (!couponCode) {
        notifyMerchant('⚠️ กรุณากรอกหรือสแกนรหัสคูปองก่อนครับ');
        return;
    }

    const result = await merchantRedeemCoupon(couponCode);
    if (result && result.success) {
        if (inputElement) inputElement.value = '';
        stopQRScanner();
        const userId = await resolveMerchantUserId();
        if (userId && typeof loadMyCoupons === 'function') {
            loadMyCoupons(userId);
        }
    }
}

async function handleScanQRClick() {
    const qrContainer = document.getElementById('qr-reader-container');
    const readerDiv = document.getElementById('qr-reader');
    if (!qrContainer || !readerDiv) return;

    qrContainer.style.display = 'block';
    readerDiv.innerHTML = '<video id="qr-video" autoplay playsinline style="width: 100%; max-height: 250px; object-fit: cover; border-radius: 8px;"></video>';
    const videoElement = document.getElementById('qr-video');

    try {
        merchantVideoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        videoElement.srcObject = merchantVideoStream;

        if (!('BarcodeDetector' in window)) {
            alert('เบราว์เซอร์นี้ไม่รองรับการสแกน QR อัตโนมัติ กรุณาใช้การพิมพ์รหัสแทนครับ');
            stopQRScanner();
            return;
        }

        const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        merchantScanInterval = setInterval(async () => {
            if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
                try {
                    const barcodes = await barcodeDetector.detect(videoElement);
                    if (barcodes.length > 0) {
                        const couponInput = document.getElementById('merchant-coupon-input');
                        if (couponInput) couponInput.value = barcodes[0].rawValue;
                        stopQRScanner();
                        await handleMerchantRedeemClick();
                    }
                } catch (err) {
                    console.error(err);
                }
            }
        }, 300);
    } catch (err) {
        console.error(err);
        alert('ไม่สามารถเปิดกล้องได้');
        stopQRScanner();
    }
}

function stopQRScanner() {
    if (merchantScanInterval) {
        clearInterval(merchantScanInterval);
        merchantScanInterval = null;
    }
    if (merchantVideoStream) {
        merchantVideoStream.getTracks().forEach((track) => track.stop());
        merchantVideoStream = null;
    }
    const qrContainer = document.getElementById('qr-reader-container');
    if (qrContainer) qrContainer.style.display = 'none';
    const readerDiv = document.getElementById('qr-reader');
    if (readerDiv) readerDiv.innerHTML = '';
}

async function openMerchantHistoryModal() {
    const modal = document.getElementById('merchant-history-modal');
    if (modal) {
        modal.style.display = 'flex';
        await fetchMerchantCouponHistory();
    }
}

function closeMerchantHistoryModal() {
    const modal = document.getElementById('merchant-history-modal');
    if (modal) modal.style.display = 'none';
}

async function fetchMerchantCouponHistory() {
    const tbody = document.getElementById('merchant-history-tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#6b7280;">กำลังโหลดข้อมูล...</td></tr>`;

    try {
        const userId = await resolveMerchantUserId();
        if (!userId) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#ef4444;">กรุณาล็อกอินก่อนดูประวัติ</td></tr>`;
            return;
        }

        const { data: campaigns, error: campError } = await supabaseClient
            .from('campaigns')
            .select('id, title, created_by')
            .eq('created_by', userId);

        if (campError) throw campError;

        if (!campaigns || campaigns.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#6b7280;">ยังไม่มีประวัติการใช้สิทธิ์ในระบบ</td></tr>`;
            return;
        }

        const myCampaignIds = campaigns.map((c) => c.id);
        const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

        const { data: filteredCoupons, error: ucError } = await supabaseClient
            .from('user_coupons')
            .select('id, coupon_code, is_redeemed, created_at, redeemed_at, campaign_id')
            .in('campaign_id', myCampaignIds)
            .order('created_at', { ascending: false });

        if (ucError) throw ucError;

        if (!filteredCoupons || filteredCoupons.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#6b7280;">ยังไม่มีประวัติการใช้สิทธิ์ในระบบ</td></tr>`;
            return;
        }

        tbody.innerHTML = filteredCoupons.map((item) => {
            const isUsed = item.is_redeemed === true;
            const statusBadge = isUsed
                ? `<span style="padding:3px 8px; background:#dcfce7; color:#15803d; border-radius:12px; font-size:11px; font-weight:600;">ใช้งานแล้ว</span>`
                : `<span style="padding:3px 8px; background:#fef3c7; color:#b45309; border-radius:12px; font-size:11px; font-weight:600;">รอใช้งาน</span>`;

            const campaignTitle = campaignMap.get(item.campaign_id)?.title || 'แคมเปญของฉัน';
            const targetTime = isUsed && item.redeemed_at ? item.redeemed_at : item.created_at;
            const formatDate = targetTime
                ? new Date(targetTime).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
                : '-';

            return `
                <tr style="border-bottom:1px solid #f3f4f6;">
                    <td style="padding:10px 8px; font-family:monospace; font-weight:600;">${item.coupon_code || '-'}</td>
                    <td style="padding:10px 8px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${campaignTitle}">${campaignTitle}</td>
                    <td style="padding:10px 8px;">${statusBadge}</td>
                    <td style="padding:10px 8px; color:#9ca3af; font-size:11px;">${formatDate}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#ef4444;">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    bindMerchantAuthAutoCheck();
    await checkMerchantPermission();
});