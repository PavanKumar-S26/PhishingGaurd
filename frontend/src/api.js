import axios from 'axios';

let authTokenGetter = async () => null;

export function setAuthTokenGetter(getter) {
  authTokenGetter = getter;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 30_000,
});

api.interceptors.request.use(async (config) => {
  const token = await authTokenGetter();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function errorMessage(error) {
  return error?.response?.data?.detail || error?.message || 'The request could not be completed.';
}

export default api;
