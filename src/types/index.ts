export interface WalletBalance {
  principalZmw: number;
  accruedYieldZmw: number;
  totalBalanceZmw: number;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  type: 'TOPUP' | 'WITHDRAWAL' | 'YIELD_CREDIT' | 'MANAGEMENT_FEE';
  amountZmw: number;
  reference?: string | null;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  phoneNumber: string;
  fullName: string | null;
  kycTier: 'UNVERIFIED' | 'TIER_1_VERIFIED' | 'TIER_2_VERIFIED';
  network: 'MTN' | 'AIRTEL' | 'ZAMTEL' | null;
}

export interface ActivePool {
  isinOrAuctionId: string;
  tenorDays: number;
  nominalRateApy: number;
  totalUnits: number;
  unitsIssued: number;
  unitsRemaining: number;
  maturesAt: string;
}

export type MnoNetwork = 'MTN' | 'AIRTEL' | 'ZAMTEL';
