// ==========================================
// 👤 profile_module.js — โมดูลโปรไฟล์ การตั้งค่า และคำขอสิทธิ์ผู้ประกอบการ
// ==========================================

let profileFullUserId = '';
let profileCurrentDisplayName = '';
let profileCurrentRole = 'user';

function getProfileClient() {
    return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
}

function escapeProfileHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function notifyProfile(message) {
    if (typeof showToast === 'function') {
        showToast(message);
    } else {
        alert(message);
    }
}

function formatShortUserId(uid) {
    if (!uid) return 'ยังไม่เข้าสู่ระบบ';
    const str = String(uid);
    if (str.length <= 14) return str;
    return `${str.slice(0, 8)}...${str.slice(-4)}`;
}

function ensureProfileRoleBadge() {
    const nameEl = document.getElementById('profile-email-display');
    if (!nameEl || !nameEl.parentElement) return null;

    let badge = document.getElementById('profile-role-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'profile-role-badge';
        badge.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'padding:2px 8px',
            'border-radius:999px',
            'font-size:10px',
            'font-weight:700',
            'flex-shrink:0'
        ].join(';');
        nameEl.parentElement.appendChild(badge);
    }
    return badge;
}

function renderProfileRoleUi(roleValue) {
    const normalizedRole = String(roleValue || 'user').toLowerCase();
    profileCurrentRole = normalizedRole;
    const isMerchant = normalizedRole === 'merchant';

    const badge = ensureProfileRoleBadge();
    if (badge) {
        if (isMerchant) {
            badge.textContent = '🏪 ผู้ประกอบการ';
            badge.style.background = '#fef08a';
            badge.style.color = '#854d0e';
        } else {
            badge.textContent = 'ผู้ใช้งานทั่วไป';
            badge.style.background = 'rgba(255,255,255,0.22)';
            badge.style.color = '#ffffff';
        }
    }

    const merchantMenuRow = document.querySelector('[onclick*="openMerchantRequestModal"]');
    if (merchantMenuRow) {
        const titleDiv = merchantMenuRow.querySelector('div > div:first-child');
        const subDiv = merchantMenuRow.querySelector('div > div:nth-child(2)');
        const actionSpan = merchantMenuRow.lastElementChild;

        if (isMerchant) {
            if (titleDiv) titleDiv.textContent = 'สถานะผู้ประกอบการ / ติดต่อทีมงาน';
            if (subDiv) subDiv.textContent = 'บัญชีของคุณได้รับสิทธิ์ผู้ประกอบการแล้ว สามารถส่งคำขอหรือติดต่อเพิ่มเติมได้';
            if (actionSpan) actionSpan.textContent = 'ติดต่อ ›';
        } else {
            if (titleDiv) titleDiv.textContent = 'สมัครเป็นผู้ประกอบการ / ติดต่อทีมงาน';
            if (subDiv) subDiv.textContent = 'ขอเปิดสิทธิ์ร้านค้า สร้างแคมเปญ และแจ้ง User ID ยืนยันตัวตน';
            if (actionSpan) actionSpan.textContent = 'สมัคร ›';
        }
    }
}

async function resolveProfileUser() {
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.id) {
        return currentUser;
    }

    const client = getProfileClient();
    if (!client || !client.auth) return null;

    try {
        const { data, error } = await client.auth.getSession();
        if (error) return null;
        if (data?.session?.user) {
            if (typeof currentUser !== 'undefined') {
                currentUser = data.session.user;
            }
            return data.session.user;
        }
    } catch (err) {
        console.warn('Error resolving profile user:', err);
    }
    return null;
}

async function loadProfileModuleData() {
    const user = await resolveProfileUser();
    const client = getProfileClient();

    const nameEl = document.getElementById('profile-email-display');
    const uidEl = document.getElementById('profile-userid-display');

    if (!user || !user.id) {
        profileFullUserId = '';
        if (uidEl) uidEl.textContent = 'ID: ยังไม่ได้ล็อกอิน';
        renderProfileRoleUi('user');
        return;
    }

    profileFullUserId = String(user.id);
    if (uidEl) {
        uidEl.textContent = `ID: ${formatShortUserId(profileFullUserId)}`;
        uidEl.title = profileFullUserId;
    }

    let displayName =
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        (user.email ? user.email.split('@')[0] : 'ผู้ใช้งาน');

    let roleVal = 'user';

    if (client) {
        try {
            const { data: profileRow, error } = await client
                .from('profiles')
                .select('display_name, role, points')
                .eq('id', user.id)
                .maybeSingle();

            if (!error && profileRow) {
                if (profileRow.display_name && String(profileRow.display_name).trim() !== '') {
                    displayName = String(profileRow.display_name).trim();
                }
                if (profileRow.role && String(profileRow.role).trim() !== '') {
                    roleVal = String(profileRow.role).trim();
                }
                if (typeof profileRow.points === 'number') {
                    const ptsEl = document.getElementById('user-points-val');
                    if (ptsEl) ptsEl.textContent = `${profileRow.points} Points`;
                }
            }
        } catch (err) {
            console.warn('Unable to fetch profile data:', err);
        }
    }

    profileCurrentDisplayName = displayName;
    if (nameEl) {
        nameEl.textContent = profileCurrentDisplayName;
    }
    renderProfileRoleUi(roleVal);
}

