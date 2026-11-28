const ADMIN_SUPABASE_URL = 'https://gnkfvgikmbbudvkblcnx.supabase.co';
const ADMIN_SUPABASE_ANON_KEY = 'sb_publishable_y7mJl9_LvLkKPOrInpoucg_BN7xR3UI';
const STORE_BANNERS_BUCKET = 'store-banners';

const adminSupabase = window.supabase
    ? window.supabase.createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_ANON_KEY)
    : null;

let currentAdminUser = null;
let allMerchantRequests = [];
let currentAdminTab = 'pending';

let allOnlineRewards = [];
let allRewardClaims = [];
let currentClaimTab = 'pending';
let currentMainSection = 'merchants';

function escapeAdminHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatAdminDate(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function toIsoFromInput(inputVal) {
    if (!inputVal) return null;
    const d = new Date(inputVal);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function checkAdminSessionLabel() {
    const statusEl = document.getElementById('admin-status-text');
    if (!statusEl || !adminSupabase?.auth) return;

    const { data } = await adminSupabase.auth.getSession();
    const user = data?.session?.user || null;
    currentAdminUser = user;

    if (user) {
        statusEl.textContent = `เข้าสู่ระบบ: ${user.email || user.id}`;
    } else {
        statusEl.textContent = 'ไม่ได้ล็อกอิน (ขึ้นอยู่กับ RLS Policy ของตาราง)';
    }
}

function switchMainSection(sectionName) {
    currentMainSection = ['merchants', 'rewards', 'claims'].includes(sectionName)
        ? sectionName
        : 'merchants';

    document.getElementById('main-tab-merchants')?.classList.toggle('active', currentMainSection === 'merchants');
    document.getElementById('main-tab-rewards')?.classList.toggle('active', currentMainSection === 'rewards');
    document.getElementById('main-tab-claims')?.classList.toggle('active', currentMainSection === 'claims');

    document.getElementById('section-merchants')?.classList.toggle('active', currentMainSection === 'merchants');
    document.getElementById('section-rewards')?.classList.toggle('active', currentMainSection === 'rewards');
    document.getElementById('section-claims')?.classList.toggle('active', currentMainSection === 'claims');
}

/* =========================================================
 * Helper อัปเดต role ของผู้ใช้ในตาราง profiles
 * ========================================================= */
async function setProfileRole(userId, nextRole) {
    if (!adminSupabase || !userId) {
        return { ok: true, skipped: true };
    }

    const { data: updatedProf, error: profErr } = await adminSupabase
        .from('profiles')
        .update({ role: nextRole })
        .eq('id', userId)
        .select('id, role');

    if (profErr) {
        return { ok: false, reason: 'error', message: profErr.message };
    }

    if (!updatedProf || updatedProf.length === 0) {
        return {
            ok: false,
            reason: 'empty',
            message: 'ไม่ได้อัปเดต role ใน profiles (0 แถว) ให้ตรวจ RLS ของตาราง profiles หรือ user_id'
        };
    }

    return { ok: true, data: updatedProf };
}

/* =========================================================
 * ส่วนที่ 1: จัดการคำขอผู้ประกอบการ (merchant_requests)
 * ========================================================= */
function switchAdminTab(tabName) {
    currentAdminTab = tabName === 'approved' ? 'approved' : 'pending';
    document.getElementById('tab-pending')?.classList.toggle('active', currentAdminTab === 'pending');
    document.getElementById('tab-approved')?.classList.toggle('active', currentAdminTab === 'approved');
    renderMerchantTable();
}

async function loadMerchantRequests() {
    const tbody = document.getElementById('merchant-requests-tbody');
    if (!adminSupabase) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">ไม่พบ Supabase Client</td></tr>';
        return;
    }

    const { data, error } = await adminSupabase
        .from('merchant_requests')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading merchant_requests:', error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty">โหลดข้อมูลไม่สำเร็จ: ${escapeAdminHtml(error.message)}</td></tr>`;
        }
        return;
    }

    allMerchantRequests = Array.isArray(data) ? data : [];
    updateTabCounts();
    renderMerchantTable();
}

