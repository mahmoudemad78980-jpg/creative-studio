/* =====================================================
   media.js — Video/Audio/Image processing utilities
   MP3 extraction via Web Audio API + lamejs (offline)
   ===================================================== */
(function (global) {
  'use strict';

  // ---------- Format helpers ----------
  function formatBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return '—';
    if (bytes < 1024) return bytes + ' ب';
    const units = ['ك.ب', 'م.ب', 'ج.ب', 'ت.ب'];
    let i = -1; let n = bytes;
    do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
    return n.toFixed(1) + ' ' + units[i];
  }

  function formatDuration(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '—';
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const m = Math.floor(seconds / 60 % 60).toString();
    const h = Math.floor(seconds / 3600);
    return h > 0 ? `${h}:${m.padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(file);
    });
  }

  function readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function blobToObjectURL(blob) {
    return URL.createObjectURL(blob);
  }

  function getExtFromMime(mime, fallback = '') {
    if (!mime) return fallback;
    const map = {
      'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
      'video/x-matroska': 'mkv', 'video/ogg': 'ogv',
      'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav',
      'audio/wave': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg',
      'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/x-m4a': 'm4a',
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp',
    };
    return map[mime] || fallback;
  }

  // ---------- Video probe ----------
  function probeMedia(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.src = url;
      v.onloadedmetadata = () => {
        resolve({
          duration: v.duration,
          width: v.videoWidth,
          height: v.videoHeight,
        });
        URL.revokeObjectURL(url);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('تعذّر قراءة بيانات الفيديو'));
      };
    });
  }

  function probeImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('تعذّر قراءة بيانات الصورة'));
      };
      img.src = url;
    });
  }

  // ---------- MP3 extraction ----------
  // Decode audio with Web Audio API, then encode to MP3 with lamejs
  async function extractMp3(file, onProgress) {
    if (typeof lamejs === 'undefined') {
      throw new Error('مكتبة lamejs غير محمّلة');
    }
    onProgress && onProgress(5, 'قراءة الملف...');
    const arrayBuffer = await readAsArrayBuffer(file);

    onProgress && onProgress(15, 'فك ترميز الصوت...');
    const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100 * 60, 44100);
    // Use temporary AudioContext for decode (OfflineAudioContext can't decode directly on all browsers)
    const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
    let audioBuffer;
    try {
      audioBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch (err) {
      tempCtx.close();
      throw new Error('تعذّر فك ترميز الصوت. تأكد أن الملف يحتوي مسار صوتي صالح.');
    }
    tempCtx.close();

    onProgress && onProgress(35, 'تحويل القنوات إلى أحادي...');
    // Resample to 44100 Hz mono for MP3
    const targetSampleRate = 44100;
    const numChannels = 1;
    const length = Math.ceil(audioBuffer.duration * targetSampleRate);
    const offlineCtx = new OfflineAudioContext(numChannels, length, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);
    const renderedBuffer = await offlineCtx.startRendering();

    onProgress && onProgress(55, 'تحويل البيانات الصوتية...');
    const samples = renderedBuffer.getChannelData(0);
    // Convert to Int16
    const sampleCount = samples.length;
    const int16 = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    onProgress && onProgress(65, 'بدء ترميز MP3 (lamejs)...');
    const kbps = 128;
    const mp3encoder = new lamejs.Mp3Encoder(1, targetSampleRate, kbps);
    const mp3Data = [];
    const blockSize = 1152;
    for (let i = 0; i < int16.length; i += blockSize) {
      const sampleChunk = int16.subarray(i, i + blockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
      if (i % (blockSize * 50) === 0 && onProgress) {
        const p = 65 + Math.floor((i / int16.length) * 25);
        onProgress(p, 'ترميز MP3... ' + Math.floor((i / int16.length) * 100) + '%');
      }
    }
    const tail = mp3encoder.flush();
    if (tail.length > 0) mp3Data.push(tail);

    onProgress && onProgress(95, 'إنهاء الملف...');
    const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });
    onProgress && onProgress(100, 'تم!');
    return mp3Blob;
  }

  // ---------- Image utilities ----------
  async function resizeImage(file, maxWidth = 1920, quality = 0.92, mimeType = 'image/jpeg') {
    const img = await loadImage(file);
    const ratio = Math.min(1, maxWidth / img.naturalWidth);
    const w = Math.round(img.naturalWidth * ratio);
    const h = Math.round(img.naturalHeight * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('فشل تحميل الصورة')); };
      img.src = url;
    });
  }

  // ---------- Save / Download helpers ----------
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  async function shareBlob(blob, filename, title) {
    if (!navigator.canShare) {
      throw new Error('مشاركة الملفات غير مدعومة في هذا المتصفح');
    }
    const file = new File([blob], filename, { type: blob.type });
    if (!navigator.canShare({ files: [file] })) {
      throw new Error('هذا المتصفح لا يدعم مشاركة هذا النوع من الملفات');
    }
    await navigator.share({ files: [file], title: title || filename, text: 'من استوديو الإبداع الذكي' });
  }

  // ---------- Thumbnail generation for video ----------
  async function generateVideoThumbnail(file, timeOffset = 0.1) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'auto';
      v.muted = true;
      v.playsInline = true;
      v.crossOrigin = 'anonymous';
      v.src = url;
      v.onloadeddata = () => {
        try {
          v.currentTime = Math.min(timeOffset, v.duration * 0.1 || 0.1);
        } catch (_) { /* ignore */ }
      };
      v.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = 320;
          const ratio = v.videoHeight / v.videoWidth || 0.5625;
          canvas.width = w;
          canvas.height = Math.round(w * ratio);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            resolve(blob);
          }, 'image/jpeg', 0.7);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('فشل إنشاء الصورة المصغّرة')); };
    });
  }

  global.MediaUtils = {
    formatBytes, formatDuration,
    readAsArrayBuffer, readAsDataURL, blobToObjectURL,
    getExtFromMime,
    probeMedia, probeImage,
    extractMp3,
    resizeImage, loadImage,
    triggerDownload, shareBlob,
    generateVideoThumbnail,
  };
})(window);
