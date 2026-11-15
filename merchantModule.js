// ==========================================
// 👑 merchantModule.js — ระบบผู้ประกอบการ จัดการแคมเปญ สแกน QR และประวัติ
// ==========================================

async function checkMerchantPermission(userId) {
    const merchantPanel = document.getElementById('merchant-control-panel');
    if (!merchantPanel) return;

    if (!userId) {
        merchantPanel.style.display = 'none';
        return;
    }

    try {
        const { data, error } = await supabaseClient.from('profiles').select('role').eq('id', userId).single();
        if (error) throw error;

        const userRole = data?.role ? data.role.trim().toLowerCase() : '';
        if (userRole === 'merchant') {
            merchantPanel.style.display = 'block';
        } else {
            merchantPanel.style.display = 'none';
        }
    } catch (err) {
        console.error('Error checking permission:', err);
        merchantPanel.style.display = 'none';
    }
}

// เปิด Modal จัดการแคมเปญ (แสดงรายการแคมเปญทั้งหมดของผู้ประกอบการก่อน)
async function openSponsorForm() {
    const modal = document.getElementById('sponsor-form-modal');
    if (modal) modal.style.display = 'flex';
    
    document.getElementById('campaign-list-view').style.display = 'block';
    document.getElementById('campaign-form-view').style.display = 'none';

    await loadMerchantCampaigns();
}