function updateTabCounts() {
    const pendingCount = allMerchantRequests.filter(
        (r) => r.status === 'pending' || r.status === 'reviewing' || !r.status
    ).length;
    const approvedCount = allMerchantRequests.filter((r) => r.status === 'approved').length;

    const pEl = document.getElementById('count-pending');
    const aEl = document.getElementById('count-approved');
    if (pEl) pEl.textContent = String(pendingCount);
    if (aEl) aEl.textContent = String(approvedCount);
}

function renderMerchantTable() {
    const tbody = document.getElementById('merchant-requests-tbody');
    if (!tbody) return;

    const rows = allMerchantRequests.filter((row) => {
        if (currentAdminTab === 'approved') {
            return row.status === 'approved';
        }
        return row.status === 'pending' || row.status === 'reviewing' || !row.status;
    });

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty">ไม่มีข้อมูลในแท็บ${currentAdminTab === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติ'}</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((row) => {
        const safeId = escapeAdminHtml(row.id);
        const safeUserId = escapeAdminHtml(row.user_id);

        const actionButtons = currentAdminTab === 'pending'
            ? `
        <button class="btn btn-approve" type="button" onclick="approveMerchantRequest('${safeId}', '${safeUserId}')">อนุมัติ</button>
        <button class="btn btn-cancel" type="button" onclick="cancelMerchantRequest('${safeId}', '${safeUserId}')">ยกเลิก</button>
        <button class="btn btn-delete" type="button" onclick="deleteMerchantRequest('${safeId}', '${safeUserId}')">ลบ</button>
      `
            : `
        <button class="btn btn-delete" type="button" onclick="revokeMerchantPermission('${safeId}', '${safeUserId}')">ถอนสิทธิ์</button>
      `;

        return `
      <tr>
        <td><strong>${escapeAdminHtml(row.shop_name || '-')}</strong></td>
        <td>${escapeAdminHtml(row.category_area || '-')}</td>
        <td>${escapeAdminHtml(row.contact_info || '-')}</td>
        <td>
          <div>${escapeAdminHtml(row.display_name || '-')}</div>
          <div class="mono">${safeUserId || '-'}</div>
        </td>
        <td>${escapeAdminHtml(row.note || '-')}</td>
        <td>${escapeAdminHtml(formatAdminDate(row.created_at))}</td>
        <td><div class="actions">${actionButtons}</div></td>
      </tr>
    `;
    }).join('');
}

async function approveMerchantRequest(requestId, userId) {
    if (!adminSupabase || !requestId) return;

    const { data: updatedReq, error: reqErr } = await adminSupabase
        .from('merchant_requests')
        .update({ status: 'approved' })
        .eq('id', requestId)
        .select();

    if (reqErr) {
        alert('อนุมัติคำขอไม่สำเร็จ: ' + reqErr.message);
        return;
    }

    if (!updatedReq || updatedReq.length === 0) {
        alert('ไม่ได้อัปเดต merchant_requests (0 แถว) อาจติด RLS Policy หรือไม่พบ id นี้');
        return;
    }

    const resolvedUserId = userId || updatedReq[0]?.user_id || '';
    if (resolvedUserId) {
        const profResult = await setProfileRole(resolvedUserId, 'merchant');
        if (!profResult.ok) {
            alert('อัปเดตคำขอแล้ว แต่เปลี่ยน role ใน profiles ไม่สำเร็จ: ' + profResult.message);
            await loadMerchantRequests();
            return;
        }
    }

    await loadMerchantRequests();
}

