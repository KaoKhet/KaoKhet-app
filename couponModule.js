// ==========================================
// 🎟️ couponModule.js — ระบบคูปอง กระเป๋าคูปองแบบซ้อนการ์ด และการลบคูปอง
// ==========================================

let walletCurrentIndex = 0;
let walletTouchStartX = 0;
let walletEventsBound = false;
let activeOnlineCouponContext = null;

function getCouponClient() {
  return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
}

function escapeCouponHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isOnlineRewardCampaign(campaignObj = {}) {
  const cType = String(campaignObj.campaign_type || '').toLowerCase();
  const cat = String(campaignObj.category || '').toLowerCase();
  const merchant = String(campaignObj.merchant_name || '').toLowerCase();
  return (
    cType.startsWith('online_reward') ||
    cat === 'online_reward' ||
    merchant.includes('online reward')
  );
}

function getOnlineRewardSubType(campaignType = '') {
  const raw = String(campaignType || '').toLowerCase();
  if (raw.includes(':')) return raw.split(':')[1] || 'online_reward';
  return raw || 'online_reward';
}

function toggleScanHintText(cardContainer, showScanHint) {
  if (!cardContainer) return;
  cardContainer.querySelectorAll('p, div, span, small').forEach((el) => {
    if (el.children.length > 0) return;
    const txt = (el.textContent || '').trim();
    if (txt.includes('ยื่นให้พนักงาน') || txt.includes('สแกน')) {
      el.style.display = showScanHint ? '' : 'none';
    }
  });
}

function getOrCreateOnlineClaimBox(modal) {
  let box = document.getElementById('online-reward-claim-box');
  if (box) return box;

  box = document.createElement('div');
  box.id = 'online-reward-claim-box';
  box.style.cssText = 'display:none; margin:12px 0; padding:12px; border-radius:12px; background:#f0fdf4; border:1px solid #bbf7d0; text-align:left;';
  box.innerHTML = `
    <div style="font-size:13px; font-weight:700; color:#166534; margin-bottom:6px;">🌐 รับรางวัลออนไลน์ (ไม่ต้องสแกน QR ที่หน้าร้าน)</div>
    <label id="online-claim-dest-label" for="online-claim-destination-input" style="display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:4px;">
      ระบุบัญชีปลายทาง / เบอร์รับรางวัล
    </label>
    <input id="online-claim-destination-input" type="text" placeholder="เช่น เบอร์ TrueMoney Wallet หรืออีเมล/บัญชีรับรางวัล"
      style="width:100%; box-sizing:border-box; padding:9px 10px; border:1px solid #d1d5db; border-radius:8px; font-size:13px; margin-bottom:8px; background:#fff; color:#111827;" />
    <button id="btn-submit-online-reward-claim" type="button" onclick="submitOnlineRewardClaimFromCoupon()"
      style="width:100%; padding:10px 12px; border:none; border-radius:8px; background:#16a34a; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">
      📤 ยืนยันส่งคำขอรับรางวัลออนไลน์
    </button>
    <div id="online-claim-status-note" style="font-size:11px; color:#4b5563; margin-top:6px;"></div>
  `;

  const detailsEl = document.getElementById('modal-coupon-details');
  if (detailsEl && detailsEl.parentNode) {
    detailsEl.parentNode.insertBefore(box, detailsEl);
  } else if (modal && modal.firstElementChild) {
    modal.firstElementChild.appendChild(box);
  }
  return box;
}

