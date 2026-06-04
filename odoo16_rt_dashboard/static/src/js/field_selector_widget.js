/** @odoo-module **/
/**
 * rt_field_selector — Custom Char field widget with a live field picker.
 *
 * Adds a small button next to any Char field.  Clicking it loads the
 * available fields from the KPI's source model and shows an inline
 * searchable dropdown so the user can pick the correct technical name.
 *
 * Zero new Python model fields or DB columns required.
 */

import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

class FieldSelectorWidget extends Component {
    static template = "odoo_rt_dashboard.FieldSelectorWidget";

    // No static props — OWL 2 skips validation, accepts all props Odoo injects.
    // Defining a partial list would cause OWL 2 prop-validation errors when
    // Odoo passes extra props (autofocus, context, startDebugTimeout, etc.).

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            open:    false,
            fields:  [],
            filter:  "",
            loading: false,
            error:   "",
        });
    }

    // ── Computed ─────────────────────────────────────────────────────────────

    get currentValue() {
        return this.props.record.data[this.props.name] || "";
    }

    /** Technical model name stored in the sibling `model_name` char field. */
    get modelName() {
        return this.props.record.data.model_name || "";
    }

    get allowedTypes() {
        return (this.props.fieldTypes && this.props.fieldTypes.length)
            ? this.props.fieldTypes
            : ["float", "integer", "monetary"];
    }

    get filteredFields() {
        const q = this.state.filter.trim().toLowerCase();
        if (!q) return this.state.fields;
        return this.state.fields.filter(
            (f) => f.name.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)
        );
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    /** Keep the raw Char value in sync as the user types. */
    onInput(ev) {
        this.props.record.update({ [this.props.name]: ev.target.value });
    }

    onFilterInput(ev) {
        this.state.filter = ev.target.value;
    }

    /** Toggle the dropdown; load fields from the model on each open. */
    async onToggle(ev) {
        ev.stopPropagation();
        if (this.state.open) {
            this.state.open  = false;
            this.state.filter = "";
            return;
        }
        const model = this.modelName;
        if (!model) {
            this.state.error = "Selecciona primero el modelo fuente (Source Model).";
            this.state.open  = true;
            return;
        }
        this.state.error   = "";
        this.state.loading = true;
        this.state.open    = true;
        try {
            const result = await this.orm.call(
                model, "fields_get", [], { attributes: ["string", "type"] }
            );
            const allowed = this.allowedTypes;
            this.state.fields = Object.entries(result)
                .filter(([, f]) => allowed.includes(f.type))
                .map(([name, f]) => ({ name, label: f.string, type: f.type }))
                .sort((a, b) => a.label.localeCompare(b.label));
            if (!this.state.fields.length) {
                this.state.error = "No se encontraron campos del tipo requerido.";
            }
        } catch (e) {
            console.error("[rt_field_selector] fields_get failed:", e);
            this.state.error  = "Error al cargar campos del modelo.";
            this.state.fields = [];
        } finally {
            this.state.loading = false;
        }
    }

    closePanel(ev) {
        if (ev) ev.stopPropagation();
        this.state.open   = false;
        this.state.filter = "";
    }

    /**
     * Use data-fname to capture the field name reliably from t-foreach
     * (avoids OWL 2 closure capture issues with inline arrow functions).
     */
    onItemClick(ev) {
        const name = ev.currentTarget.dataset.fname;
        if (name) {
            this.props.record.update({ [this.props.name]: name });
        }
        this.state.open   = false;
        this.state.filter = "";
    }
}

registry.category("fields").add("rt_field_selector", {
    component:      FieldSelectorWidget,
    supportedTypes: ["char"],
    extractProps({ options }) {
        return {
            fieldTypes: (options && options.field_types) ? options.field_types : undefined,
        };
    },
});
