import api from './api';

export const login = async (creds) => {
  try {
    const response = await api.post('/api/auth/login', creds);
    return response;
  } catch (error) {
    console.error('Login error:', error.response || error);
    // Enhanced error handling
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.message || error.response.data || 'Login failed';
      throw {
        ...error,
        message: typeof message === 'string' ? message : 'Login failed',
        requiresVerification: error.response.data?.requiresVerification,
        email: error.response.data?.email
      };
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Network error. Please check your connection.');
    } else {
      // Something else went wrong
      throw new Error('An unexpected error occurred');
    }
  }
};

export const register = async (creds) => {
  try {
    const response = await api.post('/api/auth/register', creds);
    return response;
  } catch (error) {
    console.error('Registration error:', error.response || error);
    // Enhanced error handling
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.message || error.response.data || 'Registration failed';
      throw {
        ...error,
        message: typeof message === 'string' ? message : 'Registration failed'
      };
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Network error. Please check your connection.');
    } else {
      // Something else went wrong
      throw new Error('An unexpected error occurred');
    }
  }
};

export const verifyEmail = async (data) => {
  try {
    const response = await api.post('/api/auth/verify-email', data);
    return response;
  } catch (error) {
    console.error('Verification error:', error.response || error);
    if (error.response) {
      const message = error.response.data?.message || 'Verification failed';
      throw { ...error, message };
    }
    throw new Error('Network error');
  }
};

export const resendVerification = async (email) => {
  try {
    const response = await api.post('/api/auth/resend-verification', { email });
    return response;
  } catch (error) {
    console.error('Resend error:', error.response || error);
    if (error.response) {
      const message = error.response.data?.message || 'Failed to resend code';
      throw { ...error, message };
    }
    throw new Error('Network error');
  }
};

// Utility function to validate credentials
export const validateCredentials = (username, password) => {
  const errors = {};

  if (!username || username.trim().length === 0) {
    errors.username = 'Username is required';
  } else if (username.trim().length < 3) {
    errors.username = 'Username must be at least 3 characters';
  } else if (username.trim().length > 20) {
    errors.username = 'Username must be less than 20 characters';
  } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    errors.username = 'Username can only contain letters, numbers, and underscores';
  }

  if (!password || password.length === 0) {
    errors.password = 'Password is required';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  } else if (password.length > 50) {
    errors.password = 'Password must be less than 50 characters';
  } else if (!/(?=.*[A-Z])/.test(password)) {
    errors.password = 'Password must contain at least one uppercase letter';
  } else if (!/(?=.*\d)/.test(password)) {
    errors.password = 'Password must contain at least one digit';
  } else if (!/(?=.*[!@#$%^&*])/.test(password)) {
    errors.password = 'Password must contain at least one special character (!@#$%^&*)';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export const logout = async () => {
  try {
    // Call the backend logout endpoint to clear the HTTP-only cookie
    await api.post('/api/auth/logout');
  } catch (error) {
    console.error('Logout API call failed:', error);
    // Continue with local cleanup even if API call fails
  }

  // Clear local storage
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('otherUserId');

  // Optionally reload the page to ensure clean state
  window.location.reload();
};

export const updateProfile = async (data) => {
  try {
    const response = await api.put('/api/auth/profile', data);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const forgotPassword = async (email) => {
  try {
    const response = await api.post('/api/auth/forgot-password', { email });
    return response.data;
  } catch (error) {
    console.error('Forgot password error:', error.response || error);
    if (error.response) {
      const message = error.response.data?.message || 'Failed to request password reset';
      throw { ...error, message };
    }
    throw new Error('Network error');
  }
};

export const resetPassword = async (data) => {
  try {
    const response = await api.post('/api/auth/reset-password', data);
    return response.data;
  } catch (error) {
    console.error('Reset password error:', error.response || error);
    if (error.response) {
      const message = error.response.data?.message || 'Failed to reset password';
      throw { ...error, message };
    }
    throw new Error('Network error');
  }
};
