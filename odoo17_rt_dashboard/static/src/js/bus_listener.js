/** @odoo-module **/

import { useService } from "@web/core/utils/hooks";
import { onWillUnmount } from "@odoo/owl";

/**
 * Hook: subscribe to rt_kpi_update bus notifications.
 *
 * @param {Function} onUpdate  Callback({ kpi_id, value, delta, level })
 */
export function useRtKpiUpdates(onUpdate) {
    const busService = useService("bus_service");
    const handler = (payload) => onUpdate(payload);
    busService.subscribe("rt_kpi_update", handler);
    onWillUnmount(() => busService.unsubscribe("rt_kpi_update", handler));
}

/**
 * Hook: subscribe to rt_alert_banner bus notifications.
 *
 * Fired by AlertDispatcher (threshold alerts) and AnomalyDetector.
 * Payload: { rule_id?, kpi_id, kpi_label, level, value, message, type? }
 *
 * @param {Function} onAlert  Callback(payload)
 */
export function useRtAlertBanner(onAlert) {
    const busService = useService("bus_service");
    const handler = (payload) => onAlert(payload);
    busService.subscribe("rt_alert_banner", handler);
    onWillUnmount(() => busService.unsubscribe("rt_alert_banner", handler));
}
