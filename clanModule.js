// ============================================================================
// 🛡️ clanModule.js — ระบบแคลน การสร้าง/จัดการแคลน และตารางอันดับสงครามแคลน
// ============================================================================

const CLAN_CREATE_RULES = {
    minLevel: 5,          // เลเวลขั้นต่ำในการสร้างแคลน
    minDistanceKm: 10.0,   // ระยะทางสะสมขั้นต่ำ (กม.)
    minJourneys: 5        // จำนวนครั้งที่บันทึกกิจกรรมขั้นต่ำ
};

let userClanMembership = null; // { ...clan_members, clan: { ...clans } }
let activeClanSubTab = 'leaderboard'; // 'leaderboard' | 'my-clan' | 'discover'
let activeWarSortMode = 'score';      // 'score' | 'distance'
let cachedEligibleStats = null;

// ============================================================================
// 1. คำนวณรอบสงครามแคลนประจำสัปดาห์ (ISO Week Key)
// ============================================================================
function getCurrentClanWarPeriod() {
    const now = new Date();
    const utcDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);

    // วันจันทร์ 00:00 น. ถึง วันอาทิตย์ 23:59:59 น. ของสัปดาห์ปัจจุบัน
    const monday = new Date(now);
    const diffToMonday = (now.getDay() + 6) % 7;
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return {
        warKey: `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`,
        warTitle: `สงครามชิงอาณาเขต สัปดาห์ที่ ${weekNo}/${utcDate.getUTCFullYear()}`,
        startsAt: monday.toISOString(),
        endsAt: sunday.toISOString()
    };
}

// ============================================================================
// 2. โหลดสถานะแคลนของผู้ใช้ & ซิงก์ UI
// ============================================================================
async function initClanSystem() {
    if (!supabaseClient || !currentUser) return;

    try {
        const { data: memberRow, error } = await supabaseClient
            .from('clan_members')
            .select('*, clans(*)')
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (!error && memberRow && memberRow.clans && memberRow.clans.is_active) {
            userClanMembership = {
                ...memberRow,
                clan: memberRow.clans
            };
            currentClan = memberRow.clans.tag || memberRow.clans.name;
        } else {
            userClanMembership = null;
            currentClan = 'none';
        }

        syncUserClanSummaryBanner();
    } catch (err) {
        console.error('initClanSystem error:', err);
    }
}

function syncUserClanSummaryBanner() {
    const displayEl = document.getElementById('user-clan-display');
    const subEl = document.getElementById('user-clan-subtext');
    const actionBtn = document.getElementById('btn-clan-header-action');

    if (!displayEl) return;

    if (userClanMembership && userClanMembership.clan) {
        const c = userClanMembership.clan;
        const roleLabel = userClanMembership.role === 'leader'
            ? 'หัวแคลน'
            : userClanMembership.role === 'co_leader'
                ? 'รองหัวแคลน'
                : 'สมาชิก';
        const tagStr = c.tag ? ` [${c.tag}]` : '';
        displayEl.innerHTML = `${c.emblem || '🛡️'} ${escapeHtmlClan(c.name)}${escapeHtmlClan(tagStr)}`;
        displayEl.style.color = c.accent_color || '#16a34a';
        if (subEl) subEl.textContent = `Lv.${c.level} • ตำแหน่ง: ${roleLabel} • แต้มช่วยทีม ${Number(userClanMembership.contribution_score || 0).toLocaleString()}`;
        if (actionBtn) {
            actionBtn.textContent = 'จัดการแคลน';
            actionBtn.onclick = () => switchClanSectionTab('my-clan');
        }
    } else {
        displayEl.innerHTML = '🚩 ยังไม่มีสังกัดแคลน';
        displayEl.style.color = '#6b7280';
        if (subEl) subEl.textContent = 'เข้าร่วมแคลนหรือสร้างแคลนของตัวเองฟรีเพื่อร่วมศึกสงคราม';
        if (actionBtn) {
            actionBtn.textContent = '+ สร้าง/หาแคลน';
            actionBtn.onclick = () => switchClanSectionTab('discover');
        }
    }
}

