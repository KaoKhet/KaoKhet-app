// ==========================================
// 🎵 KaoKhet Music Service (YouTube Data API v3 + IFrame Player API)
// ==========================================

const YT_API_KEY = 'AIzaSyAZfaBcJ7U1Xqwazj3X4kawsarMfQvRlbc';

let ytPlayer = null;
let ytApiReady = false;
let pendingVideoId = null;

let kkPlaylist = [];
let kkCurrentIndex = 0;
let kkIsPlaying = false;

// จำ videoId ที่เล่นผ่านตัวเล่นฝังไม่ได้ในเซสชันนี้
const blockedVideoIds = new Set();

// ตัวแปรสำหรับกันการข้ามเพลงซ้อนและจำกัดจำนวนรอบการข้ามอัตโนมัติ
let isAutoSkipping = false;
let autoSkipCount = 0;
let hasShownSkipToast = false;

// โหลด YouTube IFrame Player API อัตโนมัติ
(function loadYouTubeIframeAPI() {
    if (window.YT && window.YT.Player) {
        ytApiReady = true;
        return;
    }
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    }
})();

window.onYouTubeIframeAPIReady = function () {
    ytApiReady = true;
    ensurePlayerCreated();
};

function ensurePlayerCreated() {
    const hostEl = document.getElementById('yt-player-host');
    if (!hostEl || !window.YT || !window.YT.Player) return;

    if (ytPlayer) return;

    ytPlayer = new window.YT.Player('yt-player-host', {
        height: '180',
        width: '100%',
        playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            playsinline: 1,
            modestbranding: 1
        },
        events: {
            onReady: (event) => {
                if (pendingVideoId && typeof event.target.loadVideoById === 'function') {
                    event.target.loadVideoById(pendingVideoId);
                    kkIsPlaying = true;
                    updatePlayButtonUI();
                }
            },
            onStateChange: (event) => {
                if (event.data === window.YT.PlayerState.PLAYING) {
                    kkIsPlaying = true;
                    autoSkipCount = 0;
                    hasShownSkipToast = false;
                    updatePlayButtonUI();
                } else if (event.data === window.YT.PlayerState.PAUSED) {
                    kkIsPlaying = false;
                    updatePlayButtonUI();
                } else if (event.data === window.YT.PlayerState.ENDED) {
                    kkIsPlaying = false;
                    autoSkipCount = 0;
                    hasShownSkipToast = false;
                    updatePlayButtonUI();
                    nextSong();
                }
            },
            onError: (event) => {
                const failedSong = kkPlaylist[kkCurrentIndex];
                if (failedSong?.videoId) {
                    blockedVideoIds.add(failedSong.videoId);
                }

                kkIsPlaying = false;
                updatePlayButtonUI();
                console.warn(`⚠️ เล่นเพลงไม่ผ่าน (Error Code: ${event?.data}) บันทึก ID ที่เล่นไม่ได้แล้วกำลังข้าม...`);
                skipToNextAvailableSong();
            }
        }
    });
}

// ฟังก์ชันช่วยข้ามไปเพลงถัดไปจนกว่าจะเจอเพลงที่เล่นได้หรือครบทุกรายการ
function skipToNextAvailableSong() {
    if (isAutoSkipping || kkPlaylist.length === 0) return;

    if (autoSkipCount >= kkPlaylist.length) {
        autoSkipCount = 0;
        hasShownSkipToast = false;
        if (typeof showToast === 'function') {
            showToast('⚠️ เพลงในรายการนี้เล่นผ่านตัวเล่นฝังไม่ได้ ลองค้นหาคำอื่นครับ');
        }
        return;
    }

    isAutoSkipping = true;
    autoSkipCount += 1;

    if (!hasShownSkipToast && typeof showToast === 'function') {
        hasShownSkipToast = true;
        showToast('⏭ บางเพลงถูกบล็อกการเล่น กำลังข้ามไปเพลงที่เล่นได้...');
    }

    setTimeout(() => {
        isAutoSkipping = false;
        let nextIdx = (kkCurrentIndex + 1) % kkPlaylist.length;
        let checked = 0;

        // ข้าม ID ที่เคยบันทึกไว้ว่าเล่นไม่ได้ทันที
        while (checked < kkPlaylist.length && blockedVideoIds.has(kkPlaylist[nextIdx]?.videoId)) {
            nextIdx = (nextIdx + 1) % kkPlaylist.length;
            checked += 1;
        }

        if (checked >= kkPlaylist.length) {
            autoSkipCount = 0;
            hasShownSkipToast = false;
            if (typeof showToast === 'function') {
                showToast('⚠️ ไม่เหลือเพลงที่เล่นได้ในลิสต์นี้แล้วครับ');
            }
            return;
        }

        selectSongFromList(nextIdx);
    }, 600);
}

