/**
 * Tool → required OAuth scope map.
 *
 * This is advisory, not the enforcement boundary: the real scope check lives in
 * rentaly's `routes/api-v1.js` (`requireScope` per route), which 403s with
 * `insufficient_scope` when a bearer lacks the scope. We mirror the mapping here
 * only to enrich the error Claude sees ("needs maintenance:write") instead of a
 * bare 403.
 *
 * The vocabulary MUST stay in lockstep with rentaly's
 * `server/lib/oauthConfig.js` OAUTH_SCOPES:
 *   properties:read · tenants:read · accounting:read ·
 *   maintenance:read · maintenance:write · communications:write
 */
export const TOOL_SCOPES: Record<string, string> = {
  // Properties (properties:read)
  proprietio_search_properties: "properties:read",
  proprietio_get_property: "properties:read",
  proprietio_list_units: "properties:read",
  proprietio_get_rent_roll: "properties:read",
  // Residents (tenants:read)
  proprietio_list_residents: "tenants:read",
  // Accounting (accounting:read)
  proprietio_get_balance_sheet: "accounting:read",
  proprietio_get_income_statement: "accounting:read",
  proprietio_get_general_ledger: "accounting:read",
  proprietio_get_noi: "accounting:read",
  proprietio_get_delinquency: "accounting:read",
  proprietio_get_lease: "accounting:read",
  // Maintenance reads (maintenance:read)
  proprietio_get_work_order: "maintenance:read",
  proprietio_search_work_orders: "maintenance:read",
  proprietio_list_vendors: "maintenance:read",
  // Maintenance writes (maintenance:write)
  proprietio_create_work_order: "maintenance:write",
  proprietio_update_work_order: "maintenance:write",
  proprietio_close_work_order: "maintenance:write",
  // Comms (communications:write)
  proprietio_send_message: "communications:write",
};

/** The scope a tool needs, or undefined if unmapped. */
export function scopeForTool(toolName: string): string | undefined {
  return TOOL_SCOPES[toolName];
}
