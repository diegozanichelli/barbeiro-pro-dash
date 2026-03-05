

## Plan: Fix Orphaned Transactions Not Appearing in Rankings

### Root Cause

The `QuickSaleModal` does NOT create a `daily_productions` record when one doesn't exist. It only looks for an existing one, and if absent, inserts transactions with `daily_production_id = NULL`.

This means:
- The `link_orphan_transactions` trigger (fires on `daily_productions` INSERT) never fires
- The `recalculate_daily_production_from_transactions` trigger never updates `tx_*` fields
- The `get_organization_rankings` RPC reads from `daily_productions`, finds nothing, and the barber is invisible in rankings

**Affected data right now (Barbearia Novante):**
- DYOGO MANOEL: 20 orphaned transactions, R$232, zero `daily_productions` records
- ARIEL ZANELA: 2 orphaned transactions
- LUCAS DANIEL: 2 orphaned transactions

The LiveDashboard "AO VIVO" works because it queries `sale_transactions` directly as fallback, but the Leaderboard/Rankings only read `daily_productions`.

### Fix

**1. QuickSaleModal: Create `daily_productions` if not exists (cart sale + manual sale)**

In both `handleCartSale` and `handleManualSale`, after looking up the existing production and finding none, upsert a new `daily_productions` record with zeroed values. This triggers `link_orphan_transactions` which links the transaction, then `recalculate_daily_production_from_transactions` updates `tx_*` fields.

The change: replace the "lookup only" pattern with "lookup or create":
```
// Current: just lookup
const { data: existingProduction } = await supabase
  .from("daily_productions").select("id")...maybeSingle();
productionId = existingProduction?.id || null;

// Fixed: lookup, and if not found, create
if (!existingProduction) {
  const { data: newProd } = await supabase
    .from("daily_productions")
    .insert({ organization_id, barber_id, date: dateStr, ... zeroed fields })
    .select("id").single();
  productionId = newProd?.id || null;
} else {
  productionId = existingProduction.id;
}
```

This ensures every sale from the manager creates a production record, allowing the trigger chain to work.

**2. Fix the infinite render loop (console error)**

The console shows `Maximum update depth exceeded` in QuickSaleModal at line ~437. This is the `useEffect` that computes `totalRevenue` in LiveDashboard (line 285-299) — it has `totalRevenue` in the dependency array but also sets it, creating a loop. Fix: remove `totalRevenue` from the dependency array.

**3. Database migration: Link existing orphaned transactions**

Run a one-time migration to create `daily_productions` records for barbers that have orphaned transactions, then link them:

```sql
-- For each barber+date combo with orphaned transactions, create daily_productions if missing
-- Then update orphaned transactions to link to the production
```

### Files to Change

1. **`src/components/dashboard/manager/QuickSaleModal.tsx`** — Create `daily_productions` record if not exists in both cart and manual sale flows
2. **`src/components/dashboard/manager/LiveDashboard.tsx`** — Remove `totalRevenue` from useEffect dependency to fix infinite loop
3. **Database migration** — Link existing orphaned transactions for Novante (and any other org)