// ==========================================
// 🪟 การเปิด/ปิด/ย่อ วิดเจ็ตเพลง
// ==========================================
function openMusicWidget() {
    if (typeof openTopLayer === 'function') {
        openTopLayer('music-widget', 'block');
    } else {
        const widget = document.getElementById('music-widget');
        if (widget) widget.style.display = 'block';
    }
    const pill = document.getElementById('music-pill');
    if (pill) pill.style.display = 'none';

    if (ytApiReady && !ytPlayer) {
        ensurePlayerCreated(pendingVideoId || '');
    }
}

function closeMusicWidget() {
    if (typeof closeTopLayer === 'function') {
        closeTopLayer('music-widget');
    } else {
        const widget = document.getElementById('music-widget');
        if (widget) widget.style.display = 'none';
    }
    if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
        ytPlayer.stopVideo();
    }
    kkIsPlaying = false;
    updatePlayButtonUI();
}

function minimizeMusicWidget() {
    if (typeof closeTopLayer === 'function') {
        closeTopLayer('music-widget');
    } else {
        const widget = document.getElementById('music-widget');
        if (widget) widget.style.display = 'none';
    }
    const pill = document.getElementById('music-pill');
    if (pill) pill.style.display = 'flex';
}

function restoreMusicWidget() {
    openMusicWidget();
}

function initMusicSystem() {
    const input = document.getElementById('widget-search-input');
    if (input && !input.dataset.kkEnterBound) {
        input.dataset.kkEnterBound = 'true';
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchAndPlayMusic();
            }
        });
    }
    if (ytApiReady && !ytPlayer) {
        ensurePlayerCreated();
    }
}

// ==========================================
// 🔎 ค้นหาเพลงด้วย YouTube Data API v3
// ==========================================
function searchAndPlayMusic() {
    const searchInput = document.getElementById('widget-search-input');
    if (!searchInput) return;
    const query = searchInput.value.trim();
    if (!query) {
        if (typeof showToast === 'function') {
            showToast('กรุณาพิมพ์ชื่อเพลงหรือศิลปินก่อนครับ');
        }
        return;
    }
    searchRealMusic(query);
}

async function searchRealMusic(query) {
    const resultsEl = document.getElementById('search-results-list');
    if (resultsEl) {
        resultsEl.style.display = 'block';
        resultsEl.innerHTML = `<div style="padding:12px; font-size:12px; color:#6b7280; text-align:center;">⏳ กำลังค้นหาเพลง...</div>`;
    }

    autoSkipCount = 0;
    isAutoSkipping = false;
    hasShownSkipToast = false;

    try {
        const url = new URL('https://www.googleapis.com/youtube/v3/search');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('type', 'video');
        url.searchParams.set('videoEmbeddable', 'true');
        url.searchParams.set('maxResults', '15');
        url.searchParams.set('q', query);
        url.searchParams.set('key', YT_API_KEY);

        const res = await fetch(url.toString());
        const data = await res.json();

        if (!res.ok) {
            const errMsg = data?.error?.message || 'เรียก YouTube Data API ไม่สำเร็จ';
            if (resultsEl) resultsEl.style.display = 'none';
            if (typeof showToast === 'function') {
                showToast('❌ ค้นหาไม่สำเร็จ: ' + errMsg);
            }
            return;
        }

        const items = Array.isArray(data.items) ? data.items : [];
        kkPlaylist = items
            .map((item) => {
                const videoId = item?.id?.videoId;
                const snippet = item?.snippet || {};
                return {
                    videoId,
                    title: decodeHtmlEntities(snippet.title || 'ไม่ทราบชื่อเพลง'),
                    artist: decodeHtmlEntities(snippet.channelTitle || 'YouTube'),
                    thumb: snippet.thumbnails?.default?.url || ''
                };
            })
            .filter((song) => Boolean(song.videoId) && !blockedVideoIds.has(song.videoId));

        if (kkPlaylist.length > 0) {
            renderSearchResults(kkPlaylist);
        } else {
            if (resultsEl) resultsEl.style.display = 'none';
            if (typeof showToast === 'function') {
                showToast('ไม่พบเพลงที่เล่นได้จากคำค้นหานี้');
            }
        }
    } catch (err) {
        console.error('YouTube search error:', err);
        if (resultsEl) resultsEl.style.display = 'none';
        if (typeof showToast === 'function') {
            showToast('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ YouTube API');
        }
    }
}

