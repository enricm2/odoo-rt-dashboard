/** @odoo-module **/

import { Component } from "@odoo/owl";

/**
 * KpiWidget — renders a single KPI with the appropriate visual:
 *   kpi_card  → dark card with value, delta badge, mini sparkline
 *   bar/funnel → horizontal bar chart
 *   line       → area sparkline chart
 *   progress   → progress bar
 */
export class KpiWidget extends Component {
    static template = "odoo_rt_dashboard.KpiWidget";

    static props = {
        kpiId: Number,
        kpi: {
            type: Object,
            shape: {
                label:          String,
                value:          { type: Number, optional: true },
                delta:          { type: Number, optional: true },
                level:          { type: String, optional: true },
                icon:           { type: String, optional: true },
                cached_value:   { type: Number, optional: true },
                chart_type:     { type: String, optional: true },
                groupby_field:  { type: String, optional: true },
                display_format: { type: String, optional: true },
                currency_symbol:{ type: String, optional: true },
                record_count:   { type: Number, optional: true },
                chart_data:     { type: Object, optional: true },
                sparkline:      { type: Array, optional: true },
                threshold_warn: { type: Number, optional: true },
                threshold_crit: { type: Number, optional: true },
                font_size:      { type: String, optional: true },
                icon_size:      { type: String, optional: true },
                accent_color:   { type: String, optional: true },
                error:          { type: Boolean, optional: true },
            },
        },
    };

    // ── Derived ──────────────────────────────────────────────────────────────

    get level() { return this.props.kpi.level || "ok"; }
    get chartType() { return this.props.kpi.chart_type || "kpi_card"; }

    /** True when icon is an emoji (not a fa- class) */
    get iconIsEmoji() {
        const icon = this.props.kpi.icon || "";
        return icon.length > 0 && !icon.startsWith("fa-");
    }

    /** Inline style for the icon — size + accent_color */
    get iconStyle() {
        const sizes = { sm: "1.1rem", md: "1.6rem", lg: "2.6rem" };
        const sz = sizes[this.props.kpi.icon_size] || sizes.md;
        const c = this.props.kpi.accent_color;
        return `font-size:${sz}${c ? ";color:" + c : ""}`;
    }

    get isBarChart() { return ["bar", "funnel", "pie"].includes(this.chartType); }
    get isLineChart() { return this.chartType === "line"; }
    get isChart() { return this.isBarChart || this.isLineChart; }

    /** Inline style for the numeric value (font size + color) */
    get valueStyle() {
        const sizes = { sm: "1.5rem", md: "2.125rem", lg: "3rem", xl: "4rem" };
        const fs = sizes[this.props.kpi.font_size] || sizes.md;
        const color = this.props.kpi.accent_color || "#e6edf3";
        return `font-size:${fs};color:${color}`;
    }

    /** Top border accent when accent_color is set */
    get cardAccentStyle() {
        const c = this.props.kpi.accent_color;
        return c ? `border-top:3px solid ${c}` : "";
    }

    /** Accent color for chart header icon/title when set */
    get chartAccentStyle() {
        const c = this.props.kpi.accent_color;
        return c ? `color:${c}` : "";
    }

    /** True only when chart_data has at least one label */
    get hasChartData() {
        const d = this.props.kpi.chart_data;
        return !!(d && (d.labels || []).length > 0);
    }

    /**
     * Chart type configured but no groupby_field set → need to configure KPI.
     * If groupby_field is set but chart_data is empty → data simply doesn't exist yet.
     */
    get chartEmptyReason() {
        if (this.hasChartData) return null;
        if (!this.props.kpi.groupby_field) {
            return "Configura el campo Group By en la definición de este KPI para ver el gráfico.";
        }
        return "Sin datos disponibles para el campo de agrupación configurado. Los registros pueden no tener ese campo completado.";
    }

    /** Human-readable value with currency symbol or % sign */
    get formattedValue() {
        const v = this.props.kpi.value ?? 0;
        const fmt = this.props.kpi.display_format || "number";
        const sym = this.props.kpi.currency_symbol || "€";

        let num;
        if (Math.abs(v) >= 1_000_000) {
            num = `${(v / 1_000_000).toFixed(1)}M`;
        } else if (Math.abs(v) >= 1_000) {
            num = `${(v / 1_000).toFixed(1)}K`;
        } else if (Number.isInteger(v)) {
            num = String(v);
        } else {
            num = v.toFixed(1);
        }

        if (fmt === "currency") return `${sym}${num}`;
        if (fmt === "percentage") return `${num}%`;
        return num;
    }

