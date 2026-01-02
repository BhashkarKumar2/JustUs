// API service with request caching and retry logic
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Request cache for GET requests
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const api = axios.create({ 
    baseURL: API_URL,
    withCredentials: true,
    timeout: 30000 // 30 second timeout
});

// Request interceptor
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token && !config.headers.Authorization) {
            config.headers.Authorization = 'Bearer ' + token;
        }
        
        // Add cache key for GET requests
        if (config.method === 'get') {
            const cacheKey = config.url + JSON.stringify(config.params);
            const cached = cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                config.adapter = () => Promise.resolve({
                    data: cached.data,
                    status: 200,
                    statusText: 'OK (cached)',
                    headers: cached.headers,
                    config
                });
            }
        }
        
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor with caching
api.interceptors.response.use(
    (response) => {
        // Cache successful GET requests
        if (response.config.method === 'get' && response.status === 200) {
            const cacheKey = response.config.url + JSON.stringify(response.config.params);
            cache.set(cacheKey, {
                data: response.data,
                headers: response.headers,
                timestamp: Date.now()
            });
        }
        return response;
    },
    async (error) => {
        const originalRequest = error.config;
        
        // Handle 401 Unauthorized - Token expired or invalid
        if (error.response && error.response.status === 401) {
            console.log('401 Unauthorized - Token expired or invalid, redirecting to sign in');
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('username');
            delete api.defaults.headers.common['Authorization'];
            cache.clear(); // Clear cache on logout
            window.location.href = '/signin';
            return Promise.reject(error);
        }
        
        // Retry logic for network errors
        if (!error.response && !originalRequest._retry && originalRequest._retryCount < 3) {
            originalRequest._retry = true;
            originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * originalRequest._retryCount));
            return api(originalRequest);
        }
        
        return Promise.reject(error);
    }
);

export function getAuthenticatedApi() {
    const token = localStorage.getItem('token');
    const authenticatedApi = axios.create({ 
        baseURL: API_URL,
        withCredentials: true,
        timeout: 30000
    });
    
    if (token) {
        authenticatedApi.defaults.headers.common['Authorization'] = 'Bearer ' + token;
    }
    
    // Add 401 response interceptor to this instance too
    authenticatedApi.interceptors.response.use(
        (response) => response,
        (error) => {
            if (error.response && error.response.status === 401) {
                console.log('401 Unauthorized - Token expired or invalid, redirecting to sign in');
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('username');
                cache.clear();
                window.location.href = '/signin';
            }
            return Promise.reject(error);
        }
    );
    
    return authenticatedApi;
}

export function setAuthToken(token) {
    // Clear cache when token changes
    cache.clear();
    
	if (token) {
        api.defaults.headers.common['Authorization'] = 'Bearer ' + token;
        localStorage.setItem('token', token);
    } else {
        delete api.defaults.headers.common['Authorization'];
        localStorage.removeItem('token');
    }
}

// Clear cache manually
export function clearCache() {
    cache.clear();
}

export default api;
