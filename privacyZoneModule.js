// ==========================================
// 🛡️ privacyZoneModule.js — ระบบ Privacy Zone (พื้นที่ส่วนตัว) จากข้อมูลจริงใน Supabase
// ==========================================

let privacyZoneState = {
    enabled: false,
    lat: null,
    lng: null,
    radiusMeters: 150,
    label: 'พื้นที่ส่วนตัว'
};

let privacyZoneLayerGroup = null;

function getPrivacyClient() {
    return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
}

async function resolvePrivacyUserId() {
    if (typeof currentUser !== 'undefined' && currentUser?.id) return currentUser.id;
    if (typeof ensureCurrentUser === 'function') {
        try {
            await ensureCurrentUser();
            if (typeof currentUser !== 'undefined' && currentUser?.id) return currentUser.id;
        } catch (_) { }
    }
    const client = getPrivacyClient();
    if (client?.auth) {
        try {
            const { data } = await client.auth.getSession();
            return data?.session?.user?.id || null;
        } catch (_) { }
    }
    return null;
}

async function loadPrivacyZoneFromSupabase() {
    const client = getPrivacyClient();
    const userId = await resolvePrivacyUserId();
    if (!client || !userId) return privacyZoneState;

    try {
        const { data, error } = await client
            .from('profiles')
            .select('privacy_zone_enabled, privacy_zone_lat, privacy_zone_lng, privacy_zone_radius, privacy_zone_label')
            .eq('id', userId)
            .maybeSingle();

        if (!error && data) {
            privacyZoneState = {
                enabled: Boolean(data.privacy_zone_enabled),
                lat: data.privacy_zone_lat !== null && data.privacy_zone_lat !== undefined ? Number(data.privacy_zone_lat) : null,
                lng: data.privacy_zone_lng !== null && data.privacy_zone_lng !== undefined ? Number(data.privacy_zone_lng) : null,
                radiusMeters: Number(data.privacy_zone_radius) > 0 ? Number(data.privacy_zone_radius) : 150,
                label: data.privacy_zone_label || 'พื้นที่ส่วนตัว'
            };
        }
    } catch (err) {
        console.warn('โหลด Privacy Zone จาก profiles ไม่สำเร็จ:', err.message);
    }

    renderPrivacyZoneOnMap();
    return privacyZoneState;
}

async function savePrivacyZoneToSupabase(nextConfig = {}) {
    const client = getPrivacyClient();
    const userId = await resolvePrivacyUserId();
    if (!client || !userId) {
        if (typeof showToast === 'function') showToast('⚠️ กรุณาล็อกอินก่อนบันทึก Privacy Zone');
        return false;
    }

    const merged = {
        enabled: nextConfig.enabled !== undefined ? Boolean(nextConfig.enabled) : privacyZoneState.enabled,
        lat: nextConfig.lat !== undefined ? (nextConfig.lat !== null ? Number(nextConfig.lat) : null) : privacyZoneState.lat,
        lng: nextConfig.lng !== undefined ? (nextConfig.lng !== null ? Number(nextConfig.lng) : null) : privacyZoneState.lng,
        radiusMeters: Number(nextConfig.radiusMeters) > 0 ? Number(nextConfig.radiusMeters) : (privacyZoneState.radiusMeters || 150),
        label: (nextConfig.label || privacyZoneState.label || 'พื้นที่ส่วนตัว').trim()
    };

    try {
        const { error } = await client
            .from('profiles')
            .update({
                privacy_zone_enabled: merged.enabled,
                privacy_zone_lat: merged.lat,
                privacy_zone_lng: merged.lng,
                privacy_zone_radius: merged.radiusMeters,
                privacy_zone_label: merged.label
            })
            .eq('id', userId);

        if (error) throw error;

        privacyZoneState = merged;
        renderPrivacyZoneOnMap();
        if (typeof showToast === 'function') {
            showToast('🛡️ บันทึกการตั้งค่า Privacy Zone ลงฐานข้อมูลแล้ว');
        }
        return true;
    } catch (err) {
        console.error('บันทึก Privacy Zone ไม่สำเร็จ:', err);
        if (typeof showToast === 'function') {
            showToast('❌ บันทึก Privacy Zone ไม่สำเร็จ: ' + (err.message || 'ตรวจสอบคอลัมน์ในตาราง profiles'));
        }
        return false;
    }
}

function isPointInsidePrivacyZone(lat, lng) {
    if (!privacyZoneState.enabled) return false;
    const zLat = Number(privacyZoneState.lat);
    const zLng = Number(privacyZoneState.lng);
    const radius = Number(privacyZoneState.radiusMeters) || 150;

    if (!Number.isFinite(zLat) || !Number.isFinite(zLng)) return false;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return false;

    if (typeof map !== 'undefined' && map && typeof map.distance === 'function') {
        return map.distance([Number(lat), Number(lng)], [zLat, zLng]) <= radius;
    }
    if (typeof L !== 'undefined' && L.latLng) {
        return L.latLng(Number(lat), Number(lng)).distanceTo(L.latLng(zLat, zLng)) <= radius;
    }
    return false;
}

function filterCoordinatesOutsidePrivacyZone(coords = []) {
    if (!privacyZoneState.enabled) return coords;
    return coords.filter((pt) => {
        if (Array.isArray(pt) && pt.length >= 2) {
            return !isPointInsidePrivacyZone(pt[0], pt[1]);
        }
        if (pt && typeof pt === 'object') {
            return !isPointInsidePrivacyZone(pt.lat, pt.lng);
        }
        return true;
    });
}

