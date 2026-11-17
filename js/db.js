/* =====================================================
   db.js — IndexedDB wrapper for the Creative Studio
   Stores: videos, audios, images (each as Blob + meta)
   ===================================================== */
(function (global) {
  'use strict';

  const DB_NAME = 'creative_studio_db';
  const DB_VERSION = 1;
  const STORES = ['videos', 'audios', 'images'];

  let _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            store.createIndex('createdAt', 'createdAt', { unique: false });
            store.createIndex('name', 'name', { unique: false });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('kind', 'kind', { unique: false });
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function tx(storeName, mode = 'readonly') {
    return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
  }

  function promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function add(storeName, record) {
    const store = await tx(storeName, 'readwrite');
    return promisify(store.add(record));
  }

  async function put(storeName, record) {
    const store = await tx(storeName, 'readwrite');
    return promisify(store.put(record));
  }

  async function get(storeName, id) {
    const store = await tx(storeName);
    return promisify(store.get(id));
  }

  async function getAll(storeName) {
    const store = await tx(storeName);
    return promisify(store.getAll());
  }

  async function remove(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    return promisify(store.delete(id));
  }

  async function clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    return promisify(store.clear());
  }

  async function getAllByKind(kind) {
    // kind: 'video' | 'audio' | 'image'
    const storeName = kind + 's';
    if (!STORES.includes(storeName)) return [];
    return getAll(storeName);
  }

  async function getAllItems() {
    const all = [];
    for (const name of STORES) {
      const items = await getAll(name);
      items.forEach((it) => all.push({ ...it, store: name }));
    }
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async function getStorageEstimate() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try { return await navigator.storage.estimate(); } catch (_) { return { usage: 0, quota: 0 }; }
    }
    return { usage: 0, quota: 0 };
  }

  function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  global.AppDB = {
    openDB,
    add, put, get, getAll, remove, clear,
    getAllByKind, getAllItems,
    getStorageEstimate,
    generateId,
    STORES,
  };
})(window);
