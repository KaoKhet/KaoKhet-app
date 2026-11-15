// ==========================================
// 🏪 shopService.js — จัดการข้อมูลร้านค้าและสปอนเซอร์
// ==========================================

/**
 * ดึงรายการร้านค้าหรือสปอนเซอร์ทั้งหมดจากตาราง sponsors
 */
async function fetchSponsors() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('sponsors')
    .select('*')
    .eq('status', 'active');
  
  if (error) {
    console.error('Error fetching sponsors:', error);
    return [];
  }
  return data;
}

/**
 * ดึงรายการแคมเปญ / เควสต์ที่เปิดใช้งานอยู่
 */
async function fetchActiveCampaigns() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('campaigns')
    .select('*, sponsors(name, logo_url)')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching campaigns:', error);
    return [];
  }
  return data;
}

/**
 * 📝 สร้างหรือบันทึกแคมเปญใหม่ โดยดึง sponsor_id จาก Session ของ Supabase โดยตรง
 */
async function createCampaign(campaignData) {
  if (!supabaseClient) {
    alert('ไม่พบการเชื่อมต่อฐานข้อมูล');
    return { success: false, message: 'No database connection' };
  }

  try {
    // 1. ลองเช็ก User จาก Supabase Auth
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.error('Auth Error:', authError);
      alert('ไม่พบ Session ผู้ใช้ กรุณาล็อกอินใหม่อีกครั้ง');
      return { success: false, message: 'ไม่พบ Session ผู้ใช้' };
    }

    const sponsorId = user.id;
    console.log('พบ Sponsor ID:', sponsorId);

    // 2. บันทึกข้อมูล
    const { data, error } = await supabaseClient
      .from('campaigns')
      .insert([{
        title: campaignData.title,
        reward_details: campaignData.reward_details,
        points_cost: campaignData.points_cost || 0,
        is_active: campaignData.is_active ?? true,
        sponsor_id: sponsorId
      }]);

    if (error) throw error;
    
    alert('สร้างแคมเปญและบันทึก sponsor_id สำเร็จ!');
    return { success: true, message: 'สร้างแคมเปญสำเร็จ!' };
  } catch (err) {
    console.error('Error creating campaign:', err);
    alert('เกิดข้อผิดพลาด: ' + err.message);
    return { success: false, message: err.message };
  }
}

/**
 * ฟังก์ชันสำหรับให้ผู้ใช้กดรับสิทธิ์ / คูปอง (Claim / Redeem Coupon)
 */
async function claimUserCoupon(userId, campaignId, couponCode) {
  if (!supabaseClient) return { success: false, message: 'No database connection' };

  try {
    const { data, error } = await supabaseClient
      .from('user_coupons')
      .insert([{
        user_id: userId,
        campaign_id: campaignId,
        coupon_code: couponCode,
        is_redeemed: false
      }]);

    if (error) throw error;
    return { success: true, message: 'กดรับสิทธิ์สำเร็จ!' };
  } catch (err) {
    console.error('Error claiming coupon:', err);
    return { success: false, message: err.message };
  }
}

/**
 * ดึงรายการคูปองทั้งหมดในกระเป๋าของผู้ใช้งานปัจจุบัน
 */
async function fetchUserCoupons(userId) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('user_coupons')
    .select('*, campaigns(*, sponsors(*))')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching user coupons:', error);
    return [];
  }
  return data;
}