async function copyCurrentUserId() {
    const user = await resolveProfileUser();
    const uid = profileFullUserId || user?.id || '';
    if (!uid) {
        notifyProfile('⚠️ ไม่พบ User ID กรุณาล็อกอินก่อนครับ');
        return;
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(uid);
            notifyProfile('✅ คัดลอก User ID เรียบร้อยแล้ว');
            return;
        }
    } catch (_) {
        // Fallback ด้านล่าง
    }

    const tempInput = document.createElement('input');
    tempInput.value = uid;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    notifyProfile('✅ คัดลอก User ID เรียบร้อยแล้ว');
}

function ensureProfileModalOverlay() {
    let modal = document.getElementById('profile-dynamic-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'profile-dynamic-modal';
        modal.style.cssText = [
            'position:fixed',
            'inset:0',
            'background:rgba(0,0,0,0.55)',
            'display:none',
            'align-items:center',
            'justify-content:center',
            'padding:16px',
            'z-index:9999'
        ].join(';');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeProfileModal();
        });
        document.body.appendChild(modal);
    }
    return modal;
}

function closeProfileModal() {
    const modal = document.getElementById('profile-dynamic-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.innerHTML = '';
    }
}

// Modal แก้ไขชื่อที่แสดงผล (display_name)
async function openEditDisplayNameModal() {
    await loadProfileModuleData();
    const modal = ensureProfileModalOverlay();

    modal.innerHTML = `
    <div style="background:#fff; width:100%; max-width:380px; border-radius:20px; padding:20px; box-shadow:0 12px 30px rgba(0,0,0,0.2);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0; font-size:16px; color:#111827;">✏️ แก้ไขชื่อที่แสดง</h3>
        <button type="button" onclick="closeProfileModal()" style="background:none; border:none; font-size:18px; color:#6b7280; cursor:pointer;">✕</button>
      </div>
      <p style="margin:0 0 12px 0; font-size:12px; color:#6b7280;">ตั้งชื่อเล่นหรือชื่อที่อยากให้แสดงในแอป แทนการใช้อีเมล</p>
      <input id="input-edit-display-name" type="text" maxlength="40" value="${escapeProfileHtml(profileCurrentDisplayName)}"
        placeholder="กรอกชื่อที่ต้องการแสดง"
        style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #d1d5db; border-radius:12px; font-size:14px; margin-bottom:14px;" />
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button type="button" onclick="closeProfileModal()" style="padding:9px 14px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; color:#374151; font-weight:600; cursor:pointer;">ยกเลิก</button>
        <button type="button" onclick="saveDisplayName()" style="padding:9px 16px; border-radius:10px; border:none; background:#16a34a; color:#fff; font-weight:700; cursor:pointer;">บันทึกชื่อ</button>
      </div>
    </div>
  `;
    modal.style.display = 'flex';
}

async function saveDisplayName() {
    const input = document.getElementById('input-edit-display-name');
    const nextName = (input?.value || '').trim();

    if (!nextName) {
        notifyProfile('⚠️ กรุณากรอกชื่อที่แสดงก่อนครับ');
        return;
    }

    const user = await resolveProfileUser();
    const client = getProfileClient();
    if (!user || !user.id) {
        notifyProfile('⚠️ กรุณาล็อกอินก่อนเปลี่ยนชื่อครับ');
        return;
    }

    try {
        if (client) {
            const { error } = await client
                .from('profiles')
                .upsert({ id: user.id, display_name: nextName }, { onConflict: 'id' });

            if (error) throw error;
        }

        profileCurrentDisplayName = nextName;
        const nameEl = document.getElementById('profile-email-display');
        if (nameEl) nameEl.textContent = nextName;

        closeProfileModal();
        notifyProfile('✅ บันทึกชื่อที่แสดงเรียบร้อยแล้ว');
    } catch (err) {
        console.error('Error saving display_name:', err);
        notifyProfile('❌ ไม่สามารถบันทึกชื่อได้: ' + (err.message || 'เกิดข้อผิดพลาด'));
    }
}