async function cancelMerchantRequest(requestId, userId = '') {
    if (!adminSupabase || !requestId) return;
    if (!confirm('ยืนยันยกเลิกคำขอนี้ใช่หรือไม่?')) return;

    const { data: updatedRows, error } = await adminSupabase
        .from('merchant_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId)
        .select();

    if (error) {
        alert('ยกเลิกคำขอไม่สำเร็จ: ' + error.message);
        return;
    }

    if (!updatedRows || updatedRows.length === 0) {
        alert('ไม่ได้ยกเลิกคำขอ (0 แถว) อาจติด RLS Policy หรือไม่พบ id นี้');
        return;
    }

    const resolvedUserId = userId || updatedRows[0]?.user_id || '';
    if (resolvedUserId) {
        const profResult = await setProfileRole(resolvedUserId, 'user');
        if (!profResult.ok) {
            console.warn('Reset profile role warning on cancel:', profResult.message);
        }
    }

    await loadMerchantRequests();
}

async function deleteMerchantRequest(requestId, userId = '') {
    if (!adminSupabase || !requestId) return;
    if (!confirm('ยืนยันลบรายการคำขอนี้ออกจากตารางใช่หรือไม่?')) return;

    const targetRow = allMerchantRequests.find((r) => String(r.id) === String(requestId));
    const resolvedUserId = userId || targetRow?.user_id || '';

    const { data: deletedRows, error } = await adminSupabase
        .from('merchant_requests')
        .delete()
        .eq('id', requestId)
        .select();

    if (error) {
        alert('ลบข้อมูลไม่สำเร็จ: ' + error.message);
        return;
    }

    if (!deletedRows || deletedRows.length === 0) {
        alert('ไม่ได้ลบข้อมูล (0 แถว) อาจติด RLS Policy หรือไม่พบ id นี้');
        return;
    }

    if (resolvedUserId) {
        const profResult = await setProfileRole(resolvedUserId, 'user');
        if (!profResult.ok) {
            alert('ลบคำขอแล้ว แต่คืนค่า role ใน profiles ไม่สำเร็จ: ' + profResult.message);
        }
    }

    await loadMerchantRequests();
}

async function revokeMerchantPermission(requestId, userId) {
    if (!adminSupabase || !requestId) return;
    if (!confirm('ยืนยันถอนสิทธิ์ผู้ประกอบการและลบรายการคำขอนี้ออกใช่หรือไม่?')) return;

    const targetRow = allMerchantRequests.find((r) => String(r.id) === String(requestId));
    const resolvedUserId = userId || targetRow?.user_id || '';

    const { data: deletedRows, error: delErr } = await adminSupabase
        .from('merchant_requests')
        .delete()
        .eq('id', requestId)
        .select();

    if (delErr) {
        alert('ลบคำขอไม่สำเร็จ: ' + delErr.message);
        return;
    }

    if (!deletedRows || deletedRows.length === 0) {
        alert('ไม่ได้ลบคำขอ (0 แถว) อาจติด RLS Policy หรือไม่พบ id นี้');
        return;
    }

    if (resolvedUserId) {
        const profResult = await setProfileRole(resolvedUserId, 'user');
        if (!profResult.ok) {
            alert('ลบคำขอแล้ว แต่คืนค่า role ใน profiles ไม่สำเร็จ: ' + profResult.message);
            await loadMerchantRequests();
            return;
        }
    }

    await loadMerchantRequests();
}

/* =========================================================
 * ช่วยอัปโหลดไฟล์รูปขึ้น Storage Bucket เดิม (store-banners)
 * ========================================================= */
async function uploadImageToStoreBanners(file, folderName = 'online-rewards') {
    if (!file || !adminSupabase?.storage) return null;

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const filePath = `${folderName}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadErr } = await adminSupabase.storage
        .from(STORE_BANNERS_BUCKET)
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (uploadErr) {
        throw new Error(`อัปโหลดรูปขึ้น ${STORE_BANNERS_BUCKET} ไม่สำเร็จ: ${uploadErr.message}`);
    }

    const { data: pubData } = adminSupabase.storage
        .from(STORE_BANNERS_BUCKET)
        .getPublicUrl(filePath);

    return pubData?.publicUrl || null;
}

/* =========================================================
 * ส่วนที่ 2: สร้างและจัดการของรางวัลออนไลน์ (campaigns)
 * ========================================================= */
async function handleCreateOnlineReward(event) {
    event.preventDefault();
    if (!adminSupabase) {
        alert('ไม่พบ Supabase Client');
        return;
    }

    const submitBtn = document.getElementById('btn-submit-reward');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const title = document.getElementById('reward-title')?.value.trim() || '';
        const rewardType = document.getElementById('reward-type')?.value || 'truemoney';
        const merchantName = document.getElementById('reward-merchant-name')?.value.trim() || 'KaoKhet Online Reward';
        const pointsCost = Math.max(0, parseInt(document.getElementById('reward-points-cost')?.value || '0', 10));
        const totalLimit = Math.max(1, parseInt(document.getElementById('reward-total-limit')?.value || '1', 10));
        const category = document.getElementById('reward-category')?.value.trim() || 'online_reward';
        const startDate = toIsoFromInput(document.getElementById('reward-start-date')?.value) || new Date().toISOString();
        const endDate = toIsoFromInput(document.getElementById('reward-end-date')?.value);
        const rewardDetails = document.getElementById('reward-details')?.value.trim() || '';
        const description = document.getElementById('reward-description')?.value.trim() || rewardDetails || title;

        const fileInput = document.getElementById('reward-image-file');
        const urlInput = document.getElementById('reward-image-url');
        let imageUrl = urlInput?.value.trim() || null;

        if (fileInput?.files && fileInput.files.length > 0) {
            imageUrl = await uploadImageToStoreBanners(fileInput.files[0], 'online-rewards');
        }

        const payload = {
            title,
            description,
            reward_details: rewardDetails || `[${rewardType}] ${title}`,
            merchant_name: merchantName,
            image_url: imageUrl,
            category,
            campaign_type: `online_reward:${rewardType}`,
            points_cost: pointsCost,
            total_limit: totalLimit,
            claimed_count: 0,
            start_date: startDate,
            end_date: endDate,
            is_active: true,
            status: 'active',
            created_by: currentAdminUser?.id || null
        };

        const { error } = await adminSupabase
            .from('campaigns')
            .insert(payload);

        if (error) {
            throw new Error(`บันทึกแคมเปญรางวัลออนไลน์ไม่สำเร็จ: ${error.message}`);
        }

        alert('สร้างของรางวัลออนไลน์ในตาราง campaigns เรียบร้อยแล้ว');
        document.getElementById('create-online-reward-form')?.reset();
        if (document.getElementById('reward-merchant-name')) {
            document.getElementById('reward-merchant-name').value = 'KaoKhet Online Reward';
        }
        if (document.getElementById('reward-category')) {
            document.getElementById('reward-category').value = 'online_reward';
        }
        await loadOnlineRewards();
    } catch (err) {
        alert(err.message || 'เกิดข้อผิดพลาดในการสร้างของรางวัล');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function loadOnlineRewards() {
    const tbody = document.getElementById('online-rewards-tbody');
    if (!adminSupabase) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">ไม่พบ Supabase Client</td></tr>';
        return;
    }

    const { data, error } = await adminSupabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading campaigns:', error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty">โหลดข้อมูลไม่สำเร็จ: ${escapeAdminHtml(error.message)}</td></tr>`;
        }
        return;
    }

    const rows = Array.isArray(data) ? data : [];
    allOnlineRewards = rows.filter(
        (c) => String(c.campaign_type || '').startsWith('online_reward') || c.category === 'online_reward'
    );
    renderOnlineRewardsTable();
}

