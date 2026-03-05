

## Plan: Fix Build Error and Ranking Data Issue

### 1. Fix Duplicate Type (Build Error)

The `src/integrations/supabase/types.ts` file has `client_purchase_history` defined twice (lines 213-259 and 345-391). Since this file is auto-generated, I will remove the first duplicate block (lines 213-259) to resolve the `TS2300: Duplicate identifier` error.

### 2. Fix Ranking Not Updating After Live Entries

The root cause: the `get_organization_rankings` RPC function prioritizes `tx_*` fields (manager/reception data) over barber-confirmed data (`services_basic_total`, `manual_*`). This means:
- When the reception enters data in "AO VIVO", the `tx_*` fields get populated via the `recalculate_daily_production_from_transactions` trigger
- The ranking RPC reads those `tx_*` fields correctly
- **However**, if a barber hasn't confirmed yet and there are no `daily_productions` records at all for that day, the barber won't appear in rankings

The actual problem is likely that after launching sales in "AO VIVO" for Barbearia Novante, the `daily_productions` records either:
- Were not created (the Live dashboard creates them with `confirmed_presence = false`)
- Or the `link_orphan_transactions` trigger didn't fire to connect transactions to productions

I will update the `get_organization_rankings` RPC to ensure it correctly picks up data regardless of whether `tx_*` or `manual_*` fields are populated, using the same priority logic already established:
- If barber confirmed (`manual_*` > 0), use `manual_*`
- Otherwise if reception entered (`tx_*` > 0), use `tx_*`
- Fallback to legacy fields

This aligns the ranking with the rest of the system.

### Technical Changes

1. **`src/integrations/supabase/types.ts`**: Remove duplicate `client_purchase_history` block (lines 213-259)

2. **Database migration**: Update `get_organization_rankings` RPC to use consistent data priority:
   - Priority 1: Barber-confirmed data (`manual_*` fields when > 0)
   - Priority 2: Manager/reception data (`tx_*` fields when > 0)
   - Priority 3: Legacy fields (`services_total`, `products_total`)
   
   This ensures that after the reception enters data in AO VIVO, the ranking immediately reflects those entries, and when the barber confirms, it updates to the confirmed values.