function escapeHtmlClan(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================================================
// 3. การสลับแท็บหน้าจอตารางอันดับ / แคลนของฉัน / ค้นหาและสร้างแคลน
// ============================================================================
async function switchClanSectionTab(tabName) {
    activeClanSubTab = tabName;

    const tabs = ['leaderboard', 'my-clan', 'discover'];
    tabs.forEach(t => {
        const btn = document.getElementById(`clan-nav-${t}`);
        if (!btn) return;
        const isActive = t === tabName;
        btn.style.background = isActive ? '#168039' : '#ffffff';
        btn.style.color = isActive ? '#ffffff' : '#4b5563';
        btn.style.borderColor = isActive ? '#168039' : '#e5e7eb';
    });

    const sortBar = document.getElementById('clan-war-sort-bar');
    if (sortBar) {
        sortBar.style.display = tabName === 'leaderboard' ? 'flex' : 'none';
    }

    await initClanSystem();

    if (tabName === 'leaderboard') {
        await loadClanWarLeaderboard(activeWarSortMode);
    } else if (tabName === 'my-clan') {
        await renderMyClanSection();
    } else if (tabName === 'discover') {
        await renderDiscoverAndCreateClanSection();
    }
}

function switchLeaderboardTab(sortMode) {
    activeWarSortMode = sortMode === 'distance' ? 'distance' : 'score';
    const areaBtn = document.getElementById('lb-tab-area');
    const distBtn = document.getElementById('lb-tab-dist');

    if (areaBtn) {
        areaBtn.style.background = activeWarSortMode === 'score' ? '#22c55e' : '#fff';
        areaBtn.style.color = activeWarSortMode === 'score' ? '#fff' : '#4b5563';
    }
    if (distBtn) {
        distBtn.style.background = activeWarSortMode === 'distance' ? '#22c55e' : '#fff';
        distBtn.style.color = activeWarSortMode === 'distance' ? '#fff' : '#4b5563';
    }

    loadClanWarLeaderboard(activeWarSortMode);
}

// ============================================================================
// 4. ตารางอันดับสงครามแคลน (Clan War Leaderboard)
// ============================================================================
async function loadClanWarLeaderboard(sortMode = 'score') {
    const container = document.getElementById('leaderboard-list-container');
    if (!container || !supabaseClient) return;

    const war = getCurrentClanWarPeriod();
    const warTitleEl = document.getElementById('clan-war-period-title');
    if (warTitleEl) warTitleEl.textContent = war.warTitle;

    container.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:36px 0;">⏳ กำลังโหลดตารางอันดับสงครามแคลน...</div>';

    try {
        const orderCol = sortMode === 'distance' ? 'distance_meters' : 'score';
        const { data: rows, error } = await supabaseClient
            .from('clan_war_scores')
            .select('*, clans(id, name, tag, emblem, accent_color, level, is_active)')
            .eq('war_key', war.warKey)
            .order(orderCol, { ascending: false })
            .limit(30);

        if (error) throw error;

        const validRows = (rows || []).filter(r => r.clans && r.clans.is_active);

        if (validRows.length === 0) {
            container.innerHTML = `
        <div style="background:#fff; border-radius:16px; padding:28px 16px; text-align:center; border:1px solid #f3f4f6;">
          <div style="font-size:32px; margin-bottom:8px;">⚔️</div>
          <div style="font-size:14px; font-weight:700; color:#1f2937; margin-bottom:4px;">ยังไม่มีแคลนทำคะแนนในรอบนี้</div>
          <div style="font-size:12px; color:#6b7280; margin-bottom:14px;">สร้างแคลนหรือเข้าร่วมแคลนแล้วออกไปเดิน/วิ่งเพื่อเปิดศึกแรกของสัปดาห์!</div>
          <button type="button" onclick="switchClanSectionTab('discover')"
            style="background:#168039; color:#fff; border:none; padding:9px 16px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
            ค้นหา / สร้างแคลนเลย
          </button>
        </div>
      `;
            return;
        }

        const myClanId = userClanMembership?.clan_id || null;

        container.innerHTML = validRows.map((item, idx) => {
            const c = item.clans;
            const isMyClan = myClanId && c.id === myClanId;
            const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
            const distKm = ((item.distance_meters || 0) / 1000).toFixed(2);
            const mainMetric = sortMode === 'distance'
                ? `${distKm} กม.`
                : `${Number(item.score || 0).toLocaleString()} แต้ม`;
            const subMetric = sortMode === 'distance'
                ? `${Number(item.score || 0).toLocaleString()} แต้ม • ยึด ${item.captured_count || 0} โซน`
                : `${distKm} กม. • ยึด ${item.captured_count || 0} โซน`;

            return `
        <div style="background:${isMyClan ? '#f0fdf4' : '#fff'}; border-radius:14px; padding:12px 14px; margin-bottom:9px; display:flex; justify-content:space-between; align-items:center; border:1.5px solid ${isMyClan ? '#22c55e' : '#f3f4f6'}; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <span style="font-size:16px; font-weight:800; min-width:28px; text-align:center; color:#eab308;">${rankBadge}</span>
            <div style="width:38px; height:38px; border-radius:12px; background:${c.accent_color || '#168039'}20; border:1px solid ${c.accent_color || '#168039'}55; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
              ${c.emblem || '🛡️'}
            </div>
            <div style="min-width:0;">
              <div style="font-size:13.5px; font-weight:700; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtmlClan(c.name)} ${c.tag ? `<span style="font-size:11px; color:#6b7280;">[${escapeHtmlClan(c.tag)}]</span>` : ''}
                ${isMyClan ? '<span style="font-size:10px; background:#22c55e; color:#fff; padding:1px 6px; border-radius:8px; margin-left:4px;">ทีมคุณ</span>' : ''}
              </div>
              <div style="font-size:11px; color:#6b7280;">Lv.${c.level || 1} • ${subMetric}</div>
            </div>
          </div>
          <div style="text-align:right; flex-shrink:0; margin-left:8px;">
            <div style="font-size:14px; font-weight:800; color:#168039;">${mainMetric}</div>
          </div>
        </div>
      `;
        }).join('');
    } catch (err) {
        console.error('loadClanWarLeaderboard error:', err);
        container.innerHTML = '<div style="text-align:center; color:#ef4444; padding:24px;">❌ โหลดตารางอันดับไม่สำเร็จ</div>';
    }
}

// ============================================================================
// 5. ตรวจสอบคุณสมบัติการสร้างแคลนแบบฟรี (ไม่เติมเงิน)
// ============================================================================
async function checkClanCreationEligibility() {
    if (!supabaseClient || !currentUser) {
        return { eligible: false, level: 1, totalDistKm: 0, totalJourneys: 0, hasClan: false };
    }

    const userLevel = Number(currentProfile?.level || 1);
    const hasClan = Boolean(userClanMembership && userClanMembership.clan);

    let totalDistKm = 0;
    let totalJourneys = 0;

    try {
        const { data: journeys } = await supabaseClient
            .from('journeys')
            .select('distance_meters')
            .eq('user_id', currentUser.id);

        if (Array.isArray(journeys)) {
            totalJourneys = journeys.length;
            const totalMeters = journeys.reduce((sum, j) => sum + (Number(j.distance_meters) || 0), 0);
            totalDistKm = totalMeters / 1000;
        }
    } catch (err) {
        console.error('checkClanCreationEligibility error:', err);
    }

    const passLevel = userLevel >= CLAN_CREATE_RULES.minLevel;
    const passDist = totalDistKm >= CLAN_CREATE_RULES.minDistanceKm;
    const passCount = totalJourneys >= CLAN_CREATE_RULES.minJourneys;

    cachedEligibleStats = {
        eligible: !hasClan && passLevel && passDist && passCount,
        hasClan,
        level: userLevel,
        totalDistKm,
        totalJourneys,
        passLevel,
        passDist,
        passCount
    };

    return cachedEligibleStats;
}

// ============================================================================
// 6. หน้าค้นหาแคลน & สร้างแคลนใหม่
// ============================================================================
async function renderDiscoverAndCreateClanSection() {
    const container = document.getElementById('leaderboard-list-container');
    if (!container || !supabaseClient) return;

    container.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:32px 0;">⏳ กำลังตรวจสอบคุณสมบัติและรายชื่อแคลน...</div>';

    const status = await checkClanCreationEligibility();
    const { data: clansList } = await supabaseClient
        .from('clans')
        .select('*, clan_members(count)')
        .eq('is_active', true)
        .order('level', { ascending: false })
        .order('total_xp', { ascending: false })
        .limit(25);

    const { data: myPendingReqs } = currentUser
        ? await supabaseClient
            .from('clan_join_requests')
            .select('clan_id')
            .eq('user_id', currentUser.id)
            .eq('status', 'pending')
        : { data: [] };

    const pendingClanIds = new Set((myPendingReqs || []).map(r => r.clan_id));

    let createBoxHtml = '';
    if (status.hasClan) {
        createBoxHtml = `
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:16px; padding:14px; margin-bottom:16px; font-size:12px; color:#15803d;">
        ✅ คุณมีสังกัดแคลน <b>${escapeHtmlClan(userClanMembership.clan.name)}</b> อยู่แล้ว (หากต้องการสร้างหรือย้ายแคลน ต้องออกจากแคลนเดิมก่อน)
      </div>
    `;
    } else {
        createBoxHtml = `
      <div style="background:#fff; border-radius:16px; padding:16px; margin-bottom:16px; border:1px solid #e5e7eb; box-shadow:0 2px 10px rgba(0,0,0,0.03);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:15px; font-weight:800; color:#1f2937;">🏰 ก่อตั้งแคลนของคุณ (ฟรี 100%)</div>
          <span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:999px; background:${status.eligible ? '#dcfce7' : '#fef3c7'}; color:${status.eligible ? '#15803d' : '#b45309'};">
            ${status.eligible ? 'ผ่านเกณฑ์ครบแล้ว' : 'ยังไม่ครบเกณฑ์'}
          </span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-bottom:12px; font-size:11px;">
          <div style="background:${status.passLevel ? '#f0fdf4' : '#f9fafb'}; border:1px solid ${status.passLevel ? '#86efac' : '#e5e7eb'}; border-radius:10px; padding:8px; text-align:center;">
            <div style="color:#6b7280;">เลเวล ≥ ${CLAN_CREATE_RULES.minLevel}</div>
            <div style="font-weight:800; color:${status.passLevel ? '#16a34a' : '#374151'}; margin-top:2px;">Lv.${status.level} ${status.passLevel ? '✓' : ''}</div>
          </div>
          <div style="background:${status.passDist ? '#f0fdf4' : '#f9fafb'}; border:1px solid ${status.passDist ? '#86efac' : '#e5e7eb'}; border-radius:10px; padding:8px; text-align:center;">
            <div style="color:#6b7280;">ระยะสะสม ≥ ${CLAN_CREATE_RULES.minDistanceKm} กม.</div>
            <div style="font-weight:800; color:${status.passDist ? '#16a34a' : '#374151'}; margin-top:2px;">${status.totalDistKm.toFixed(1)} กม. ${status.passDist ? '✓' : ''}</div>
          </div>
          <div style="background:${status.passCount ? '#f0fdf4' : '#f9fafb'}; border:1px solid ${status.passCount ? '#86efac' : '#e5e7eb'}; border-radius:10px; padding:8px; text-align:center;">
            <div style="color:#6b7280;">กิจกรรม ≥ ${CLAN_CREATE_RULES.minJourneys} ครั้ง</div>
            <div style="font-weight:800; color:${status.passCount ? '#16a34a' : '#374151'}; margin-top:2px;">${status.totalJourneys} ครั้ง ${status.passCount ? '✓' : ''}</div>
          </div>
        </div>

        <button type="button" onclick="openCreateClanModal()" ${status.eligible ? '' : 'disabled'}
          style="width:100%; padding:11px; border:none; border-radius:12px; font-size:13px; font-weight:800; cursor:${status.eligible ? 'pointer' : 'not-allowed'}; background:${status.eligible ? 'linear-gradient(90deg, #0E4D24, #168039)' : '#e5e7eb'}; color:${status.eligible ? '#fff' : '#9ca3af'};">
          ${status.eligible ? '✨ สร้างแคลนของฉันเลย' : '🔒 วิ่งสะสมให้ครบตามเกณฑ์เพื่อปลดล็อกการสร้างแคลน'}
        </button>
      </div>
    `;
    }

    const clansHtml = (clansList || []).length === 0
        ? '<div style="text-align:center; color:#9ca3af; padding:24px;">ยังไม่มีแคลนเปิดรับสมัครในขณะนี้</div>'
        : (clansList || []).map(c => {
            const memberCount = c.clan_members?.[0]?.count || 0;
            const isFull = memberCount >= (c.max_members || 25);
            const isPending = pendingClanIds.has(c.id);
            const isMine = userClanMembership?.clan_id === c.id;

            let btnHtml = '';
            if (isMine) {
                btnHtml = `<span style="font-size:11px; font-weight:700; color:#16a34a;">แคลนของคุณ</span>`;
            } else if (status.hasClan) {
                btnHtml = `<span style="font-size:11px; color:#9ca3af;">มีแคลนแล้ว</span>`;
            } else if (c.join_mode === 'closed' || isFull) {
                btnHtml = `<span style="font-size:11px; color:#ef4444; font-weight:600;">${isFull ? 'เต็มแล้ว' : 'ปิดรับ'}</span>`;
            } else if (isPending) {
                btnHtml = `<span style="font-size:11px; background:#fef3c7; color:#b45309; padding:5px 10px; border-radius:8px; font-weight:700;">รออนุมัติ</span>`;
            } else {
                const btnText = c.join_mode === 'open' ? 'เข้าร่วม' : 'ขอเข้าร่วม';
                btnHtml = `
            <button type="button" onclick="joinOrRequestClan('${c.id}', '${c.join_mode}')"
              style="background:#168039; color:#fff; border:none; padding:7px 12px; border-radius:9px; font-size:12px; font-weight:700; cursor:pointer;">
              ${btnText}
            </button>
          `;
            }

            return `
          <div style="background:#fff; border-radius:14px; padding:13px; margin-bottom:10px; border:1px solid #f3f4f6; display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div style="display:flex; align-items:center; gap:10px; min-width:0;">
              <div style="width:42px; height:42px; border-radius:12px; background:${c.accent_color || '#168039'}20; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
                ${c.emblem || '🛡️'}
              </div>
              <div style="min-width:0;">
                <div style="font-size:14px; font-weight:700; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${escapeHtmlClan(c.name)} ${c.tag ? `<span style="font-size:11px; color:#6b7280;">[${escapeHtmlClan(c.tag)}]</span>` : ''}
                </div>
                <div style="font-size:11px; color:#6b7280;">Lv.${c.level} • สมาชิก ${memberCount}/${c.max_members} คน • ${c.join_mode === 'open' ? 'เปิดรับทันที' : c.join_mode === 'approval' ? 'รออนุมัติ' : 'ปิดรับ'}</div>
                ${c.motto ? `<div style="font-size:11px; color:#4b5563; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">"${escapeHtmlClan(c.motto)}"</div>` : ''}
              </div>
            </div>
            <div style="flex-shrink:0;">${btnHtml}</div>
          </div>
        `;
        }).join('');

    container.innerHTML = `
    ${createBoxHtml}
    <div style="font-size:13px; font-weight:700; color:#374151; margin-bottom:10px;">🔎 รายชื่อแคลนทั้งหมด</div>
    ${clansHtml}
  `;
}

function openCreateClanModal() {
    if (!cachedEligibleStats || !cachedEligibleStats.eligible) {
        showToast('⚠️ คุณสมบัติยังไม่ครบตามเกณฑ์การสร้างแคลน');
        return;
    }
    openTopLayer('create-clan-modal', 'flex');
}

function closeCreateClanModal() {
    closeTopLayer('create-clan-modal');
}

async function handleCreateClanSubmit(event) {
    event.preventDefault();
    if (!supabaseClient || !currentUser) return;

    const status = await checkClanCreationEligibility();
    if (!status.eligible) {
        showToast('⚠️ คุณไม่สามารถสร้างแคลนได้ในขณะนี้');
        return;
    }

    const name = document.getElementById('new-clan-name')?.value.trim() || '';
    const tag = document.getElementById('new-clan-tag')?.value.trim().toUpperCase() || null;
    const emblem = document.getElementById('new-clan-emblem')?.value || '🛡️';
    const accentColor = document.getElementById('new-clan-color')?.value || '#168039';
    const joinMode = document.getElementById('new-clan-join-mode')?.value || 'open';
    const motto = document.getElementById('new-clan-motto')?.value.trim() || '';

    if (name.length < 2 || name.length > 32) {
        showToast('⚠️ ชื่อแคลนต้องมีความยาว 2–32 ตัวอักษร');
        return;
    }

    try {
        const { data: createdClan, error: clanErr } = await supabaseClient
            .from('clans')
            .insert([{
                name,
                tag: tag || null,
                emblem,
                accent_color: accentColor,
                join_mode: joinMode,
                motto,
                leader_id: currentUser.id
            }])
            .select()
            .single();

        if (clanErr) {
            if (clanErr.code === '23505') {
                showToast('❌ ชื่อแคลนนี้มีผู้ใช้งานแล้ว กรุณาใช้ชื่ออื่น');
            } else {
                showToast('❌ สร้างแคลนไม่สำเร็จ: ' + clanErr.message);
            }
            return;
        }

        const { error: memberErr } = await supabaseClient
            .from('clan_members')
            .insert([{
                clan_id: createdClan.id,
                user_id: currentUser.id,
                role: 'leader'
            }]);

        if (memberErr) {
            showToast('❌ เพิ่มหัวแคลนไม่สำเร็จ: ' + memberErr.message);
            return;
        }

        // สร้างแถวคะแนนเริ่มต้นในรอบสงครามปัจจุบันทันที
        const war = getCurrentClanWarPeriod();
        await supabaseClient.from('clan_war_scores').upsert([{
            war_key: war.warKey,
            war_title: war.warTitle,
            starts_at: war.startsAt,
            ends_at: war.endsAt,
            clan_id: createdClan.id,
            score: 0,
            distance_meters: 0,
            steps: 0,
            captured_count: 0
        }], { onConflict: 'war_key,clan_id' });

        closeCreateClanModal();
        showToast(`🎉 ก่อตั้งแคลน "${createdClan.name}" สำเร็จ!`);
        await switchClanSectionTab('my-clan');
    } catch (err) {
        console.error('handleCreateClanSubmit error:', err);
        showToast('❌ เกิดข้อผิดพลาดในการสร้างแคลน');
    }
}

async function joinOrRequestClan(clanId, joinMode) {
    if (!supabaseClient || !currentUser) return;
    if (userClanMembership && userClanMembership.clan) {
        showToast('⚠️ คุณมีแคลนสังกัดอยู่แล้ว');
        return;
    }

    try {
        if (joinMode === 'open') {
            const { error } = await supabaseClient
                .from('clan_members')
                .insert([{
                    clan_id: clanId,
                    user_id: currentUser.id,
                    role: 'member'
                }]);

            if (error) {
                showToast('❌ เข้าร่วมแคลนไม่สำเร็จ: ' + error.message);
                return;
            }

            showToast('🎉 เข้าร่วมแคลนเรียบร้อยแล้ว!');
            await switchClanSectionTab('my-clan');
        } else {
            const { error } = await supabaseClient
                .from('clan_join_requests')
                .insert([{
                    clan_id: clanId,
                    user_id: currentUser.id,
                    request_type: 'join',
                    status: 'pending',
                    message: 'ขอเข้าร่วมแคลนเพื่อร่วมศึกสงคราม'
                }]);

            if (error) {
                if (error.code === '23505') {
                    showToast('⏳ คุณส่งคำขอเข้าแคลนนี้ไว้แล้ว กรุณารอหัวแคลนอนุมัติ');
                } else {
                    showToast('❌ ส่งคำขอไม่สำเร็จ: ' + error.message);
                }
                return;
            }

            showToast('📩 ส่งคำขอเข้าร่วมแคลนแล้ว รอหัวแคลนอนุมัติ');
            await renderDiscoverAndCreateClanSection();
        }
    } catch (err) {
        console.error('joinOrRequestClan error:', err);
    }
}

// ============================================================================
// 7. หน้าจัดการแคลนของฉัน (รายชื่อสมาชิก + อนุมัติคำขอ + ปรับยศ/เตะ/ออก)
// ============================================================================
async function renderMyClanSection() {
    const container = document.getElementById('leaderboard-list-container');
    if (!container || !supabaseClient) return;

    if (!userClanMembership || !userClanMembership.clan) {
        container.innerHTML = `
      <div style="background:#fff; border-radius:16px; padding:28px 16px; text-align:center; border:1px solid #f3f4f6;">
        <div style="font-size:34px; margin-bottom:8px;">🛡️</div>
        <div style="font-size:15px; font-weight:700; color:#1f2937; margin-bottom:4px;">คุณยังไม่ได้สังกัดแคลน</div>
        <div style="font-size:12px; color:#6b7280; margin-bottom:14px;">เลือกเข้าร่วมแคลนที่เปิดรับ หรือสะสมระยะทางให้ครบเกณฑ์เพื่อก่อตั้งแคลนของตัวเอง</div>
        <button type="button" onclick="switchClanSectionTab('discover')"
          style="background:#168039; color:#fff; border:none; padding:10px 18px; border-radius:12px; font-size:13px; font-weight:700; cursor:pointer;">
          ไปหน้าค้นหา & สร้างแคลน
        </button>
      </div>
    `;
        return;
    }

    const clan = userClanMembership.clan;
    const myRole = userClanMembership.role;
    const isOfficer = myRole === 'leader' || myRole === 'co_leader';
    const isLeader = myRole === 'leader';

    container.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:32px 0;">⏳ กำลังโหลดข้อมูลแคลนและสมาชิก...</div>';

    try {
        const formatMemberLabel = (p, fallback = 'นักวิ่ง KaoKhet') => {
            const name = (p?.display_name || '').trim();
            if (name) return name;
            return p?.email || fallback;
        };

        const { data: members } = await supabaseClient
            .from('clan_members')
            .select('*')
            .eq('clan_id', clan.id)
            .order('contribution_score', { ascending: false });

        const memberIds = (members || []).map(m => m.user_id);
        const { data: profilesData } = memberIds.length > 0
            ? await supabaseClient.from('profiles').select('id, email, display_name, level').in('id', memberIds)
            : { data: [] };

        const profileMap = {};
        (profilesData || []).forEach(p => { profileMap[p.id] = p; });

        let pendingSectionHtml = '';
        if (isOfficer) {
            const { data: pendingReqs } = await supabaseClient
                .from('clan_join_requests')
                .select('*')
                .eq('clan_id', clan.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: true });

            const reqIds = (pendingReqs || []).map(r => r.user_id);
            const { data: reqProfiles } = reqIds.length > 0
                ? await supabaseClient.from('profiles').select('id, email, display_name, level').in('id', reqIds)
                : { data: [] };
            const reqProfileMap = {};
            (reqProfiles || []).forEach(p => { reqProfileMap[p.id] = p; });

            if (pendingReqs && pendingReqs.length > 0) {
                pendingSectionHtml = `
          <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:16px; padding:14px; margin-bottom:14px;">
            <div style="font-size:13px; font-weight:800; color:#92400e; margin-bottom:8px;">📩 คำขอเข้าร่วมแคลน (${pendingReqs.length})</div>
            ${pendingReqs.map(req => {
                    const p = reqProfileMap[req.user_id] || {};
                    return `
                <div style="background:#fff; border-radius:10px; padding:10px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <div style="min-width:0;">
                    <div style="font-size:12.5px; font-weight:700; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtmlClan(formatMemberLabel(p, req.user_id))}</div>
                    <div style="font-size:11px; color:#6b7280;">Lv.${p.level || 1}</div>
                  </div>
                  <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button type="button" onclick="reviewClanJoinRequest('${req.id}', '${req.user_id}', 'approved')"
                      style="background:#22c55e; color:#fff; border:none; padding:5px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">รับเข้าทีม</button>
                    <button type="button" onclick="reviewClanJoinRequest('${req.id}', '${req.user_id}', 'rejected')"
                      style="background:#f3f4f6; color:#ef4444; border:none; padding:5px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">ปฏิเสธ</button>
                  </div>
                </div>
              `;
                }).join('')}
          </div>
        `;
            }
        }

        const nextLevelXp = (clan.level || 1) * 2000;
        const xpProgressPct = Math.min(100, Math.round(((clan.total_xp || 0) % 2000) / 20));

        const membersHtml = (members || []).map((m, idx) => {
            const p = profileMap[m.user_id] || {};
            const isMe = m.user_id === currentUser.id;
            const roleBadge = m.role === 'leader'
                ? '<span style="background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:700;">👑 หัวแคลน</span>'
                : m.role === 'co_leader'
                    ? '<span style="background:#dbeafe; color:#1d4ed8; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:700;">⭐ รองหัวแคลน</span>'
                    : '<span style="background:#f3f4f6; color:#6b7280; padding:2px 6px; border-radius:6px; font-size:10px;">สมาชิก</span>';

            let manageBtns = '';
            if (!isMe && m.role !== 'leader') {
                if (isLeader) {
                    const nextRole = m.role === 'co_leader' ? 'member' : 'co_leader';
                    const roleBtnLabel = m.role === 'co_leader' ? 'ลดขั้น' : 'ตั้งรองฯ';
                    manageBtns += `
            <button type="button" onclick="changeClanMemberRole('${m.id}', '${nextRole}')"
              style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 7px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;">
              ${roleBtnLabel}
            </button>
          `;
                }
                if (isOfficer) {
                    manageBtns += `
            <button type="button" onclick="kickClanMember('${m.id}')"
              style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 7px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;">
              เตะ
            </button>
          `;
                }
            }

            return `
        <div style="background:#fff; border-radius:12px; padding:11px 12px; margin-bottom:8px; border:1px solid #f3f4f6; display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div style="min-width:0;">
            <div style="font-size:13px; font-weight:700; color:#1f2937; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span>#${idx + 1} ${escapeHtmlClan(formatMemberLabel(p, 'นักวิ่ง KaoKhet'))}</span>
              ${roleBadge}
            </div>
            <div style="font-size:11px; color:#6b7280; margin-top:2px;">
              ช่วยทีม ${Number(m.contribution_score || 0).toLocaleString()} แต้ม • ${((m.contribution_meters || 0) / 1000).toFixed(2)} กม. • ยึด ${m.contribution_captures || 0} โซน
            </div>
          </div>
          <div style="display:flex; gap:4px; flex-shrink:0;">${manageBtns}</div>
        </div>
      `;
        }).join('');

        container.innerHTML = `
      <div style="background:linear-gradient(135deg, ${clan.accent_color || '#168039'} 0%, #0f172a 100%); color:#fff; border-radius:18px; padding:16px; margin-bottom:14px; box-shadow:0 6px 18px rgba(0,0,0,0.12);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:48px; height:48px; border-radius:14px; background:rgba(255,255,255,0.16); display:flex; align-items:center; justify-content:center; font-size:26px;">
              ${clan.emblem || '🛡️'}
            </div>
            <div>
              <div style="font-size:17px; font-weight:800;">${escapeHtmlClan(clan.name)} ${clan.tag ? `[${escapeHtmlClan(clan.tag)}]` : ''}</div>
              <div style="font-size:11px; opacity:0.88;">Lv.${clan.level} • สมาชิก ${(members || []).length}/${clan.max_members} คน • โหมด: ${clan.join_mode === 'open' ? 'เปิดรับทุกคน' : clan.join_mode === 'approval' ? 'รออนุมัติ' : 'ปิดรับ'}</div>
            </div>
          </div>
          <button type="button" onclick="leaveOrDisbandClan()"
            style="background:rgba(239,68,68,0.85); color:#fff; border:none; padding:6px 10px; border-radius:9px; font-size:11px; font-weight:700; cursor:pointer;">
            ${isLeader ? 'สลายแคลน' : 'ออกจากแคลน'}
          </button>
        </div>
        ${clan.motto ? `<div style="font-size:12px; opacity:0.92; margin-top:10px; background:rgba(255,255,255,0.1); padding:7px 10px; border-radius:10px;">"${escapeHtmlClan(clan.motto)}"</div>` : ''}
        <div style="margin-top:10px;">
          <div style="display:flex; justify-content:space-between; font-size:10.5px; opacity:0.85; margin-bottom:4px;">
            <span>ค่าประสบการณ์แคลน (Clan XP)</span>
            <span>${Number(clan.total_xp || 0).toLocaleString()} XP (อัปเลเวลถัดไป ${nextLevelXp.toLocaleString()})</span>
          </div>
          <div style="height:6px; background:rgba(255,255,255,0.2); border-radius:999px; overflow:hidden;">
            <div style="height:100%; width:${xpProgressPct}%; background:#4ade80;"></div>
          </div>
        </div>
      </div>

      ${pendingSectionHtml}

      <div style="font-size:13px; font-weight:700; color:#374151; margin-bottom:8px;">👥 สมาชิกและผลงานสมทบในแคลน</div>
      ${membersHtml}
    `;
    } catch (err) {
        console.error('renderMyClanSection error:', err);
        container.innerHTML = '<div style="text-align:center; color:#ef4444; padding:24px;">❌ โหลดข้อมูลแคลนไม่สำเร็จ</div>';
    }
}