function renderOnlineRewardsTable() {
    const tbody = document.getElementById('online-rewards-tbody');
    if (!tbody) return;

    if (allOnlineRewards.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">ยังไม่มีแคมเปญของรางวัลออนไลน์</td></tr>';
        return;
    }

    tbody.innerHTML = allOnlineRewards.map((item) => {
        const safeId = escapeAdminHtml(item.id);
        const active = item.is_active !== false && item.status !== 'inactive';
        const claimed = Number(item.claimed_count || 0);
        const total = Number(item.total_limit || 0);

        return `
      <tr>
        <td>
          ${item.image_url
                ? `<img class="thumb" src="${escapeAdminHtml(item.image_url)}" alt="${escapeAdminHtml(item.title)}" />`
                : '<span style="color:#9ca3af; font-size:12px;">ไม่มีรูป</span>'
            }
        </td>
        <td>
          <strong>${escapeAdminHtml(item.title || '-')}</strong>
          <div class="mono">${escapeAdminHtml(item.campaign_type || '-')}</div>
          <div style="color:#6b7280; font-size:12px;">${escapeAdminHtml(item.reward_details || '')}</div>
        </td>
        <td>
          <div>ใช้ <strong>${escapeAdminHtml(item.points_cost ?? 0)}</strong> พอยต์</div>
          <div style="font-size:12px; color:#4b5563;">รับแล้ว ${claimed} / ${total || '∞'}</div>
        </td>
        <td>${escapeAdminHtml(item.merchant_name || '-')}</td>
        <td style="font-size:12px;">
          <div>เริ่ม: ${escapeAdminHtml(formatAdminDate(item.start_date))}</div>
          <div>หมดอายุ: ${escapeAdminHtml(formatAdminDate(item.end_date))}</div>
        </td>
        <td>
          <span class="badge ${active ? 'badge-completed' : 'badge-cancelled'}">
            ${active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
          </span>
        </td>
        <td>
          <div class="actions">
            <button class="btn btn-cancel" type="button" onclick="toggleOnlineRewardActive('${safeId}', ${active})">
              ${active ? 'ปิดแคมเปญ' : 'เปิดแคมเปญ'}
            </button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
}

async function toggleOnlineRewardActive(campaignId, currentlyActive) {
    if (!adminSupabase || !campaignId) return;
    const nextActive = !currentlyActive;

    const { error } = await adminSupabase
        .from('campaigns')
        .update({
            is_active: nextActive,
            status: nextActive ? 'active' : 'inactive'
        })
        .eq('id', campaignId);

    if (error) {
        alert('อัปเดตสถานะแคมเปญไม่สำเร็จ: ' + error.message);
        return;
    }

    await loadOnlineRewards();
}

/* =========================================================
 * ส่วนที่ 3: จัดการคำขอแลกของรางวัล (reward_claims) & ปิดรายการ
 * ========================================================= */
function switchClaimTab(tabName) {
    currentClaimTab = ['pending', 'completed', 'cancelled'].includes(tabName) ? tabName : 'pending';
    document.getElementById('claim-tab-pending')?.classList.toggle('active', currentClaimTab === 'pending');
    document.getElementById('claim-tab-completed')?.classList.toggle('active', currentClaimTab === 'completed');
    document.getElementById('claim-tab-cancelled')?.classList.toggle('active', currentClaimTab === 'cancelled');
    renderRewardClaimsTable();
}

async function loadRewardClaims() {
    const tbody = document.getElementById('reward-claims-tbody');
    if (!adminSupabase) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">ไม่พบ Supabase Client</td></tr>';
        return;
    }

    const { data, error } = await adminSupabase
        .from('reward_claims')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading reward_claims:', error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty">โหลดข้อมูลไม่สำเร็จ: ${escapeAdminHtml(error.message)}</td></tr>`;
        }
        return;
    }

    const claims = Array.isArray(data) ? data : [];
    const userIds = [...new Set(claims.map((c) => c.user_id).filter(Boolean))];
    const campaignIds = [...new Set(claims.map((c) => c.campaign_id).filter(Boolean))];

    const profileMap = {};
    if (userIds.length > 0) {
        const { data: profilesData } = await adminSupabase
            .from('profiles')
            .select('id, display_name, full_name, email')
            .in('id', userIds);

        (profilesData || []).forEach((p) => {
            profileMap[p.id] = p.display_name || p.full_name || p.email || p.id;
        });
    }

    const campaignMap = {};
    if (campaignIds.length > 0) {
        const { data: campaignsData } = await adminSupabase
            .from('campaigns')
            .select('id, title, reward_details')
            .in('id', campaignIds);

        (campaignsData || []).forEach((c) => {
            campaignMap[c.id] = c.title || c.reward_details || c.id;
        });
    }

    allRewardClaims = claims.map((c) => ({
        ...c,
        _userLabel: profileMap[c.user_id] || c.user_id || '-',
        _campaignLabel: campaignMap[c.campaign_id] || c.campaign_id || '-'
    }));

    updateClaimTabCounts();
    renderRewardClaimsTable();
}

