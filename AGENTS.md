# Project Baseline & Instructions

This document defines the mandatory architectural and design baseline for the AngoChat Payment App. All future modifications MUST adhere to these rules.

## 1. Core Architecture
- **Runtime**: Hybrid application with an Express backend (`api/index.ts`) and a React frontend (`src/App.tsx`).
- **Payments**: Integration with NOWPayments API. Support for `pay_currency` (BTC, USDTBSC).
- **Authentication**: Supabase Auth (Sign in with Google).
- **Database**: Supabase PostgreSQL for user profiles (`profiles` table).

## 2. Payment Logic Rules
- **USDT (BEP20)**: Identifier is `usdtbsc`. It is the default currency and allows values from $1.
- **Bitcoin**: Identifier is `btc`. **MANDATORY**: Only available for values of $10 and $20. For values below $10, the Bitcoin option must be hidden or disabled.
- **Verification**: All payments must be verified via the server-side webhook flow.

## 3. UI & Design Standards
- **AngoCoin Icon**: Use the custom SVG implementation of a golden coin with an octopus (AngoChat logo). Use specific HEX codes: `#FFE57F`, `#FFD740`, `#FFC400`, and `#8A6508` for the icon.
- **Checkout Flow**: 
    - The user's current balance must NOT be shown in the checkout modal.
    - Currency selection must appear before amount selection.
    - Copy-to-clipboard MUST be triggered by a single click on the address or amount field.
    - Payment instructions (Amount, Wallet Address) MUST be displayed above the QR code.
- **Icons**: Exclusively use `lucide-react` (e.g., `Copy`, `Bitcoin`, `Wallet`).

## 4. Error Handling
- Server errors from NOWPayments must be translated into user-friendly Portuguese (e.g., "O valor é muito baixo").
- Supabase session errors must trigger a clean sign-out.
