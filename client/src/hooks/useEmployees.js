import { useCallback } from 'react';
import { api } from '../services/api.js';
import useApiResource from './useApiResource.js';

export default function useEmployees(enabled = true) {
  const loader = useCallback(() => api.get('/employees/options').then((response) => response.data), []);
  const resource = useApiResource(loader, [], { immediate: enabled });
  const employees = resource.data ?? [];
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  return {
    employees,
    employeeMap: byId,
    loading: resource.loading,
    error: resource.error,
    reload: resource.reload,
  };
}