function updateClaimTabCounts() {
    const pendingCount = allRewardClaims.filter((c) => c.status === 'pending' || !c.status).length;
    const completedCount = allRewardClaims.filter((c) => c.status === 'completed').length;
    const cancelledCount = allRewardClaims.filter((c) => c.status === 'cancelled').length;

    const topPendingEl = document.getElementById('count-claims-pending');
    const pEl = document.getElementById('count-claim-pending');
    const cEl = document.getElementById('count-claim-completed');
    const xEl = document.getElementById('count-claim-cancelled');

    if (topPendingEl) topPendingEl.textContent = String(pendingCount);
    if (pEl) pEl.textContent = String(pendingCount);
    if (cEl) cEl.textContent = String(completedCount);
    if (xEl) xEl.textContent = String(cancelledCount);
}

function renderRewardClaimsTable() {
    const tbody = document.getElementById('reward-claims-tbody');
    if (!tbody) return;

    const rows = allRewardClaims.filter((row) => {
        if (currentClaimTab === 'completed') return row.status === 'completed';
        if (currentClaimTab === 'cancelled') return row.status === 'cancelled';
        return row.status === 'pending' || !row.status;
    });

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">ไม่มีคำขอแลกของรางวัลในหมวดนี้</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => {
        const safeId = escapeAdminHtml(row.id);
        const status = row.status || 'pending';
        const badgeClass =
            status === 'completed' ? 'badge-completed' :
                status === 'cancelled' ? 'badge-cancelled' : 'badge-pending';
        const statusText =
            status === 'completed' ? 'ส่งรางวัลแล้ว' :
                status === 'cancelled' ? 'ยกเลิกแล้ว' : 'รอดำเนินการ';

        const proofBlock = `
      <div><span class="badge ${badgeClass}">${statusText}</span></div>
      ${row.proof_text ? `<div style="margin-top:6px; font-size:12px;">หลักฐาน/โค้ด: <strong>${escapeAdminHtml(row.proof_text)}</strong></div>` : ''}
      ${row.proof_image_url ? `<div style="margin-top:6px;"><a href="${escapeAdminHtml(row.proof_image_url)}" target="_blank" rel="noopener">ดูรูปหลักฐาน</a></div>` : ''}
    `;

        const actionButtons = status === 'pending'
            ? `
        <button class="btn btn-approve" type="button" onclick="openFulfillModal('${safeId}')">แนบหลักฐาน / ส่งรางวัล</button>
        <button class="btn btn-cancel" type="button" onclick="cancelRewardClaim('${safeId}')">ยกเลิก</button>
      `
            : `
        <button class="btn btn-delete" type="button" onclick="deleteRewardClaim('${safeId}')">ลบ</button>
      `;

        return `
      <tr>
        <td>
          <div><strong>${escapeAdminHtml(row.claim_code || '-')}</strong></div>
          <div class="mono">${safeId}</div>
        </td>
        <td>
          <div>${escapeAdminHtml(row._userLabel)}</div>
          <div class="mono">${escapeAdminHtml(row.user_id || '-')}</div>
        </td>
        <td>
          <div><strong>${escapeAdminHtml(row._campaignLabel)}</strong></div>
          <div style="font-size:12px; color:#6b7280;">ประเภท: ${escapeAdminHtml(row.reward_type || '-')}</div>
        </td>
        <td><strong>${escapeAdminHtml(row.destination_account || '-')}</strong></td>
        <td>${proofBlock}</td>
        <td>
          <div>ขอ: ${escapeAdminHtml(formatAdminDate(row.created_at))}</div>
          ${row.completed_at ? `<div style="font-size:12px; color:#166534;">ปิด: ${escapeAdminHtml(formatAdminDate(row.completed_at))}</div>` : ''}
        </td>
        <td><div class="actions">${actionButtons}</div></td>
      </tr>
    `;
    }).join('');
}

