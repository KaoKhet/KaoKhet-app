// ==========================================
// 👥 friendModule.js — ระบบเพื่อน (เฟส 1: ค้นหา ID/รหัสเพื่อน, QR Code, คำขอเพื่อน) + โอนคูปองหน้าร้านให้เพื่อน
// ==========================================

let cachedAcceptedFriends = [];
let cachedPendingRequests = [];
let currentFriendTab = 'friends'; // 'friends' | 'requests' | 'add'
let activeTransferCoupon = null;
let friendQrScannerStream = null;
let friendQrScanTimer = null;

function getFriendClient() {
    return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
}

function escapeFriendHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function resolveFriendUserId() {
    const client = getFriendClient();
    if (typeof currentUser !== 'undefined' && currentUser?.id) return currentUser.id;
    if (typeof ensureCurrentUser === 'function') {
        try {
            await ensureCurrentUser();
            if (typeof currentUser !== 'undefined' && currentUser?.id) return currentUser.id;
        } catch (_) { }
    }
    if (client?.auth) {
        try {
            const { data } = await client.auth.getSession();
            return data?.session?.user?.id || null;
        } catch (_) { }
    }
    return null;
}

function extractProfileLabel(profile, fallbackId = '') {
    if (!profile) return fallbackId ? `ผู้ใช้ ${String(fallbackId).slice(0, 6)}` : 'ผู้ใช้งาน KaoKhet';
    return (
        profile.display_name ||
        profile.full_name ||
        profile.username ||
        (profile.email ? profile.email.split('@')[0] : null) ||
        (profile.friend_code ? `รหัส ${profile.friend_code}` : null) ||
        `ผู้ใช้ ${String(profile.id || fallbackId).slice(0, 6)}`
    );
}

// ==========================================
// 1. ดึงข้อมูลเพื่อนและคำขอเพื่อน
// ==========================================
async function refreshFriendLists() {
    const client = getFriendClient();
    const myId = await resolveFriendUserId();
    if (!client || !myId) {
        cachedAcceptedFriends = [];
        cachedPendingRequests = [];
        updateFriendRequestBadges();
        return;
    }

    try {
        const { data: rows, error } = await client
            .from('friendships')
            .select('*')
            .or(`user_id.eq.${myId},friend_id.eq.${myId}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const allRows = Array.isArray(rows) ? rows : [];
        const otherIds = [...new Set(
            allRows.map((r) => (r.user_id === myId ? r.friend_id : r.user_id)).filter(Boolean)
        )];

        let profileMap = {};
        if (otherIds.length > 0) {
            const { data: profiles } = await client
                .from('profiles')
                .select('*')
                .in('id', otherIds);

            (profiles || []).forEach((p) => {
                profileMap[p.id] = p;
            });
        }

        cachedAcceptedFriends = allRows
            .filter((r) => r.status === 'accepted')
            .map((r) => {
                const otherId = r.user_id === myId ? r.friend_id : r.user_id;
                const prof = profileMap[otherId] || { id: otherId };
                return {
                    friendshipId: r.id,
                    friendUserId: otherId,
                    name: extractProfileLabel(prof, otherId),
                    friendCode: prof.friend_code || String(otherId).replace(/-/g, '').slice(0, 8).toUpperCase(),
                    avatarUrl: prof.avatar_url || prof.avatar || null,
                    since: r.updated_at || r.created_at
                };
            });

        // คำขอที่ส่งเข้ามาหาเราและยังรอตอบรับ
        cachedPendingRequests = allRows
            .filter((r) => r.status === 'pending' && r.friend_id === myId)
            .map((r) => {
                const prof = profileMap[r.user_id] || { id: r.user_id };
                return {
                    friendshipId: r.id,
                    senderId: r.user_id,
                    name: extractProfileLabel(prof, r.user_id),
                    friendCode: prof.friend_code || String(r.user_id).replace(/-/g, '').slice(0, 8).toUpperCase(),
                    createdAt: r.created_at
                };
            });

        updateFriendRequestBadges();
    } catch (err) {
        console.error('Error refreshing friend lists:', err);
    }
}

function updateFriendRequestBadges() {
    const count = cachedPendingRequests.length;
    document.querySelectorAll('[data-friend-req-badge]').forEach((el) => {
        if (count > 0) {
            el.textContent = count > 99 ? '99+' : String(count);
            el.style.display = 'inline-flex';
        } else {
            el.style.display = 'none';
        }
    });
}

// ==========================================
// 2. หน้าต่างจัดการเพื่อน (รายชื่อเพื่อน / คำขอ / QR & ค้นหาแอดเพื่อน)
// ==========================================
function ensureFriendsModalDom() {
    let modal = document.getElementById('friends-hub-modal');
    if (modal) {
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        return modal;
    }

    modal = document.createElement('div');
    modal.id = 'friends-hub-modal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(17,24,39,0.65); z-index:99998; align-items:center; justify-content:center; padding:16px;';
    modal.innerHTML = `
        <div style="background:#ffffff; width:100%; max-width:420px; max-height:85vh; border-radius:24px; padding:20px; box-shadow:0 20px 45px rgba(0,0,0,0.22); display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f3f4f6; padding-bottom:12px; margin-bottom:12px;">
                <h3 style="margin:0; font-size:16px; font-weight:700; color:#111827;">👥 เพื่อน & เพิ่มเพื่อน</h3>
                <button type="button" onclick="closeFriendsModal()"
                    style="background:#f3f4f6; border:none; width:30px; height:30px; border-radius:50%; font-size:16px; font-weight:700; cursor:pointer; color:#374151;">×</button>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:12px;">
                <button type="button" id="ftab-friends" onclick="switchFriendTab('friends')"
                    style="flex:1; padding:8px 6px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                    เพื่อนของฉัน
                </button>
                <button type="button" id="ftab-requests" onclick="switchFriendTab('requests')"
                    style="flex:1; padding:8px 6px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer; position:relative;">
                    คำขอแอด <span data-friend-req-badge style="display:none; background:#ef4444; color:#fff; font-size:10px; padding:1px 6px; border-radius:999px; margin-left:3px;">0</span>
                </button>
                <button type="button" id="ftab-add" onclick="switchFriendTab('add')"
                    style="flex:1; padding:8px 6px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                    + เพิ่มเพื่อน / QR
                </button>
            </div>

            <div id="friends-hub-body" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px;"></div>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeFriendsModal();
    });

    document.body.appendChild(modal);
    return modal;
}