function useCoupon(couponId, couponCode, couponTitle, couponDetailsText = '', isOnline = false, onlineMeta = {}) {
  selectedCouponIdForUse = couponId;
  activeOnlineCouponContext = isOnline
    ? {
      couponId,
      couponCode,
      couponTitle,
      campaignId: onlineMeta.campaignId || null,
      rewardType: onlineMeta.rewardType || 'online_reward',
      isRedeemed: Boolean(onlineMeta.isRedeemed)
    }
    : null;

  const modal = document.getElementById('use-coupon-modal');
  const titleEl = document.getElementById('modal-coupon-title');
  const codeEl = document.getElementById('modal-coupon-code');
  const qrEl = document.getElementById('modal-coupon-qr');
  const detailsEl = document.getElementById('modal-coupon-details');
  const cardBox = modal ? modal.firstElementChild : null;
  const onlineBox = getOrCreateOnlineClaimBox(modal);

  if (cardBox) {
    cardBox.style.display = '';
  }
  if (titleEl) titleEl.innerText = couponTitle || 'คูปองส่วนลด KaoKhet';
  if (codeEl) codeEl.innerText = couponCode || 'KAOKHET-COUPON';

  if (isOnline) {
    if (qrEl) qrEl.style.display = 'none';
    if (codeEl) codeEl.style.display = 'none';
    toggleScanHintText(cardBox, false);

    if (onlineBox) {
      onlineBox.style.display = 'block';
      const labelEl = document.getElementById('online-claim-dest-label');
      const inputEl = document.getElementById('online-claim-destination-input');
      const btnEl = document.getElementById('btn-submit-online-reward-claim');
      const noteEl = document.getElementById('online-claim-status-note');

      if (labelEl) {
        labelEl.innerText = onlineMeta.rewardType === 'truemoney'
          ? 'เบอร์ TrueMoney Wallet ที่ต้องการรับเงิน'
          : 'บัญชีปลายทาง / อีเมล / ข้อมูลสำหรับรับรางวัลออนไลน์';
      }
      if (inputEl) {
        inputEl.value = '';
        inputEl.disabled = Boolean(onlineMeta.isRedeemed);
      }
      if (btnEl) {
        btnEl.disabled = Boolean(onlineMeta.isRedeemed);
        btnEl.style.opacity = onlineMeta.isRedeemed ? '0.6' : '1';
        btnEl.innerText = onlineMeta.isRedeemed
          ? '✅ ส่งคำขอหรือใช้งานรายการนี้แล้ว'
          : '📤 ยืนยันส่งคำขอรับรางวัลออนไลน์';
      }
      if (noteEl) {
        noteEl.innerText = onlineMeta.isRedeemed
          ? 'รายการนี้ถูกบันทึกหรือใช้งานไปแล้ว'
          : 'เมื่อกดยืนยัน ระบบจะส่งคำขอให้แอดมินตรวจสอบและแจ้งเตือนกลับที่กระดิ่งแอป';
      }
    }
  } else {
    if (qrEl) {
      qrEl.style.display = '';
      qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(couponCode || 'KAOKHET')}`;
    }
    if (codeEl) codeEl.style.display = '';
    toggleScanHintText(cardBox, true);
    if (onlineBox) onlineBox.style.display = 'none';
  }

  if (detailsEl) {
    detailsEl.innerHTML = couponDetailsText || 'กดปุ่ม "ปิดหน้าต่าง" เพื่อกลับไปยังกระเป๋าคูปอง';
  }

  if (modal) {
    modal.style.display = 'flex';
    modal.style.zIndex = '9999';
  }
}

function closeUseCouponModal() {
  const modal = document.getElementById('use-coupon-modal');
  if (modal) modal.style.display = 'none';
  selectedCouponIdForUse = null;
  activeOnlineCouponContext = null;
}

async function submitOnlineRewardClaimFromCoupon() {
  const client = getCouponClient();
  const ctx = activeOnlineCouponContext;
  if (!client || !ctx || ctx.isRedeemed) return;

  const inputEl = document.getElementById('online-claim-destination-input');
  const btnEl = document.getElementById('btn-submit-online-reward-claim');
  const destinationAccount = inputEl?.value.trim() || '';

  if (!destinationAccount) {
    if (typeof showToast === 'function') {
      showToast('⚠️ กรุณาระบุเบอร์หรือบัญชีปลายทางก่อนส่งคำขอ');
    } else {
      alert('กรุณาระบุเบอร์หรือบัญชีปลายทางก่อนส่งคำขอ');
    }
    inputEl?.focus();
    return;
  }

  if (typeof ensureCurrentUser === 'function') {
    await ensureCurrentUser();
  }
  let activeUserId = (typeof currentUser !== 'undefined' && currentUser?.id) ? currentUser.id : null;
  if (!activeUserId && client?.auth) {
    const { data } = await client.auth.getSession();
    activeUserId = data?.session?.user?.id || null;
  }

  if (!activeUserId) {
    alert('กรุณาล็อกอินก่อนส่งคำขอรับรางวัล');
    return;
  }

  if (btnEl) btnEl.disabled = true;

  try {
    const claimCode = `#CLM-${Date.now().toString().slice(-6)}`;
    const { error: claimErr } = await client
      .from('reward_claims')
      .insert({
        claim_code: claimCode,
        user_id: activeUserId,
        campaign_id: ctx.campaignId,
        coupon_id: ctx.couponId || null,
        reward_type: ctx.rewardType || 'online_reward',
        destination_account: destinationAccount,
        status: 'pending'
      });

    if (claimErr) throw claimErr;

    if (ctx.couponId) {
      const { error: couponErr } = await client
        .from('user_coupons')
        .update({ is_redeemed: true, redeemed_at: new Date().toISOString() })
        .eq('id', ctx.couponId);
      if (couponErr) console.warn('Update user_coupons warning:', couponErr.message);
    }

    if (typeof showToast === 'function') {
      showToast(`🎁 ส่งคำขอ ${claimCode} สำเร็จแล้ว! รอแอดมินจัดส่งรางวัล`);
    } else {
      alert(`ส่งคำขอรับรางวัล ${claimCode} เรียบร้อยแล้ว`);
    }

    closeUseCouponModal();
    await loadMyCoupons(activeUserId);
  } catch (err) {
    console.error('Error submitting online reward claim:', err);
    if (typeof showToast === 'function') {
      showToast('❌ ส่งคำขอรับรางวัลไม่สำเร็จ: ' + (err.message || ''));
    } else {
      alert('ส่งคำขอรับรางวัลไม่สำเร็จ: ' + (err.message || ''));
    }
    if (btnEl) btnEl.disabled = false;
  }
}