async function reviewClanJoinRequest(requestId, applicantUserId, decision) {
    if (!supabaseClient || !currentUser || !userClanMembership) return;

    try {
        const clan = userClanMembership.clan;

        if (decision === 'approved') {
            const { count } = await supabaseClient
                .from('clan_members')
                .select('id', { count: 'exact', head: true })
                .eq('clan_id', clan.id);

            if ((count || 0) >= (clan.max_members || 25)) {
                showToast('⚠️ จำนวนสมาชิกแคลนเต็มโควตาแล้ว');
                return;
            }

            const { error: insertErr } = await supabaseClient
                .from('clan_members')
                .insert([{
                    clan_id: clan.id,
                    user_id: applicantUserId,
                    role: 'member'
                }]);

            if (insertErr) {
                showToast('❌ ไม่สามารถรับสมาชิกได้ (ผู้ใช้อาจเข้าแคลนอื่นแล้ว)');
                return;
            }
        }

        await supabaseClient
            .from('clan_join_requests')
            .update({
                status: decision,
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', requestId);

        showToast(decision === 'approved' ? '✅ รับสมาชิกเข้าแคลนเรียบร้อย' : 'ปฏิเสธคำขอแล้ว');
        await renderMyClanSection();
    } catch (err) {
        console.error('reviewClanJoinRequest error:', err);
    }
}

async function changeClanMemberRole(memberRowId, newRole) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient
        .from('clan_members')
        .update({ role: newRole })
        .eq('id', memberRowId);

    if (error) {
        showToast('❌ เปลี่ยนตำแหน่งไม่สำเร็จ: ' + error.message);
        return;
    }
    showToast(newRole === 'co_leader' ? '⭐ แต่งตั้งเป็นรองหัวแคลนแล้ว' : 'ปรับตำแหน่งเป็นสมาชิกแล้ว');
    await renderMyClanSection();
}

async function kickClanMember(memberRowId) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient
        .from('clan_members')
        .delete()
        .eq('id', memberRowId);

    if (error) {
        showToast('❌ ลบสมาชิกไม่สำเร็จ: ' + error.message);
        return;
    }
    showToast('นำสมาชิกออกจากแคลนเรียบร้อย');
    await renderMyClanSection();
}

