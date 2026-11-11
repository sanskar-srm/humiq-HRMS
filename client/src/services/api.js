import axios from 'axios';

const TOKEN_KEY = 'hrms.token';
const PORTAL_KEY = 'hrms.portal';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
  getPortal: () => localStorage.getItem(PORTAL_KEY) || 'staff',
  setPortal: (portal) => localStorage.setItem(PORTAL_KEY, portal),
};

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
});

client.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new Event('hrms:unauthorized'));
    }
    const body = error.response?.data;
    const normalized = new Error(body?.message || error.message || 'The request could not be completed');
    normalized.status = error.response?.status;
    normalized.code = body?.error?.code;
    normalized.details = body?.error?.details;
    normalized.requestId = body?.error?.requestId || error.response?.headers?.['x-request-id'];

    const logContext = {
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url,
      status: normalized.status,
      code: normalized.code,
      requestId: normalized.requestId,
      message: normalized.message,
      details: normalized.details,
    };
    if (!normalized.status || normalized.status >= 500) {
      console.error('[api] request failed', logContext);
    } else {
      console.warn('[api] request rejected', logContext);
    }

    return Promise.reject(normalized);
  },
);

const unwrap = (promise) => promise.then((response) => response.data);

export const api = {
  get: (url, config) => unwrap(client.get(url, config)),
  post: (url, data, config) => unwrap(client.post(url, data, config)),
  patch: (url, data, config) => unwrap(client.patch(url, data, config)),
  put: (url, data, config) => unwrap(client.put(url, data, config)),
  delete: (url, config) => unwrap(client.delete(url, config)),
  download: async (url) => {
    const response = await client.get(url, { responseType: 'blob' });
    const disposition = response.headers['content-disposition'] || '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] || 'document.html';
    const blobUrl = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  },
};

export const getErrorMessage = (error) => {
  if (!error) return 'Something went wrong';
  if (error.details?.length) {
    return `${error.message}: ${error.details.map((detail) => detail.message).join(', ')}`;
  }
  return error.message || 'Something went wrong';
};