function openFulfillModal(claimId) {
    const claim = allRewardClaims.find((c) => c.id === claimId);
    if (!claim) return;

    document.getElementById('fulfill-claim-id').value = claim.id;
    document.getElementById('fulfill-proof-image').value = '';
    document.getElementById('fulfill-proof-text').value = claim.proof_text || '';

    const summaryEl = document.getElementById('fulfill-claim-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
      <div><strong>รหัสคำขอ:</strong> ${escapeAdminHtml(claim.claim_code || claim.id)}</div>
      <div><strong>ผู้รับ:</strong> ${escapeAdminHtml(claim._userLabel)}</div>
      <div><strong>รางวัล:</strong> ${escapeAdminHtml(claim._campaignLabel)}</div>
      <div><strong>บัญชีปลายทาง:</strong> ${escapeAdminHtml(claim.destination_account || '-')}</div>
    `;
    }

    document.getElementById('fulfill-modal')?.classList.add('open');
}

function closeFulfillModal() {
    document.getElementById('fulfill-modal')?.classList.remove('open');
    document.getElementById('fulfill-claim-form')?.reset();
    document.getElementById('fulfill-claim-id').value = '';
}

function handleModalBackdropClick(event) {
    if (event.target?.id === 'fulfill-modal') {
        closeFulfillModal();
    }
}

async function handleConfirmFulfillClaim(event) {
    event.preventDefault();
    if (!adminSupabase) return;

    const claimId = document.getElementById('fulfill-claim-id')?.value;
    const claim = allRewardClaims.find((c) => c.id === claimId);
    if (!claim) return;

    const fileInput = document.getElementById('fulfill-proof-image');
    const proofText = document.getElementById('fulfill-proof-text')?.value.trim() || '';
    const hasFile = Boolean(fileInput?.files && fileInput.files.length > 0);

    if (!hasFile && !proofText) {
        alert('กรุณาแนบรูปหลักฐานการโอน หรือกรอกรหัส/ข้อความยืนยันอย่างน้อย 1 อย่าง');
        return;
    }

    const confirmBtn = document.getElementById('btn-confirm-fulfill');
    if (confirmBtn) confirmBtn.disabled = true;

    try {
        let proofImageUrl = claim.proof_image_url || null;
        if (hasFile) {
            proofImageUrl = await uploadImageToStoreBanners(fileInput.files[0], 'reward-proofs');
        }

        const nowIso = new Date().toISOString();
        const { data: updatedRows, error: updateErr } = await adminSupabase
            .from('reward_claims')
            .update({
                status: 'completed',
                proof_image_url: proofImageUrl,
                proof_text: proofText || null,
                fulfilled_by: currentAdminUser?.id || null,
                completed_at: nowIso
            })
            .eq('id', claimId)
            .select();

        if (updateErr) {
            throw new Error(`ปิดรายการคำขอไม่สำเร็จ: ${updateErr.message}`);
        }

        if (!updatedRows || updatedRows.length === 0) {
            throw new Error('ไม่ได้อัปเดต reward_claims (0 แถว) กรุณาตรวจสอบสิทธิ์หรือ RLS Policy');
        }

        if (claim.user_id) {
            const detailNote = proofText ? ` | รายละเอียด/รหัส: ${proofText}` : '';
            const slipLink = proofImageUrl ? ` | ดูหลักฐานการโอน: ${proofImageUrl}` : '';
            const { error: notifErr } = await adminSupabase
                .from('notifications')
                .insert({
                    user_id: claim.user_id,
                    title: '🎁 ได้รับรางวัลออนไลน์แล้ว',
                    message: `คำขอ ${claim.claim_code || ''} สำหรับ "${claim._campaignLabel}" ถูกจัดส่งเรียบร้อยแล้ว${detailNote}${slipLink}`,
                    is_read: false
                });

            if (notifErr) {
                console.warn('Insert notifications warning:', notifErr.message);
            }
        }

        alert('ยืนยันการส่งของรางวัลและบันทึกหลักฐานเรียบร้อยแล้ว');
        closeFulfillModal();
        await loadRewardClaims();
    } catch (err) {
        alert(err.message || 'เกิดข้อผิดพลาดในการปิดรายการ');
    } finally {
        if (confirmBtn) confirmBtn.disabled = false;
    }
}

async function cancelRewardClaim(claimId) {
    if (!adminSupabase || !claimId) return;
    if (!confirm('ยืนยันยกเลิกคำขอแลกของรางวัลนี้ใช่หรือไม่?')) return;

    const { error } = await adminSupabase
        .from('reward_claims')
        .update({ status: 'cancelled' })
        .eq('id', claimId);

    if (error) {
        alert('ยกเลิกคำขอไม่สำเร็จ: ' + error.message);
        return;
    }

    await loadRewardClaims();
}

async function deleteRewardClaim(claimId) {
    if (!adminSupabase || !claimId) return;
    if (!confirm('ยืนยันลบรายการคำขอนี้ใช่หรือไม่?')) return;

    const { error } = await adminSupabase
        .from('reward_claims')
        .delete()
        .eq('id', claimId);

    if (error) {
        alert('ลบรายการไม่สำเร็จ: ' + error.message);
        return;
    }

    await loadRewardClaims();
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkAdminSessionLabel();
    await Promise.all([
        loadMerchantRequests(),
        loadOnlineRewards(),
        loadRewardClaims()
    ]);
});
