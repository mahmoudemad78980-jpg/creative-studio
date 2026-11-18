/* =====================================================
   app.js — Main application controller
   ===================================================== */
(function (global) {
  'use strict';

  // ----- DOM helpers -----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v;
      else if (v != null) node.setAttribute(k, v);
    }
    children.flat().forEach((c) => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  // ----- Toast -----
  function toast(message, type = 'info', duration = 3000) {
    const wrap = $('#toastWrap');
    if (!wrap) return;
    const t = el('div', { class: 'toast ' + type }, message);
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 240ms, transform 240ms';
      t.style.opacity = '0';
      t.style.transform = 'translateY(10px)';
      setTimeout(() => t.remove(), 280);
    }, duration);
  }

  // ----- Confirm dialog -----
  function confirmDialog(message, title = 'تأكيد الإجراء') {
    return new Promise((resolve) => {
      const dlg = $('#confirmDialog');
      $('#confirmTitle').textContent = title;
      $('#confirmMessage').textContent = message;
      dlg.classList.remove('hidden');
      const ok = $('#confirmOk');
      const cancel = $('#confirmCancel');
      const cleanup = (val) => {
        dlg.classList.add('hidden');
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        resolve(val);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

  // ----- Tabs -----
  function setupTabs() {
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.section;
        $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
        $$('[data-section-panel]').forEach((p) => {
          p.classList.toggle('hidden', p.dataset.sectionPanel !== target);
        });
        if (target === 'storage') renderStorage();
      });
    });
    $$('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.jump.replace('section-', '');
        const tab = $(`.tab[data-section="${target}"]`);
        if (tab) tab.click();
      });
    });
  }

  // ----- Dropzone helper -----
  function setupDropzone(zone, onFile) {
    const input = zone.querySelector('input[type=file]');
    const pickBtn = zone.querySelector('.link-btn');
    const click = () => input && input.click();
    zone.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target === pickBtn) return;
      click();
    });
    if (pickBtn) pickBtn.addEventListener('click', (e) => { e.stopPropagation(); click(); });
    if (input) {
      input.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach(onFile);
        input.value = '';
      });
    }
    ['dragenter', 'dragover'].forEach((ev) => {
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); });
    });
    zone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      const files = Array.from(dt.files || []);
      files.forEach(onFile);
    });
  }

  // ----- Card builders -----
  function buildMediaCard(record, kind) {
    const card = el('article', { class: 'card', 'data-id': record.id, 'data-store': record.store, 'data-kind': kind });
    const thumb = el('div', { class: 'card-thumb' });

    if (kind === 'image') {
      const img = el('img', { src: record.thumbDataURL || URL.createObjectURL(record.blob), alt: record.name, loading: 'lazy' });
      thumb.appendChild(img);
    } else if (kind === 'video') {
      if (record.thumbDataURL) {
        const img = el('img', { src: record.thumbDataURL, alt: record.name, loading: 'lazy' });
        thumb.appendChild(img);
      } else {
        thumb.appendChild(el('div', { class: 'thumb-icon', html: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' }));
      }
      const v = el('video', { src: URL.createObjectURL(record.blob), preload: 'metadata', muted: true, playsinline: true });
      v.style.display = 'none';
      thumb.appendChild(v);
    } else {
      thumb.appendChild(el('div', { class: 'thumb-icon', html: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' }));
    }

    if (kind === 'video' || kind === 'audio') {
      const overlay = el('div', { class: 'play-overlay' });
      overlay.appendChild(el('span', { html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><polygon points="6 4 20 12 6 20 6 4"/></svg>' }));
      thumb.appendChild(overlay);
    }
    const badge = el('span', { class: 'badge' }, kind === 'video' ? 'فيديو' : kind === 'audio' ? 'MP3' : 'صورة');
    thumb.appendChild(badge);

    const body = el('div', { class: 'card-body' });
    const title = el('div', { class: 'card-title', title: record.name }, record.name);
    body.appendChild(title);
    const meta = el('div', { class: 'card-meta' });
    const sizeText = MediaUtils.formatBytes(record.size);
    if (kind === 'video' || kind === 'audio') {
      meta.appendChild(el('span', {}, MediaUtils.formatDuration(record.duration || 0)));
      meta.appendChild(el('span', {}, '·'));
    }
    meta.appendChild(el('span', {}, sizeText));
    body.appendChild(meta);

    const actions = el('div', { class: 'card-actions' });
    const playBtn = makeIconBtn('play', '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>', 'تشغيل');
    playBtn.addEventListener('click', (e) => { e.stopPropagation(); openPlayer(record, kind); });
    const shareBtn = makeIconBtn('share', '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>', 'مشاركة');
    shareBtn.addEventListener('click', (e) => { e.stopPropagation(); openSidebar(record, kind, 'share'); });
    const dlBtn = makeIconBtn('download', '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', 'حفظ في المعرض');
    dlBtn.addEventListener('click', (e) => { e.stopPropagation(); openSidebar(record, kind, 'download'); });
    const delBtn = makeIconBtn('delete', '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>', 'حذف');
    delBtn.classList.add('danger');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog('هل تريد حذف "' + record.name + '" نهائياً؟');
      if (ok) {
        await AppDB.remove(record.store, record.id);
        toast('تم الحذف', 'success');
        refreshAll();
      }
    });
    actions.append(playBtn, shareBtn, dlBtn, delBtn);
    body.appendChild(actions);
    card.append(thumb, body);
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openSidebar(record, kind);
    });
    return card;
  }

  function makeIconBtn(action, svg, label) {
    const btn = el('button', { class: 'icon-btn', 'data-action': action, 'aria-label': label, type: 'button' });
    btn.innerHTML = svg;
    return btn;
  }

  // ----- Action sidebar -----
  let _currentSidebarItem = null;

  function openSidebar(record, kind, initialAction) {
    _currentSidebarItem = { record, kind };
    $('#sidebarItemName').textContent = record.name;
    const preview = $('#sidebarPreview');
    preview.innerHTML = '';
    if (kind === 'image') {
      preview.appendChild(el('img', { src: record.thumbDataURL || URL.createObjectURL(record.blob), alt: record.name }));
    } else if (kind === 'video') {
      const v = el('video', { src: URL.createObjectURL(record.blob), controls: true, preload: 'metadata' });
      preview.appendChild(v);
    } else {
      const a = el('audio', { src: URL.createObjectURL(record.blob), controls: true, preload: 'metadata' });
      preview.appendChild(a);
    }
    const meta = $('#sidebarMeta');
    meta.innerHTML = '';
    const lines = [
      ['النوع', kind === 'video' ? 'فيديو' : kind === 'audio' ? 'صوت MP3' : 'صورة'],
      ['الحجم', MediaUtils.formatBytes(record.size)],
    ];
    if (record.duration) lines.push(['المدة', MediaUtils.formatDuration(record.duration)]);
    // Numeric "W × H" strings get visually reversed inside RTL text — isolate them as LTR
    if (record.width && record.height) {
      lines.push(['الأبعاد', '\u2066' + record.width + ' × ' + record.height + '\u2069']);
    }
    if (record.mime) lines.push(['الصيغة', record.mime]);
    if (record.createdAt) lines.push(['التاريخ', new Date(record.createdAt).toLocaleString('ar-EG')]);
    lines.forEach(([k, v]) => {
      meta.appendChild(el('div', {},
        el('strong', {}, k + ': '),
        document.createTextNode(v)
      ));
    });
    $('#actionSidebar').classList.add('open');
    $('#sidebarBackdrop').classList.add('open');
    if (initialAction === 'share') setTimeout(() => doAction('share'), 200);
    if (initialAction === 'download') setTimeout(() => doAction('download'), 200);
  }

  function closeSidebar() {
    $('#actionSidebar').classList.remove('open');
    $('#sidebarBackdrop').classList.remove('open');
    setTimeout(() => { $('#sidebarPreview').innerHTML = ''; }, 250);
    _currentSidebarItem = null;
  }

  async function doAction(action) {
    if (!_currentSidebarItem) return;
    const { record, kind } = _currentSidebarItem;
    const baseName = (record.name || 'file').replace(/\.[^.]+$/, '');
    const ext = MediaUtils.getExtFromMime(record.mime) || (kind === 'audio' ? 'mp3' : kind === 'video' ? 'mp4' : 'jpg');
    const filename = baseName + '.' + ext;
    try {
      if (action === 'play') {
        openPlayer(record, kind);
        closeSidebar();
      } else if (action === 'share') {
        if (!navigator.share) {
          toast('مشاركة الملفات غير مدعومة هنا، جاري التحميل بدلاً من ذلك', 'info');
          MediaUtils.triggerDownload(record.blob, filename);
        } else {
          await MediaUtils.shareBlob(record.blob, filename, record.name);
          toast('تمت المشاركة', 'success');
        }
      } else if (action === 'download') {
        MediaUtils.triggerDownload(record.blob, filename);
        toast('تم حفظ "' + filename + '" في مجلد التنزيلات', 'success');
      } else if (action === 'delete') {
        const ok = await confirmDialog('هل تريد حذف "' + record.name + '" نهائياً؟');
        if (!ok) return;
        await AppDB.remove(record.store, record.id);
        toast('تم الحذف', 'success');
        closeSidebar();
        refreshAll();
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'حدث خطأ', 'error');
    }
  }

  // ----- Player -----
  let _playerMedia = null;
  let _playerKind = null;
  let _playerUrl = null;

  function openPlayer(record, kind) {
    _playerMedia = record; _playerKind = kind;
    $('#playerTitle').textContent = record.name;
    const body = $('#playerBody');
    body.innerHTML = '';
    body.classList.toggle('audio-mode', kind === 'audio');
    if (_playerUrl) { URL.revokeObjectURL(_playerUrl); _playerUrl = null; }
    _playerUrl = URL.createObjectURL(record.blob);
    const url = _playerUrl;
    let media;
    if (kind === 'video') {
      media = el('video', { src: url, autoplay: true, controls: false, playsinline: true });
      media.style.maxHeight = '70vh';
    } else if (kind === 'audio') {
      const wrap = el('div', { class: 'audio-wrap' });
      const icon = el('div', { class: 'thumb-icon', html: '<svg viewBox="0 0 24 24" width="86" height="86" fill="none" stroke="#60a5fa" stroke-width="1.6"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' });
      wrap.appendChild(icon);
      // Decorative equalizer bars (animate while playing)
      const eq = el('div', { class: 'eq' });
      for (let i = 0; i < 14; i++) eq.appendChild(el('i', { style: `--d:${(i * 0.07).toFixed(2)}s;--h:${28 + ((i * 37) % 52)}%` }));
      wrap.appendChild(eq);
      wrap.appendChild(el('h3', {}, record.name));
      media = el('audio', { src: url, autoplay: true });
      body.appendChild(wrap);
      body.appendChild(media);
    } else {
      media = el('img', { src: url, alt: record.name });
    }
    if (kind !== 'audio') body.appendChild(media);
    $('#playerOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    bindPlayerEvents(media, kind);
  }

  function bindPlayerEvents(media, kind) {
    const playBtn = $('#playerPlay');
    const seekTrack = $('#seekTrack');
    const seekFill = $('#seekFill');
    const currentEl = $('#playerCurrent');
    const durationEl = $('#playerDuration');
    const volumeEl = $('#playerVolume');
    const shareBtn = $('#playerShare');
    const body = $('#playerBody');

    const updatePlayIcon = () => {
      const playing = !media.paused && !media.ended;
      playBtn.innerHTML = playing
        ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
        : '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
    };

    const onTime = () => {
      if (!isFinite(media.duration)) return;
      const pct = (media.currentTime / media.duration) * 100;
      seekFill.style.width = pct + '%';
      currentEl.textContent = MediaUtils.formatDuration(media.currentTime);
      durationEl.textContent = MediaUtils.formatDuration(media.duration);
    };
    media.addEventListener('timeupdate', onTime);
    media.addEventListener('loadedmetadata', onTime);
    media.addEventListener('play', () => { updatePlayIcon(); body.classList.add('is-playing'); });
    media.addEventListener('pause', () => { updatePlayIcon(); body.classList.remove('is-playing'); });
    media.addEventListener('ended', () => { updatePlayIcon(); body.classList.remove('is-playing'); });

    playBtn.onclick = () => {
      if (media.paused) media.play().catch(() => {});
      else media.pause();
    };
    seekTrack.onclick = (e) => {
      if (!isFinite(media.duration)) return;
      const rect = seekTrack.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      media.currentTime = media.duration * ratio;
    };
    volumeEl.oninput = () => { media.volume = volumeEl.value / 100; };
    media.volume = volumeEl.value / 100;
    shareBtn.onclick = () => doAction('share');
  }

  function closePlayer() {
    $('#playerOverlay').classList.add('hidden');
    document.body.style.overflow = '';
    if (_playerUrl) { URL.revokeObjectURL(_playerUrl); _playerUrl = null; }
    _playerMedia = null; _playerKind = null;
    $('#playerBody').innerHTML = '';
    $('#playerBody').classList.remove('audio-mode');
  }

  // ----- Video upload handler -----
  async function handleVideoUpload(file) {
    if (!file.type.startsWith('video/')) {
      toast('هذا ليس ملف فيديو صالحاً', 'error');
      return false;
    }
    try {
      const meta = await MediaUtils.probeMedia(file);
      let thumbDataURL = null;
      try {
        const thumbBlob = await MediaUtils.generateVideoThumbnail(file);
        thumbDataURL = await MediaUtils.readAsDataURL(thumbBlob);
      } catch (_) { /* no thumbnail */ }
      const record = {
        id: AppDB.generateId(),
        name: file.name || ('video-' + Date.now() + '.mp4'),
        type: file.type,
        mime: file.type,
        size: file.size,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        thumbDataURL,
        blob: file,
        createdAt: Date.now(),
        kind: 'video',
      };
      // store blob separately to keep record small
      const storeRecord = { ...record, blob: undefined };
      await AppDB.add('videos', { ...storeRecord, blob: file });
      // Keep blob in memory for cards
      record.__hasBlob = true;
      toast('تم رفع الفيديو: ' + record.name, 'success');
      refreshAll();
      return true;
    } catch (err) {
      console.error(err);
      toast('فشل رفع الفيديو: ' + (err.message || ''), 'error');
      return false;
    }
  }

  // ----- Audio extraction handler -----
  async function handleAudioExtraction(file) {
    const statusEl = $('#extractionStatus');
    const bar = $('#extractBar');
    const label = $('#extractLabel');
    statusEl.hidden = false;
    bar.style.width = '0%';
    label.textContent = 'بدء المعالجة...';
    try {
      if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
        throw new Error('الرجاء اختيار ملف فيديو أو صوت');
      }
      const onProgress = (pct, text) => {
        bar.style.width = pct + '%';
        label.textContent = text;
      };
      const mp3Blob = await MediaUtils.extractMp3(file, onProgress);
      // Probe duration
      const url = URL.createObjectURL(mp3Blob);
      const probeAudio = document.createElement('audio');
      probeAudio.preload = 'metadata';
      probeAudio.src = url;
      await new Promise((res) => { probeAudio.onloadedmetadata = res; probeAudio.onerror = res; });
      const duration = isFinite(probeAudio.duration) ? probeAudio.duration : 0;
      URL.revokeObjectURL(url);
      const baseName = (file.name || 'audio').replace(/\.[^.]+$/, '');
      const record = {
        id: AppDB.generateId(),
        name: baseName + '.mp3',
        type: 'audio/mpeg',
        mime: 'audio/mpeg',
        size: mp3Blob.size,
        duration,
        blob: mp3Blob,
        createdAt: Date.now(),
        kind: 'audio',
      };
      await AppDB.add('audios', record);
      label.textContent = 'تم! تم حفظ ' + record.name;
      toast('تم استخلاص الصوت بنجاح: ' + record.name, 'success');
      setTimeout(() => { statusEl.hidden = true; }, 1500);
      refreshAll();
      return true;
    } catch (err) {
      console.error(err);
      label.textContent = 'فشل: ' + (err.message || 'خطأ غير معروف');
      toast('فشل استخلاص الصوت: ' + (err.message || ''), 'error');
      setTimeout(() => { statusEl.hidden = true; }, 3000);
      return false;
    }
  }

  // ----- Image upload handler -----
  async function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
      toast('هذا ليس ملف صورة صالح', 'error');
      return;
    }
    try {
      const meta = await MediaUtils.probeImage(file);
      const dataURL = await MediaUtils.readAsDataURL(file);
      const record = {
        id: AppDB.generateId(),
        name: file.name || ('image-' + Date.now() + '.jpg'),
        type: file.type,
        mime: file.type,
        size: file.size,
        width: meta.width,
        height: meta.height,
        thumbDataURL: dataURL,
        blob: file,
        createdAt: Date.now(),
        kind: 'image',
      };
      await AppDB.add('images', record);
      toast('تم حفظ الصورة: ' + record.name, 'success');
      refreshAll();
      return true;
    } catch (err) {
      console.error(err);
      toast('فشل حفظ الصورة', 'error');
      return false;
    }
  }

  // ----- Direct media links -----
  const MAX_DIRECT_MEDIA_BYTES = 100 * 1024 * 1024;
  const DIRECT_MEDIA_EXTENSIONS = {
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mkv: 'video/x-matroska', ogv: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
    aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  };
  let _pendingDirectMedia = null;

  function directMediaType(url, contentType) {
    const mime = (contentType || '').split(';')[0].trim().toLowerCase();
    if (/^(video|audio|image)\//.test(mime)) return mime;
    const extension = url.pathname.split('.').pop().toLowerCase();
    return DIRECT_MEDIA_EXTENSIONS[extension] || '';
  }

  async function readLimitedResponse(response, mime) {
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_DIRECT_MEDIA_BYTES) {
      if (response.body) await response.body.cancel();
      throw new Error('حجم الملف يتجاوز الحد الأقصى (100 م.ب)');
    }
    if (!response.body || !response.body.getReader) {
      const blob = await response.blob();
      if (blob.size > MAX_DIRECT_MEDIA_BYTES) throw new Error('حجم الملف يتجاوز الحد الأقصى (100 م.ب)');
      return blob.slice(0, blob.size, mime);
    }

    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_DIRECT_MEDIA_BYTES) {
          await reader.cancel();
          throw new Error('حجم الملف يتجاوز الحد الأقصى (100 م.ب)');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return new Blob(chunks, { type: mime });
  }

  function directFilename(url, mime) {
    let name = url.pathname.split('/').pop() || '';
    try { name = decodeURIComponent(name); } catch (_) { /* Keep the encoded name. */ }
    name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
    if (!name || name === '.' || name === '..') {
      const ext = MediaUtils.getExtFromMime(mime) || 'bin';
      name = 'media-' + Date.now() + '.' + ext;
    }
    return name.slice(0, 180);
  }

  function clearDirectResult() {
    _pendingDirectMedia = null;
    $('#directResult').classList.add('hidden');
    $('#directFileActions').innerHTML = '';
    $('#directLinkStatus').textContent = '';
  }

  async function checkDirectLink(event) {
    event.preventDefault();
    clearDirectResult();
    const input = $('#directUrl');
    const button = $('#directCheckBtn');
    const status = $('#directLinkStatus');
    let url;
    try {
      url = new URL(input.value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('استخدم رابط HTTP أو HTTPS عاماً من دون بيانات دخول');
      }
    } catch (err) {
      status.textContent = err.message || 'أدخل رابطاً صالحاً';
      return;
    }

    button.disabled = true;
    input.disabled = true;
    status.textContent = 'جارٍ التحقق وتنزيل الملف...';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(url.href, {
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.body) await response.body.cancel();
        throw new Error('رفض الخادم الطلب (HTTP ' + response.status + ')');
      }
      const mime = directMediaType(url, response.headers.get('content-type'));
      if (!mime) {
        if (response.body) await response.body.cancel();
        throw new Error('الرابط لا يشير إلى ملف فيديو أو صوت أو صورة مدعوم');
      }
      const blob = await readLimitedResponse(response, mime);
      const name = directFilename(url, mime);
      const kind = mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'image';
      _pendingDirectMedia = { blob, mime, name, kind };
      $('#directFileName').textContent = name;
      $('#directFileMeta').textContent = mime + ' · ' + MediaUtils.formatBytes(blob.size);
      const actionLabel = kind === 'video' ? 'حفظ الفيديو' : kind === 'audio' ? 'حفظ الصوت كـ MP3' : 'حفظ الصورة';
      const action = el('button', { class: 'btn btn-primary', type: 'button', dataset: { directKind: kind } }, actionLabel);
      action.addEventListener('click', saveDirectMedia);
      $('#directFileActions').appendChild(action);
      $('#directResult').classList.remove('hidden');
      status.textContent = 'تم العثور على ملف مباشر. اختر الحفظ لإضافته إلى المخزن المحلي.';
    } catch (err) {
      status.textContent = err.name === 'AbortError'
        ? 'انتهت مهلة الاتصال. جرّب رابطاً أسرع أو تحقق من الشبكة.'
        : err instanceof TypeError
          ? 'تعذّر الوصول إلى الملف. قد يمنع الخادم طلبات المتصفح (CORS)، أو قد يكون الرابط صفحة وليست ملفاً مباشراً.'
          : err.message || 'فشل فحص الرابط';
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
      input.disabled = false;
    }
  }

  async function saveDirectMedia(event) {
    if (!_pendingDirectMedia) return;
    const button = event.currentTarget;
    const input = $('#directUrl');
    button.disabled = true;
    input.disabled = true;
    const { blob, mime, name, kind } = _pendingDirectMedia;
    const file = new File([blob], name, { type: mime });
    $('#directLinkStatus').textContent = 'جارٍ حفظ الملف...';
    try {
      const saved = kind === 'video'
        ? await handleVideoUpload(file)
        : kind === 'audio'
          ? await handleAudioExtraction(file)
          : await handleImageUpload(file);
      if (saved) {
        clearDirectResult();
        $('#directUrl').value = '';
        $('#directLinkStatus').textContent = 'تم حفظ الملف في المخزن المحلي.';
      } else {
        $('#directLinkStatus').textContent = 'تعذّر حفظ الملف، راجع رسالة الخطأ.';
      }
    } catch (err) {
      console.error(err);
      $('#directLinkStatus').textContent = err.message || 'تعذّر حفظ الملف';
    } finally {
      button.disabled = false;
      input.disabled = false;
    }
  }

  function setupDirectLinks() {
    $('#directLinkForm').addEventListener('submit', checkDirectLink);
    $('#directUrl').addEventListener('input', clearDirectResult);
    receiveSharedLink();
  }

  function receiveSharedLink() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('url') && !params.has('text')) return;

    const candidates = [params.get('url') || ''];
    const sharedText = params.get('text') || '';
    const textUrl = sharedText.match(/https?:\/\/[^\s<>"']+/i);
    if (textUrl) candidates.push(textUrl[0].replace(/[),.;!?]+$/, ''));

    const sharedUrl = candidates.find((candidate) => {
      try {
        const url = new URL(candidate.trim());
        return ['http:', 'https:'].includes(url.protocol);
      } catch (_) {
        return false;
      }
    });

    window.history.replaceState(null, document.title, window.location.pathname + window.location.hash);
    const tab = $('.tab[data-section="direct"]');
    if (tab) tab.click();
    if (!sharedUrl) {
      $('#directLinkStatus').textContent = 'لم يتم استلام رابط HTTP أو HTTPS صالح من المتصفح.';
      return;
    }

    $('#directUrl').value = sharedUrl.trim();
    $('#directLinkStatus').textContent = 'وصل الرابط من المتصفح. اضغط «فحص الرابط» للمتابعة؛ قد لا تكون صفحة الموقع ملفاً مباشراً.';
    $('#directUrl').focus();
  }

  // ----- Refresh grids -----
  async function refreshAll() {
    await Promise.all([renderVideoGrid(), renderAudioGrid(), renderImageGrid(), renderStorage(), updateStorageLabel()]);
  }

  async function renderVideoGrid() {
    const grid = $('#videoGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const items = await AppDB.getAllByKind('video');
    items.sort((a, b) => b.createdAt - a.createdAt);
    if (items.length === 0) {
      grid.appendChild(el('div', { class: 'empty-state', style: { gridColumn: '1 / -1' } },
        el('h4', {}, 'لا توجد فيديوهات بعد'),
        el('p', {}, 'اسحب وأفلت ملفاً في الأعلى للبدء')
      ));
      return;
    }
    items.forEach((r) => grid.appendChild(buildMediaCard(r, 'video')));
  }

  async function renderAudioGrid() {
    const grid = $('#audioGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const items = await AppDB.getAllByKind('audio');
    items.sort((a, b) => b.createdAt - a.createdAt);
    if (items.length === 0) {
      grid.appendChild(el('div', { class: 'empty-state', style: { gridColumn: '1 / -1' } },
        el('h4', {}, 'لا توجد ملفات صوتية بعد'),
        el('p', {}, 'اسحب فيديو أو ملف صوتي لاستخلاص MP3')
      ));
      return;
    }
    items.forEach((r) => grid.appendChild(buildMediaCard(r, 'audio')));
  }

  async function renderImageGrid() {
    const grid = $('#imageGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const items = await AppDB.getAllByKind('image');
    items.sort((a, b) => b.createdAt - a.createdAt);
    if (items.length === 0) {
      grid.appendChild(el('div', { class: 'empty-state', style: { gridColumn: '1 / -1' } },
        el('h4', {}, 'لا توجد صور بعد'),
        el('p', {}, 'اسحب الصور إلى الأعلى لرفعها')
      ));
      return;
    }
    items.forEach((r) => grid.appendChild(buildMediaCard(r, 'image')));
  }

  // ----- Storage section -----
  let _currentFilter = 'all';
  let _currentSearch = '';

  async function renderStorage() {
    const grid = $('#storageGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const all = await AppDB.getAllItems();
    const filtered = all.filter((it) => {
      const matchFilter = _currentFilter === 'all' || it.kind === _currentFilter;
      const matchSearch = !_currentSearch || (it.name || '').toLowerCase().includes(_currentSearch.toLowerCase());
      return matchFilter && matchSearch;
    });
    if (filtered.length === 0) {
      grid.classList.add('hidden');
      $('#emptyState').classList.remove('hidden');
      return;
    }
    grid.classList.remove('hidden');
    $('#emptyState').classList.add('hidden');
    filtered.forEach((r) => grid.appendChild(buildMediaCard(r, r.kind)));
  }

  function setupStorageFilters() {
    $$('.filter-chips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('.filter-chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
        _currentFilter = chip.dataset.filter;
        renderStorage();
      });
    });
    const search = $('#storageSearch');
    if (search) {
      let t;
      search.addEventListener('input', (e) => {
        clearTimeout(t);
        t = setTimeout(() => { _currentSearch = e.target.value; renderStorage(); }, 150);
      });
    }
  }

  // ----- Storage label -----
  async function updateStorageLabel() {
    const est = await AppDB.getStorageEstimate();
    const used = est.usage || 0;
    $('#storageLabel').textContent = MediaUtils.formatBytes(used);
  }

  // ----- Network status -----
  function setupNetwork() {
    const label = $('#networkLabel');
    const pill = $('#networkStatus');
    PWA.watchNetwork((online) => {
      label.textContent = online ? 'متصل' : 'أوفلاين';
      pill.classList.toggle('online', online);
    });
  }

  // ----- PWA install + updates -----
  function setupPWA() {
    PWA.setupInstallPrompt();
    // Register the service worker so the app keeps working offline
    PWA.register().then((reg) => {
      if (reg) {
        console.info('[PWA] ready for offline use');
      }
    });
    window.addEventListener('pwa:updated', () => {
      toast('تم تحديث التطبيق، أعد التحميل لتطبيق النسخة الجديدة', 'info', 5000);
    });
  }

  // ----- Sidebar events -----
  function setupSidebar() {
    $('#sidebarClose').addEventListener('click', closeSidebar);
    $('#sidebarBackdrop').addEventListener('click', closeSidebar);
    $$('.action-tile').forEach((tile) => {
      tile.addEventListener('click', () => doAction(tile.dataset.action));
    });
  }

  // ----- Player events -----
  function setupPlayer() {
    $('#playerClose').addEventListener('click', closePlayer);
    $('#playerOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'playerOverlay') closePlayer();
    });
  }

  // ----- Boot -----
  function init() {
    setupTabs();
    setupDropzone($('#videoDrop'), handleVideoUpload);
    setupDropzone($('#audioDrop'), handleAudioExtraction);
    setupDropzone($('#imageDrop'), handleImageUpload);
    setupDirectLinks();
    setupStorageFilters();
    setupSidebar();
    setupPlayer();
    setupNetwork();
    setupPWA();
    refreshAll();
    setTimeout(() => $('#appLoader').classList.add('hidden'), 400);
  }

  // Expose helpers
  global.App = { toast, confirmDialog, refreshAll, openSidebar, closeSidebar, openPlayer, closePlayer };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