    /** Delta as % change from cached_value */
    get deltaPercent() {
        const curr = this.props.kpi.value ?? 0;
        const prev = this.props.kpi.cached_value ?? curr;
        if (prev === 0) return null;
        return ((curr - prev) / Math.abs(prev)) * 100;
    }

    get deltaLabel() {
        const pct = this.deltaPercent;
        if (pct === null) return null;
        const sign = pct > 0 ? "+" : "";
        return `${sign}${pct.toFixed(1)}%`;
    }

    get deltaClass() {
        const pct = this.deltaPercent;
        if (pct === null) return "rt-delta rt-delta-flat";
        if (pct > 0.5) return "rt-delta rt-delta-up";
        if (pct < -0.5) return "rt-delta rt-delta-down";
        return "rt-delta rt-delta-flat";
    }

    get deltaIcon() {
        const pct = this.deltaPercent;
        if (pct === null) return "fa-minus";
        if (pct > 0.5) return "fa-arrow-up";
        if (pct < -0.5) return "fa-arrow-down";
        return "fa-minus";
    }

    get cardLevelClass() {
        if (this.level === "warning") return "level-warning";
        if (this.level === "critical") return "level-critical";
        return "";
    }

    get subtitle() {
        const count = this.props.kpi.record_count;
        if (count != null) {
            return `${count.toLocaleString("es-ES")} registros`;
        }
        return null;
    }

    // ── Sparkline SVG ────────────────────────────────────────────────────────

    get sparklinePoints() {
        const values = this.props.kpi.sparkline || [];
        if (values.length < 2) return "";
        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min || 1;
        const W = 200, H = 44, PAD = 3;
        return values
            .map((v, i) => {
                const x = (i / (values.length - 1)) * W;
                const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
    }

    get sparklineAreaPoints() {
        const pts = this.sparklinePoints;
        if (!pts) return "";
        return `${pts} 200,44 0,44`;
    }

    get sparklineColor() {
        if (this.level === "critical") return "#f85149";
        if (this.level === "warning") return "#d29922";
        return "#3fb950";
    }

    get hasSparkline() {
        return (this.props.kpi.sparkline || []).length >= 2;
    }

    // ── Line / Area chart ─────────────────────────────────────────────────────

    get lineChartData() {
        const data = this.props.kpi.chart_data;
        if (!data || !data.labels || data.labels.length === 0) return null;

        const W = 400, H = 140, PX = 8, PY = 12;
        const vals = data.values;
        const max = Math.max(...vals, 1);
        const min = Math.min(...vals, 0);
        const range = max - min || 1;
        const n = vals.length;

        const pts = vals.map((v, i) => ({
            x: +(PX + (i / Math.max(n - 1, 1)) * (W - PX * 2)).toFixed(2),
            y: +(PY + (1 - (v - min) / range) * (H - PY * 2)).toFixed(2),
        }));

        const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        const areaPath = `${linePath} L${pts[n - 1].x},${H} L${PX},${H} Z`;

        // X-axis: first, middle, last label
        const xLabels = n <= 4
            ? data.labels.map((l, i) => ({ l, x: pts[i].x }))
            : [
                { l: data.labels[0], x: pts[0].x },
                { l: data.labels[Math.floor(n / 2)], x: pts[Math.floor(n / 2)].x },
                { l: data.labels[n - 1], x: pts[n - 1].x },
            ];

        const maxLabel = max >= 1_000_000
            ? `${(max / 1_000_000).toFixed(1)}M`
            : max >= 1_000 ? `${(max / 1_000).toFixed(0)}K` : String(Math.round(max));

        return { linePath, areaPath, xLabels, maxLabel, pts };
    }

    // ── Bar chart ─────────────────────────────────────────────────────────────

    get barChartRows() {
        const data = this.props.kpi.chart_data;
        if (!data || !data.labels) return [];
        const max = Math.max(...data.values, 1);
        return data.labels.map((label, i) => ({
            label,
            value: data.values[i] ?? 0,
            pct: Math.round(((data.values[i] ?? 0) / max) * 100),
            colorClass: `rt-bar-${(i % 5) + 1}`,
            displayVal: data.values[i] >= 1000
                ? `${(data.values[i] / 1000).toFixed(1)}K`
                : String(Math.round(data.values[i] ?? 0)),
        }));
    }
}
