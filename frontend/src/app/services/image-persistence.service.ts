import { Injectable } from '@angular/core';

export interface SessionImage {
    id: string;
    blob: Blob;
    name: string;
    timestamp: number;
}

@Injectable({
    providedIn: 'root'
})
export class ImagePersistenceService {
    private dbName = 'DimoEditorDB';
    private storeName = 'session_images';
    private dbPromise: Promise<IDBDatabase>;

    constructor() {
        this.dbPromise = this.initDB();
    }

    private initDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = (event) => {
                console.error('Unified persistence error', event);
                reject('Error opening database');
            };

            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event: any) => {
                resolve(event.target.result);
            };
        });
    }

    async saveImage(blob: Blob, name: string = 'Imagen Editada'): Promise<SessionImage> {
        const db = await this.dbPromise;
        const id = crypto.randomUUID();
        const image: SessionImage = {
            id,
            blob,
            name,
            timestamp: Date.now()
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add(image);

            request.onsuccess = () => resolve(image);
            request.onerror = () => reject('Error saving image');
        });
    }

    async getAllImages(): Promise<SessionImage[]> {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                // Sort by timestamp desc
                const results: SessionImage[] = request.result;
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };
            request.onerror = () => reject('Error fetching images');
        });
    }

    async deleteImage(id: string): Promise<void> {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject('Error deleting image');
        });
    }

    async clearAll(): Promise<void> {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject('Error clearing gallery');
        });
    }
}