async function leaveOrDisbandClan() {
    if (!supabaseClient || !currentUser || !userClanMembership) return;
    const clan = userClanMembership.clan;
    const isLeader = userClanMembership.role === 'leader';

    if (isLeader) {
        const { error } = await supabaseClient
            .from('clans')
            .delete()
            .eq('id', clan.id)
            .eq('leader_id', currentUser.id);

        if (error) {
            showToast('❌ สลายแคลนไม่สำเร็จ: ' + error.message);
            return;
        }
        showToast('สลายแคลนเรียบร้อยแล้ว');
    } else {
        const { error } = await supabaseClient
            .from('clan_members')
            .delete()
            .eq('id', userClanMembership.id)
            .eq('user_id', currentUser.id);

        if (error) {
            showToast('❌ ออกจากแคลนไม่สำเร็จ: ' + error.message);
            return;
        }
        showToast('ออกจากแคลนเรียบร้อยแล้ว');
    }

    userClanMembership = null;
    await switchClanSectionTab('leaderboard');
}

// ============================================================================
// 8. บันทึกแต้มสงครามแคลนอัตโนมัติหลังวิ่งเสร็จ (เรียกจาก executeDatabaseInsert)
// ============================================================================
function calculateClanWarPoints({ distanceMeters = 0, steps = 0, isCaptured = false }) {
    const distPoints = Math.floor((Number(distanceMeters) || 0) / 10); // ทุก 10 เมตร = 1 แต้ม
    const stepPoints = Math.floor((Number(steps) || 0) / 100);         // ทุก 100 ก้าว = 1 แต้ม
    const captureBonus = isCaptured ? 250 : 0;                         // ยึดพื้นที่สำเร็จ +250 แต้ม
    return Math.max(0, distPoints + stepPoints + captureBonus);
}