function decodeHtmlEntities(text) {
    const txt = document.createElement('textarea');
    txt.innerHTML = text;
    return txt.value;
}

function renderSearchResults(songs) {
    const container = document.getElementById('search-results-list');
    if (!container) return;
    container.innerHTML = '';

    songs.forEach((song, index) => {
        const item = document.createElement('div');
        item.style.cssText =
            'display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #e5e7eb; cursor:pointer; background:#fff;';
        item.innerHTML = `
      <div style="width:36px; height:36px; background:#10b981; color:white; border-radius:8px; display:flex; justify-content:center; align-items:center; flex-shrink:0;">🎵</div>
      <div style="flex:1; overflow:hidden;">
        <div style="font-size:13px; font-weight:600; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(song.title)}</div>
        <div style="font-size:11px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(song.artist)}</div>
      </div>
    `;
        item.onclick = () => selectSongFromList(index);
        container.appendChild(item);
    });

    container.style.display = 'block';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ==========================================
// ▶️ ควบคุมการเล่นผ่าน YouTube IFrame Player
// ==========================================
function selectSongFromList(index) {
    if (!kkPlaylist[index]) return;
    kkCurrentIndex = index;
    const song = kkPlaylist[kkCurrentIndex];

    const resultsEl = document.getElementById('search-results-list');
    if (resultsEl) resultsEl.style.display = 'none';

    updateWidgetUI();
    pendingVideoId = song.videoId;

    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(song.videoId);
        kkIsPlaying = true;
        updatePlayButtonUI();
    } else if (ytApiReady) {
        ensurePlayerCreated();
        kkIsPlaying = true;
        updatePlayButtonUI();
    } else {
        if (typeof showToast === 'function') {
            showToast('⏳ กำลังโหลดเครื่องเล่น YouTube...');
        }
    }
}

function togglePlayMusic() {
    if (!ytPlayer) {
        if (kkPlaylist.length > 0) {
            selectSongFromList(kkCurrentIndex);
        }
        return;
    }

    const state = typeof ytPlayer.getPlayerState === 'function' ? ytPlayer.getPlayerState() : -1;
    if (state === window.YT?.PlayerState?.PLAYING) {
        ytPlayer.pauseVideo();
        kkIsPlaying = false;
    } else {
        ytPlayer.playVideo();
        kkIsPlaying = true;
    }
    updatePlayButtonUI();
}

function updatePlayButtonUI() {
    const btn = document.getElementById('widget-play-btn');
    if (btn) btn.innerText = kkIsPlaying ? '⏸' : '▶';
}

function nextSong() {
    if (kkPlaylist.length === 0) return;
    autoSkipCount = 0;
    hasShownSkipToast = false;
    kkCurrentIndex = (kkCurrentIndex + 1) % kkPlaylist.length;
    selectSongFromList(kkCurrentIndex);
}

function prevSong() {
    if (kkPlaylist.length === 0) return;
    autoSkipCount = 0;
    hasShownSkipToast = false;
    kkCurrentIndex = (kkCurrentIndex - 1 + kkPlaylist.length) % kkPlaylist.length;
    selectSongFromList(kkCurrentIndex);
}

function updateWidgetUI() {
    if (kkPlaylist.length === 0) return;
    const song = kkPlaylist[kkCurrentIndex];
    const titleEl = document.getElementById('widget-song-title');
    const artistEl = document.getElementById('widget-artist');
    if (titleEl) titleEl.innerText = song.title;
    if (artistEl) artistEl.innerText = song.artist;
}

window.MusicService = {
    init: initMusicSystem,
    open: openMusicWidget,
    close: closeMusicWidget,
    minimize: minimizeMusicWidget,
    restore: restoreMusicWidget,
    search: searchRealMusic,
    playIndex: selectSongFromList,
    togglePlay: togglePlayMusic,
    next: nextSong,
    prev: prevSong
};