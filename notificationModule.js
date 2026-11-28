// ==========================================
// 🔔 notificationModule.js — กล่องจดหมายแจ้งเตือน พอยต์ ฟิลด์พิเศษ แผนที่มินิแมพ และการนำทางโปรไฟล์ร้านค้า
// ==========================================

let notificationRealtimeChannel = null;
let cachedUserNotifications = [];
let currentNotifFilter = 'all'; // 'all' | 'reward' | 'system'
let selectedNotifId = null;

function getNotifClient() {
    return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
}

function escapeNotifHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showInAppNotifConfirm({ title, message, confirmText = 'ยืนยันลบ', onConfirm }) {
    let overlay = document.getElementById('notif-confirm-dialog');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'notif-confirm-dialog';
        overlay.style.cssText = [
            'display:none',
            'position:fixed',
            'inset:0',
            'background:rgba(17, 24, 39, 0.55)',
            'z-index:100001',
            'align-items:center',
            'justify-content:center',
            'padding:20px'
        ].join(';');

        overlay.innerHTML = `
            <div style="background:#ffffff; width:100%; max-width:320px; border-radius:20px; padding:20px; box-shadow:0 20px 40px rgba(0,0,0,0.22); text-align:center; animation:notifPopIn 0.16s ease-out;">
                <div style="width:46px; height:46px; margin:0 auto 10px; border-radius:999px; background:#fee2e2; color:#dc2626; display:flex; align-items:center; justify-content:center; font-size:21px;">
                    🗑️
                </div>
                <div id="notif-confirm-title" style="font-size:15px; font-weight:700; color:#111827; margin-bottom:6px;"></div>
                <div id="notif-confirm-message" style="font-size:12px; color:#4b5563; line-height:1.5; margin-bottom:16px;"></div>
                <div style="display:flex; gap:8px;">
                    <button id="notif-confirm-cancel-btn" type="button"
                        style="flex:1; padding:9px 12px; border-radius:11px; border:1px solid #e5e7eb; background:#f9fafb; color:#374151; font-size:13px; font-weight:700; cursor:pointer;">
                        ยกเลิก
                    </button>
                    <button id="notif-confirm-ok-btn" type="button"
                        style="flex:1; padding:9px 12px; border-radius:11px; border:none; background:#ef4444; color:#ffffff; font-size:13px; font-weight:700; cursor:pointer;">
                        ยืนยันลบ
                    </button>
                </div>
            </div>
        `;

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeInAppNotifConfirm();
            }
        });

        document.body.appendChild(overlay);
    } else if (overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
    }

    const titleEl = document.getElementById('notif-confirm-title');
    const msgEl = document.getElementById('notif-confirm-message');
    const cancelBtn = document.getElementById('notif-confirm-cancel-btn');
    const okBtn = document.getElementById('notif-confirm-ok-btn');

    if (titleEl) titleEl.textContent = title || 'ยืนยันการลบข้อความ';
    if (msgEl) msgEl.textContent = message || 'ต้องการลบรายการแจ้งเตือนนี้ใช่หรือไม่?';
    if (okBtn) {
        okBtn.textContent = confirmText;
        okBtn.disabled = false;
        okBtn.style.opacity = '1';
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => closeInAppNotifConfirm();
    }

    if (okBtn) {
        okBtn.onclick = async () => {
            okBtn.disabled = true;
            okBtn.style.opacity = '0.65';
            okBtn.textContent = 'กำลังลบ...';
            try {
                if (typeof onConfirm === 'function') {
                    await onConfirm();
                }
            } finally {
                closeInAppNotifConfirm();
            }
        };
    }

    overlay.style.display = 'flex';
}

function closeInAppNotifConfirm() {
    const overlay = document.getElementById('notif-confirm-dialog');
    if (overlay) overlay.style.display = 'none';
}

async function resolveActiveNotifUserId() {
    const client = getNotifClient();
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
    if (client?.auth) {
        try {
            const { data } = await client.auth.getSession();
            return data?.session?.user?.id || null;
        } catch (_) { }
    }
    return null;
}