async function fetchLatestMerchantRequest(client, userId) {
    if (!client || !userId) return null;
    try {
        const { data, error } = await client
            .from('merchant_requests')
            .select('id, shop_name, status, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!error && data) return data;
    } catch (err) {
        console.warn('Unable to fetch latest merchant request:', err);
    }
    return null;
}

// Modal สมัครเป็นผู้ประกอบการ / ติดต่อทีมงาน พร้อมแนบ User ID คัดกรองเบื้องต้น
async function openMerchantRequestModal() {
    await loadProfileModuleData();
    const user = await resolveProfileUser();
    const client = getProfileClient();
    const latestReq = (user?.id && client) ? await fetchLatestMerchantRequest(client, user.id) : null;

    const modal = ensureProfileModalOverlay();
    const uidText = profileFullUserId || 'ยังไม่ได้ล็อกอิน';

    const statusLabelMap = {
        pending: '⏳ รอตรวจสอบ',
        reviewing: '🔍 กำลังพิจารณา',
        approved: '✅ อนุมัติแล้ว',
        rejected: '❌ ไม่ผ่านเกณฑ์'
    };

    const latestStatusBanner = latestReq
        ? `<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:9px 12px; margin-bottom:12px; font-size:11px; color:#334155;">
         คำขอล่าสุด: <strong>${escapeProfileHtml(latestReq.shop_name)}</strong> — <span>${escapeProfileHtml(statusLabelMap[latestReq.status] || latestReq.status)}</span>
       </div>`
        : '';

    modal.innerHTML = `
    <div style="background:#fff; width:100%; max-width:420px; max-height:90vh; overflow-y:auto; border-radius:20px; padding:20px; box-shadow:0 12px 30px rgba(0,0,0,0.22);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h3 style="margin:0; font-size:16px; color:#111827;">🏪 สมัครเป็นผู้ประกอบการ / ติดต่อทีมงาน</h3>
        <button type="button" onclick="closeProfileModal()" style="background:none; border:none; font-size:18px; color:#6b7280; cursor:pointer;">✕</button>
      </div>

      ${latestStatusBanner}

      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:10px 12px; margin-bottom:12px;">
        <div style="font-size:11px; color:#166534; font-weight:700;">User ID สำหรับยืนยันตัวตน</div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:4px;">
          <code style="font-size:11px; color:#14532d; word-break:break-all;">${escapeProfileHtml(uidText)}</code>
          <button type="button" onclick="copyCurrentUserId()" style="background:#16a34a; color:#fff; border:none; border-radius:8px; padding:4px 8px; font-size:11px; font-weight:700; cursor:pointer; flex-shrink:0;">คัดลอก</button>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:4px;">ชื่อร้านค้า / กิจการ *</label>
          <input id="merchant-req-shop-name" type="text" placeholder="เช่น คาเฟ่บ้านค่าย / ร้านอาหาร..."
            style="width:100%; box-sizing:border-box; padding:9px 12px; border:1px solid #d1d5db; border-radius:10px; font-size:13px;" />
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:4px;">ประเภทธุรกิจ / พื้นที่ตั้ง</label>
          <input id="merchant-req-category" type="text" placeholder="เช่น อาหารและเครื่องดื่ม / อ.บ้านค่าย ระยอง"
            style="width:100%; box-sizing:border-box; padding:9px 12px; border:1px solid #d1d5db; border-radius:10px; font-size:13px;" />
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:4px;">เบอร์โทร หรือ LINE ID สำหรับติดต่อกลับ *</label>
          <input id="merchant-req-contact" type="text" placeholder="กรอกเบอร์โทร หรือ LINE ID"
            style="width:100%; box-sizing:border-box; padding:9px 12px; border:1px solid #d1d5db; border-radius:10px; font-size:13px;" />
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:4px;">วัตถุประสงค์ / รายละเอียดแคมเปญที่สนใจ</label>
          <textarea id="merchant-req-note" rows="3" placeholder="เช่น ขอเปิดสิทธิ์ผู้ประกอบการเพื่อสร้างคูปองส่วนลด หรือสอบถามเงื่อนไขแคมเปญ"
            style="width:100%; box-sizing:border-box; padding:9px 12px; border:1px solid #d1d5db; border-radius:10px; font-size:13px; resize:vertical;"></textarea>
        </div>
      </div>

      <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end;">
        <button type="button" onclick="copyMerchantRequestSummary()"
          style="padding:9px 12px; border-radius:10px; border:1px solid #d1d5db; background:#f9fafb; color:#374151; font-size:12px; font-weight:700; cursor:pointer;">📋 คัดลอกข้อความส่งแชต</button>
        <button type="button" onclick="submitMerchantRequest()"
          style="padding:9px 16px; border-radius:10px; border:none; background:#16a34a; color:#fff; font-size:12px; font-weight:700; cursor:pointer;">ส่งคำขอ</button>
      </div>
    </div>
  `;
    modal.style.display = 'flex';
}

function buildMerchantRequestSummaryText() {
    const shopName = (document.getElementById('merchant-req-shop-name')?.value || '').trim();
    const category = (document.getElementById('merchant-req-category')?.value || '').trim();
    const contact = (document.getElementById('merchant-req-contact')?.value || '').trim();
    const note = (document.getElementById('merchant-req-note')?.value || '').trim();

    return [
        'คำขอสิทธิ์ผู้ประกอบการ / ติดต่อทีมงาน',
        `User ID: ${profileFullUserId || '-'}`,
        `ชื่อที่แสดง: ${profileCurrentDisplayName || '-'}`,
        `สถานะปัจจุบัน: ${profileCurrentRole}`,
        `ชื่อร้าน: ${shopName || '-'}`,
        `ประเภท/พื้นที่: ${category || '-'}`,
        `ช่องทางติดต่อ: ${contact || '-'}`,
        `รายละเอียด: ${note || '-'}`
    ].join('\n');
}

async function copyMerchantRequestSummary() {
    const summary = buildMerchantRequestSummaryText();
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(summary);
            notifyProfile('✅ คัดลอกข้อมูลคำขอสำหรับส่งให้ทีมงานแล้ว');
            return;
        }
    } catch (_) {
        // Fallback ด้านล่าง
    }

    const area = document.createElement('textarea');
    area.value = summary;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    document.body.removeChild(area);
    notifyProfile('✅ คัดลอกข้อมูลคำขอสำหรับส่งให้ทีมงานแล้ว');
}

