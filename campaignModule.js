// ==========================================
// 🎯 campaignModule.js — โมดูลแคมเปญ สิทธิประโยชน์ และระบบแท็บ
// ==========================================

let activeSponsorsList = [];
let userCouponsList = [];
let selectedCouponIdForUse = null;
let couponIdToDelete = null;
let activeRewardCategory = 'all';
let isClaimingCampaign = false;

function getCampaignClient() {
  return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
}

function escapeCampaignHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStartOfTodayIso() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return startOfToday.toISOString();
}

async function fetchTodayClaimedCampaignIds(client, userId) {
  const claimedSet = new Set();
  if (!client || !userId) return claimedSet;

  try {
    const { data, error } = await client
      .from('campaign_claims')
      .select('campaign_id')
      .eq('user_id', userId)
      .gte('created_at', getStartOfTodayIso());

    if (!error && Array.isArray(data)) {
      data.forEach((row) => {
        if (row && row.campaign_id != null) {
          claimedSet.add(String(row.campaign_id));
        }
      });
    }
  } catch (err) {
    console.warn('ไม่สามารถตรวจสอบรายการรับสิทธิ์วันนี้ได้:', err);
  }

  return claimedSet;
}

async function initShopModule() {
  console.log("Initializing Shop & Sponsor Module...");
  await ensureCurrentUser();
  console.log('Current User ID:', currentUser?.id);

  await loadShopDataToUI(activeRewardCategory);
  if (typeof loadMyCoupons === 'function') {
    await loadMyCoupons(currentUser?.id);
  }
  if (typeof checkMerchantPermission === 'function') {
    await checkMerchantPermission(currentUser?.id);
  }
  if (typeof updateNotificationBadge === 'function') {
    await updateNotificationBadge();
  }
}