async function processRedeemUserCoupon(couponId) {
  const client = getCouponClient();
  if (!couponId || !client) return;

  try {
    const { error } = await client
      .from('user_coupons')
      .update({ is_redeemed: true, redeemed_at: new Date().toISOString() })
      .eq('id', couponId);

    if (error) throw error;

    if (typeof showToast === 'function') showToast('🎉 ใช้คูปองสำเร็จเรียบร้อยแล้ว!');
    closeUseCouponModal();

    if (typeof ensureCurrentUser === 'function') {
      await ensureCurrentUser();
    }
    if (typeof currentUser !== 'undefined' && currentUser?.id) {
      await loadMyCoupons(currentUser.id);
    }
  } catch (err) {
    console.error('Error redeeming coupon:', err);
    if (typeof showToast === 'function') {
      showToast('❌ ไม่สามารถกดใช้คูปองได้ กรุณาลองใหม่อีกครั้ง');
    }
  }
}

function updateWalletDots() {
  const dots = document.querySelectorAll('#walletPageDots .wallet-dot');
  const prevBtn = document.getElementById('walletPrevBtn');
  const nextBtn = document.getElementById('walletNextBtn');

  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === walletCurrentIndex);
  });

  if (prevBtn) prevBtn.disabled = dots.length <= 1;
  if (nextBtn) nextBtn.disabled = dots.length <= 1;
}

function updateWalletCardPositions() {
  const container = document.getElementById('my-coupons-container');
  if (!container) return;

  const cards = container.querySelectorAll('.coupon-card');
  const total = cards.length;
  if (total === 0) return;

  if (walletCurrentIndex >= total) walletCurrentIndex = 0;

  let maxCardHeight = 136;

  cards.forEach((card, idx) => {
    const relIndex = (idx - walletCurrentIndex + total) % total;

    if (relIndex === 0) {
      card.style.display = 'flex';
      card.style.transform = 'translateX(0px) translateY(0px) scale(1)';
      card.style.opacity = '1';
      card.style.zIndex = '10';
      if (card.offsetHeight > 0) {
        maxCardHeight = Math.max(maxCardHeight, card.offsetHeight + 14);
      }
    } else if (relIndex === 1) {
      card.style.display = 'flex';
      card.style.transform = 'translateX(8px) translateY(6px) scale(0.97)';
      card.style.opacity = '0.75';
      card.style.zIndex = '5';
    } else if (relIndex === 2) {
      card.style.display = 'flex';
      card.style.transform = 'translateX(14px) translateY(12px) scale(0.94)';
      card.style.opacity = '0.45';
      card.style.zIndex = '2';
    } else {
      card.style.display = 'none';
    }
  });

  container.style.minHeight = `${maxCardHeight}px`;
  updateWalletDots();
}