function closeSponsorForm() {
    const modal = document.getElementById('sponsor-form-modal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('add-sponsor-form');
    if (form) form.reset();
}

// ฟังก์ชันดึงแคมเปญที่ผู้ประกอบการ (created_by) สร้างขึ้นมาแสดงในรายการจัดการ
async function loadMerchantCampaigns() {
    const container = document.getElementById('merchant-campaigns-container');
    if (!container) return;

    if (!currentUser || !currentUser.id) {
        container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">กรุณาล็อกอินก่อนจัดการแคมเปญ</div>`;
        return;
    }

    container.innerHTML = `<div style="text-align:center; color:#9ca3af; padding:20px;">⏳ กำลังโหลดแคมเปญของคุณ...</div>`;

    try {
        const { data: campaigns, error } = await supabaseClient
            .from('campaigns')
            .select('*')
            .eq('created_by', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!campaigns || campaigns.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; color:#9ca3af; padding:30px 0;">
                    <div style="font-size:32px; margin-bottom:8px;">🏷️</div>
                    <div style="font-size:13px;">คุณยังไม่มีแคมเปญในระบบ</div>
                    <div style="font-size:11px; margin-top:4px;">กดปุ่ม "+ เพิ่มแคมเปญ" มุมขวาบนเพื่อสร้างได้เลย</div>
                </div>`;
            return;
        }

        let html = '';
        campaigns.forEach(camp => {
            const title = camp.title || 'แคมเปญไม่มีชื่อ';
            const reward = camp.reward_details || '-';
            const limit = camp.total_limit || 10;
            const claimed = camp.claimed_count || 0;
            const points = camp.points_cost || 0;
            
            const campString = encodeURIComponent(JSON.stringify(camp));

            html += `
                <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <div style="flex:1; overflow:hidden;">
                        <div style="font-size:14px; font-weight:700; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
                        <div style="font-size:11px; color:#4b5563; margin-top:2px;">🎁 สิทธิ์: ${reward}</div>
                        <div style="font-size:11px; color:#6b7280; margin-top:2px;">🪙 ใช้ ${points} Points | 📊 ใช้ไป ${claimed}/${limit} สิทธิ์</div>
                    </div>
                    <div style="display:flex; gap:6px; flex-shrink:0;">
                        <button onclick='openEditCampaignForm("${campString}")' style="background:#3b82f6; color:white; border:none; padding:6px 10px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer;">✏️ แก้ไข</button>
                        <button onclick='confirmDeleteCampaign("${camp.id}")' style="background:#ef4444; color:white; border:none; padding:6px 10px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer;">🗑️ ลบ</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (err) {
        console.error('Error loading merchant campaigns:', err);
        container.innerHTML = `<div style="text-align:center; color:red; padding:20px;">ไม่สามารถโหลดรายการแคมเปญได้</div>`;
    }
}

// ==========================================
// 🛠️ ส่วนฟังก์ชันอัปโหลดแบนเนอร์และจัดการฟอร์มแคมเปญ (ฉบับสมบูรณ์)
// ==========================================

// 1. ฟังก์ชันอัปโหลดแบนเนอร์ร้านค้าไปยัง Supabase Storage พร้อมบันทึกข้อมูลตาราง store_profiles ให้ครบถ้วน
async function uploadStoreBanner(storeId, fileInput) {
    if (!currentUser || !currentUser.id) {
        showToast('⚠️ กรุณาล็อกอินก่อนอัปโหลดแบนเนอร์');
        return;
    }

    const file = fileInput.files[0];
    if (!file) {
        alert('กรุณาเลือกไฟล์รูปภาพแบนเนอร์ก่อนครับ');
        return;
    }

    try {
        showToast('⏳ กำลังอัปโหลดแบนเนอร์...');
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        // 1. อัปโหลดรูปขึ้น Supabase Storage (bucket: store-banners)
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('store-banners')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabaseClient.storage
            .from('store-banners')
            .getPublicUrl(filePath);

        const bannerUrl = publicUrlData.publicUrl;

        // 2. ดึงค่าชื่อร้านจากฟอร์ม (ถ้ามี) เพื่อใช้บันทึกร่วมกัน
        const storeNameInput = document.getElementById('sponsor-merchant-name');
        let storeNameVal = storeNameInput ? storeNameInput.value.trim() : '';

        // 3. เตรียมข้อมูล Upsert ให้ครบถ้วนทุกคอลัมน์ที่จำเป็นป้องกันค่าว่าง (Null)
        const upsertData = { 
            id: storeId || currentUser.id, 
            merchant_id: currentUser.id,
            banner_url: bannerUrl 
        };
        
        if (storeNameVal) {
            upsertData.store_name = storeNameVal;
        }

        // 4. บันทึกลงตาราง store_profiles
        const { error: updateError } = await supabaseClient
            .from('store_profiles')
            .upsert(upsertData);

        if (updateError) throw updateError;

        showToast('✅ อัปโหลดแบนเนอร์สำเร็จ!');
        
        // 5. อัปเดตพรีวิวรูปบนหน้าจอทันที
        const previewImg = document.getElementById('current-banner-img');
        if (previewImg) {
            previewImg.src = bannerUrl;
        }

    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการอัปโหลดแบนเนอร์:', error.message);
        alert('อัปโหลดไม่สำเร็จ: ' + error.message);
    }
}

// 2. เปิดฟอร์มสำหรับ "เพิ่มแคมเปญใหม่" (พร้อมดึงแบนเนอร์ล่าสุดจาก store_profiles มาแสดง)
async function openCreateCampaignForm() {
    document.getElementById('campaign-list-view').style.display = 'none';
    document.getElementById('campaign-form-view').style.display = 'block';
    document.getElementById('form-mode-title').innerText = '✨ เพิ่มแคมเปญใหม่';
    
    const form = document.getElementById('add-sponsor-form');
    if (form) form.reset();
    document.getElementById('editing-campaign-id').value = '';

    // ดึงรูปแบนเนอร์ล่าสุดจากตาราง store_profiles มาแสดงที่พรีวิวเสมอ
    try {
        if (currentUser && currentUser.id) {
            const { data: storeData } = await supabaseClient
                .from('store_profiles')
                .select('banner_url, store_name')
                .eq('merchant_id', currentUser.id)
                .maybeSingle();

            if (storeData) {
                if (storeData.banner_url) {
                    const previewImg = document.getElementById('current-banner-img');
                    if (previewImg) previewImg.src = storeData.banner_url;
                }
                if (storeData.store_name) {
                    const storeNameInput = document.getElementById('sponsor-merchant-name');
                    if (storeNameInput && !storeNameInput.value) {
                        storeNameInput.value = storeData.store_name;
                    }
                }
            }
        }
    } catch (err) {
        console.error('ไม่สามารถโหลดข้อมูลแบนเนอร์ร้านค้าได้:', err);
    }

    setTimeout(() => {
      initMerchantMiniMap(13.7367, 100.5231);
    }, 100);
}

// 3. เปิดฟอร์มสำหรับ "แก้ไขแคมเปญเดิม" (พร้อมดึงแบนเนอร์ล่าสุดจาก store_profiles มาแสดงเช่นกัน)
async function openEditCampaignForm(campEncodedStr) {
    const camp = JSON.parse(decodeURIComponent(campEncodedStr));

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

    document.getElementById('sponsor-lat').value = camp.lat || '';
    document.getElementById('sponsor-lng').value = camp.lng || '';
    document.getElementById('sponsor-radius').value = camp.node_radius || 50;
    
    const secretCb = document.getElementById('sponsor-is-secret');
    if (secretCb) secretCb.checked = Boolean(camp.is_secret_node);
    
    const raidCb = document.getElementById('sponsor-is-raid');
    if (raidCb) raidCb.checked = Boolean(camp.is_raid_boss);
    
    const bossInput = document.getElementById('sponsor-boss-name');
    if (bossInput) bossInput.value = camp.boss_name || '';
    
    const targetDistInput = document.getElementById('sponsor-target-dist');
    if (targetDistInput) targetDistInput.value = camp.target_distance_km ?? 500;
    
    toggleRaidBossFields();

    // ดึงรูปแบนเนอร์ล่าสุดจากตาราง store_profiles มาแสดงที่พรีวิวเสมอ
    try {
        if (currentUser && currentUser.id) {
            const { data: storeData } = await supabaseClient
                .from('store_profiles')
                .select('banner_url')
                .eq('merchant_id', currentUser.id)
                .maybeSingle();

            if (storeData && storeData.banner_url) {
                const previewImg = document.getElementById('current-banner-img');
                if (previewImg) previewImg.src = storeData.banner_url;
            }
        }
    } catch (err) {
        console.error('ไม่สามารถโหลดข้อมูลแบนเนอร์ร้านค้าได้:', err);
    }

    const lat = camp.lat || 13.7367;
    const lng = camp.lng || 100.5231;
    setTimeout(() => {
        initMerchantMiniMap(lat, lng);
    }, 100);
}

// ปุ่มกดกลับไปหน้ารายการ
function backToCampaignList() {
    document.getElementById('campaign-form-view').style.display = 'none';
    document.getElementById('campaign-list-view').style.display = 'block';
    loadMerchantCampaigns();
}

// ==========================================
// 📝 ฟังก์ชันบันทึกแคมเปญ (พร้อมระบบ Upsert สปอนเซอร์อัตโนมัติ ป้องกัน Error Foreign Key)
// ==========================================
async function handleSaveCampaign(event) {
    event.preventDefault();
    if (!currentUser) {
        showToast('⚠️ กรุณาล็อกอินก่อนบันทึกข้อมูล');
        return;
    }

    try {
        const campaignId = document.getElementById('editing-campaign-id').value;
        const isEditing = campaignId !== '';

        showToast(isEditing ? '⏳ กำลังอัปเดตแคมเปญ...' : '⏳ กำลังสร้างแคมเปญ...');

        const sponsorId = currentUser.id;

        const title = document.getElementById('sponsor-title').value.trim();
        const category = document.getElementById('sponsor-category').value;
        const reward = document.getElementById('sponsor-reward').value.trim();
        const pointsCost = parseInt(document.getElementById('sponsor-points-cost')?.value, 10) || 0;
        const totalLimit = parseInt(document.getElementById('sponsor-total-limit').value, 10) || 10;
        const startDate = document.getElementById('sponsor-start-date').value;
        const endDate = document.getElementById('sponsor-end-date').value;
        const description = document.getElementById('sponsor-desc').value.trim();
        const merchantNameInput = document.getElementById('sponsor-merchant-name');
        const merchantName = merchantNameInput ? merchantNameInput.value.trim() : '';
        
        const imageFileInput = document.getElementById('sponsor-image-file');
        let imageUrl = '';
        if (imageFileInput && imageFileInput.files && imageFileInput.files[0]) {
            imageUrl = await compressImageFile(imageFileInput.files[0]);
        }

        const lat = parseFloat(document.getElementById('sponsor-lat').value) || null;
        const lng = parseFloat(document.getElementById('sponsor-lng').value) || null;
        const nodeRadius = parseInt(document.getElementById('sponsor-radius').value, 10) || 50;

        const bossNameInput = document.getElementById('sponsor-boss-name');
        const bossName = bossNameInput ? bossNameInput.value.trim() : '';

        const secretNodeCb = document.getElementById('sponsor-is-secret');
        const isSecretNode = secretNodeCb ? secretNodeCb.checked : false;

        const raidBossCb = document.getElementById('sponsor-is-raid');
        const isRaidBoss = raidBossCb ? raidBossCb.checked : false;

        const targetDistInput = document.getElementById('sponsor-target-dist');
        const targetDistKm = targetDistInput ? parseFloat(targetDistInput.value) || 500 : 500;

        // 💡 1. ระบบอัตโนมัติ: บันทึกหรืออัปเดตข้อมูลโปรไฟล์สปอนเซอร์ลงในตาราง sponsors ก่อน
        // เพื่อให้มี ID รองรับ Foreign Key ของตาราง campaigns เสมอโดยไม่ต้องเพิ่มข้อมูลเอง
        const { error: sponsorUpsertError } = await supabaseClient
            .from('sponsors')
            .upsert([{
                id: sponsorId,
                name: merchantName || currentUser.email || 'ร้านค้าสปอนเซอร์',
                description: description || 'รายละเอียดร้านค้า',
                banner_url: imageUrl || null,
                status: 'active'
            }], { onConflict: 'id' });

        if (sponsorUpsertError) {
            console.error('Error auto-upserting sponsor:', sponsorUpsertError);
            throw new Error(sponsorUpsertError.message || 'ไม่สามารถอัปเดตข้อมูลสปอนเซอร์ได้');
        }

        // 2. จัดเตรียมข้อมูลสำหรับบันทึกแคมเปญ
        const campaignData = {
            title,
            category,
            reward_details: reward,
            points_cost: pointsCost, 
            total_limit: totalLimit,
            start_date: startDate,
            end_date: endDate,
            description,
            merchant_name: merchantName !== '' ? merchantName : null,
            lat,
            lng,
            node_radius: nodeRadius,
            is_secret_node: isSecretNode,
            is_raid_boss: isRaidBoss,
            boss_name: isRaidBoss ? bossName : null,
            target_distance_km: isRaidBoss ? targetDistKm : null,
            sponsor_id: sponsorId // ผูก sponsor_id ตรงกับ ID ผู้ใช้ปัจจุบัน
        };

        if (imageUrl) {
            campaignData.image_url = imageUrl;
        }

        if (isEditing) {
            const { error } = await supabaseClient
                .from('campaigns')
                .update(campaignData)
                .eq('id', campaignId);

            if (error) throw error;
            showToast('🎉 อัปเดตแคมเปญสำเร็จ!');
        } else {
            campaignData.created_by = currentUser.id;
            campaignData.claimed_count = 0;
            campaignData.status = 'active';
            campaignData.is_active = true;

            const { error } = await supabaseClient
                .from('campaigns')
                .insert([campaignData]);

            if (error) throw error;
            showToast('🎉 สร้างแคมเปญสปอนเซอร์สำเร็จ!');
        }

        backToCampaignList();
        await loadShopDataToUI('all');

    } catch (err) {
        console.error('Error saving campaign:', err);
        showToast('❌ ไม่สามารถบันทึกข้อมูลได้: ' + (err.message || 'เกิดข้อผิดพลาด'));
    }
}

// ฟังก์ชันลบแคมเปญ (DELETE)
async function confirmDeleteCampaign(campaignId) {
    if (!confirm('🗑️ คุณแน่ใจหรือไม่ว่าต้องการลบแคมเปญนี้? ระบบจะคืนพอยต์และแจ้งเตือนผู้ใช้ที่รับสิทธิ์ไปแล้วโดยอัตโนมัติ การกระทำนี้ไม่สามารถย้อนกลับได้')) {
        return;
    }

    try {
        showToast('⏳ กำลังลบแคมเปญและดำเนินการคืนพอยต์...');

        const { error } = await supabaseClient
            .from('campaigns')
            .delete()
            .eq('id', campaignId)
            .eq('created_by', currentUser.id);

        if (error) throw error;

        showToast('🗑️ ลบแคมเปญและคืนพอยต์ให้ผู้ใช้งานเรียบร้อยแล้ว');
        
        await loadMerchantCampaigns();
        await loadShopDataToUI('all');

    } catch (err) {
        console.error('Error deleting campaign:', err);
        showToast('❌ ไม่สามารถลบแคมเปญได้: ' + (err.message || 'เกิดข้อผิดพลาด'));
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
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
        };
    });
}

async function merchantRedeemCoupon(couponCode) {
    if (!currentUser) {
        showToast('⚠️ กรุณาล็อกอินก่อนใช้งานระบบผู้ประกอบการ');
        return { success: false, message: 'กรุณาล็อกอินก่อนใช้งาน' };
    }

    try {
        showToast('⏳ กำลังตรวจสอบรหัสคูปอง...');
        const codeToSearch = couponCode.trim().toUpperCase();

        const { data: couponData, error: fetchError } = await supabaseClient
            .from('user_coupons')
            .select('id, coupon_code, is_redeemed, campaign_id')
            .eq('coupon_code', codeToSearch)
            .maybeSingle();

        if (fetchError) throw fetchError;

        if (!couponData) {
            showToast('❌ ไม่พบรหัสคูปองนี้ในระบบ');
            return { success: false, message: 'ไม่พบรหัสคูปองนี้ในระบบ' };
        }

        if (couponData.is_redeemed === true) {
            showToast('⚠️ รหัสคูปองนี้ถูกใช้งานไปแล้วเรียบร้อยครับ');
            return { success: false, message: 'รหัสคูปองนี้ถูกใช้งานไปแล้วเรียบร้อยครับ' };
        }

        const { error: updateError } = await supabaseClient
            .from('user_coupons')
            .update({ is_redeemed: true, redeemed_at: new Date().toISOString() })
            .eq('id', couponData.id);

        if (updateError) throw updateError;

        const successMsg = `ใช้สิทธิ์สำเร็จ! รหัส ${codeToSearch} ถูกใช้งานเรียบร้อย`;
        showToast(`✅ ${successMsg}`);
        return { success: true, message: successMsg };

    } catch (err) {
        console.error('Error redeeming coupon:', err);
        const errorMsg = err.message || 'ไม่สามารถใช้งานได้ในขณะนี้';
        showToast('❌ เกิดข้อผิดพลาด: ' + errorMsg);
        return { success: false, message: errorMsg };
    }
}

async function handleMerchantRedeemClick() {
    const inputElement = document.getElementById('merchant-coupon-input'); 
    const couponCode = inputElement ? inputElement.value.trim() : '';

    if (!couponCode) {
        showToast('⚠️ กรุณากรอกหรือสแกนรหัสคูปองก่อนครับ');
        return;
    }

    try {
        const result = await merchantRedeemCoupon(couponCode);
        if (result && result.success) {
            showToast(`✅ ${result.message}`);
            if (inputElement) inputElement.value = '';
            if (typeof stopQRScanner === 'function') stopQRScanner();
            if (currentUser && typeof loadMyCoupons === 'function') {
                loadMyCoupons(currentUser.id);
            }
        } else {
            showToast(`❌ ${result?.message || 'ไม่สามารถใช้สิทธิ์ได้'}`);
        }
    } catch (err) {
        console.error('Error in merchant redeem click:', err);
        showToast('❌ เกิดข้อผิดพลาด');
    }
}

let videoStream = null;
let scanInterval = null;

async function handleScanQRClick() {
    const qrContainer = document.getElementById('qr-reader-container');
    if (qrContainer) qrContainer.style.display = 'block';

    let readerDiv = document.getElementById('qr-reader');
    readerDiv.innerHTML = '<video id="qr-video" autoplay playsinline style="width: 100%; max-height: 250px; object-fit: cover; border-radius: 8px;"></video>';
    const videoElement = document.getElementById('qr-video');

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        videoElement.srcObject = videoStream;

        if (!('BarcodeDetector' in window)) {
            alert('เบราว์เซอร์นี้ไม่รองรับการสแกน QR อัตโนมัติ กรุณาใช้การพิมพ์รหัสแทนครับ');
            stopQRScanner();
            return;
        }

        const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        scanInterval = setInterval(async () => {
            if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
                try {
                    const barcodes = await barcodeDetector.detect(videoElement);
                    if (barcodes.length > 0) {
                        const scannedText = barcodes[0].rawValue;
                        const couponInput = document.getElementById('merchant-coupon-input');
                        if (couponInput) couponInput.value = scannedText;
                        stopQRScanner();
                        handleMerchantRedeemClick();
                    }
                } catch (err) { console.error(err); }
            }
        }, 300);
    } catch (err) {
        console.error(err);
        alert('ไม่สามารถเปิดกล้องได้');
        stopQRScanner();
    }
}

