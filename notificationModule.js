// ==========================================
// 🔔 notificationModule.js — แจ้งเตือน พอยต์ ฟิลด์พิเศษ แผนที่มินิแมพ และการนำทางโปรไฟล์ร้านค้า
// ==========================================

async function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;

    if (!currentUser || !currentUser.id) {
        badge.style.display = 'none';
        return;
    }

    try {
        const { count, error } = await supabaseClient
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id)
            .eq('is_read', false);

        if (error) throw error;

        if (count && count > 0) {
            badge.innerText = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch (err) {
        console.error('Error updating notification badge:', err);
    }
}

async function refreshUserPointsUI() {
    if (!currentUser || !currentUser.id) return;

    try {
        const { data: profileData, error } = await supabaseClient
            .from('profiles')
            .select('points')
            .eq('id', currentUser.id)
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
    if (modal) modal.style.display = 'flex';
    await Promise.all([
        loadUserNotifications(),
        refreshUserPointsUI()
    ]);
}

function closeNotificationsModal() {
    const modal = document.getElementById('notifications-modal');
    if (modal) modal.style.display = 'none';
}

async function loadUserNotifications() {
    const container = document.getElementById('notifications-list-container');
    if (!container) return;

    if (!currentUser || !currentUser.id) {
        container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">กรุณาล็อกอินก่อนดูแจ้งเตือน</div>`;
        return;
    }

    try {
        const { data: notifs, error } = await supabaseClient
            .from('notifications')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!notifs || notifs.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:#9ca3af; padding:30px 0; font-size:13px;">📭 ยังไม่มีการแจ้งเตือนในขณะนี้</div>`;
            return;
        }

        const hasUnread = notifs.some(n => !n.is_read);
        let html = '';

        if (hasUnread) {
            html += `
                <div style="display:flex; justify-content:flex-end; margin-bottom:4px;">
                    <button onclick="markAllNotificationsAsRead()" style="background:#dcfce7; color:#15803d; border:none; padding:6px 12px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">✓ อ่านทั้งหมด</button>
                </div>
            `;
        }

        notifs.forEach(n => {
            const dateStr = new Date(n.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
            const bgStyle = n.is_read ? 'background:#fff; border:1px solid #f3f4f6;' : 'background:#f0fdf4; border:1px solid #bbf7d0;';

            html += `
                <div style="${bgStyle} border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px; position:relative;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <span style="font-size:13px; font-weight:700; color:#1f2937;">${n.title}</span>
                        <span style="font-size:10px; color:#9ca3af;">${dateStr}</span>
                    </div>
                    <div style="font-size:12px; color:#4b5563; line-height:1.4;">${n.message}</div>
                    ${!n.is_read ? `<button onclick="markNotificationAsRead('${n.id}')" style="align-self:flex-end; background:none; border:none; color:#16a34a; font-size:11px; font-weight:600; cursor:pointer; margin-top:4px;">✓ ทำเครื่องหมายว่าอ่านแล้ว</button>` : ''}
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (err) {
        console.error('Error loading notifications:', err);
        container.innerHTML = `<div style="text-align:center; color:red; padding:20px;">ไม่สามารถโหลดแจ้งเตือนได้</div>`;
    }
}

async function markNotificationAsRead(notifId) {
    try {
        const { error } = await supabaseClient
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
    if (!currentUser || !currentUser.id) return;

    try {
        const { error } = await supabaseClient
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', currentUser.id)
            .eq('is_read', false);

        if (error) throw error;

        showToast('✓ ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว');
        await Promise.all([
            loadUserNotifications(),
            updateNotificationBadge()
        ]);
    } catch (err) {
        console.error('Error marking all notifications as read:', err);
        showToast('❌ ไม่สามารถอัปเดตสถานะแจ้งเตือนได้');
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