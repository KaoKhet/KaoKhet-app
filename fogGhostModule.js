// ==========================================
// 🌫️ forgotModule.js — ระบบหมอกสำรวจ (Fog of War) จากข้อมูลจริงใน Supabase
// ==========================================

let fogLayerGroup = null;
let isFogOfWarActive = false;
let fogRefreshTimer = null;

function getFogClient() {
    return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
}

async function resolveFogUserId() {
    if (typeof currentUser !== 'undefined' && currentUser?.id) return currentUser.id;
    if (typeof ensureCurrentUser === 'function') {
        try {
            await ensureCurrentUser();
            if (typeof currentUser !== 'undefined' && currentUser?.id) return currentUser.id;
        } catch (_) { }
    }
    const client = getFogClient();
    if (client?.auth) {
        try {
            const { data } = await client.auth.getSession();
            return data?.session?.user?.id || null;
        } catch (_) { }
    }
    return null;
}

function collectExploredPointsFromJourneys(journeys = []) {
    const points = [];
    for (const row of journeys) {
        const coords = Array.isArray(row?.path_coordinates) ? row.path_coordinates : [];
        for (const pt of coords) {
            if (Array.isArray(pt) && pt.length >= 2) {
                const lat = Number(pt[0]);
                const lng = Number(pt[1]);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    points.push([lat, lng]);
                }
            } else if (pt && typeof pt === 'object') {
                const lat = Number(pt.lat);
                const lng = Number(pt.lng);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    points.push([lat, lng]);
                }
            }
        }
    }
    return points;
}

async function fetchExploredCoordinatesFromSupabase() {
    const client = getFogClient();
    const userId = await resolveFogUserId();
    if (!client || !userId) return [];

    const { data, error } = await client
        .from('journeys')
        .select('path_coordinates')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(100);

    if (error) {
        console.warn('โหลดเส้นทางสำหรับหมอกสำรวจไม่สำเร็จ:', error.message);
        return [];
    }

    const points = collectExploredPointsFromJourneys(Array.isArray(data) ? data : []);
    if (typeof pathCoordinates !== 'undefined' && Array.isArray(pathCoordinates)) {
        for (const pt of pathCoordinates) {
            if (Array.isArray(pt) && pt.length >= 2) {
                const lat = Number(pt[0]);
                const lng = Number(pt[1]);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    points.push([lat, lng]);
                }
            }
        }
    }

    return points;
}

function buildFogMaskPolygon(centerLatLng, exploredPoints, clearRadiusMeters = 85) {
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return null;

    // กรอบหมอกคลุมรอบจุดศูนย์กลาง (~12 กม.)
    const latDelta = 0.11;
    const lngDelta = 0.13;
    const [cLat, cLng] = centerLatLng;

    const outerRing = [
        [cLat + latDelta, cLng - lngDelta],
        [cLat + latDelta, cLng + lngDelta],
        [cLat - latDelta, cLng + lngDelta],
        [cLat - latDelta, cLng - lngDelta]
    ];

    // ลดจำนวนจุดซ้ำที่ใกล้กันเกินไปเพื่อให้วาดเร็วและลื่น
    const sampled = [];
    for (const pt of exploredPoints) {
        const tooClose = sampled.some((s) => map.distance(s, pt) < 35);
        if (!tooClose) sampled.push(pt);
        if (sampled.length >= 90) break;
    }

    if (sampled.length === 0) {
        return L.polygon(outerRing, {
            color: '#334155',
            fillColor: '#0f172a',
            fillOpacity: 0.72,
            weight: 1,
            interactive: false
        });
    }

    // สร้างรูเปิดหมอก (hole) รอบจุดที่เคยสำรวจจริง (ทวนเข็มนาฬิกาตามมาตรฐาน GeoJSON/Leaflet hole)
    const holes = sampled.map(([lat, lng]) => {
        const rLat = clearRadiusMeters / 111320;
        const rLng = clearRadiusMeters / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
        const ring = [];
        const stepsCount = 12;
        for (let i = stepsCount - 1; i >= 0; i--) {
            const angle = (i / stepsCount) * Math.PI * 2;
            ring.push([lat + rLat * Math.sin(angle), lng + rLng * Math.cos(angle)]);
        }
        return ring;
    });

    return L.polygon([outerRing, ...holes], {
        color: '#334155',
        fillColor: '#0f172a',
        fillOpacity: 0.72,
        weight: 1,
        interactive: false
    });
}

async function renderFogOfWarLayer() {
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;

    if (!fogLayerGroup) {
        fogLayerGroup = L.layerGroup();
    } else {
        fogLayerGroup.clearLayers();
    }

    if (!isFogOfWarActive) {
        if (map.hasLayer(fogLayerGroup)) {
            map.removeLayer(fogLayerGroup);
        }
        return;
    }

    const exploredPoints = await fetchExploredCoordinatesFromSupabase();
    const center = exploredPoints.length > 0
        ? exploredPoints[0]
        : [map.getCenter().lat, map.getCenter().lng];

    const fogPoly = buildFogMaskPolygon(center, exploredPoints, 85);
    if (fogPoly) {
        fogLayerGroup.addLayer(fogPoly);
    }

    // วาดวงกลมขอบเขตที่เปิดหมอกแล้วให้เห็นชัดขึ้น
    exploredPoints.slice(0, 60).forEach(([lat, lng]) => {
        L.circle([lat, lng], {
            radius: 85,
            color: '#38bdf8',
            weight: 1,
            opacity: 0.35,
            fillColor: '#38bdf8',
            fillOpacity: 0.08,
            interactive: false
        }).addTo(fogLayerGroup);
    });

    if (!map.hasLayer(fogLayerGroup)) {
        fogLayerGroup.addTo(map);
    }
}

async function toggleFogOfWar() {
    isFogOfWarActive = !isFogOfWarActive;
    if (typeof isFogActive !== 'undefined') {
        isFogActive = isFogOfWarActive;
    }

    if (!isFogOfWarActive) {
        if (fogLayerGroup && typeof map !== 'undefined' && map && map.hasLayer(fogLayerGroup)) {
            map.removeLayer(fogLayerGroup);
        }
        if (typeof showToast === 'function') showToast('ปิดหมอกสำรวจแล้ว');
        return;
    }

    if (typeof showToast === 'function') {
        showToast('🌫️ กำลังโหลดพื้นที่สำรวจจริงจากฐานข้อมูล...');
    }
    await renderFogOfWarLayer();
    if (typeof showToast === 'function') {
        showToast('🌫️ เปิดใช้งานหมอกสำรวจพื้นที่แล้ว');
    }
}

function scheduleFogRefresh() {
    if (!isFogOfWarActive) return;
    if (fogRefreshTimer) clearTimeout(fogRefreshTimer);
    fogRefreshTimer = setTimeout(() => {
        fogRefreshTimer = null;
        renderFogOfWarLayer();
    }, 400);
}