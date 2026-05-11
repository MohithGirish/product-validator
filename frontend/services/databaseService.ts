import { ProductData, User, ValidationRecord } from '../types';
import { MOCK_USERS, MASTER_PRODUCT_DATABASE } from '../constants';

// ==============================================================================
// CONFIGURATION
// ==============================================================================
// INSTRUCTIONS:
// 1. Create a Google Sheet with tabs: 'db_users', 'db_products', 'db_history'.
// 2. Add header rows to each matching the Type interfaces.
// 3. Create a Google Apps Script (Extensions > Apps Script) to handle doGet/doPost.
// 4. Deploy as Web App (Access: Anyone).
// 5. Paste the Web App URL below.
//
// If this string is empty, the app will fallback to LocalStorage (Offline Mode).
const GOOGLE_APPS_SCRIPT_URL = ""; 
const PRODUCTS_API_BASE = '/api/products';
// ==============================================================================


// --- Private Helper Functions (LocalStorage Fallback) ---

const _readTableLocal = <T>(key: string): T[] => {
    try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : [];
    } catch (error) {
        console.error(`Failed to read table "${key}" from localStorage`, error);
        return [];
    }
};

const _writeTableLocal = <T>(key:string, data: T[]): void => {
    try {
        window.localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error(`Failed to write table "${key}" to localStorage`, error);
    }
};

// --- Google Sheets API Helper ---