function nextWalletCard() {
  const count = document.querySelectorAll('#my-coupons-container .coupon-card').length;
  if (count <= 1) return;
  walletCurrentIndex = (walletCurrentIndex + 1) % count;
  updateWalletCardPositions();
}

function prevWalletCard() {
  const count = document.querySelectorAll('#my-coupons-container .coupon-card').length;
  if (count <= 1) return;
  walletCurrentIndex = (walletCurrentIndex - 1 + count) % count;
  updateWalletCardPositions();
}

function bindWalletControls(container) {
  const prevBtn = document.getElementById('walletPrevBtn');
  const nextBtn = document.getElementById('walletNextBtn');
  const dotsWrap = document.getElementById('walletPageDots');

  if (prevBtn) prevBtn.onclick = prevWalletCard;
  if (nextBtn) nextBtn.onclick = nextWalletCard;

  if (dotsWrap) {
    dotsWrap.querySelectorAll('.wallet-dot').forEach((dot, idx) => {
      dot.onclick = () => {
        walletCurrentIndex = idx;
        updateWalletCardPositions();
      };
    });
  }

  container.querySelectorAll('.coupon-card').forEach((card, idx) => {
    card.onclick = (e) => {
      if (e.target.closest('button')) return;

      if (idx !== walletCurrentIndex) {
        walletCurrentIndex = idx;
        updateWalletCardPositions();
        return;
      }

      const couponId = card.dataset.couponId;
      const couponCode = card.dataset.couponCode;
      const couponTitle = card.dataset.couponTitle;
      const couponDetails = card.dataset.couponDetails;
      const isOnline = card.dataset.isOnline === 'true';
      const rewardType = card.dataset.rewardType || 'online_reward';
      const campaignId = card.dataset.campaignId || null;
      const isRedeemed = card.dataset.isRedeemed === 'true';

      useCoupon(couponId, couponCode, couponTitle, couponDetails, isOnline, {
        rewardType,
        campaignId,
        isRedeemed
      });
    };
  });

  if (!walletEventsBound) {
    container.addEventListener('touchstart', (e) => {
      walletTouchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      const diff = walletTouchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 40) {
        if (diff > 0) nextWalletCard();
        else prevWalletCard();
      }
    }, { passive: true });

    walletEventsBound = true;
  }
}
// ==========================================
// 🎟️ โหลดกระเป๋าคูปอง
// ==========================================
async function loadMyCoupons(targetUserId = null) {
  const container = document.getElementById('my-coupons-container');
  const navBar = document.getElementById('walletNavBar');
  const dotsWrap = document.getElementById('walletPageDots');

  if (!container) {
    console.error("ไม่พบ element ID 'my-coupons-container'");
    return;
  }

  walletCurrentIndex = 0;
  if (navBar) navBar.style.display = 'none';
  if (dotsWrap) dotsWrap.innerHTML = '';
  container.style.minHeight = '90px';
  container.innerHTML = `<div style="text-align:center; padding:16px; color:#6b7280; font-size:13px;">กำลังโหลดคูปองของคุณ...</div>`;

  try {
    const client = getCouponClient();
    if (!client) {
      throw new Error("ไม่พบตัวแปรเชื่อมต่อ Supabase ในระบบ");
    }

    if (!targetUserId && typeof ensureCurrentUser === 'function') {
      await ensureCurrentUser();
    }

    const activeUserId = targetUserId || (typeof currentUser !== 'undefined' ? currentUser?.id : null);
    if (!activeUserId) {
      container.innerHTML = `<div style="text-align:center; padding:18px; color:#9ca3af; font-size:13px;">ยังไม่มีคูปองในกระเป๋าของคุณ</div>`;
      return;
    }

    const { data: userCoupons, error: ucError } = await client
      .from('user_coupons')
      .select('id, coupon_code, is_redeemed, created_at, redeemed_at, campaign_id, transfer_count, transferred_from')
      .eq('user_id', activeUserId)
      .order('created_at', { ascending: false });

    if (ucError) throw ucError;

    userCouponsList = userCoupons || [];

    if (userCouponsList.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:18px; color:#9ca3af; font-size:13px;">ยังไม่มีคูปองในกระเป๋าของคุณ</div>`;
      return;
    }

    const campaignIds = [...new Set(userCouponsList.map(c => c.campaign_id).filter(Boolean))];
    const campaignMap = new Map();

    if (campaignIds.length > 0) {
      const { data: campaigns, error: campError } = await client
        .from('campaigns')
        .select('id, title, reward_details, merchant_name, campaign_type, category')
        .in('id', campaignIds);

      if (campError) throw campError;
      (campaigns || []).forEach(camp => campaignMap.set(camp.id, camp));
    }

    container.innerHTML = userCouponsList.map(uc => {
      const camp = campaignMap.get(uc.campaign_id) || {};
      const isOnline = isOnlineRewardCampaign(camp);
      const rewardSubType = getOnlineRewardSubType(camp.campaign_type);
      const merchantName = (camp.merchant_name && camp.merchant_name.trim() !== '')
        ? camp.merchant_name
        : (isOnline ? 'KaoKhet Online Reward' : 'ร้านค้าทั่วไป');
      const title = camp.title || 'แคมเปญส่วนลด';
      const reward = camp.reward_details || 'สิทธิ์พิเศษ';

      const claimedDate = uc.created_at
        ? new Date(uc.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
        : '-';

      const redeemedDate = uc.redeemed_at
        ? new Date(uc.redeemed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
        : '';

      const fallbackSuffix = String(uc.id || '').substring(0, 6).toUpperCase() || 'COUPON';
      const couponCode = uc.coupon_code || ('KAOKHET-' + fallbackSuffix);
      const isRedeemed = uc.is_redeemed === true;
      const isTransferredCoupon = Number(uc.transfer_count || 0) >= 1 || Boolean(uc.transferred_from);
      const cardClass = isRedeemed ? 'coupon-card redeemed' : 'coupon-card';

      const statusText = isRedeemed
        ? `ดำเนินการ/ใช้งานแล้ว${redeemedDate ? ` (${escapeCouponHtml(redeemedDate)})` : ''}`
        : (isOnline ? 'พร้อมกรอกปลายทางรับรางวัลออนไลน์' : 'พร้อมใช้งานที่หน้าร้าน');

      const detailsHtml = encodeURIComponent(
        `<div><strong>ประเภท:</strong> ${isOnline ? '🌐 รางวัลออนไลน์' : '🏪 คูปองหน้าร้าน'}</div>` +
        `<div><strong>ผู้ให้สิทธิ์/ร้านค้า:</strong> ${escapeCouponHtml(merchantName)}</div>` +
        `<div><strong>สิทธิ์ที่ได้รับ:</strong> ${escapeCouponHtml(reward)}</div>` +
        `<div><strong>รับเมื่อ:</strong> ${escapeCouponHtml(claimedDate)}</div>` +
        `<div><strong>สถานะ:</strong> ${statusText}</div>`
      );

      return `
        <div class="${cardClass}"
             data-coupon-id="${escapeCouponHtml(uc.id)}"
             data-campaign-id="${escapeCouponHtml(uc.campaign_id || '')}"
             data-coupon-code="${escapeCouponHtml(couponCode)}"
             data-coupon-title="${escapeCouponHtml(title)}"
             data-coupon-details="${detailsHtml}"
             data-is-online="${isOnline ? 'true' : 'false'}"
             data-reward-type="${escapeCouponHtml(rewardSubType)}"
             data-is-redeemed="${isRedeemed ? 'true' : 'false'}">
          <div class="coupon-notch-top"></div>
          <div class="coupon-notch-bottom"></div>

          <div class="coupon-left">
            <div class="vip-badge">${isRedeemed ? 'USED' : (isOnline ? 'ONLINE' : 'VIP')}</div>
            <div class="coupon-icon">${isRedeemed ? '✅' : (isOnline ? '🌐' : '🎟️')}</div>
          </div>

          <div class="coupon-divider"></div>

          <div class="coupon-right">
            <div class="merchant-tag">${isOnline ? '🌐' : '🏪'} ${escapeCouponHtml(merchantName)}</div>
            <div class="coupon-title">${escapeCouponHtml(title)}</div>
            <div class="coupon-reward">สิทธิ์: ${escapeCouponHtml(reward)}</div>
            <div class="coupon-meta">รับเมื่อ: ${escapeCouponHtml(claimedDate)}</div>

            ${!isRedeemed && !isOnline && !isTransferredCoupon ? `
              <div class="coupon-actions" style="margin-top:6px;">
                <button type="button"
                  onclick="event.stopPropagation(); openTransferCouponModal('${escapeCouponHtml(uc.id)}', '${escapeCouponHtml(title)}')"
                  style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:4px 9px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                  🎁 ส่งให้เพื่อน
                </button>
              </div>
            ` : (!isRedeemed && !isOnline && isTransferredCoupon ? `
              <div style="font-size:10.5px; color:#9ca3af; margin-top:4px;">🔒 คูปองของขวัญ (โอนต่อไม่ได้)</div>
            ` : '')}

            ${isRedeemed ? `
              <div class="coupon-actions">
                <span style="font-size:11px; font-weight:700; color:#d1d5db; flex:1;">✨ ดำเนินการ/ใช้งานแล้ว</span>
                <button type="button" onclick="event.stopPropagation(); deleteUserCoupon('${escapeCouponHtml(uc.id)}')" class="delete-coupon-btn" title="ลบคูปอง">
                  ลบ
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.coupon-card').forEach(card => {
      if (card.dataset.couponDetails) {
        card.dataset.couponDetails = decodeURIComponent(card.dataset.couponDetails);
      }
    });

    if (dotsWrap) {
      dotsWrap.innerHTML = userCouponsList.map((_, i) =>
        `<span class="wallet-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`
      ).join('');
    }

    if (navBar && userCouponsList.length > 1) navBar.style.display = 'flex';

    bindWalletControls(container);
    updateWalletCardPositions();

  } catch (err) {
    console.error('Error loading my coupons:', err);
    container.innerHTML = `<div style="text-align:center; padding:16px; color:#ef4444; font-size:13px;">เกิดข้อผิดพลาด: ${escapeCouponHtml(err.message || 'ไม่สามารถโหลดคูปองได้')}</div>`;
  }
}

// ==========================================
// 🗑️ ฟังก์ชันลบคูปอง
// ==========================================
function deleteUserCoupon(couponId) {
  couponIdToDelete = couponId;
  const modal = document.getElementById('delete-coupon-modal');
  const confirmBtn = document.getElementById('btn-confirm-delete-coupon');

  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      await processDeleteUserCoupon();
    };
  }
  if (modal) modal.style.display = 'flex';
}

function closeDeleteCouponModal() {
  const modal = document.getElementById('delete-coupon-modal');
  if (modal) modal.style.display = 'none';
  couponIdToDelete = null;
}

async function processDeleteUserCoupon() {
  const client = getCouponClient();
  if (!couponIdToDelete || !client) return;

  try {
    const { error } = await client.from('user_coupons').delete().eq('id', couponIdToDelete);
    if (error) throw error;

    if (typeof showToast === 'function') {
      showToast('🗑️ ลบคูปองออกจากกระเป๋าเรียบร้อยแล้ว');
    }
    closeDeleteCouponModal();

    if (typeof ensureCurrentUser === 'function') {
      await ensureCurrentUser();
    }
    if (typeof currentUser !== 'undefined' && currentUser?.id) {
      await loadMyCoupons(currentUser.id);
    }
  } catch (err) {
    console.error('Error deleting coupon:', err);
    if (typeof showToast === 'function') {
      showToast('❌ ไม่สามารถลบคูปองได้ กรุณาลองใหม่อีกครั้ง');
    }
  }
}