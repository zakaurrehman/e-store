-- Deposits can be sent to Zendropship's Binance USDT (TRC20) address, and withdrawals are paid in USDT on
-- TRC20. The older values stay: past deposits and payouts made by bank transfer, PayPal or other crypto
-- keep their method and still read correctly.
ALTER TYPE "DepositMethod" ADD VALUE IF NOT EXISTS 'USDT_TRC20';
ALTER TYPE "PayoutMethod" ADD VALUE IF NOT EXISTS 'USDT_TRC20';
