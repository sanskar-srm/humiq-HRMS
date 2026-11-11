import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const loadProfile = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      console.warn('[auth] profile load failed; clearing local session', {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        requestId: error?.requestId,
      });
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    loadProfile();
    const onUnauthorized = () => clearSession();
    window.addEventListener('hrms:unauthorized', onUnauthorized);
    return () => window.removeEventListener('hrms:unauthorized', onUnauthorized);
  }, [loadProfile, clearSession]);

  const loginStaff = useCallback(async (employeeId, password) => {
    const response = await api.post('/auth/login', { employee_id: employeeId, password });
    tokenStore.set(response.data.token);
    tokenStore.setPortal('staff');
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const loginEmployee = useCallback(async (email, password) => {
    const response = await api.post('/employee/auth/login', { email, password });
    tokenStore.set(response.data.token);
    tokenStore.setPortal('employee');
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const registerEmployee = useCallback(async (payload) => {
    const response = await api.post('/employee/auth/register', payload);
    return response.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Stateless JWT: local session is cleared even if the audit call fails.
    }
    clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const response = await api.get('/auth/me');
    setUser(response.data);
    return response.data;
  }, []);

  const value = useMemo(() => {
    const role = user?.role;
    return {
      user,
      role,
      loading,
      loginStaff,
      loginEmployee,
      registerEmployee,
      logout,
      refreshUser,
      isAdmin: role === 'Admin',
      isHR: role === 'HR',
      isManager: role === 'Manager',
      isEmployee: role === 'Employee',
      isHRAdmin: role === 'Admin' || role === 'HR',
      isStaffAgent: ['Admin', 'HR', 'Manager'].includes(role),
      hasRole: (...roles) => roles.includes(role),
    };
  }, [user, loading, loginStaff, loginEmployee, registerEmployee, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
