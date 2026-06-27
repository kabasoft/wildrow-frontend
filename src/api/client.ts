import type { ActivePool, MnoNetwork, Transaction, UserProfile, WalletBalance } from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api';
const TOKEN_KEY = 'wildrow_access_token';
const MOCK_STORE_KEY = 'wildrow_mock_api_state';
const MOCK_ACCESS_TOKEN = 'mock-access-token';

type MockCharge = {
  txRef: string;
  amount: number;
  polls: number;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'EXPIRED';
};

type MockStore = {
  phoneNumber: string | null;
  otpCode: string | null;
  profile: UserProfile | null;
  balance: WalletBalance;
  txs: Transaction[];
  pool: ActivePool;
  charge: MockCharge | null;
};

function isLocalDevApi() {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/?$/i.test(BASE_URL);
}

function defaultMockStore(): MockStore {
  const now = new Date().toISOString();
  return {
    phoneNumber: null,
    otpCode: null,
    profile: null,
    balance: {
      principalZmw: 0,
      accruedYieldZmw: 0,
      totalBalanceZmw: 0,
      updatedAt: now,
    },
    txs: [],
    pool: {
      isinOrAuctionId: 'WR-MOCK-364D',
      tenorDays: 364,
      nominalRateApy: 0.145,
      totalUnits: 1000,
      unitsIssued: 412,
      unitsRemaining: 588,
      maturesAt: new Date(Date.now() + 364 * 24 * 60 * 60 * 1000).toISOString(),
    },
    charge: null,
  };
}

function readMockStore(): MockStore {
  if (typeof window === 'undefined') return defaultMockStore();
  const raw = window.localStorage.getItem(MOCK_STORE_KEY);
  if (!raw) return defaultMockStore();

  try {
    return { ...defaultMockStore(), ...JSON.parse(raw) } as MockStore;
  } catch {
    return defaultMockStore();
  }
}

function writeMockStore(store: MockStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MOCK_STORE_KEY, JSON.stringify(store));
}

function currentMockPhone(store: MockStore) {
  return store.phoneNumber ?? '260971234567';
}

function mockProfileFromStore(store: MockStore): UserProfile {
  return (
    store.profile ?? {
      id: 'mock-user',
      phoneNumber: currentMockPhone(store),
      fullName: 'Wildrow Investor',
      kycTier: 'UNVERIFIED',
      network: null,
    }
  );
}

function persistProfile(store: MockStore, profile: UserProfile) {
  store.profile = profile;
  store.phoneNumber = profile.phoneNumber;
  writeMockStore(store);
}

function parseBody(options: RequestInit) {
  if (!options.body || typeof options.body !== 'string') return {};
  try {
    return JSON.parse(options.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function unauthorized() {
  return new ApiError(401, 'Unauthorized');
}

function mockRequest<T>(path: string, options: RequestInit = {}): T {
  const store = readMockStore();
  const method = (options.method ?? 'GET').toUpperCase();
  const body = parseBody(options);
  const authed = !!getToken();

  if (path === '/v1/auth/otp/request' && method === 'POST') {
    const phoneNumber = String(body.phoneNumber ?? '').trim();
    store.phoneNumber = phoneNumber;
    store.otpCode = '1234';
    writeMockStore(store);
    return { message: 'OTP sent', devCode: '1234' } as T;
  }

  if (path === '/v1/auth/otp/verify' && method === 'POST') {
    const code = String(body.code ?? '').trim();
    const phoneNumber = String(body.phoneNumber ?? currentMockPhone(store)).trim();
    if (store.otpCode && code !== store.otpCode) {
      throw new ApiError(400, 'Invalid code');
    }

    persistProfile(store, {
      id: 'mock-user',
      phoneNumber,
      fullName: 'Wildrow Investor',
      kycTier: 'UNVERIFIED',
      network: null,
    });
    setToken(MOCK_ACCESS_TOKEN);
    return { accessToken: MOCK_ACCESS_TOKEN, userId: 'mock-user' } as T;
  }

  if (!authed) {
    throw unauthorized();
  }

  const profile = mockProfileFromStore(store);

  if (path === '/v1/users/me' && method === 'GET') {
    return profile as T;
  }

  if (path === '/v1/users/me/kyc/tier-1' && method === 'POST') {
    const network = String(body.network ?? 'MTN') as MnoNetwork;
    persistProfile(store, { ...profile, kycTier: 'TIER_1_VERIFIED', network });
    return {} as T;
  }

  if (path === '/v1/wallet/balance' && method === 'GET') {
    return store.balance as T;
  }

  if (path === '/v1/wallet/transactions' && method === 'GET') {
    return store.txs as T;
  }

  if (path === '/v1/ledger/active-pool' && method === 'GET') {
    return store.pool as T;
  }

  if (path === '/v1/wallet/withdraw' && method === 'POST') {
    const amountZmw = Number(body.amountZmw ?? 0);
    if (amountZmw <= 0 || amountZmw > store.balance.totalBalanceZmw) {
      throw new ApiError(400, 'Insufficient balance');
    }

    store.balance = {
      ...store.balance,
      principalZmw: Math.max(0, store.balance.principalZmw - amountZmw),
      totalBalanceZmw: Math.max(0, store.balance.totalBalanceZmw - amountZmw),
      updatedAt: new Date().toISOString(),
    };
    store.txs = [
      {
        id: `mock-withdraw-${Date.now()}`,
        type: 'WITHDRAWAL',
        amountZmw,
        reference: null,
        createdAt: new Date().toISOString(),
      },
      ...store.txs,
    ];
    writeMockStore(store);
    return {} as T;
  }

  if (path === '/v3/charges?type=mobile_money_zambia' && method === 'POST') {
    const amount = Number(body.amount ?? 0);
    const txRef = `WR-${Date.now()}`;
    store.charge = { txRef, amount, polls: 0, status: 'PENDING' };
    writeMockStore(store);
    return { data: { tx_ref: txRef } } as T;
  }

  const chargeMatch = path.match(/^\/v3\/charges\/([^/]+)\/status$/);
  if (chargeMatch && method === 'GET') {
    const txRef = chargeMatch[1];
    if (!store.charge || store.charge.txRef !== txRef) {
      return { txRef, status: 'PENDING' } as T;
    }

    store.charge.polls += 1;
    if (store.charge.polls >= 2 && store.charge.status === 'PENDING') {
      store.charge.status = 'SUCCESSFUL';
      store.balance = {
        ...store.balance,
        principalZmw: store.balance.principalZmw + store.charge.amount,
        totalBalanceZmw: store.balance.totalBalanceZmw + store.charge.amount,
        updatedAt: new Date().toISOString(),
      };
      store.txs = [
        {
          id: `mock-topup-${Date.now()}`,
          type: 'TOPUP',
          amountZmw: store.charge.amount,
          reference: txRef,
          createdAt: new Date().toISOString(),
        },
        ...store.txs,
      ];
    }
    writeMockStore(store);
    return { txRef, status: store.charge.status } as T;
  }

  throw new ApiError(404, `No mock route for ${method} ${path}`);
}

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
  try {
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
  } catch (error) {
    if (isLocalDevApi() && !(error instanceof ApiError && error.status < 500)) {
      return mockRequest<T>(path, options);
    }
    throw error;
  }
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