async function openFriendsModal(initialTab = 'friends') {
    const modal = ensureFriendsModalDom();
    modal.style.display = 'flex';
    currentFriendTab = ['friends', 'requests', 'add'].includes(initialTab) ? initialTab : 'friends';
    await refreshFriendLists();
    renderFriendsHubBody();
}

function closeFriendsModal() {
    stopFriendQrScanner();
    const modal = document.getElementById('friends-hub-modal');
    if (modal) modal.style.display = 'none';
}

function switchFriendTab(tabName) {
    stopFriendQrScanner();
    currentFriendTab = tabName;
    renderFriendsHubBody();
}

async function renderFriendsHubBody() {
    const body = document.getElementById('friends-hub-body');
    if (!body) return;

    ['friends', 'requests', 'add'].forEach((t) => {
        const btn = document.getElementById(`ftab-${t}`);
        if (!btn) return;
        if (currentFriendTab === t) {
            btn.style.background = '#16a34a';
            btn.style.color = '#ffffff';
            btn.style.border = '1px solid #16a34a';
        } else {
            btn.style.background = '#f3f4f6';
            btn.style.color = '#4b5563';
            btn.style.border = '1px solid #e5e7eb';
        }
    });

    if (currentFriendTab === 'friends') {
        if (cachedAcceptedFriends.length === 0) {
            body.innerHTML = `
                <div style="text-align:center; padding:30px 14px; background:#f9fafb; border:1px dashed #e5e7eb; border-radius:14px;">
                    <div style="font-size:28px; margin-bottom:6px;">🤝</div>
                    <div style="font-size:13px; font-weight:700; color:#374151; margin-bottom:4px;">ยังไม่มีรายชื่อเพื่อน</div>
                    <div style="font-size:12px; color:#6b7280; margin-bottom:12px;">เพิ่มเพื่อนด้วยรหัสเพื่อนหรือสแกน QR Code เพื่อโอนคูปองหน้าร้านให้กันได้</div>
                    <button type="button" onclick="switchFriendTab('add')"
                        style="background:#16a34a; color:#fff; border:none; padding:8px 14px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                        + เพิ่มเพื่อนเลย
                    </button>
                </div>
            `;
            return;
        }

        body.innerHTML = cachedAcceptedFriends.map((f) => `
            <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:11px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <div style="width:38px; height:38px; border-radius:999px; background:#dcfce7; color:#15803d; font-weight:700; font-size:15px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        ${escapeFriendHtml(f.name.charAt(0).toUpperCase())}
                    </div>
                    <div style="min-width:0;">
                        <div style="font-size:13px; font-weight:700; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeFriendHtml(f.name)}
                        </div>
                        <div style="font-size:11px; color:#6b7280;">รหัสเพื่อน: ${escapeFriendHtml(f.friendCode)}</div>
                    </div>
                </div>
                <span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; font-size:11px; font-weight:700; padding:4px 9px; border-radius:999px; flex-shrink:0;">
                    ✓ เพื่อน
                </span>
            </div>
        `).join('');
        return;
    }

    if (currentFriendTab === 'requests') {
        if (cachedPendingRequests.length === 0) {
            body.innerHTML = `
                <div style="text-align:center; padding:30px 14px; background:#f9fafb; border:1px dashed #e5e7eb; border-radius:14px; color:#6b7280; font-size:13px;">
                    📭 ไม่มีคำขอเป็นเพื่อนที่รอตอบรับ
                </div>
            `;
            return;
        }

        body.innerHTML = cachedPendingRequests.map((req) => `
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:12px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="min-width:0;">
                    <div style="font-size:13px; font-weight:700; color:#111827;">${escapeFriendHtml(req.name)}</div>
                    <div style="font-size:11px; color:#4b5563;">รหัส: ${escapeFriendHtml(req.friendCode)}</div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button type="button" onclick="respondFriendRequest('${escapeFriendHtml(req.friendshipId)}', true)"
                        style="background:#16a34a; color:#fff; border:none; padding:6px 11px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                        รับแอด
                    </button>
                    <button type="button" onclick="respondFriendRequest('${escapeFriendHtml(req.friendshipId)}', false)"
                        style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:6px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                        ปฏิเสธ
                    </button>
                </div>
            </div>
        `).join('');
        return;
    }

    // แท็บ: เพิ่มเพื่อน / QR Code
    const client = getFriendClient();
    const myId = await resolveFriendUserId();
    let myFriendCode = myId ? String(myId).replace(/-/g, '').slice(0, 8).toUpperCase() : '';

    if (client && myId) {
        try {
            const { data: myProf } = await client.from('profiles').select('friend_code').eq('id', myId).single();
            if (myProf?.friend_code) myFriendCode = myProf.friend_code;
        } catch (_) { }
    }

    const qrPayload = encodeURIComponent(`KAOKHET_FRIEND:${myId || ''}`);
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${qrPayload}`;

    body.innerHTML = `
        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:14px; padding:12px;">
            <div style="font-size:12px; font-weight:700; color:#111827; margin-bottom:6px;">🔎 ค้นหาด้วยรหัสเพื่อน หรือ User ID</div>
            <div style="display:flex; gap:6px;">
                <input id="friend-search-input" type="text" placeholder="กรอกรหัสเพื่อน 8 หลัก หรือ User ID"
                    style="flex:1; padding:9px 11px; border-radius:10px; border:1px solid #d1d5db; font-size:12px; outline:none;" />
                <button type="button" onclick="searchAndSendFriendRequest()"
                    style="background:#16a34a; color:#fff; border:none; padding:9px 14px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;">
                    ส่งคำขอ
                </button>
            </div>
            <div id="friend-search-feedback" style="font-size:11px; margin-top:6px; color:#4b5563;"></div>
        </div>

        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:14px; padding:14px; text-align:center;">
            <div style="font-size:12px; font-weight:700; color:#166534; margin-bottom:8px;">📲 QR Code ส่วนตัวของฉัน</div>
            <img src="${qrImageUrl}" alt="My Friend QR"
                style="width:155px; height:155px; border-radius:12px; background:#fff; padding:8px; border:1px solid #dcfce7; margin:0 auto 8px; display:block;" />
            <div style="font-size:12px; font-weight:700; color:#111827; margin-bottom:6px;">
                รหัสเพื่อนของคุณ: <span style="color:#16a34a;">${escapeFriendHtml(myFriendCode)}</span>
            </div>
            <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                <button type="button" onclick="copyMyFriendCode('${escapeFriendHtml(myFriendCode)}')"
                    style="background:#ffffff; color:#15803d; border:1px solid #bbf7d0; padding:6px 12px; border-radius:9px; font-size:11px; font-weight:700; cursor:pointer;">
                    📋 คัดลอกรหัส
                </button>
                <button type="button" onclick="startFriendQrScanner()"
                    style="background:#16a34a; color:#ffffff; border:none; padding:6px 12px; border-radius:9px; font-size:11px; font-weight:700; cursor:pointer;">
                    📷 เปิดกล้องสแกน QR
                </button>
            </div>
            <div id="friend-qr-scanner-box" style="display:none; margin-top:10px;">
                <video id="friend-qr-video" playsinline style="width:100%; max-height:210px; border-radius:12px; background:#000; object-fit:cover;"></video>
                <button type="button" onclick="stopFriendQrScanner()"
                    style="margin-top:6px; background:#ef4444; color:#fff; border:none; padding:5px 12px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                    ปิดกล้อง
                </button>
            </div>
        </div>
    `;
}

function copyMyFriendCode(code) {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    if (typeof showToast === 'function') showToast(`📋 คัดลอกรหัสเพื่อน ${code} แล้ว`);
}

async function searchAndSendFriendRequest(rawInputOverride = null) {
    const client = getFriendClient();
    const myId = await resolveFriendUserId();
    const inputEl = document.getElementById('friend-search-input');
    const feedbackEl = document.getElementById('friend-search-feedback');

    const rawVal = (rawInputOverride ?? inputEl?.value ?? '').trim();
    if (!client || !myId) return;
    if (!rawVal) {
        if (feedbackEl) feedbackEl.innerHTML = '<span style="color:#dc2626;">กรุณากรอกรหัสเพื่อนหรือ User ID</span>';
        return;
    }

    const cleanedCode = rawVal.replace(/^KAOKHET_FRIEND:/i, '').trim();

    try {
        if (feedbackEl) feedbackEl.innerHTML = '<span style="color:#4b5563;">⏳ กำลังค้นหาผู้ใช้...</span>';

        let targetProfile = null;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanedCode);

        if (isUuid) {
            const { data } = await client.from('profiles').select('*').eq('id', cleanedCode).maybeSingle();
            targetProfile = data;
        } else {
            const { data } = await client.from('profiles').select('*').eq('friend_code', cleanedCode.toUpperCase()).maybeSingle();
            targetProfile = data;
        }

        if (!targetProfile) {
            if (feedbackEl) feedbackEl.innerHTML = '<span style="color:#dc2626;">❌ ไม่พบผู้ใช้จากรหัสนี้</span>';
            return;
        }

        if (targetProfile.id === myId) {
            if (feedbackEl) feedbackEl.innerHTML = '<span style="color:#dc2626;">⚠️ ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้</span>';
            return;
        }

        const { data: existing } = await client
            .from('friendships')
            .select('*')
            .or(`and(user_id.eq.${myId},friend_id.eq.${targetProfile.id}),and(user_id.eq.${targetProfile.id},friend_id.eq.${myId})`)
            .maybeSingle();

        if (existing) {
            if (existing.status === 'accepted') {
                if (feedbackEl) feedbackEl.innerHTML = '<span style="color:#16a34a;">✓ คุณเป็นเพื่อนกับผู้ใช้นี้แล้ว</span>';
                return;
            }
            if (existing.status === 'pending') {
                if (feedbackEl) feedbackEl.innerHTML = '<span style="color:#d97706;">⏳ มีคำขอเป็นเพื่อนค้างอยู่แล้ว</span>';
                return;
            }
        }

        const { error: insertErr } = await client.from('friendships').insert({
            user_id: myId,
            friend_id: targetProfile.id,
            status: 'pending'
        });

        if (insertErr) throw insertErr;

        // ส่งแจ้งเตือนเข้ากล่องจดหมายผู้รับคำขอ
        await client.from('notifications').insert({
            user_id: targetProfile.id,
            title: '👥 มีคำขอเป็นเพื่อนใหม่',
            message: 'มีผู้เล่นส่งคำขอเป็นเพื่อนถึงคุณ เปิดหน้า "เพื่อน & เพิ่มเพื่อน" เพื่อกดตอบรับได้เลย',
            is_read: false
        });

        const targetName = extractProfileLabel(targetProfile);
        if (inputEl) inputEl.value = '';
        if (feedbackEl) {
            feedbackEl.innerHTML = `<span style="color:#16a34a; font-weight:700;">✅ ส่งคำขอเป็นเพื่อนถึง ${escapeFriendHtml(targetName)} เรียบร้อยแล้ว</span>`;
        }
        if (typeof showToast === 'function') showToast(`✅ ส่งคำขอเป็นเพื่อนถึง ${targetName} แล้ว`);
    } catch (err) {
        console.error('Error sending friend request:', err);
        if (feedbackEl) feedbackEl.innerHTML = `<span style="color:#dc2626;">❌ ส่งคำขอไม่สำเร็จ: ${escapeFriendHtml(err.message)}</span>`;
    }
}

async function respondFriendRequest(friendshipId, accept) {
    const client = getFriendClient();
    if (!client || !friendshipId) return;

    try {
        if (accept) {
            const { error } = await client
                .from('friendships')
                .update({ status: 'accepted', updated_at: new Date().toISOString() })
                .eq('id', friendshipId);
            if (error) throw error;
            if (typeof showToast === 'function') showToast('🤝 รับเป็นเพื่อนเรียบร้อยแล้ว!');
        } else {
            const { error } = await client
                .from('friendships')
                .delete()
                .eq('id', friendshipId);
            if (error) throw error;
            if (typeof showToast === 'function') showToast('ปฏิเสธคำขอเป็นเพื่อนแล้ว');
        }

        await refreshFriendLists();
        renderFriendsHubBody();
    } catch (err) {
        console.error('Error responding friend request:', err);
        if (typeof showToast === 'function') showToast('❌ ดำเนินการไม่สำเร็จ: ' + (err.message || ''));
    }
}

async function startFriendQrScanner() {
    const box = document.getElementById('friend-qr-scanner-box');
    const video = document.getElementById('friend-qr-video');
    if (!box || !video) return;

    if (!('BarcodeDetector' in window)) {
        if (typeof showToast === 'function') {
            showToast('⚠️ อุปกรณ์นี้ยังไม่รองรับสแกน QR ผ่านเบราว์เซอร์โดยตรง กรุณาใช้รหัสเพื่อน 8 หลักแทน');
        }
        return;
    }

    try {
        box.style.display = 'block';
        friendQrScannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = friendQrScannerStream;
        await video.play();

        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        friendQrScanTimer = setInterval(async () => {
            if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
            try {
                const barcodes = await detector.detect(video);
                if (barcodes && barcodes.length > 0) {
                    const rawValue = barcodes[0].rawValue || '';
                    stopFriendQrScanner();
                    await searchAndSendFriendRequest(rawValue);
                }
            } catch (_) { }
        }, 500);
    } catch (err) {
        stopFriendQrScanner();
        if (typeof showToast === 'function') showToast('❌ ไม่สามารถเปิดกล้องได้: ' + (err.message || ''));
    }
}

function stopFriendQrScanner() {
    if (friendQrScanTimer) {
        clearInterval(friendQrScanTimer);
        friendQrScanTimer = null;
    }
    if (friendQrScannerStream) {
        friendQrScannerStream.getTracks().forEach((t) => t.stop());
        friendQrScannerStream = null;
    }
    const box = document.getElementById('friend-qr-scanner-box');
    if (box) box.style.display = 'none';
}

// ==========================================
// 3. หน้าต่างเลือกคูปอง & รายชื่อเพื่อนตอนกดส่งของขวัญคูปองหน้าร้าน
// ==========================================
async function fetchTransferableStoreCoupons() {
    const client = getFriendClient();
    const myId = await resolveFriendUserId();
    if (!client || !myId) return { transferable: [], alreadyTransferredCount: 0 };

    const { data: rows, error } = await client
        .from('user_coupons')
        .select('id, coupon_code, is_redeemed, created_at, campaign_id, transfer_count, transferred_from')
        .eq('user_id', myId)
        .eq('is_redeemed', false)
        .order('created_at', { ascending: false });

    if (error) throw error;
    const rawCoupons = Array.isArray(rows) ? rows : [];
    if (rawCoupons.length === 0) return { transferable: [], alreadyTransferredCount: 0 };

    const campaignIds = [...new Set(rawCoupons.map((c) => c.campaign_id).filter(Boolean))];
    let campaignMap = new Map();

    if (campaignIds.length > 0) {
        const { data: campaigns, error: campErr } = await client
            .from('campaigns')
            .select('id, title, reward_details, merchant_name, campaign_type, category')
            .in('id', campaignIds);
        if (campErr) throw campErr;
        (campaigns || []).forEach((c) => campaignMap.set(c.id, c));
    }

    // คัดเฉพาะคูปองหน้าร้านที่ยังไม่ถูกใช้งาน และยังไม่เคยถูกโอนมา (โอนได้ครั้งเดียวต่อใบ)
    const storeCoupons = rawCoupons.filter((uc) => {
        const camp = campaignMap.get(uc.campaign_id) || {};
        const cType = String(camp.campaign_type || '').toLowerCase();
        const cat = String(camp.category || '').toLowerCase();
        const merchant = String(camp.merchant_name || '').toLowerCase();
        const isOnline = cType.startsWith('online_reward') || cat === 'online_reward' || merchant.includes('online reward');
        return !isOnline;
    });

    let alreadyTransferredCount = 0;
    const transferable = [];

    storeCoupons.forEach((uc) => {
        const isAlreadyTransferred = Number(uc.transfer_count || 0) >= 1 || Boolean(uc.transferred_from);
        if (isAlreadyTransferred) {
            alreadyTransferredCount += 1;
            return;
        }

        const camp = campaignMap.get(uc.campaign_id) || {};
        const code = uc.coupon_code || ('KAOKHET-' + String(uc.id || '').slice(0, 6).toUpperCase());
        const title = camp.title || 'คูปองกิจกรรมหน้าร้าน';
        const merchant = (camp.merchant_name && camp.merchant_name.trim()) ? camp.merchant_name : 'ร้านค้าทั่วไป';

        transferable.push({
            id: uc.id,
            code,
            title,
            merchant,
            reward: camp.reward_details || ''
        });
    });

    return { transferable, alreadyTransferredCount };
}

function handleTransferCouponSelectionChange() {
    const selectedCouponRadio = document.querySelector('input[name="transfer-coupon-radio"]:checked');
    const selectedId = selectedCouponRadio?.value;
    const list = Array.isArray(window.__transferableStoreCoupons) ? window.__transferableStoreCoupons : [];
    const found = list.find((item) => String(item.id) === String(selectedId));
    if (found) {
        activeTransferCoupon = { id: found.id, title: found.title, code: found.code, merchant: found.merchant };
    }
}

async function openTransferCouponModal(couponId = null, couponTitle = 'คูปองกิจกรรมหน้าร้าน') {
    await refreshFriendLists();

    let transferableCoupons = [];
    let alreadyTransferredCount = 0;
    try {
        const res = await fetchTransferableStoreCoupons();
        transferableCoupons = res.transferable || [];
        alreadyTransferredCount = res.alreadyTransferredCount || 0;
    } catch (err) {
        console.error('Error loading transferable coupons:', err);
        transferableCoupons = [];
    }
    window.__transferableStoreCoupons = transferableCoupons;

    let initialCoupon = null;
    if (couponId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(couponId).trim())) {
        initialCoupon = transferableCoupons.find((c) => String(c.id) === String(couponId).trim()) || {
            id: String(couponId).trim(),
            title: couponTitle || 'คูปองกิจกรรมหน้าร้าน',
            code: '',
            merchant: ''
        };
    } else if (transferableCoupons.length > 0) {
        initialCoupon = transferableCoupons[0];
    }

    activeTransferCoupon = initialCoupon ? { ...initialCoupon } : null;

    let modal = document.getElementById('transfer-coupon-friend-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'transfer-coupon-friend-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(17,24,39,0.68); z-index:100000; align-items:center; justify-content:center; padding:16px;';
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeTransferCouponModal();
        });
        document.body.appendChild(modal);
    } else if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }

    const couponSelectorHtml = transferableCoupons.length === 0
        ? `
            <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:11px; padding:10px 12px; margin-bottom:12px; font-size:12px; color:#b91c1c; font-weight:600; line-height:1.45;">
                ${alreadyTransferredCount > 0
            ? `🔒 คูปองหน้าร้านในกระเป๋า (${alreadyTransferredCount} ใบ) เคยถูกโอนมาแล้ว ระบบล็อกไม่ให้โอนต่อเป็นทอดที่ 2`
            : 'ไม่มีคูปองหน้าร้านที่พร้อมโอนในกระเป๋าขณะนี้'}
            </div>
        `
        : transferableCoupons.length === 1
            ? `
                <input type="radio" name="transfer-coupon-radio" value="${escapeFriendHtml(transferableCoupons[0].id)}" checked style="display:none;" />
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:11px; padding:9px 12px; margin-bottom:12px; font-size:12px; color:#166534; font-weight:700;">
                    🎟️ ${escapeFriendHtml(transferableCoupons[0].title)}
                    <div style="font-size:11px; font-weight:500; color:#15803d; margin-top:2px;">
                        ${escapeFriendHtml(transferableCoupons[0].merchant)} • รหัส ${escapeFriendHtml(transferableCoupons[0].code)}
                    </div>
                </div>
            `
            : `
                <div style="margin-bottom:12px;">
                    <div style="font-size:12px; font-weight:700; color:#374151; margin-bottom:6px;">
                        🎟️ เลือกคูปองที่จะส่ง (${transferableCoupons.length} ใบในกระเป๋า)
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px; max-height:145px; overflow-y:auto;">
                        ${transferableCoupons.map((c, idx) => {
                const isChecked = activeTransferCoupon
                    ? String(c.id) === String(activeTransferCoupon.id)
                    : idx === 0;
                return `
                                <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1px solid #d1fae5; border-radius:10px; cursor:pointer; background:#f0fdf4;">
                                    <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                                        <input type="radio" name="transfer-coupon-radio" value="${escapeFriendHtml(c.id)}" ${isChecked ? 'checked' : ''} onchange="handleTransferCouponSelectionChange()" style="accent-color:#16a34a;" />
                                        <div style="min-width:0;">
                                            <div style="font-size:12px; font-weight:700; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                                ${escapeFriendHtml(c.title)}
                                            </div>
                                            <div style="font-size:10.5px; color:#4b5563;">
                                                ${escapeFriendHtml(c.merchant)} • ${escapeFriendHtml(c.code)}
                                            </div>
                                        </div>
                                    </div>
                                    <span style="font-size:10.5px; font-weight:700; color:#15803d; flex-shrink:0;">โอนได้</span>
                                </label>
                            `;
            }).join('')}
                    </div>
                </div>
            `;

    const canSubmitTransfer = transferableCoupons.length > 0 && cachedAcceptedFriends.length > 0;

    const friendsOptionsHtml = cachedAcceptedFriends.length === 0
        ? `
            <div style="text-align:center; padding:20px 12px; background:#f9fafb; border:1px dashed #e5e7eb; border-radius:12px;">
                <div style="font-size:13px; font-weight:700; color:#374151; margin-bottom:4px;">คุณยังไม่มีรายชื่อเพื่อน</div>
                <div style="font-size:11px; color:#6b7280; margin-bottom:10px;">ต้องเพิ่มเพื่อนและได้รับการตอบรับก่อนจึงจะโอนคูปองหน้าร้านได้</div>
                <button type="button" onclick="closeTransferCouponModal(); openFriendsModal('add');"
                    style="background:#16a34a; color:#fff; border:none; padding:7px 14px; border-radius:9px; font-size:12px; font-weight:700; cursor:pointer;">
                    + เพิ่มเพื่อนเลย
                </button>
            </div>
        `
        : `
            <div style="display:flex; flex-direction:column; gap:7px; max-height:175px; overflow-y:auto;">
                ${cachedAcceptedFriends.map((f, idx) => `
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border:1px solid #e5e7eb; border-radius:11px; cursor:pointer; background:#ffffff;">
                        <div style="display:flex; align-items:center; gap:9px; min-width:0;">
                            <input type="radio" name="transfer-recipient-radio" value="${escapeFriendHtml(f.friendUserId)}" ${idx === 0 ? 'checked' : ''} style="accent-color:#16a34a;" />
                            <div style="min-width:0;">
                                <div style="font-size:13px; font-weight:700; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                    ${escapeFriendHtml(f.name)}
                                </div>
                                <div style="font-size:11px; color:#6b7280;">รหัสเพื่อน: ${escapeFriendHtml(f.friendCode)}</div>
                            </div>
                        </div>
                        <span style="font-size:11px; color:#16a34a; font-weight:700;">เลือก</span>
                    </label>
                `).join('')}
            </div>

            <div style="margin-top:10px;">
                <label style="display:block; font-size:11px; font-weight:700; color:#374151; margin-bottom:4px;">💬 ข้อความสั้น ๆ ฝากถึงเพื่อน (ไม่บังคับ)</label>
                <input id="transfer-coupon-note-input" type="text" maxlength="120" placeholder="เช่น ฝากไปใช้สิทธิ์แทนหน่อยนะ!"
                    style="width:100%; box-sizing:border-box; padding:9px 11px; border-radius:10px; border:1px solid #d1d5db; font-size:12px; outline:none;" />
            </div>

            <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:9px 11px; margin-top:10px; font-size:11px; color:#92400e; line-height:1.45;">
                ⚠️ เมื่อกดยืนยัน ระบบจะโอนสิทธิ์คูปองนี้เข้ากระเป๋าเพื่อนและส่งแจ้งเตือนเข้ากล่องจดหมายเพื่อนทันที โดยคุณจะไม่สามารถใช้งานคูปองใบนี้ได้อีก
            </div>

            <div style="display:flex; gap:8px; margin-top:12px;">
                <button type="button" onclick="closeTransferCouponModal()"
                    style="flex:1; padding:10px; border-radius:11px; border:1px solid #e5e7eb; background:#f9fafb; color:#374151; font-size:13px; font-weight:700; cursor:pointer;">
                    ยกเลิก
                </button>
                <button type="button" id="confirm-transfer-coupon-btn" onclick="confirmTransferStoreCoupon()" ${canSubmitTransfer ? '' : 'disabled'}
                    style="flex:1.4; padding:10px; border-radius:11px; border:none; background:#16a34a; color:#ffffff; font-size:13px; font-weight:700; cursor:pointer; opacity:${canSubmitTransfer ? '1' : '0.5'};">
                    🎁 ยืนยันโอนสิทธิ์
                </button>
            </div>
        `;

    modal.innerHTML = `
        <div style="background:#ffffff; width:100%; max-width:390px; max-height:90vh; overflow-y:auto; border-radius:22px; padding:20px; box-shadow:0 20px 45px rgba(0,0,0,0.24);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h3 style="margin:0; font-size:15px; font-weight:700; color:#111827;">🎁 ส่งของขวัญคูปองหน้าร้าน</h3>
                <button type="button" onclick="closeTransferCouponModal()"
                    style="background:#f3f4f6; border:none; width:28px; height:28px; border-radius:50%; font-size:15px; font-weight:700; cursor:pointer;">×</button>
            </div>

            ${couponSelectorHtml}

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:12px; font-weight:700; color:#374151;">เลือกเพื่อนผู้รับสิทธิ์</span>
                <button type="button" onclick="closeTransferCouponModal(); openFriendsModal('add');"
                    style="background:none; border:none; color:#16a34a; font-size:11px; font-weight:700; cursor:pointer; padding:0;">
                    + เพิ่มเพื่อน
                </button>
            </div>

            ${friendsOptionsHtml}
        </div>
    `;

    modal.style.display = 'flex';
}

function closeTransferCouponModal() {
    const modal = document.getElementById('transfer-coupon-friend-modal');
    if (modal) modal.style.display = 'none';
    activeTransferCoupon = null;
}

async function confirmTransferStoreCoupon() {
    const client = getFriendClient();
    if (!client) return;

    const selectedCouponRadio = document.querySelector('input[name="transfer-coupon-radio"]:checked');
    const couponId = String(selectedCouponRadio?.value || activeTransferCoupon?.id || '').trim();
    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(couponId);

    if (!isValidUuid) {
        if (typeof showToast === 'function') showToast('⚠️ กรุณาเลือกคูปองที่ต้องการโอนให้ถูกต้อง');
        return;
    }

    const selectedRadio = document.querySelector('input[name="transfer-recipient-radio"]:checked');
    const recipientId = selectedRadio?.value;
    if (!recipientId) {
        if (typeof showToast === 'function') showToast('⚠️ กรุณาเลือกเพื่อนผู้รับสิทธิ์');
        return;
    }

    const noteVal = document.getElementById('transfer-coupon-note-input')?.value || '';
    const confirmBtn = document.getElementById('confirm-transfer-coupon-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'กำลังโอนสิทธิ์...';
    }

    try {
        const { data, error } = await client.rpc('transfer_store_coupon', {
            p_coupon_id: couponId,
            p_recipient_id: recipientId,
            p_note: noteVal
        });

        if (error) throw error;

        closeTransferCouponModal();
        if (typeof showToast === 'function') {
            showToast(`🎁 โอนสิทธิ์ "${data?.coupon_name || 'คูปอง'}" ให้เพื่อนเรียบร้อยแล้ว!`);
        }

        const activeUserId = await resolveFriendUserId();
        if (typeof loadMyCoupons === 'function') {
            await loadMyCoupons(activeUserId);
        }
    } catch (err) {
        console.error('Error transferring store coupon:', err);
        if (typeof showToast === 'function') {
            showToast('❌ โอนสิทธิ์ไม่สำเร็จ: ' + (err.message || ''));
        }
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '🎁 ยืนยันโอนสิทธิ์';
        }
    }
}