// ==========================================
// 🎯 campaignModule.js — โมดูลแคมเปญ สิทธิประโยชน์ และระบบแท็บ
// ==========================================

let activeSponsorsList = [];
let userCouponsList = [];
let selectedCouponIdForUse = null;
let couponIdToDelete = null;

async function initShopModule() {
    console.log("Initializing Shop & Sponsor Module...");
    console.log('Current User ID:', currentUser?.id);
    await loadShopDataToUI('all');
    await loadMyCoupons(currentUser?.id);
    await checkMerchantPermission(currentUser?.id);
    await updateNotificationBadge();
}

async function ensureCurrentUser() {
  if (currentUser && currentUser.id) {
    return currentUser;
  }

  try {
    if (typeof supabaseClient === 'undefined' || !supabaseClient || !supabaseClient.auth) {
      return null;
    }

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      console.error('Error restoring session:', error);
      return null;
    }

    if (data && data.session && data.session.user) {
      currentUser = data.session.user;
      return currentUser;
    }

    return null;
  } catch (err) {
    console.error('Unexpected error restoring session:', err);
    return null;
  }
}

// 1. แทนที่ฟังก์ชัน loadShopDataToUI เดิม (ปรับเป็น Grid 2 คอลัมน์พอดีหน้าจอมือถือ)
async function loadShopDataToUI(category = 'all') {
  const container = document.getElementById('content-view-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:30px 0;">⏳ กำลังโหลดสิทธิประโยชน์...</div>';

  try {
    let campaigns = await fetchActiveCampaigns();

    if (category && category !== 'all') {
      campaigns = campaigns.filter(camp => camp.category === category);
    }

    if (!campaigns || campaigns.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:30px 0;">ยังไม่มีแคมเปญสปอนเซอร์ในหมวดหมู่นี้</div>';
      return;
    }

    // ปรับเป็น 2 คอลัมน์ (repeat(2, 1fr)) และจัดช่องไฟให้เหมาะกับหน้าจอมือถือ
    let html = '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; padding: 0 16px 16px 16px;">';
    campaigns.forEach(camp => {
      const sponsorName = (camp.merchant_name && camp.merchant_name.trim() !== '') 
        ? camp.merchant_name 
        : (camp.sponsors && camp.sponsors.name ? camp.sponsors.name : 'Stride Partner');

      const imageUrl = camp.image_url ? camp.image_url : 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=500&q=80';
      const endDateStr = camp.end_date ? new Date(camp.end_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : 'ไม่จำกัดเวลา';

      const totalLimit = camp.total_limit || 10;
      const claimedCount = camp.claimed_count || 0;
      const remaining = totalLimit - claimedCount;
      const isSoldOut = remaining <= 0;
      const pointsCost = camp.points_cost || 0;

      const stockBadge = isSoldOut 
        ? `<span style="position:absolute; top:6px; left:6px; background:rgba(239,68,68,0.9); color:#fff; font-size:8px; font-weight:700; padding:2px 5px; border-radius:6px;">❌ หมดแล้ว</span>`
        : `<span style="position:absolute; top:6px; left:6px; background:rgba(34,197,94,0.9); color:#fff; font-size:8px; font-weight:700; padding:2px 5px; border-radius:6px;">🔥 เหลือ ${remaining}/${totalLimit}</span>`;

      const cardOpacity = isSoldOut ? 'opacity: 0.65; background:#f9fafb;' : 'background:#fff;';
      const btnStyle = isSoldOut 
        ? `width:100%; border:none; padding:7px; border-radius:10px; font-size:11px; font-weight:700; background:#9ca3af; color:#fff; cursor:not-allowed;`
        : `width:100%; border:none; padding:7px; border-radius:10px; font-size:11px; font-weight:700; background:#22c55e; color:#fff; cursor:pointer;`;
      
      const btnAction = isSoldOut ? '' : `onclick="handleClaimCampaign('${camp.id}', '${camp.reward_details ? camp.reward_details.replace(/'/g, "\\'") : 'สิทธิ์พิเศษ'}') "`;
      const btnText = isSoldOut ? 'สิทธิ์เต็มแล้ว' : `🪙 ${pointsCost} Points`;

      html += `
        <div style="${cardOpacity} border-radius:16px; overflow:hidden; border:1px solid #e5e7eb; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; flex-direction:column; justify-content:space-between; min-width:0;">
          <div style="position:relative; width:100%; height:105px; background:#e5e7eb;">
            <img src="${imageUrl}" style="width:100%; height:100%; object-fit:cover;" alt="Campaign Banner" />
            ${stockBadge}
            <span style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.65); color:#fff; font-size:8px; font-weight:600; padding:2px 5px; border-radius:6px; backdrop-filter:blur(4px);">⏳ ${endDateStr}</span>
          </div>
          <div style="padding:10px; display:flex; flex-direction:column; flex:1; justify-content:space-between;">
            <div>
              <div style="font-size:9px; color:#3b82f6; font-weight:700; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sponsorName}</div>
              <div style="font-size:12px; font-weight:700; color:#1f2937; margin:3px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${camp.title}">${camp.title}</div>
              <div style="font-size:10px; color:#6b7280; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${camp.description || 'สิทธิ์พิเศษสำหรับชาว Stride'}</div>
            </div>
            <div>
              <div style="font-size:10px; font-weight:800; color:#16a34a; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🎁 ${camp.reward_details || 'สิทธิ์พิเศษ'}</div>
              <button ${btnAction} style="${btnStyle}">${btnText}</button>
            </div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;

  } catch (err) {
    console.error('Error loading shop data:', err);
    container.innerHTML = '<div style="text-align:center; color:red; padding:30px 0;">ไม่สามารถโหลดข้อมูลได้</div>';
  }
}

// 2. ฟังก์ชันกรองหมวดหมู่
function filterRewards(category, btnElement) {
    const tabs = document.querySelectorAll('.reward-tab');
    tabs.forEach(tab => {
        tab.style.background = '#fff';
        tab.style.color = '#4b5563';
        tab.style.border = '1px solid #e5e7eb';
        tab.classList.remove('active');
    });
    
    if (btnElement) {
        btnElement.style.background = '#1f2937';
        btnElement.style.color = '#fff';
        btnElement.style.border = 'none';
        btnElement.classList.add('active');
    }

    loadShopDataToUI(category);
}

// 3. ฟังก์ชันกดรับสิทธิ์แคมเปญ (เช็กสิทธิ์แบบรีเซ็ตทุกเที่ยงคืน 00:00 น.)
async function handleClaimCampaign(campaignId, rewardTitle) {
  console.log('[handleClaimCampaign] before ensureCurrentUser:', currentUser);
  await ensureCurrentUser();
  console.log('[handleClaimCampaign] after ensureCurrentUser:', currentUser);

  if (!currentUser || !currentUser.id) {
    showToast('⚠️ กรุณาล็อกอินก่อนกดรับสิทธิ์');
    return;
  }

  let pointsDeducted = false;
  let previousPoints = 0;
  let claimInserted = false;

  try {
    showToast('⏳ กำลังตรวจสอบสิทธิ์และแต้ม...');

    const { data: campaignData, error: fetchError } = await supabaseClient
      .from('campaigns')
      .select('total_limit, claimed_count, points_cost, title')
      .eq('id', campaignId)
      .single();

    if (fetchError) throw fetchError;

    const totalLimit = campaignData.total_limit || 10;
    const claimedCount = campaignData.claimed_count || 0;
    const pointsCost = campaignData.points_cost || 0;
    const resolvedRewardLabel = rewardTitle || campaignData.title || 'สิทธิ์พิเศษ';

    if (claimedCount >= totalLimit) {
      showToast('❌ เสียใจด้วยครับ สิทธิ์แคมเปญนี้เต็มแล้ว');
      await loadShopDataToUI('all');
      return;
    }

    const { data: profileData, error: profileError } = await supabaseClient
      .from('profiles')
      .select('points')
      .eq('id', currentUser.id)
      .single();

    if (profileError) throw profileError;

    const userPoints = profileData?.points || 0;
    previousPoints = userPoints;

    if (userPoints < pointsCost) {
      showToast(`❌ แต้มของคุณไม่พอ (ต้องการ ${pointsCost} Points / คุณมี ${userPoints} Points)`);
      return;
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data: todayClaim, error: claimCheckError } = await supabaseClient
      .from('campaign_claims')
      .select('id, created_at')
      .eq('user_id', currentUser.id)
      .eq('campaign_id', campaignId)
      .gte('created_at', startOfToday.toISOString())
      .maybeSingle();

    if (claimCheckError) throw claimCheckError;

    if (todayClaim) {
      showToast('⚠️ คุณรับสิทธิ์วันนี้ไปแล้ว สามารถกดรับซ้ำได้ใหม่หลังเที่ยงคืน (00:00 น.) ครับ');
      return;
    }

    const newPoints = userPoints - pointsCost;
    const { error: updatePointsError } = await supabaseClient
      .from('profiles')
      .update({ points: newPoints })
      .eq('id', currentUser.id);

    if (updatePointsError) throw updatePointsError;
    pointsDeducted = true;

    const { error: insertClaimError } = await supabaseClient
      .from('campaign_claims')
      .insert([{ user_id: currentUser.id, campaign_id: campaignId }]);

    if (insertClaimError) {
      throw insertClaimError;
    }
    claimInserted = true;

    const dummyCode = 'STRIDE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const result = await claimUserCoupon(currentUser.id, campaignId, dummyCode);

    if (!result || !result.success) {
      throw new Error((result && result.message) || 'ไม่สามารถบันทึกคูปองลงกระเป๋าได้');
    }

    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update({ claimed_count: claimedCount + 1 })
      .eq('id', campaignId);

    if (updateError) throw updateError;

    showToast(`🎉 แลกรับ "${resolvedRewardLabel}" สำเร็จ! หัก ${pointsCost} Points (เหลือ ${newPoints} Points)`);
    
    const pointsDisplay = document.getElementById('user-points-val');
    if (pointsDisplay) pointsDisplay.innerText = `${newPoints} Points`;
    const sponsorPointsDisplay = document.getElementById('sponsor-user-points');
    if (sponsorPointsDisplay) sponsorPointsDisplay.innerText = `${newPoints} Points`;

    await Promise.all([
      loadMyCoupons(currentUser.id),
      loadShopDataToUI('all')
    ]);

  } catch (err) {
    if (claimInserted) {
      await supabaseClient
        .from('campaign_claims')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('campaign_id', campaignId);
    }
    if (pointsDeducted) {
      await supabaseClient
        .from('profiles')
        .update({ points: previousPoints })
        .eq('id', currentUser.id);
    }
    console.error('Error claiming campaign:', err);
    showToast('❌ ไม่สามารถรับสิทธิ์ได้: ' + (err.message || 'เกิดข้อผิดพลาด'));
  }
}

// ==========================================
// 🔀 ฟังก์ชันแท็บ, อัปโหลดแบนเนอร์ และกริดสปอนเซอร์ (ที่เพิ่มใหม่)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const mainTabBtns = document.querySelectorAll('.main-tab-btn');
    const subCategoriesWrapper = document.getElementById('sub-categories-wrapper');
    const subTabBtns = document.querySelectorAll('.sub-tab-btn');
    
    let currentMainTab = 'all';
    let currentSubCategory = 'all';

    function activateMainTab(tabName, shouldLoadContent = true) {
        currentMainTab = tabName || 'all';
        mainTabBtns.forEach(b => {
            const isMatch = b.getAttribute('data-tab') === currentMainTab;
            b.classList.toggle('active', isMatch);
        });

        if (currentMainTab === 'sponsor') {
            if (subCategoriesWrapper) subCategoriesWrapper.style.display = 'none';
            if (shouldLoadContent && typeof loadSponsorBanners === 'function') {
                loadSponsorBanners();
            }
        } else {
            if (subCategoriesWrapper) subCategoriesWrapper.style.display = 'flex';
            currentSubCategory = 'all';
            subTabBtns.forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-category') === currentSubCategory);
            });
            if (shouldLoadContent) {
                loadCampaigns('all');
            }
        }
    }

    mainTabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const clickedBtn = e.target.closest('.main-tab-btn') || btn;
            const tabName = clickedBtn.getAttribute('data-tab') || 'all';
            activateMainTab(tabName, true);
        });
    });

    subTabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const clickedBtn = e.target.closest('.sub-tab-btn') || btn;
            subTabBtns.forEach(b => b.classList.remove('active'));
            clickedBtn.classList.add('active');
            
            currentSubCategory = clickedBtn.getAttribute('data-category') || 'all';
            loadCampaigns(currentSubCategory);
        });
    });

    // เปิดแท็บ "ร้านค้า&สปอนเซอร์" อัตโนมัติเมื่อย้อนกลับมาพร้อมพารามิเตอร์ ?tab=sponsor
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'sponsor') {
        const sponsorTabBtn = document.querySelector('.main-tab-btn[data-tab="sponsor"]');
        if (sponsorTabBtn) {
            activateMainTab('all', true);
        } else if (typeof loadSponsorBanners === 'function') {
            if (subCategoriesWrapper) subCategoriesWrapper.style.display = 'none';
            loadSponsorBanners();
        }
    } else if (mainTabBtns.length > 0) {
        const defaultBtn = document.querySelector('.main-tab-btn[data-tab="all"]') || mainTabBtns[0];
        const defaultTab = defaultBtn.getAttribute('data-tab') || 'all';
        activateMainTab(defaultTab, true);
    }
});

// เชื่อมต่อฟังก์ชันโหลดแคมเปญเข้ากับระบบแท็บ
function loadCampaigns(category) {
    loadShopDataToUI(category);
}

// ฟังก์ชันดึงข้อมูลแบนเนอร์ร้านค้ามาแสดงผลแบบกริดแนวตั้ง (ใช้ supabaseClient)
async function loadSponsorBanners() {
    const container = document.getElementById('content-view-container');
    container.innerHTML = `<p style="text-align: center; color: #9ca3af; padding: 20px;">กำลังโหลดแบนเนอร์สปอนเซอร์...</p>`;

    try {
        const { data: stores, error } = await supabaseClient
            .from('store_profiles')
            .select('id, store_name, banner_url');

        if (error) {
            throw error;
        }

        if (!stores || stores.length === 0) {
            container.innerHTML = `<p style="text-align: center; color: #9ca3af; padding: 20px;">ยังไม่มีข้อมูลร้านค้าหรือสปอนเซอร์ในขณะนี้</p>`;
            return;
        }

        let gridHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 16px;">
        `;

        stores.forEach(store => {
            const bannerImage = store.banner_url || 'default-banner.png';
            const storeName = store.store_name || 'ร้านค้าไม่มีชื่อ';

            gridHtml += `
                <div onclick="goToStoreProfile('${store.id}')" style="background: #1f2937; border-radius: 12px; overflow: hidden; cursor: pointer; transition: transform 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" onmouseover="this.style.transform='translateY(-4px)';" onmouseout="this.style.transform='translateY(0)';">
                    <img src="${bannerImage}" alt="${storeName}" style="width: 100%; height: 160px; object-fit: cover;">
                    <div style="padding: 12px; text-align: center; color: #ffffff; font-weight: 600; font-size: 16px;">
                        ${storeName}
                    </div>
                </div>
            `;
        });

        gridHtml += `</div>`;
        container.innerHTML = gridHtml;

    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการโหลดแบนเนอร์สปอนเซอร์:', error.message);
        container.innerHTML = `<p style="text-align: center; color: #ef4444; padding: 20px;">ไม่สามารถโหลดข้อมูลสปอนเซอร์ได้</p>`;
    }
}