function stopQRScanner() {
    if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
    if (videoStream) { videoStream.getTracks().forEach(track => track.stop()); videoStream = null; }
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
        if (!currentUser || !currentUser.id) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#ef4444;">กรุณาล็อกอินก่อนดูประวัติ</td></tr>`;
            return;
        }

        const { data: campaigns, error: campError } = await supabaseClient
            .from('campaigns')
            .select('id, title, created_by')
            .eq('created_by', currentUser.id);

        if (campError) throw campError;

        if (!campaigns || campaigns.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#6b7280;">ยังไม่มีประวัติการใช้สิทธิ์ในระบบ</td></tr>`;
            return;
        }

        const myCampaignIds = campaigns.map(c => c.id);
        const campaignMap = new Map();
        campaigns.forEach(c => campaignMap.set(c.id, c));

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

        let htmlRows = '';
        filteredCoupons.forEach(item => {
            const isUsed = item.is_redeemed === true;
            const statusBadge = isUsed 
                ? `<span style="padding:3px 8px; background:#dcfce7; color:#15803d; border-radius:12px; font-size:11px; font-weight:600;">ใช้งานแล้ว</span>` 
                : `<span style="padding:3px 8px; background:#fef3c7; color:#b45309; border-radius:12px; font-size:11px; font-weight:600;">รอใช้งาน</span>`;

            const camp = campaignMap.get(item.campaign_id) || {};
            const campaignTitle = camp.title || 'แคมเปญของฉัน';
            const targetTime = isUsed && item.redeemed_at ? item.redeemed_at : item.created_at;
            const formatDate = targetTime ? new Date(targetTime).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';

            htmlRows += `
                <tr style="border-bottom:1px solid #f3f4f6;">
                    <td style="padding:10px 8px; font-family:monospace; font-weight:600;">${item.coupon_code || '-'}</td>
                    <td style="padding:10px 8px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${campaignTitle}">${campaignTitle}</td>
                    <td style="padding:10px 8px;">${statusBadge}</td>
                    <td style="padding:10px 8px; color:#9ca3af; font-size:11px;">${formatDate}</td>
                </tr>
            `;
        });
        tbody.innerHTML = htmlRows;
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#ef4444;">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
    }
}