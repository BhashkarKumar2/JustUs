import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
    baseURL: API_URL,
    withCredentials: true, // Important: This ensures cookies are sent with requests
    headers: {
        'ngrok-skip-browser-warning': 'true' // Skip ngrok warning page
    }
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Response interceptor with refresh logic
const responseInterceptor = (apiInstance) => async (error) => {
    const originalRequest = error.config;

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
            return new Promise(function (resolve, reject) {
                failedQueue.push({ resolve, reject });
            }).then(token => {
                originalRequest.headers['Authorization'] = 'Bearer ' + token;
                return apiInstance(originalRequest);
            }).catch(err => {
                return Promise.reject(err);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            // Call refresh endpoint using raw axios to avoid interceptors
            console.log('Refreshing token...');
            const { data } = await axios.post(`${API_URL}/api/auth/refresh-token`, {}, {
                withCredentials: true
            });

            const { token } = data;

            // Update token
            setAuthToken(token);

            // Update pending requests
            originalRequest.headers['Authorization'] = 'Bearer ' + token;
            processQueue(null, token);

            return apiInstance(originalRequest);
        } catch (err) {
            processQueue(err, null);

            // Logout
            console.log('Refresh failed, logging out');
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('username');
            delete api.defaults.headers.common['Authorization'];
            window.location.href = '/signin';

            return Promise.reject(err);
        } finally {
            isRefreshing = false;
        }
    }
    return Promise.reject(error);
};

// Add request interceptor to ensure token is always included
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token && !config.headers.Authorization) {
            config.headers.Authorization = 'Bearer ' + token;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor
api.interceptors.response.use(
    (response) => {
        return response;
    },
    responseInterceptor(api)
);

// Create a function to get a new axios instance with the current token
export function getAuthenticatedApi() {
    const token = localStorage.getItem('token');
    const authenticatedApi = axios.create({
        baseURL: API_URL,
        withCredentials: true, // Ensure cookies are sent
        headers: {
            'ngrok-skip-browser-warning': 'true' // Skip ngrok warning page
        }
    });

    if (token) {
        authenticatedApi.defaults.headers.common['Authorization'] = 'Bearer ' + token;
    }

    // Add 401 response interceptor to this instance too
    authenticatedApi.interceptors.response.use(
        (response) => response,
        responseInterceptor(authenticatedApi)
    );

    return authenticatedApi;
}

export function setAuthToken(token) {
    console.log('Setting auth token:', token ? 'present' : 'none');

    if (token) {
        api.defaults.headers.common['Authorization'] = 'Bearer ' + token;
        // Also store in localStorage for the interceptor
        localStorage.setItem('token', token);
    } else {
        delete api.defaults.headers.common['Authorization'];
        localStorage.removeItem('token');
    }
}

export default api;
