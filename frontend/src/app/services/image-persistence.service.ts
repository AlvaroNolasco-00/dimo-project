import { Injectable } from '@angular/core';

export interface SessionImage {
    id: string;
    blob: Blob;
    name: string;
    timestamp: number;
    projectId?: number;
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
            const request = indexedDB.open(this.dbName, 2); // Increment version to 2

            request.onerror = (event) => {
                console.error('Unified persistence error', event);
                reject('Error opening database');
            };

            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                let store: IDBObjectStore;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                } else {
                    if (!request.transaction) {
                        reject('Transaction not available during upgrade');
                        return;
                    }
                    store = request.transaction.objectStore(this.storeName);
                }

                // Create index for projectId if it doesn't exist
                if (!store.indexNames.contains('projectId')) {
                    store.createIndex('projectId', 'projectId', { unique: false });
                }
            };

            request.onsuccess = (event: any) => {
                resolve(event.target.result);
            };
        });
    }

    async saveImage(blob: Blob, name: string = 'Imagen Editada', projectId?: number): Promise<SessionImage> {
        const db = await this.dbPromise;
        const id = crypto.randomUUID();
        const image: SessionImage = {
            id,
            blob,
            name,
            timestamp: Date.now(),
            projectId
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add(image);

            request.onsuccess = () => resolve(image);
            request.onerror = () => reject('Error saving image');
        });
    }

    async getAllImages(projectId?: number): Promise<SessionImage[]> {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);

            let request: IDBRequest;

            if (projectId !== undefined) {
                const index = store.index('projectId');
                request = index.getAll(projectId);
            } else {
                request = store.getAll();
            }

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
