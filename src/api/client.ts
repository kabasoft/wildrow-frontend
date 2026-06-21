const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api';
const TOKEN_KEY = 'wildrow_access_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body.message ?? `Request failed with status ${res.status}`);
  }
  return body as T;
}

export const api = {
  requestOtp: (phoneNumber: string) =>
    request<{ message: string; devCode?: string }>('/v1/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),

  verifyOtp: (phoneNumber: string, code: string) =>
    request<{ accessToken: string; userId: string }>('/v1/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, code }),
    }),

  submitTierOneKyc: (nationalRegistrationNo: string, network: string) =>
    request('/v1/users/me/kyc/tier-1', {
      method: 'POST',
      body: JSON.stringify({ nationalRegistrationNo, network }),
    }),

  getProfile: () => request('/v1/users/me'),

  getBalance: () => request('/v1/wallet/balance'),

  getTransactions: () => request('/v1/wallet/transactions'),

  withdraw: (amountZmw: number) =>
    request('/v1/wallet/withdraw', { method: 'POST', body: JSON.stringify({ amountZmw }) }),

  getActivePool: () => request('/v1/ledger/active-pool'),

  createCharge: (params: {
    amount: number;
    currency: string;
    email: string;
    network: string;
    phone_number: string;
    fullname: string;
    meta: { tier_kyc_status: string; national_registration_number: string; fund_code: string };
  }) => request('/v3/charges?type=mobile_money_zambia', { method: 'POST', body: JSON.stringify(params) }),

  getChargeStatus: (txRef: string) => request<{ txRef: string; status: string }>(`/v3/charges/${txRef}/status`),
};

export { ApiError };