async function submitMerchantRequest() {
    const shopName = (document.getElementById('merchant-req-shop-name')?.value || '').trim();
    const category = (document.getElementById('merchant-req-category')?.value || '').trim();
    const contact = (document.getElementById('merchant-req-contact')?.value || '').trim();
    const note = (document.getElementById('merchant-req-note')?.value || '').trim();

    if (!shopName || !contact) {
        notifyProfile('⚠️ กรุณากรอกชื่อร้านค้าและช่องทางติดต่อกลับด้วยครับ');
        return;
    }

    const user = await resolveProfileUser();
    const client = getProfileClient();

    if (!client || !user || !user.id) {
        notifyProfile('⚠️ กรุณาล็อกอินก่อนส่งคำขอครับ');
        return;
    }

    try {
        const { error } = await client
            .from('merchant_requests')
            .insert([{
                user_id: user.id,
                display_name: profileCurrentDisplayName || null,
                shop_name: shopName,
                category_area: category || null,
                contact_info: contact,
                note: note || null,
                status: 'pending'
            }]);

        if (error) throw error;

        closeProfileModal();
        notifyProfile('✅ ส่งคำขอเรียบร้อยแล้ว ทีมงานจะตรวจสอบ User ID และติดต่อกลับครับ');
    } catch (err) {
        console.error('Error inserting merchant_requests:', err);
        notifyProfile('❌ ส่งคำขอไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด'));
    }
}

// ฟังก์ชันรองรับการเปิดหน้าโปรไฟล์และปุ่มตั้งค่าเดิม หากยังไม่ได้ผูกไว้ที่อื่น
document.addEventListener('DOMContentLoaded', () => {
    loadProfileModuleData();
});

document.addEventListener('click', (e) => {
    const navTarget = e.target.closest('[onclick*="screen-profile"], [data-screen="screen-profile"]');
    if (navTarget) {
        setTimeout(() => loadProfileModuleData(), 50);
    }
});

if (typeof window.openPrivacyZoneModal !== 'function') {
    window.openPrivacyZoneModal = function () {
        notifyProfile('🛡️ เมนูตั้งค่า Privacy Zone สามารถปรับแต่งเพิ่มเติมได้ในหน้าตั้งค่าพื้นที่ส่วนตัวครับ');
    };
}

if (typeof window.openMusicModal !== 'function') {
    window.openMusicModal = function () {
        notifyProfile('🎵 เมนูตั้งค่าแอปเพลงหลัก พร้อมรองรับการเชื่อมต่อแอปฟังเพลงของคุณ');
    };
}

if (typeof window.showHowToPlayModal !== 'function') {
    window.showHowToPlayModal = function () {
        notifyProfile('🗺️ เดินทางเช็กอิน เก็บแต้ม และนำแต้มไปแลกรับสิทธิ์แคมเปญในหน้าสิทธิประโยชน์ได้เลยครับ');
    };
}