async function recordClanWarContribution({ distanceMeters = 0, steps = 0, isCaptured = false }) {
    if (!supabaseClient || !currentUser) return;

    if (!userClanMembership) {
        await initClanSystem();
    }
    if (!userClanMembership || !userClanMembership.clan) return;

    const earnedPoints = calculateClanWarPoints({ distanceMeters, steps, isCaptured });
    if (earnedPoints <= 0 && distanceMeters <= 0 && steps <= 0) return;

    const clan = userClanMembership.clan;
    const war = getCurrentClanWarPeriod();

    try {
        // 1. อัปเดตผลงานสมทบรายบุคคลใน clan_members
        const nextMemberScore = (Number(userClanMembership.contribution_score) || 0) + earnedPoints;
        const nextMemberMeters = (Number(userClanMembership.contribution_meters) || 0) + Math.round(distanceMeters);
        const nextMemberSteps = (Number(userClanMembership.contribution_steps) || 0) + Math.round(steps);
        const nextMemberCaptures = (Number(userClanMembership.contribution_captures) || 0) + (isCaptured ? 1 : 0);

        await supabaseClient
            .from('clan_members')
            .update({
                contribution_score: nextMemberScore,
                contribution_meters: nextMemberMeters,
                contribution_steps: nextMemberSteps,
                contribution_captures: nextMemberCaptures
            })
            .eq('id', userClanMembership.id);

        // 2. อัปเดต XP และเลเวลแคลนใน clans
        const nextClanXp = (Number(clan.total_xp) || 0) + earnedPoints;
        const nextClanLevel = Math.floor(nextClanXp / 2000) + 1;
        await supabaseClient
            .from('clans')
            .update({
                total_xp: nextClanXp,
                level: nextClanLevel
            })
            .eq('id', clan.id);

        // 3. อัปเดตคะแนนประจำรอบสงครามใน clan_war_scores
        const { data: existingWarRow } = await supabaseClient
            .from('clan_war_scores')
            .select('*')
            .eq('war_key', war.warKey)
            .eq('clan_id', clan.id)
            .maybeSingle();

        if (existingWarRow) {
            await supabaseClient
                .from('clan_war_scores')
                .update({
                    score: (Number(existingWarRow.score) || 0) + earnedPoints,
                    distance_meters: (Number(existingWarRow.distance_meters) || 0) + Math.round(distanceMeters),
                    steps: (Number(existingWarRow.steps) || 0) + Math.round(steps),
                    captured_count: (Number(existingWarRow.captured_count) || 0) + (isCaptured ? 1 : 0)
                })
                .eq('id', existingWarRow.id);
        } else {
            await supabaseClient
                .from('clan_war_scores')
                .insert([{
                    war_key: war.warKey,
                    war_title: war.warTitle,
                    starts_at: war.startsAt,
                    ends_at: war.endsAt,
                    clan_id: clan.id,
                    score: earnedPoints,
                    distance_meters: Math.round(distanceMeters),
                    steps: Math.round(steps),
                    captured_count: isCaptured ? 1 : 0
                }]);
        }

        await initClanSystem();
        if (earnedPoints > 0) {
            showToast(`⚔️ สมทบแต้มให้แคลน ${clan.name} +${earnedPoints.toLocaleString()} แต้ม!`);
        }
    } catch (err) {
        console.error('recordClanWarContribution error:', err);
    }
}