function bindNotificationBellTriggers() {
    const candidates = [
        document.getElementById('notification-bell-btn'),
        document.getElementById('btn-notifications'),
        document.getElementById('bell-btn'),
        document.getElementById('notification-badge')?.parentElement,
        ...document.querySelectorAll('[data-open-notifications], .notification-bell, .bell-btn')
    ].filter(Boolean);

    const uniqueEls = [...new Set(candidates)];
    uniqueEls.forEach((el) => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openNotificationsModal();
        });
    });
}

function subscribeNotificationsRealtime(userId) {
    const client = getNotifClient();
    if (!client || !userId || typeof client.channel !== 'function') return;

    try {
        if (notificationRealtimeChannel && typeof client.removeChannel === 'function') {
            client.removeChannel(notificationRealtimeChannel);
        }
        notificationRealtimeChannel = client
            .channel(`user-notifs-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                async () => {
                    await updateNotificationBadge();
                    const modal = document.getElementById('notifications-modal');
                    if (modal && modal.style.display !== 'none') {
                        await loadUserNotifications();
                    }
                }
            )
            .subscribe();
    } catch (err) {
        console.warn('Realtime notifications subscribe warning:', err);
    }
}

async function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;

    const client = getNotifClient();
    const userId = await resolveActiveNotifUserId();
    if (!client || !userId) {
        badge.style.display = 'none';
        return;
    }

    try {
        const { count, error } = await client
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) throw error;

        if (count && count > 0) {
            badge.innerText = count > 99 ? '99+' : String(count);
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch (err) {
        console.error('Error updating notification badge:', err);
    }
}

async function refreshUserPointsUI() {
    const client = getNotifClient();
    const userId = await resolveActiveNotifUserId();
    if (!client || !userId) return;

    try {
        const { data: profileData, error } = await client
            .from('profiles')
            .select('points')
            .eq('id', userId)
            .single();

        if (error) throw error;

        const latestPoints = profileData?.points || 0;
        const pointsDisplay = document.getElementById('user-points-val');
        if (pointsDisplay) pointsDisplay.innerText = `${latestPoints} Points`;

        const sponsorPointsDisplay = document.getElementById('sponsor-user-points');
        if (sponsorPointsDisplay) sponsorPointsDisplay.innerText = `${latestPoints} Points`;
    } catch (err) {
        console.error('Error refreshing user points UI:', err);
    }
}

async function openNotificationsModal() {
    const modal = document.getElementById('notifications-modal');
    if (modal) {
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.inset = '0';
        modal.style.zIndex = '99999';
    }
    selectedNotifId = null;
    await Promise.all([
        loadUserNotifications(),
        refreshUserPointsUI(),
        updateNotificationBadge()
    ]);
}

function closeNotificationsModal() {
    closeInAppNotifConfirm();
    const modal = document.getElementById('notifications-modal');
    if (modal) modal.style.display = 'none';
    selectedNotifId = null;
}

function classifyNotificationCategory(notif) {
    const text = `${notif?.title || ''} ${notif?.message || ''}`.toLowerCase();
    if (
        text.includes('รางวัล') ||
        text.includes('หลักฐาน') ||
        text.includes('#clm-') ||
        text.includes('truemoney') ||
        text.includes('store-banners')
    ) {
        return 'reward';
    }
    return 'system';
}

function parseNotificationDetails(notif) {
    const rawMsg = String(notif?.message || '');
    const urlMatch = rawMsg.match(/(https?:\/\/[^\s]+)/);
    const proofUrl = urlMatch ? urlMatch[1] : null;
    const claimMatch = rawMsg.match(/(#CLM-[A-Z0-9]+)/i);
    const claimCode = claimMatch ? claimMatch[1] : null;

    let cleanText = rawMsg;
    if (proofUrl) {
        cleanText = cleanText
            .replace(proofUrl, '')
            .replace(/\|\s*ดูหลักฐานการโอน\s*:\s*/g, '')
            .replace(/ดูหลักฐานการโอน\s*:\s*/g, '')
            .trim();
    }

    return {
        cleanText,
        proofUrl,
        claimCode,
        category: classifyNotificationCategory(notif)
    };
}

function setNotificationFilter(filterKey) {
    currentNotifFilter = ['all', 'reward', 'system'].includes(filterKey) ? filterKey : 'all';
    selectedNotifId = null;
    renderNotificationsInbox();
}

async function openNotificationDetail(notifId) {
    selectedNotifId = notifId;
    const target = cachedUserNotifications.find((n) => String(n.id) === String(notifId));
    renderNotificationsInbox();

    if (target && !target.is_read) {
        target.is_read = true;
        const client = getNotifClient();
        if (client) {
            await client
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notifId);
            await updateNotificationBadge();
        }
    }
}

function backToNotificationList() {
    selectedNotifId = null;
    renderNotificationsInbox();
}

async function loadUserNotifications() {
    const container = document.getElementById('notifications-list-container');
    if (!container) return;

    const client = getNotifClient();
    const userId = await resolveActiveNotifUserId();

    if (!client || !userId) {
        container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:24px; font-size:13px;">กรุณาล็อกอินก่อนดูแจ้งเตือน</div>`;
        return;
    }

    subscribeNotificationsRealtime(userId);

    try {
        const { data: notifs, error } = await client
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        cachedUserNotifications = Array.isArray(notifs) ? notifs : [];
        renderNotificationsInbox();
    } catch (err) {
        console.error('Error loading notifications:', err);
        container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:24px; font-size:13px;">ไม่สามารถโหลดแจ้งเตือนได้</div>`;
    }
}

function renderNotificationsInbox() {
    const container = document.getElementById('notifications-list-container');
    if (!container) return;

    if (selectedNotifId) {
        const item = cachedUserNotifications.find((n) => String(n.id) === String(selectedNotifId));
        if (item) {
            renderNotificationDetailView(container, item);
            return;
        }
        selectedNotifId = null;
    }

    const totalCount = cachedUserNotifications.length;
    const unreadCount = cachedUserNotifications.filter((n) => !n.is_read).length;
    const readCount = totalCount - unreadCount;

    const filteredList = cachedUserNotifications.filter((n) => {
        if (currentNotifFilter === 'all') return true;
        return classifyNotificationCategory(n) === currentNotifFilter;
    });

    const pillStyle = (key) => {
        const active = currentNotifFilter === key;
        return active
            ? 'background:#16a34a; color:#ffffff; border:1px solid #16a34a; font-weight:700;'
            : 'background:#f3f4f6; color:#4b5563; border:1px solid #e5e7eb; font-weight:600;';
    };

    let html = `
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                <span style="font-size:11px; color:#6b7280; font-weight:600;">
                    ทั้งหมด ${totalCount} รายการ ${unreadCount > 0 ? `• ยังไม่อ่าน ${unreadCount}` : ''}
                </span>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    ${unreadCount > 0 ? `
                        <button type="button" onclick="markAllNotificationsAsRead()"
                            style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:5px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                            ✓ อ่านทั้งหมด
                        </button>
                    ` : ''}
                    ${readCount > 0 ? `
                        <button type="button" onclick="deleteReadNotifications()"
                            style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:5px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                            🗑️ ลบที่อ่านแล้ว
                        </button>
                    ` : ''}
                </div>
            </div>

            <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:2px;">
                <button type="button" onclick="setNotificationFilter('all')"
                    style="${pillStyle('all')} padding:5px 11px; border-radius:999px; font-size:11px; cursor:pointer; white-space:nowrap;">
                    ทั้งหมด
                </button>
                <button type="button" onclick="setNotificationFilter('reward')"
                    style="${pillStyle('reward')} padding:5px 11px; border-radius:999px; font-size:11px; cursor:pointer; white-space:nowrap;">
                    🎁 รางวัล & หลักฐาน
                </button>
                <button type="button" onclick="setNotificationFilter('system')"
                    style="${pillStyle('system')} padding:5px 11px; border-radius:999px; font-size:11px; cursor:pointer; white-space:nowrap;">
                    ⚙️ ระบบ / คืนพอยต์
                </button>
            </div>
        </div>
    `;

    if (filteredList.length === 0) {
        html += `
            <div style="text-align:center; color:#9ca3af; padding:34px 12px; font-size:13px; background:#f9fafb; border-radius:14px; border:1px dashed #e5e7eb;">
                📭 ไม่มีรายการแจ้งเตือนในหมวดหมู่นี้
            </div>
        `;
        container.innerHTML = html;
        return;
    }

    filteredList.forEach((n) => {
        const parsed = parseNotificationDetails(n);
        const dateStr = new Date(n.created_at).toLocaleString('th-TH', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });

        const isUnread = !n.is_read;
        const cardStyle = isUnread
            ? 'background:#f0fdf4; border:1px solid #bbf7d0; border-left:4px solid #16a34a;'
            : 'background:#ffffff; border:1px solid #e5e7eb; border-left:4px solid #d1d5db;';

        const iconBadge = parsed.category === 'reward'
            ? (isUnread ? '🎁' : '📩')
            : (isUnread ? '🔔' : '✉️');

        const safeId = escapeNotifHtml(n.id);

        html += `
            <div onclick="openNotificationDetail('${safeId}')"
                style="${cardStyle} border-radius:12px; padding:11px 12px; display:flex; align-items:flex-start; gap:10px; cursor:pointer; transition:background 0.15s;">
                <div style="width:36px; height:36px; border-radius:10px; background:${isUnread ? '#dcfce7' : '#f3f4f6'}; display:flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0;">
                    ${iconBadge}
                </div>

                <div style="flex:1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:3px;">
                        <span style="font-size:13px; font-weight:${isUnread ? '700' : '600'}; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeNotifHtml(n.title || 'แจ้งเตือนระบบ')}
                        </span>
                        <span style="font-size:10px; color:#6b7280; white-space:nowrap; flex-shrink:0;">
                            ${escapeNotifHtml(dateStr)}
                        </span>
                    </div>

                    <div style="font-size:12px; color:#4b5563; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                        ${escapeNotifHtml(parsed.cleanText)}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:7px; gap:6px;">
                        <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
                            ${isUnread ? `<span style="background:#16a34a; color:#fff; font-size:10px; font-weight:700; padding:2px 7px; border-radius:999px;">ใหม่</span>` : ''}
                            ${parsed.proofUrl ? `<span style="background:#fef3c7; color:#92400e; font-size:10px; font-weight:700; padding:2px 7px; border-radius:999px;">📎 มีรูปหลักฐาน</span>` : ''}
                            <span style="font-size:11px; color:#15803d; font-weight:600;">แตะเพื่อดูรายละเอียด →</span>
                        </div>

                        <button type="button"
                            onclick="event.stopPropagation(); deleteSingleNotification('${safeId}')"
                            title="ลบข้อความนี้"
                            style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; border-radius:7px; padding:3px 8px; font-size:11px; font-weight:600; cursor:pointer; flex-shrink:0;">
                            🗑️ ลบ
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderNotificationDetailView(container, notif) {
    const parsed = parseNotificationDetails(notif);
    const fullDateStr = new Date(notif.created_at).toLocaleString('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
    const safeId = escapeNotifHtml(notif.id);

    container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <button type="button" onclick="backToNotificationList()"
                    style="background:#f3f4f6; color:#111827; border:1px solid #e5e7eb; padding:6px 12px; border-radius:9px; font-size:12px; font-weight:700; cursor:pointer;">
                    ← กลับหน้ารายการ
                </button>
                <button type="button" onclick="deleteSingleNotification('${safeId}')"
                    style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:6px 12px; border-radius:9px; font-size:12px; font-weight:700; cursor:pointer;">
                    🗑️ ลบข้อความนี้
                </button>
            </div>

            <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:14px; padding:14px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                    <span style="font-size:20px;">${parsed.category === 'reward' ? '🎁' : '🔔'}</span>
                    <div style="font-size:15px; font-weight:700; color:#111827;">
                        ${escapeNotifHtml(notif.title || 'แจ้งเตือนระบบ')}
                    </div>
                </div>
                <div style="font-size:11px; color:#6b7280; margin-bottom:10px;">
                    ได้รับเมื่อ: ${escapeNotifHtml(fullDateStr)}
                </div>

                ${parsed.claimCode ? `
                    <div style="display:inline-block; background:#dcfce7; color:#166534; font-size:11px; font-weight:700; padding:4px 10px; border-radius:8px; margin-bottom:10px;">
                        รหัสคำขอ: ${escapeNotifHtml(parsed.claimCode)}
                    </div>
                ` : ''}

                <div style="font-size:13px; color:#1f2937; line-height:1.6; background:#ffffff; border:1px solid #f3f4f6; border-radius:10px; padding:12px; white-space:pre-line;">
                    ${escapeNotifHtml(parsed.cleanText)}
                </div>

                ${parsed.proofUrl ? `
                    <div style="margin-top:12px; background:#ffffff; border:1px solid #bbf7d0; border-radius:12px; padding:10px;">
                        <div style="font-size:12px; font-weight:700; color:#166534; margin-bottom:8px;">
                            📎 หลักฐานการจัดส่งรางวัล / สลิปการโอน
                        </div>
                        <a href="${escapeNotifHtml(parsed.proofUrl)}" target="_blank" rel="noopener" style="display:block;">
                            <img src="${escapeNotifHtml(parsed.proofUrl)}" alt="หลักฐานการโอน"
                                style="width:100%; max-height:240px; object-fit:contain; border-radius:8px; background:#f3f4f6; border:1px solid #e5e7eb;" />
                        </a>
                        <a href="${escapeNotifHtml(parsed.proofUrl)}" target="_blank" rel="noopener"
                            style="display:block; text-align:center; margin-top:8px; background:#16a34a; color:#ffffff; text-decoration:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700;">
                            🔍 เปิดดูรูปหลักฐานขนาดเต็ม
                        </a>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

async function deleteSingleNotification(notifId) {
    const client = getNotifClient();
    const userId = await resolveActiveNotifUserId();
    if (!client || !userId || !notifId) return;

    const target = cachedUserNotifications.find((n) => String(n.id) === String(notifId));
    const targetTitle = target?.title ? `"${target.title}"` : 'ข้อความแจ้งเตือนนี้';

    showInAppNotifConfirm({
        title: 'ลบข้อความแจ้งเตือน?',
        message: `ต้องการลบ ${targetTitle} ออกจากกล่องจดหมายใช่หรือไม่? (ประวัติคำขอหรือคูปองของคุณจะไม่ถูกลบ)`,
        confirmText: 'ลบข้อความ',
        onConfirm: async () => {
            try {
                const { error } = await client
                    .from('notifications')
                    .delete()
                    .eq('id', notifId)
                    .eq('user_id', userId);

                if (error) throw error;

                cachedUserNotifications = cachedUserNotifications.filter((n) => String(n.id) !== String(notifId));
                if (String(selectedNotifId) === String(notifId)) {
                    selectedNotifId = null;
                }

                renderNotificationsInbox();
                await updateNotificationBadge();

                if (typeof showToast === 'function') {
                    showToast('🗑️ ลบข้อความแจ้งเตือนเรียบร้อยแล้ว');
                }
            } catch (err) {
                console.error('Error deleting notification:', err);
                if (typeof showToast === 'function') {
                    showToast('❌ ลบข้อความไม่สำเร็จ: ' + (err.message || ''));
                }
            }
        }
    });
}

async function deleteReadNotifications() {
    const client = getNotifClient();
    const userId = await resolveActiveNotifUserId();
    if (!client || !userId) return;

    const readIds = cachedUserNotifications.filter((n) => n.is_read).map((n) => n.id);
    if (readIds.length === 0) return;

    showInAppNotifConfirm({
        title: 'ลบข้อความที่อ่านแล้วทั้งหมด?',
        message: `ระบบจะลบข้อความที่อ่านแล้วจำนวน ${readIds.length} รายการออกจากกล่องจดหมายของคุณทันที`,
        confirmText: `ลบ ${readIds.length} รายการ`,
        onConfirm: async () => {
            try {
                const { error } = await client
                    .from('notifications')
                    .delete()
                    .eq('user_id', userId)
                    .eq('is_read', true);

                if (error) throw error;

                cachedUserNotifications = cachedUserNotifications.filter((n) => !n.is_read);
                selectedNotifId = null;
                renderNotificationsInbox();
                await updateNotificationBadge();

                if (typeof showToast === 'function') {
                    showToast('🗑️ ลบข้อความที่อ่านแล้วทั้งหมดเรียบร้อยแล้ว');
                }
            } catch (err) {
                console.error('Error deleting read notifications:', err);
                if (typeof showToast === 'function') {
                    showToast('❌ ลบข้อความที่อ่านแล้วไม่สำเร็จ: ' + (err.message || ''));
                }
            }
        }
    });
}

async function markNotificationAsRead(notifId) {
    const client = getNotifClient();
    if (!client || !notifId) return;

    try {
        const { error } = await client
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notifId);

        if (error) throw error;
        await Promise.all([
            loadUserNotifications(),
            updateNotificationBadge()
        ]);
    } catch (err) {
        console.error('Error marking notification as read:', err);
    }
}

async function markAllNotificationsAsRead() {
    const client = getNotifClient();
    const userId = await resolveActiveNotifUserId();
    if (!client || !userId) return;

    try {
        const { error } = await client
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) throw error;

        if (typeof showToast === 'function') {
            showToast('✓ ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว');
        }
        await Promise.all([
            loadUserNotifications(),
            updateNotificationBadge()
        ]);
    } catch (err) {
        console.error('Error marking all notifications as read:', err);
        if (typeof showToast === 'function') {
            showToast('❌ ไม่สามารถอัปเดตสถานะแจ้งเตือนได้');
        }
    }
}

function toggleRaidBossFields() {
    const raidCb = document.getElementById('sponsor-is-raid');
    const fields = document.getElementById('raid-boss-fields');

    if (raidCb && fields) {
        fields.style.display = raidCb.checked ? 'flex' : 'none';
    }
}

let merchantMiniMap = null;
let merchantMarker = null;

function initMerchantMiniMap(lat = 13.7367, lng = 100.5231) {
    const mapContainer = document.getElementById('merchant-mini-map');
    if (!mapContainer) return;

    if (!merchantMiniMap) {
        merchantMiniMap = L.map('merchant-mini-map', {
            zoomControl: false,
            attributionControl: false
        }).setView([lat, lng], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(merchantMiniMap);

        merchantMiniMap.on('click', (e) => {
            const clickedLat = e.latlng.lat;
            const clickedLng = e.latlng.lng;
            updateMerchantMarkerPosition(clickedLat, clickedLng);
        });
    } else {
        merchantMiniMap.setView([lat, lng], 15);
    }

    updateMerchantMarkerPosition(lat, lng);

    setTimeout(() => {
        merchantMiniMap.invalidateSize();
    }, 200);
}

function updateMerchantMarkerPosition(lat, lng) {
    const latInput = document.getElementById('sponsor-lat');
    const lngInput = document.getElementById('sponsor-lng');

    if (latInput) latInput.value = lat.toFixed(6);
    if (lngInput) lngInput.value = lng.toFixed(6);

    if (!merchantMiniMap) return;

    if (!merchantMarker) {
        merchantMarker = L.marker([lat, lng], { draggable: true }).addTo(merchantMiniMap);

        merchantMarker.on('dragend', (event) => {
            const position = event.target.getLatLng();
            if (latInput) latInput.value = position.lat.toFixed(6);
            if (lngInput) lngInput.value = position.lng.toFixed(6);
        });
    } else {
        merchantMarker.setLatLng([lat, lng]);
    }
    merchantMiniMap.panTo([lat, lng]);
}

function getCurrentLocationForSponsor() {
    if (!navigator.geolocation) {
        showToast('⚠️ เบราว์เซอร์ไม่รองรับการระบุตำแหน่ง');
        return;
    }
    showToast('⏳ กำลังค้นหาตำแหน่งปัจจุบัน...');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            updateMerchantMarkerPosition(lat, lng);
            showToast('📍 ดึงพิกัดปัจจุบันสำเร็จ!');
        },
        (err) => {
            showToast('❌ ไม่สามารถดึงพิกัดได้: ' + err.message);
        }
    );
}

function resetMerchantMiniMap() {
    getCurrentLocationForSponsor();
}

// ฟังก์ชันสำหรับคลิกเปลี่ยนหน้าไปยังโปรไฟล์ร้านค้าแบบไดนามิก
function goToStoreProfile(storeId) {
    window.location.href = `store-profile.html?id=${storeId}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    bindNotificationBellTriggers();
    await updateNotificationBadge();
});