/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { rpc } from "@web/core/network/rpc";
import { KpiWidget } from "./kpi_widget";
import { useRtKpiUpdates, useRtAlertBanner } from "./bus_listener";

const DEPT_ICONS = {
    ceo:       "fa-th-large",
    ventas:    "fa-line-chart",
    marketing: "fa-bullhorn",
    cfo:       "fa-money",
    cto:       "fa-terminal",
    ops:       "fa-cogs",
    rrhh:      "fa-users",
};

class RtDashboardView extends Component {
    static template = "odoo_rt_dashboard.DashboardView";
    static components = { KpiWidget };

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");

        this.state = useState({
            dashboards: [],
            selectedId: null,
            kpis: {},
            loading: false,
            error: null,
            settingUp: false,
            reinstalling: false,
            alerts: [],
            _alertSeq: 0,
            briefing: null,
            briefingLoading: false,
            briefingError: null,
            showBriefing: false,
            // ── Layout editor ──────────────────────────────────────────────
            editMode: false,
            layout: [],       // ordered list of KPI IDs for selected dashboard
            dragSrcId: null,
            dragOverId: null,
        });

        useRtKpiUpdates(({ kpi_id, value, delta, level }) => {
            if (Object.prototype.hasOwnProperty.call(this.state.kpis, kpi_id)) {
                this.state.kpis[kpi_id] = {
                    ...this.state.kpis[kpi_id],
                    value,
                    delta,
                    level,
                };
            }
        });

        useRtAlertBanner((payload) => {
            const id = ++this.state._alertSeq;
            this.state.alerts = [...this.state.alerts, { id, ...payload }];
            if (payload.level !== "critical") {
                setTimeout(() => this.dismissAlert(id), 30_000);
            }
        });

