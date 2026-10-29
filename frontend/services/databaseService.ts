// Data access for the frontend. Every call goes to the backend API with the
// session token (see apiClient.ts).
// - Users and sign-in: /api/auth/*, /api/users (user management is admin-only).
// - Products: /api/products. If the backend can't be reached at all, falls back
//   to a copy in this browser's localStorage; an error answer from the server
//   (e.g. 403 for staff) is shown instead.
// - Validation history: /api/history, stored on the server so every device sees
//   the same records. Records saved on a device by older versions of the app,
//   or while the backend was unreachable, wait in localStorage 'db_history'
//   until AuthContext uploads them.
import { ProductData, User, ValidationRecord } from '../types';
import { MASTER_PRODUCT_DATABASE } from '../constants';
import { ApiError, apiJson, setToken } from './apiClient';

const PRODUCTS_API_BASE = '/api/products';
const LOCAL_HISTORY_KEY = 'db_history';

// --- localStorage helpers (offline product copy, old on-device history) ---

const _readTableLocal = <T>(key: string): T[] => {
    try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : [];
    } catch (error) {
        console.error(`Failed to read table "${key}" from localStorage`, error);
        return [];
    }
};

const _writeTableLocal = <T>(key: string, data: T[]): boolean => {
    try {
        window.localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error(`Failed to write table "${key}" to localStorage`, error);
        return false;
    }
};

// Only a failed connection falls back to the local copy; an answer from the
// server (403, 400, 500…) is a real result and is passed on to the caller.
const _isOffline = (error: unknown): boolean => !(error instanceof ApiError);

// Seed the offline product copy without overwriting local records, and drop the
// old local user table (it held plain-text demo passwords and is no longer used).
const initializeLocalStorage = () => {
    const localProducts = _readTableLocal<ProductData>('db_products');
    const productMap = new Map(localProducts.map(p => [p.id, p]));
    MASTER_PRODUCT_DATABASE.forEach(product => {
        if (!productMap.has(product.id)) productMap.set(product.id, product);
    });
    _writeTableLocal('db_products', Array.from(productMap.values()));
    try {
        window.localStorage.removeItem('db_users');
    } catch {
        // Storage blocked: nothing to clean up.
    }
};

initializeLocalStorage();

/** Holds the full-size photos sent alongside a history record; the record itself holds thumbnails. */
export interface HistoryFullImages {
    barcode?: string | null;
    batch?: string | null;
}

