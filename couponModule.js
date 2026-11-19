// ==========================================
// 🎟️ couponModule.js — ระบบคูปอง กระเป๋าคูปองแบบซ้อนการ์ด และการลบคูปอง
// ==========================================

let walletCurrentIndex = 0;
let walletTouchStartX = 0;
let walletEventsBound = false;

function useCoupon(couponId, couponCode, couponTitle, couponDetailsText = '') {
  selectedCouponIdForUse = couponId;

  const modal = document.getElementById('use-coupon-modal');
  const titleEl = document.getElementById('modal-coupon-title');
  const codeEl = document.getElementById('modal-coupon-code');
  const qrEl = document.getElementById('modal-coupon-qr');
  const detailsEl = document.getElementById('modal-coupon-details');

  if (titleEl) titleEl.innerText = couponTitle || 'คูปองส่วนลด KaoKhet';
  if (codeEl) codeEl.innerText = couponCode || 'KAOKHET-COUPON';
  if (qrEl) {
    qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(couponCode || 'KAOKHET')}`;
  }
  if (detailsEl) {
    detailsEl.innerHTML = couponDetailsText || 'กดปุ่ม "ปิดหน้าต่าง" เพื่อกลับไปยังกระเป๋าคูปอง';
  }

  if (modal) modal.style.display = 'flex';
}

function closeUseCouponModal() {
  const modal = document.getElementById('use-coupon-modal');
  if (modal) modal.style.display = 'none';
  selectedCouponIdForUse = null;
}

async function processRedeemUserCoupon(couponId) {
  try {
    const { error } = await supabaseClient
      .from('user_coupons')
      .update({ is_redeemed: true, redeemed_at: new Date().toISOString() })
      .eq('id', couponId);

    if (error) throw error;

    showToast('🎉 ใช้คูปองสำเร็จเรียบร้อยแล้ว!');
    closeUseCouponModal();

    if (currentUser) {
      await loadMyCoupons(currentUser.id);
    }
  } catch (err) {
    console.error('Error redeeming coupon:', err);
    showToast('❌ ไม่สามารถกดใช้คูปองได้ กรุณาลองใหม่อีกครั้ง');
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
      useCoupon(couponId, couponCode, couponTitle, couponDetails);
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
  container.style.minHeight = '90px';
  container.innerHTML = `<div style="text-align:center; padding:16px; color:#6b7280; font-size:13px;">กำลังโหลดคูปองของคุณ...</div>`;

  try {
    if (!supabaseClient) {
      throw new Error("ไม่พบตัวแปรเชื่อมต่อ Supabase ในระบบ");
    }

    const activeUserId = targetUserId || currentUser?.id;
    if (!activeUserId) {
      container.innerHTML = `<div style="text-align:center; padding:18px; color:#9ca3af; font-size:13px;">ยังไม่มีคูปองในกระเป๋าของคุณ</div>`;
      return;
    }

    const { data: userCoupons, error: ucError } = await supabaseClient
      .from('user_coupons')
      .select('id, coupon_code, is_redeemed, created_at, campaign_id')
      .eq('user_id', activeUserId)
      .order('created_at', { ascending: false });

    if (ucError) throw ucError;

    if (!userCoupons || userCoupons.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:18px; color:#9ca3af; font-size:13px;">ยังไม่มีคูปองในกระเป๋าของคุณ</div>`;
      return;
    }

    const campaignIds = [...new Set(userCoupons.map(c => c.campaign_id).filter(Boolean))];
    const campaignMap = new Map();

    if (campaignIds.length > 0) {
      const { data: campaigns, error: campError } = await supabaseClient
        .from('campaigns')
        .select('id, title, reward_details, merchant_name')
        .in('id', campaignIds);

      if (campError) throw campError;
      (campaigns || []).forEach(camp => campaignMap.set(camp.id, camp));
    }

    container.innerHTML = userCoupons.map(uc => {
      const camp = campaignMap.get(uc.campaign_id) || {};
      const merchantName = (camp.merchant_name && camp.merchant_name.trim() !== '')
        ? camp.merchant_name
        : 'ร้านค้าทั่วไป';
      const title = camp.title || 'แคมเปญส่วนลด';
      const reward = camp.reward_details || 'สิทธิ์พิเศษ';

      const claimedDate = new Date(uc.created_at).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      const couponCode = uc.coupon_code || ('KAOKHET-' + uc.id.substring(0, 6).toUpperCase());
      const isRedeemed = uc.is_redeemed === true;
      const cardClass = isRedeemed ? 'coupon-card redeemed' : 'coupon-card';

      const detailsHtml = encodeURIComponent(
        `<div><strong>ร้านค้า:</strong> ${merchantName}</div>` +
        `<div><strong>สิทธิ์ที่ได้รับ:</strong> ${reward}</div>` +
        `<div><strong>รับเมื่อ:</strong> ${claimedDate}</div>` +
        `<div><strong>สถานะ:</strong> ${isRedeemed ? 'ใช้งานเรียบร้อยแล้ว' : 'พร้อมใช้งาน'}</div>`
      );

      return `
        <div class="${cardClass}"
             data-coupon-id="${uc.id}"
             data-coupon-code="${couponCode}"
             data-coupon-title="${title.replace(/"/g, '&quot;')}"
             data-coupon-details="${detailsHtml}">
          <div class="coupon-notch-top"></div>
          <div class="coupon-notch-bottom"></div>

          <div class="coupon-left">
            <div class="vip-badge">${isRedeemed ? 'USED' : 'VIP'}</div>
            <div class="coupon-icon">${isRedeemed ? '✅' : '🎟️'}</div>
          </div>

          <div class="coupon-divider"></div>

          <div class="coupon-right">
            <div class="merchant-tag">🏪 ${merchantName}</div>
            <div class="coupon-title">${title}</div>
            <div class="coupon-reward">สิทธิ์: ${reward}</div>
            <div class="coupon-meta">รับเมื่อ: ${claimedDate}</div>

            ${isRedeemed ? `
              <div class="coupon-actions">
                <span style="font-size:11px; font-weight:700; color:#d1d5db; flex:1;">✨ ใช้งานเรียบร้อยแล้ว</span>
                <button type="button" onclick="event.stopPropagation(); deleteUserCoupon('${uc.id}')" class="delete-coupon-btn" title="ลบคูปอง">
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
      dotsWrap.innerHTML = userCoupons.map((_, i) =>
        `<span class="wallet-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`
      ).join('');
    }

    if (navBar && userCoupons.length > 1) navBar.style.display = 'flex';

    bindWalletControls(container);
    updateWalletCardPositions();

  } catch (err) {
    console.error('Error loading my coupons:', err);
    container.innerHTML = `<div style="text-align:center; padding:16px; color:#ef4444; font-size:13px;">เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถโหลดคูปองได้'}</div>`;
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
  if (!couponIdToDelete) return;

  try {
    const { error } = await supabaseClient.from('user_coupons').delete().eq('id', couponIdToDelete);
    if (error) throw error;

    showToast('🗑️ ลบคูปองออกจากกระเป๋าเรียบร้อยแล้ว');
    closeDeleteCouponModal();
    if (currentUser) await loadMyCoupons(currentUser.id);
  } catch (err) {
    console.error('Error deleting coupon:', err);
    showToast('❌ ไม่สามารถลบคูปองได้ กรุณาลองใหม่อีกครั้ง');
  }
}