        onWillStart(() => this._loadDashboards());
    }

    // ── Data loading ─────────────────────────────────────────────────────────

    async _loadDashboards() {
        // Always call setup/defaults so that:
        //   1. groupby_field is synced to existing KPI records after upgrades
        //   2. Newly-created KPIs (manual or default) are linked to the dashboards
        //   3. No manual "Reinstalar KPIs" action required from the user
        try {
            const result = await rpc("/rt_dashboard/setup/defaults", {});
            const dashboards = (result.ok && result.dashboards) ? result.dashboards : [];
            this.state.dashboards = dashboards;
            if (dashboards.length > 0) {
                await this._loadSnapshot(dashboards[0].id);
            }
        } catch (err) {
            this.state.error = err.message || "Error cargando dashboards";
        }
    }

    async _loadSnapshot(dashboardId) {
        this.state.loading = true;
        this.state.error = null;
        try {
            const result = await rpc("/rt_dashboard/snapshot", { dashboard_id: dashboardId });
            if (result.error) throw new Error(result.error);
            this.state.kpis = result.kpis || {};
            this.state.selectedId = dashboardId;

            // Load saved layout for this dashboard
            const dash = this.state.dashboards.find(d => d.id === dashboardId);
            try {
                this.state.layout = (dash && dash.layout) ? JSON.parse(dash.layout) : [];
            } catch {
                this.state.layout = [];
            }
        } catch (err) {
            this.state.error = err.message || "Error cargando datos KPI";
            this.notification.add(this.state.error, { type: "danger" });
        } finally {
            this.state.loading = false;
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    async selectDashboard(dashboardId) {
        if (dashboardId === this.state.selectedId) return;
        this.state.briefing = null;
        this.state.showBriefing = false;
        this.state.editMode = false;
        this.state.dragSrcId = null;
        this.state.dragOverId = null;
        await this._loadSnapshot(dashboardId);
    }

    async setupDefaults() {
        this.state.settingUp = true;
        this.state.error = null;
        try {
            const result = await rpc("/rt_dashboard/setup/defaults", {});
            if (result.ok && result.dashboards.length) {
                this.state.dashboards = result.dashboards;
                await this._loadSnapshot(result.dashboards[0].id);
                this.notification.add("KPIs y dashboards instalados.", { type: "success" });
            } else {
                this.state.error = "No se encontraron KPIs para los módulos instalados.";
            }
        } catch (err) {
            this.state.error = err.message || "Error al configurar los dashboards.";
            this.notification.add(this.state.error, { type: "danger" });
        } finally {
            this.state.settingUp = false;
        }
    }

    async reinstallKpis() {
        this.state.reinstalling = true;
        this.state.error = null;
        try {
            const result = await rpc("/rt_dashboard/setup/defaults", {});
            if (result.ok) {
                this.state.dashboards = result.dashboards;
                const currentId = this.state.selectedId;
                const stillExists = result.dashboards.find((d) => d.id === currentId);
                const targetId = stillExists ? currentId : (result.dashboards[0] || {}).id;
                if (targetId) await this._loadSnapshot(targetId);
                this.notification.add("KPIs actualizados correctamente.", { type: "success" });
            }
        } catch (err) {
            this.state.error = err.message || "Error al reinstalar KPIs.";
            this.notification.add(this.state.error, { type: "danger" });
        } finally {
            this.state.reinstalling = false;
        }
    }

    dismissAlert(alertId) {
        this.state.alerts = this.state.alerts.filter((a) => a.id !== alertId);
    }

    // ── Layout editor ─────────────────────────────────────────────────────────

    toggleEditMode() {
        this.state.editMode = !this.state.editMode;
        this.state.dragSrcId = null;
        this.state.dragOverId = null;
    }

    onDragStart(id, e) {
        e.dataTransfer.effectAllowed = "move";
        this.state.dragSrcId = id;
    }

    onDragOver(id) {
        if (this.state.dragSrcId !== null && this.state.dragSrcId !== id) {
            this.state.dragOverId = id;
        }
    }

    onDrop(targetId) {
        const srcId = this.state.dragSrcId;
        if (srcId === null || srcId === targetId) {
            this.onDragEnd();
            return;
        }
        // Build current ordered list of IDs (respects existing layout)
        const allIds = this.kpiEntries.map(e => e.id);
        const newLayout = [...allIds];
        const si = newLayout.indexOf(srcId);
        const ti = newLayout.indexOf(targetId);
        newLayout.splice(si, 1);
        newLayout.splice(ti, 0, srcId);

        this.state.layout = newLayout;
        this.onDragEnd();
        this._saveLayout();
    }

    onDragEnd() {
        this.state.dragSrcId = null;
        this.state.dragOverId = null;
    }

    async _saveLayout() {
        if (!this.state.selectedId) return;
        try {
            await rpc("/rt_dashboard/save_layout", {
                dashboard_id: this.state.selectedId,
                layout: this.state.layout,
            });
            // Sync the cached dashboard object so tab switches keep the layout
            const dash = this.state.dashboards.find(d => d.id === this.state.selectedId);
            if (dash) dash.layout = JSON.stringify(this.state.layout);
        } catch {
            this.notification.add("No se pudo guardar el layout", { type: "warning" });
        }
    }

    async toggleBriefing() {
        if (this.state.showBriefing) {
            this.state.showBriefing = false;
            return;
        }
        this.state.showBriefing = true;
        if (!this.state.briefing) await this._loadBriefing();
    }

    async refreshBriefing() {
        this.state.briefing = null;
        await this._loadBriefing();
    }

    async _loadBriefing() {
        const dashboard = this.selectedDashboard;
        if (!dashboard) return;
        this.state.briefingLoading = true;
        this.state.briefingError = null;
        try {
            const result = await rpc("/rt_dashboard/ai/briefing", { department: dashboard.department });
            if (result.error) { this.state.briefingError = result.error; }
            else { this.state.briefing = result; }
        } catch (err) {
            this.state.briefingError = err.message || "Error al generar el briefing";
        } finally {
            this.state.briefingLoading = false;
        }
    }

    // ── Computed ─────────────────────────────────────────────────────────────

    get kpiEntries() {
        const entries = Object.entries(this.state.kpis).map(([id, kpi]) => ({
            id: parseInt(id, 10),
            ...kpi,
        }));
        if (!this.state.layout.length) return entries;
        return entries.sort((a, b) => {
            const pa = this.state.layout.indexOf(a.id);
            const pb = this.state.layout.indexOf(b.id);
            return (pa === -1 ? 9999 : pa) - (pb === -1 ? 9999 : pb);
        });
    }

    /** KPI cards — all types except explicit chart types */
    get cardKpis() {
        return this.kpiEntries.filter(
            (k) => !["bar", "funnel", "pie", "line"].includes(k.chart_type)
        );
    }

    /** KPIs that render as chart widgets (always, even if data is still loading) */
    get chartKpis() {
        return this.kpiEntries.filter(
            (k) => ["bar", "funnel", "pie", "line"].includes(k.chart_type)
        );
    }

    get selectedDashboard() {
        return this.state.dashboards.find((d) => d.id === this.state.selectedId);
    }

    get activeAlerts() {
        return this.state.alerts;
    }

    deptIcon(department) {
        return DEPT_ICONS[department] || "fa-tachometer";
    }
}

registry.category("actions").add("rt_dashboard.main_view", RtDashboardView);