export const databaseService = {
    // --- Sign-in ---
    /** Signs in, stores the session token and returns the user, or null for wrong credentials. */
    login: async (username: string, password: string): Promise<User | null> => {
        setToken(null);
        try {
            const { user, token } = await apiJson<{ user: User; token: string }>(
                '/api/auth/login', 'POST', { username, password });
            setToken(token);
            return user;
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) return null;
            throw error;
        }
    },

    /** Returns the user for the stored token, or null when there is none or it expired. */
    getCurrentUser: async (): Promise<User | null> => {
        try {
            return await apiJson<User>('/api/auth/me');
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                setToken(null);
                return null;
            }
            throw error;
        }
    },

    logout: async (): Promise<void> => {
        try {
            await apiJson<void>('/api/auth/logout', 'POST');
        } catch (error) {
            console.warn('Sign-out request failed; clearing the local session anyway.', error);
        } finally {
            setToken(null);
        }
    },

    // --- Users (admin) ---
    getUsers: async (): Promise<User[]> => {
        try {
            return await apiJson<User[]>('/api/users');
        } catch (error) {
            console.warn('Failed to fetch users from backend:', error);
            return [];
        }
    },

    addUser: async (newUser: { username: string; password: string; role: 'admin' | 'staff' }): Promise<User> => {
        return await apiJson<User>('/api/users', 'POST', newUser);
    },

    deleteUser: async (userId: string): Promise<void> => {
        await apiJson<void>(`/api/users/${encodeURIComponent(userId)}`, 'DELETE');
    },

    // --- Products ---
    getProducts: async (): Promise<ProductData[]> => {
        try {
            return await apiJson<ProductData[]>(PRODUCTS_API_BASE);
        } catch (error) {
            if (!_isOffline(error)) throw error;
            console.warn('Backend unreachable; using the local product copy:', error);
            return _readTableLocal<ProductData>('db_products');
        }
    },

    findProductsByBarcode: async (barcode: string): Promise<ProductData[]> => {
        try {
            return await apiJson<ProductData[]>(`${PRODUCTS_API_BASE}/barcode/${encodeURIComponent(barcode)}`);
        } catch (error) {
            if (!_isOffline(error)) throw error;
            console.warn('Backend unreachable; searching the local product copy:', error);
            return _readTableLocal<ProductData>('db_products').filter(p => p.barcode === barcode);
        }
    },

    addProduct: async (newProduct: ProductData): Promise<ProductData> => {
        try {
            return await apiJson<ProductData>(PRODUCTS_API_BASE, 'POST', newProduct);
        } catch (error) {
            if (!_isOffline(error)) throw error;
            console.warn('Backend unreachable; saving the product locally:', error);
            _writeTableLocal('db_products', [newProduct, ..._readTableLocal<ProductData>('db_products')]);
            return newProduct;
        }
    },

    updateProduct: async (updatedProduct: ProductData): Promise<ProductData> => {
        try {
            return await apiJson<ProductData>(
                `${PRODUCTS_API_BASE}/${encodeURIComponent(updatedProduct.id)}`, 'PUT', updatedProduct);
        } catch (error) {
            if (!_isOffline(error)) throw error;
            console.warn('Backend unreachable; updating the product locally:', error);
            const products = _readTableLocal<ProductData>('db_products');
            _writeTableLocal('db_products', products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
            return updatedProduct;
        }
    },

    deleteProduct: async (productId: string): Promise<void> => {
        try {
            await apiJson<void>(`${PRODUCTS_API_BASE}/${encodeURIComponent(productId)}`, 'DELETE');
        } catch (error) {
            if (!_isOffline(error)) throw error;
            console.warn('Backend unreachable; deleting the product locally:', error);
            _writeTableLocal('db_products', _readTableLocal<ProductData>('db_products').filter(p => p.id !== productId));
        }
    },

    // --- History ---
    /** Returns history newest first: the caller's own records for staff, everyone's for admins. */
    getHistory: async (): Promise<ValidationRecord[]> => {
        return await apiJson<ValidationRecord[]>('/api/history');
    },

    addHistoryRecord: async (record: ValidationRecord, full: HistoryFullImages = {}): Promise<ValidationRecord> => {
        return await apiJson<ValidationRecord>('/api/history', 'POST', {
            ...record,
            barcodeImageFull: full.barcode || undefined,
            batchImageFull: full.batch || undefined,
        });
    },

    /** Returns the full-size photo of a record, or null if the server has none. */
    getHistoryImage: async (recordId: string, which: 'barcode' | 'batch'): Promise<string | null> => {
        try {
            const { dataUrl } = await apiJson<{ dataUrl: string }>(
                `/api/history/${encodeURIComponent(recordId)}/images/${which}`);
            return dataUrl;
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
        }
    },

    /** Keeps a record on this device until it can be uploaded; returns false if storage is full. */
    queueLocalHistory: (record: ValidationRecord): boolean =>
        _writeTableLocal(LOCAL_HISTORY_KEY, [record, ..._readTableLocal<ValidationRecord>(LOCAL_HISTORY_KEY)]),

    isOffline: _isOffline,

    clearHistory: async (): Promise<void> => {
        await apiJson<void>('/api/history', 'DELETE');
    },

    /** Returns history waiting on this device: saved by older versions of the app, or while offline. */
    getLocalHistory: (): ValidationRecord[] => _readTableLocal<ValidationRecord>(LOCAL_HISTORY_KEY),

    /** Removes the given records from this device's old local history once they're on the server. */
    forgetLocalHistory: (ids: Set<string>): void => {
        const remaining = _readTableLocal<ValidationRecord>(LOCAL_HISTORY_KEY).filter(r => !ids.has(r.id));
        if (remaining.length) _writeTableLocal(LOCAL_HISTORY_KEY, remaining);
        else {
            try {
                window.localStorage.removeItem(LOCAL_HISTORY_KEY);
            } catch {
                // Storage blocked: nothing to clean up.
            }
        }
    },
};