function renderPrivacyZoneOnMap() {
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;

    if (!privacyZoneLayerGroup) {
        privacyZoneLayerGroup = L.layerGroup();
    } else {
        privacyZoneLayerGroup.clearLayers();
    }

    const zLat = Number(privacyZoneState.lat);
    const zLng = Number(privacyZoneState.lng);
    if (privacyZoneState.enabled && Number.isFinite(zLat) && Number.isFinite(zLng)) {
        const circle = L.circle([zLat, zLng], {
            radius: Number(privacyZoneState.radiusMeters) || 150,
            color: '#8b5cf6',
            fillColor: '#a78bfa',
            fillOpacity: 0.16,
            weight: 2,
            dashArray: '6, 6'
        }).bindPopup(`🛡️ <b>${privacyZoneState.label || 'พื้นที่ส่วนตัว'}</b><br>รัศมี ${privacyZoneState.radiusMeters || 150} เมตร`);

        privacyZoneLayerGroup.addLayer(circle);
        if (!map.hasLayer(privacyZoneLayerGroup)) {
            privacyZoneLayerGroup.addTo(map);
        }
    } else if (map.hasLayer(privacyZoneLayerGroup)) {
        map.removeLayer(privacyZoneLayerGroup);
    }
}

async function setPrivacyZoneAtCurrentLocation(radiusMeters = 150, label = 'พื้นที่ส่วนตัว') {
    if (!navigator.geolocation) {
        if (typeof showToast === 'function') showToast('⚠️ อุปกรณ์นี้ไม่รองรับ GPS');
        return false;
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const ok = await savePrivacyZoneToSupabase({
                    enabled: true,
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    radiusMeters,
                    label
                });
                resolve(ok);
            },
            (err) => {
                if (typeof showToast === 'function') showToast('❌ ดึงตำแหน่งไม่สำเร็จ: ' + err.message);
                resolve(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

async function openPrivacyZoneModal() {
    if (typeof loadPrivacyZoneFromSupabase === 'function') {
        await loadPrivacyZoneFromSupabase();
    }

    const enabledEl = document.getElementById('pz-enabled-input');
    const labelEl = document.getElementById('pz-label-input');
    const latEl = document.getElementById('pz-lat-input');
    const lngEl = document.getElementById('pz-lng-input');
    const radiusEl = document.getElementById('pz-radius-input');

    if (enabledEl) enabledEl.checked = Boolean(privacyZoneState.enabled);
    if (labelEl) labelEl.value = privacyZoneState.label || 'พื้นที่ส่วนตัว';
    if (latEl) latEl.value = privacyZoneState.lat ?? '';
    if (lngEl) lngEl.value = privacyZoneState.lng ?? '';
    if (radiusEl) radiusEl.value = Number(privacyZoneState.radiusMeters) > 0 ? Number(privacyZoneState.radiusMeters) : 150;

    if (typeof openTopLayer === 'function') {
        openTopLayer('privacy-zone-modal', 'flex');
    } else {
        const modal = document.getElementById('privacy-zone-modal');
        if (modal) modal.style.display = 'flex';
    }
}

function closePrivacyZoneModal() {
    if (typeof closeTopLayer === 'function') {
        closeTopLayer('privacy-zone-modal');
    } else {
        const modal = document.getElementById('privacy-zone-modal');
        if (modal) modal.style.display = 'none';
    }
}

function fillPrivacyZoneWithCurrentGps() {
    if (!navigator.geolocation) {
        if (typeof showToast === 'function') showToast('⚠️ อุปกรณ์นี้ไม่รองรับ GPS');
        return;
    }
    if (typeof showToast === 'function') showToast('📡 กำลังดึงพิกัดปัจจุบัน...');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const latEl = document.getElementById('pz-lat-input');
            const lngEl = document.getElementById('pz-lng-input');
            const enabledEl = document.getElementById('pz-enabled-input');
            if (latEl) latEl.value = Number(pos.coords.latitude).toFixed(6);
            if (lngEl) lngEl.value = Number(pos.coords.longitude).toFixed(6);
            if (enabledEl) enabledEl.checked = true;
            if (typeof showToast === 'function') showToast('📍 ใส่พิกัดปัจจุบันเรียบร้อยแล้ว');
        },
        (err) => {
            if (typeof showToast === 'function') showToast('❌ ดึงพิกัดไม่สำเร็จ: ' + err.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

async function submitPrivacyZoneForm() {
    const enabled = Boolean(document.getElementById('pz-enabled-input')?.checked);
    const label = (document.getElementById('pz-label-input')?.value || 'พื้นที่ส่วนตัว').trim();
    const rawLat = document.getElementById('pz-lat-input')?.value;
    const rawLng = document.getElementById('pz-lng-input')?.value;
    const rawRadius = document.getElementById('pz-radius-input')?.value;

    const lat = rawLat !== '' && rawLat !== undefined ? Number(rawLat) : null;
    const lng = rawLng !== '' && rawLng !== undefined ? Number(rawLng) : null;
    const radiusMeters = Number(rawRadius) > 0 ? Number(rawRadius) : 150;

    if (enabled && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
        if (typeof showToast === 'function') showToast('⚠️ กรุณาระบุพิกัด Lat และ Lng ก่อนเปิดใช้งาน Privacy Zone');
        return;
    }

    const saved = await savePrivacyZoneToSupabase({
        enabled,
        label,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        radiusMeters
    });

    if (saved) {
        closePrivacyZoneModal();
    }
}