const _fetchFromSheet = async <T>(table: string): Promise<T[]> => {
    if (!GOOGLE_APPS_SCRIPT_URL) return [];
    try {
        const response = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=get_data&table=${table}`);
        const data = await response.json();
        return data as T[];
    } catch (e) {
        console.error(`Error fetching ${table} from Sheets:`, e);
        return [];
    }
};

const _postToSheet = async (table: string, action: 'add' | 'update' | 'delete', payload: any): Promise<boolean> => {
    if (!GOOGLE_APPS_SCRIPT_URL) return false;
    
    // Google Apps Script requires a specific POST format to avoid CORS preflight issues in some browsers,
    // often treated as text/plain to bypass strict CORS checks if the script isn't set up perfectly.
    // However, the standard fetch with correct CORS setup on GAS side works best.
    try {
        await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action, table, payload: action === 'delete' ? undefined : payload, id: action === 'delete' ? payload : undefined })
        });
        return true;
    } catch (e) {
        console.error(`Error performing ${action} on ${table}:`, e);
        return false;
    }
};

const _fetchFromBackend = async <T>(url: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(options?.headers || {})
        },
        ...options
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorBody.error || `Backend error: ${response.status}`);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json();
};


// --- Database Initialization ---

const initializeDatabase = async () => {
    if (GOOGLE_APPS_SCRIPT_URL) {
        console.log("Connected to Google Sheets Database.");
        return; // Skip local seeding if using cloud DB
    }

    // --- Users Table Initialization (Merge logic) ---
    const localUsers = _readTableLocal<User>('db_users');
    const userMap = new Map(localUsers.map(u => [u.id, u]));
    MOCK_USERS.forEach(user => userMap.set(user.id, user)); 
    _writeTableLocal('db_users', Array.from(userMap.values()));

    // --- Products Table Initialization (Merge logic) ---
    const localProducts = _readTableLocal<ProductData>('db_products');
    const productMap = new Map(localProducts.map(p => [p.id, p]));
    MASTER_PRODUCT_DATABASE.forEach(product => {
        if (!productMap.has(product.id)) {
            productMap.set(product.id, product);
        }
    });
    _writeTableLocal('db_products', Array.from(productMap.values()));

    // --- History Table Initialization ---
    if (!localStorage.getItem('db_history')) {
        _writeTableLocal('db_history', []);
    }
};

// Initialize on load
initializeDatabase();


// --- Public API for Database Service ---

export const databaseService = {
    // --- User Table ---
    getUsers: async (): Promise<User[]> => {
        if (GOOGLE_APPS_SCRIPT_URL) {
            return await _fetchFromSheet<User>('db_users');
        }
        return Promise.resolve(_readTableLocal<User>('db_users'));
    },
    
    findUserByUsernameAndPassword: async (username: string, password: string): Promise<User | null> => {
        let users: User[] = [];
        if (GOOGLE_APPS_SCRIPT_URL) {
            users = await _fetchFromSheet<User>('db_users');
        } else {
            users = _readTableLocal<User>('db_users');
        }
        const user = users.find(u => u.username === username && u.password === password);
        return user || null;
    },

    // --- Product Table ---
    getProducts: async (): Promise<ProductData[]> => {
        try {
            return await _fetchFromBackend<ProductData[]>(PRODUCTS_API_BASE);
        } catch (error) {
            console.warn('Falling back to local product storage:', error);
            if (GOOGLE_APPS_SCRIPT_URL) {
                return await _fetchFromSheet<ProductData>('db_products');
            }
            return Promise.resolve(_readTableLocal<ProductData>('db_products'));
        }
    },
    
    findProductsByBarcode: async (barcode: string): Promise<ProductData[]> => {
        try {
            return await _fetchFromBackend<ProductData[]>(`${PRODUCTS_API_BASE}/barcode/${encodeURIComponent(barcode)}`);
        } catch (error) {
            console.warn('Falling back to local product search:', error);
            let products: ProductData[] = [];
            if (GOOGLE_APPS_SCRIPT_URL) {
                products = await _fetchFromSheet<ProductData>('db_products');
            } else {
                products = _readTableLocal<ProductData>('db_products');
            }
            return products.filter(p => p.barcode === barcode) || [];
        }
    },

    addProduct: async (newProduct: ProductData): Promise<ProductData> => {
        try {
            return await _fetchFromBackend<ProductData>(PRODUCTS_API_BASE, {
                method: 'POST',
                body: JSON.stringify(newProduct)
            });
        } catch (error) {
            console.warn('Falling back to local product add:', error);
            if (GOOGLE_APPS_SCRIPT_URL) {
                await _postToSheet('db_products', 'add', newProduct);
                return newProduct;
            }
            const products = _readTableLocal<ProductData>('db_products');
            const updatedProducts = [newProduct, ...products];
            _writeTableLocal('db_products', updatedProducts);
            return newProduct;
        }
    },

    updateProduct: async (updatedProduct: ProductData): Promise<ProductData> => {
        try {
            return await _fetchFromBackend<ProductData>(`${PRODUCTS_API_BASE}/${encodeURIComponent(updatedProduct.id)}`, {
                method: 'PUT',
                body: JSON.stringify(updatedProduct)
            });
        } catch (error) {
            console.warn('Falling back to local product update:', error);
            if (GOOGLE_APPS_SCRIPT_URL) {
                await _postToSheet('db_products', 'update', updatedProduct);
                return updatedProduct;
            }
            let products = _readTableLocal<ProductData>('db_products');
            products = products.map(p => p.id === updatedProduct.id ? updatedProduct : p);
            _writeTableLocal('db_products', products);
            return updatedProduct;
        }
    },

    deleteProduct: async (productId: string): Promise<void> => {
        try {
            await _fetchFromBackend<void>(`${PRODUCTS_API_BASE}/${encodeURIComponent(productId)}`, {
                method: 'DELETE'
            });
            return;
        } catch (error) {
            console.warn('Falling back to local product delete:', error);
            if (GOOGLE_APPS_SCRIPT_URL) {
                await _postToSheet('db_products', 'delete', productId);
                return;
            }
            let products = _readTableLocal<ProductData>('db_products');
            products = products.filter(p => p.id !== productId);
            _writeTableLocal('db_products', products);
        }
    },

    // --- History Table ---
    getHistory: async (): Promise<ValidationRecord[]> => {
        if (GOOGLE_APPS_SCRIPT_URL) {
            const records = await _fetchFromSheet<ValidationRecord>('db_history');
            // Sheets might return boolean as string "TRUE" or "FALSE", ensure type safety if needed
            // Also timestamps might come as strings.
            return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
        return Promise.resolve(_readTableLocal<ValidationRecord>('db_history'));
    },

    addHistoryRecord: async (record: ValidationRecord): Promise<ValidationRecord> => {
        if (GOOGLE_APPS_SCRIPT_URL) {
            // We use 'add' but we pass the full record
            await _postToSheet('db_history', 'add', record);
            return record;
        } else {
            const history = _readTableLocal<ValidationRecord>('db_history');
            const updatedHistory = [record, ...history];
            _writeTableLocal('db_history', updatedHistory);
            return record;
        }
    },

    clearHistory: async (): Promise<void> => {
        if (GOOGLE_APPS_SCRIPT_URL) {
            await _postToSheet('db_history', 'delete', '__all__');
        } else {
            _writeTableLocal('db_history', []);
        }
    }
};