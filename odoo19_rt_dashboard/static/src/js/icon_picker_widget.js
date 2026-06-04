/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useState } from "@odoo/owl";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

// ── Icon catalogue ────────────────────────────────────────────────────────────

const ICON_GROUPS = [
    {
        label: "💰 Finanzas",
        icons: ["💰","💶","💵","💴","💳","🏦","📈","📉","💹","🤑","💸","🧾","💎","🏧","💱","🪙"],
    },
    {
        label: "🎯 Ventas & CRM",
        icons: ["🎯","🏆","🛒","🤝","⭐","🏅","🎖️","👑","🚀","🔥","💥","🎁","🏪","🛍️","📦","🧲"],
    },
    {
        label: "🏎️ Competición",
        icons: ["🏎️","🏁","⚡","🥇","🥈","🥉","🏇","🎽","🏋️","🏃","🤸","🎲","🎳","🎪","🎠","🏆"],
    },
    {
        label: "👥 Equipo & RRHH",
        icons: ["👥","👤","🧑‍💼","👨‍💼","👩‍💼","🤝","🎓","📋","💼","🏢","🪪","👔","🧑‍🤝‍🧑","🤜","🤛","👏"],
    },
    {
        label: "💻 Tech & IT",
        icons: ["💻","📱","🔧","⚙️","🛡️","🔑","🔗","💡","🖥️","🐛","🤖","📡","🔌","🔋","⌨️","🖱️"],
    },
    {
        label: "🚚 Operaciones",
        icons: ["🚚","📦","🏭","🏗️","⏰","📊","🗂️","🔄","🧰","🏷️","📬","✈️","🚂","⚓","🛳️","🏪"],
    },
    {
        label: "📣 Marketing",
        icons: ["📣","📧","🌍","📸","🎬","🎨","📰","📢","💬","🌐","🗺️","📍","🔭","📡","🎯","🌟"],
    },
    {
        label: "⚠️ Alertas & Estado",
        icons: ["⚠️","🚨","🔔","❗","✅","❌","⛔","💯","📌","🔴","🟢","🟡","🟠","🔵","⚡","🆘"],
    },
    {
        label: "🌱 Crecimiento",
        icons: ["🌱","🌿","🌳","🌻","☀️","🌈","🎉","🥳","🎊","🎈","🌟","💫","✨","🔝","📐","🧭"],
    },
];

// ── Component ─────────────────────────────────────────────────────────────────

export class IconPickerField extends Component {
    static template = "odoo_rt_dashboard.IconPickerField";
    static props = { ...standardFieldProps };

    setup() {
        this.state = useState({ open: false });
        this.groups = ICON_GROUPS;
    }

    get value() {
        return this.props.record.data[this.props.name] || "";
    }

    get isEmoji() {
        const v = this.value;
        return v.length > 0 && !v.startsWith("fa-");
    }

    get previewClass() {
        return this.isEmoji ? "" : "fa fa-fw " + (this.value || "fa-tachometer");
    }

    togglePicker() {
        if (!this.props.readonly) {
            this.state.open = !this.state.open;
        }
    }

    selectIcon(icon) {
        this.props.record.update({ [this.props.name]: icon });
        this.state.open = false;
    }

    clearIcon() {
        this.props.record.update({ [this.props.name]: "" });
    }

    isSelected(icon) {
        return this.value === icon;
    }
}

registry.category("fields").add("rt_icon_picker", {
    component: IconPickerField,
    supportedTypes: ["char"],
    displayName: "Icon Picker",
});