async function ensureCurrentUser() {
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.id) {
    return currentUser;
  }

  try {
    const client = getCampaignClient();
    if (!client || !client.auth) {
      return null;
    }

    const { data, error } = await client.auth.getSession();
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

// 1. โหลดรายการสิทธิประโยชน์แบบ Grid 2 คอลัมน์
async function loadShopDataToUI(category = 'all') {
  activeRewardCategory = category || 'all';
  const container = document.getElementById('content-view-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:30px 0;">⏳ กำลังโหลดสิทธิประโยชน์...</div>';

  try {
    if (typeof fetchActiveCampaigns !== 'function') {
      throw new Error('ไม่พบฟังก์ชัน fetchActiveCampaigns');
    }

    await ensureCurrentUser();
    const client = getCampaignClient();
    const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : null;

    const [rawCampaigns, claimedTodaySet] = await Promise.all([
      fetchActiveCampaigns(),
      fetchTodayClaimedCampaignIds(client, uid)
    ]);

    let campaigns = rawCampaigns || [];

    if (activeRewardCategory !== 'all') {
      campaigns = campaigns.filter(camp => camp.category === activeRewardCategory);
    }

    if (!campaigns || campaigns.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:30px 0;">ยังไม่มีแคมเปญสปอนเซอร์ในหมวดหมู่นี้</div>';
      return;
    }

    let html = '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; padding: 0 16px 16px 16px;">';
    campaigns.forEach(camp => {
      const sponsorName = (camp.merchant_name && camp.merchant_name.trim() !== '')
        ? camp.merchant_name
        : (camp.sponsors && camp.sponsors.name ? camp.sponsors.name : 'KaoKhet Partner');

      const fallbackImg = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=500&q=80';
      const imageUrl = camp.image_url ? camp.image_url : fallbackImg;
      const endDateStr = camp.end_date
        ? new Date(camp.end_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
        : 'ไม่จำกัดเวลา';

      const totalLimit = camp.total_limit ?? 10;
      const claimedCount = camp.claimed_count ?? 0;
      const remaining = totalLimit - claimedCount;
      const isSoldOut = remaining <= 0;
      const isAlreadyClaimedToday = claimedTodaySet.has(String(camp.id));
      const isDisabled = isSoldOut || isAlreadyClaimedToday;
      const pointsCost = camp.points_cost ?? 0;

      const stockBadge = isSoldOut
        ? `<span style="position:absolute; top:6px; left:6px; background:rgba(239,68,68,0.9); color:#fff; font-size:8px; font-weight:700; padding:2px 5px; border-radius:6px;">❌ หมดแล้ว</span>`
        : isAlreadyClaimedToday
          ? `<span style="position:absolute; top:6px; left:6px; background:rgba(107,114,128,0.92); color:#fff; font-size:8px; font-weight:700; padding:2px 5px; border-radius:6px;">✓ รับแล้ววันนี้</span>`
          : `<span style="position:absolute; top:6px; left:6px; background:rgba(34,197,94,0.9); color:#fff; font-size:8px; font-weight:700; padding:2px 5px; border-radius:6px;">🔥 เหลือ ${remaining}/${totalLimit}</span>`;

      const cardOpacity = isDisabled ? 'opacity: 0.72; background:#f9fafb;' : 'background:#fff;';
      const btnStyle = isDisabled
        ? `width:100%; border:none; padding:7px; border-radius:10px; font-size:11px; font-weight:700; background:#9ca3af; color:#fff; cursor:not-allowed;`
        : `width:100%; border:none; padding:7px; border-radius:10px; font-size:11px; font-weight:700; background:#22c55e; color:#fff; cursor:pointer;`;

      const safeId = escapeCampaignHtml(camp.id);
      const btnAction = isDisabled ? 'disabled aria-disabled="true"' : `onclick="handleClaimCampaign('${safeId}')"`;
      const btnText = isSoldOut
        ? 'สิทธิ์เต็มแล้ว'
        : isAlreadyClaimedToday
          ? 'รับสิทธิ์แล้ว'
          : `🪙 ${pointsCost} Points`;

      html += `
        <div style="${cardOpacity} border-radius:16px; overflow:hidden; border:1px solid #e5e7eb; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; flex-direction:column; justify-content:space-between; min-width:0;">
          <div style="position:relative; width:100%; height:105px; background:#e5e7eb;">
            <img src="${escapeCampaignHtml(imageUrl)}" onerror="this.onerror=null;this.src='${fallbackImg}';" style="width:100%; height:100%; object-fit:cover;" alt="Campaign Banner" />
            ${stockBadge}
            <span style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.65); color:#fff; font-size:8px; font-weight:600; padding:2px 5px; border-radius:6px; backdrop-filter:blur(4px);">⏳ ${escapeCampaignHtml(endDateStr)}</span>
          </div>
          <div style="padding:10px; display:flex; flex-direction:column; flex:1; justify-content:space-between;">
            <div>
              <div style="font-size:9px; color:#3b82f6; font-weight:700; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeCampaignHtml(sponsorName)}</div>
              <div style="font-size:12px; font-weight:700; color:#1f2937; margin:3px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeCampaignHtml(camp.title)}">${escapeCampaignHtml(camp.title)}</div>
              <div style="font-size:10px; color:#6b7280; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeCampaignHtml(camp.description || 'สิทธิ์พิเศษสำหรับชาว KaoKhet')}</div>
            </div>
            <div>
              <div style="font-size:10px; font-weight:800; color:#16a34a; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🎁 ${escapeCampaignHtml(camp.reward_details || 'สิทธิ์พิเศษ')}</div>
              <button type="button" ${btnAction} style="${btnStyle}">${btnText}</button>
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

// 3. ฟังก์ชันกดรับสิทธิ์แคมเปญ (เช็กเงื่อนไขป้อมปราการ / เรดบอส + รีเซ็ตทุกเที่ยงคืน 00:00 น.)
function getBangkokDateKey(dateObj = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(dateObj);

  const y = parts.find((p) => p.type === 'year')?.value || '1970';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

async function validateCampaignClaimRules(campaignData) {
  const rawType = String(campaignData.campaign_type || '').toLowerCase().trim();
  const mode = rawType || (campaignData.is_raid_boss ? 'raid_boss' : (campaignData.is_secret_node ? 'fortress' : 'normal'));
  const todayKey = getBangkokDateKey();

  if (mode === 'fortress' || Boolean(campaignData.is_secret_node)) {
    const checkedKey = `checked_node_${currentUser.id}_${campaignData.id}_${todayKey}`;
    const radiusMeters = Number(campaignData.node_radius) > 0 ? Number(campaignData.node_radius) : 50;
    if (localStorage.getItem(checkedKey) !== 'true') {
      return {
        ok: false,
        message: `🏰 กรุณาเดินทางไปเช็กอินในรัศมีป้อมปราการ (${radiusMeters} ม.) ก่อนรับสิทธิ์`
      };
    }
  }

  if (mode === 'raid_boss' || Boolean(campaignData.is_raid_boss)) {
    const targetKm = Number(campaignData.target_distance_km);
    const currentKm = Number(campaignData.current_distance_km) || 0;
    const minPlayerKm = Number(campaignData.min_distance_km);
    const requiredTargetKm = targetKm > 0 ? targetKm : 10;
    const requiredMinPlayerKm = minPlayerKm > 0 ? minPlayerKm : 1;

    const contribKey = `raid_contrib_${currentUser.id}_${campaignData.id}_${todayKey}`;
    const myContribKm = Number(localStorage.getItem(contribKey) || 0);

    // ถ้าระยะทางสะสมของผู้เล่นในระบบมีอยู่ ให้เช็กเทียบกับระยะทางสะสมของผู้เล่นด้วย
    const playerTotalKm = typeof totalDistance !== 'undefined'
      ? Number(totalDistance)
      : (typeof userTotalDistanceKm !== 'undefined' ? Number(userTotalDistanceKm) : myContribKm);

    if (currentKm < requiredTargetKm) {
      return {
        ok: false,
        message: `🐲 บอสยังไม่ถูกพิชิต (${currentKm.toFixed(1)}/${requiredTargetKm} กม.) ร่วมสะสมระยะทางให้ครบเป้าก่อนครับ`
      };
    }

    if (myContribKm < requiredMinPlayerKm || playerTotalKm < requiredMinPlayerKm) {
      const effectiveDist = Math.min(myContribKm, playerTotalKm);
      return {
        ok: false,
        message: `📏 ระยะทางสะสมของคุณ (${effectiveDist.toFixed(2)} กม.) ยังไม่ถึงเกณฑ์ขั้นต่ำ ${requiredMinPlayerKm} กม.`
      };
    }
  }

  return { ok: true };
}

async function handleClaimCampaign(campaignId, rewardTitle) {
  if (isClaimingCampaign) return;

  await ensureCurrentUser();
  const client = getCampaignClient();

  if (!currentUser || !currentUser.id || !client) {
    if (typeof showToast === 'function') showToast('⚠️ กรุณาล็อกอินก่อนกดรับสิทธิ์');
    return;
  }

  isClaimingCampaign = true;
  let pointsDeducted = false;
  let previousPoints = 0;
  let insertedClaimId = null;

  try {
    if (typeof showToast === 'function') showToast('⏳ กำลังตรวจสอบสิทธิ์และแต้ม...');

    const { data: campaignData, error: fetchError } = await client
      .from('campaigns')
      .select('id, total_limit, claimed_count, points_cost, title, reward_details, is_active, campaign_type, is_secret_node, is_raid_boss, node_radius, current_distance_km, target_distance_km, min_distance_km')
      .eq('id', campaignId)
      .single();

    if (fetchError) throw fetchError;

    const totalLimit = campaignData.total_limit ?? 10;
    const claimedCount = campaignData.claimed_count ?? 0;
    const pointsCost = campaignData.points_cost ?? 0;
    const resolvedRewardLabel = rewardTitle || campaignData.title || campaignData.reward_details || 'สิทธิ์พิเศษ';

    if (campaignData.is_active === false || claimedCount >= totalLimit) {
      if (typeof showToast === 'function') showToast('❌ เสียใจด้วยครับ สิทธิ์แคมเปญนี้เต็มแล้ว');
      await loadShopDataToUI(activeRewardCategory);
      return;
    }

    const ruleCheck = await validateCampaignClaimRules(campaignData);
    if (!ruleCheck.ok) {
      if (typeof showToast === 'function') showToast(ruleCheck.message);
      return;
    }

    const { data: todayClaim, error: claimCheckError } = await client
      .from('campaign_claims')
      .select('id, created_at')
      .eq('user_id', currentUser.id)
      .eq('campaign_id', campaignId)
      .gte('created_at', getStartOfTodayIso())
      .maybeSingle();

    if (claimCheckError) throw claimCheckError;

    if (todayClaim) {
      if (typeof showToast === 'function') {
        showToast('⚠️ คุณรับสิทธิ์วันนี้ไปแล้ว สามารถกดรับซ้ำได้ใหม่หลังเที่ยงคืน (00:00 น.) ครับ');
      }
      await loadShopDataToUI(activeRewardCategory);
      return;
    }

    const { data: profileData, error: profileError } = await client
      .from('profiles')
      .select('points')
      .eq('id', currentUser.id)
      .single();

    if (profileError) throw profileError;

    const userPoints = profileData?.points || 0;
    previousPoints = userPoints;

    if (userPoints < pointsCost) {
      if (typeof showToast === 'function') {
        showToast(`❌ แต้มของคุณไม่พอ (ต้องการ ${pointsCost} Points / คุณมี ${userPoints} Points)`);
      }
      return;
    }

    const newPoints = userPoints - pointsCost;
    const { error: updatePointsError } = await client
      .from('profiles')
      .update({ points: newPoints })
      .eq('id', currentUser.id);

    if (updatePointsError) throw updatePointsError;
    pointsDeducted = true;

    const { data: insertedClaim, error: insertClaimError } = await client
      .from('campaign_claims')
      .insert([{ user_id: currentUser.id, campaign_id: campaignId }])
      .select('id')
      .single();

    if (insertClaimError) throw insertClaimError;
    insertedClaimId = insertedClaim?.id || null;

    const dummyCode = 'KAOKHET-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const result = typeof claimUserCoupon === 'function'
      ? await claimUserCoupon(currentUser.id, campaignId, dummyCode)
      : { success: false, message: 'ไม่พบฟังก์ชัน claimUserCoupon' };

    if (!result || !result.success) {
      throw new Error((result && result.message) || 'ไม่สามารถบันทึกคูปองลงกระเป๋าได้');
    }

    const { error: updateError } = await client
      .from('campaigns')
      .update({ claimed_count: claimedCount + 1 })
      .eq('id', campaignId);

    if (updateError) throw updateError;

    if (typeof showToast === 'function') {
      showToast(`🎉 แลกรับ "${resolvedRewardLabel}" สำเร็จ! หัก ${pointsCost} Points (เหลือ ${newPoints} Points)`);
    }

    const pointsDisplay = document.getElementById('user-points-val');
    if (pointsDisplay) pointsDisplay.innerText = `${newPoints} Points`;
    const sponsorPointsDisplay = document.getElementById('sponsor-user-points');
    if (sponsorPointsDisplay) sponsorPointsDisplay.innerText = `${newPoints} Points`;

    const refreshTasks = [loadShopDataToUI(activeRewardCategory)];
    if (typeof loadMyCoupons === 'function') {
      refreshTasks.push(loadMyCoupons(currentUser.id));
    }
    await Promise.all(refreshTasks);

  } catch (err) {
    if (insertedClaimId && client) {
      await client
        .from('campaign_claims')
        .delete()
        .eq('id', insertedClaimId);
    }
    if (pointsDeducted && client) {
      await client
        .from('profiles')
        .update({ points: previousPoints })
        .eq('id', currentUser.id);
    }
    console.error('Error claiming campaign:', err);
    if (typeof showToast === 'function') {
      showToast('❌ ไม่สามารถรับสิทธิ์ได้: ' + (err.message || 'เกิดข้อผิดพลาด'));
    }
  } finally {
    isClaimingCampaign = false;
  }
}

// ==========================================
// 🔀 ฟังก์ชันแท็บ และกริดสปอนเซอร์
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
      activateMainTab('sponsor', true);
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

// ฟังก์ชันดึงข้อมูลแบนเนอร์ร้านค้ามาแสดงผลแบบกริดแนวตั้ง
async function loadSponsorBanners() {
  const container = document.getElementById('content-view-container');
  if (!container) return;

  const client = getCampaignClient();
  if (!client) {
    container.innerHTML = `<p style="text-align: center; color: #ef4444; padding: 20px;">ไม่พบการเชื่อมต่อฐานข้อมูล</p>`;
    return;
  }

  container.innerHTML = `<p style="text-align: center; color: #9ca3af; padding: 20px;">กำลังโหลดแบนเนอร์สปอนเซอร์...</p>`;

  try {
    const { data: stores, error } = await client
      .from('store_profiles')
      .select('id, store_name, banner_url');

    if (error) throw error;

    if (!stores || stores.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: #9ca3af; padding: 20px;">ยังไม่มีข้อมูลร้านค้าหรือสปอนเซอร์ในขณะนี้</p>`;
      return;
    }

    let gridHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 16px;">`;

    stores.forEach(store => {
      const bannerImage = store.banner_url || 'default-banner.png';
      const storeName = store.store_name || 'ร้านค้าไม่มีชื่อ';
      const safeStoreId = escapeCampaignHtml(store.id);

      gridHtml += `
        <div onclick="if(typeof goToStoreProfile === 'function') goToStoreProfile('${safeStoreId}')" style="background: #1f2937; border-radius: 12px; overflow: hidden; cursor: pointer; transition: transform 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" onmouseover="this.style.transform='translateY(-4px)';" onmouseout="this.style.transform='translateY(0)';">
          <img src="${escapeCampaignHtml(bannerImage)}" onerror="this.onerror=null;this.src='default-banner.png';" alt="${escapeCampaignHtml(storeName)}" style="width: 100%; height: 160px; object-fit: cover;">
          <div style="padding: 12px; text-align: center; color: #ffffff; font-weight: 600; font-size: 16px;">
            ${escapeCampaignHtml(storeName)}
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