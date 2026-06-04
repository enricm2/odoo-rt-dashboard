{
    'name': 'RT Dashboard',
    'version': '17.0.2.0.3',
    'category': 'Reporting',
    'summary': 'Dashboards en tiempo real con IA, alertas multicanal e iconos personalizables',
    'description': """
RT Dashboard para Odoo 18
=========================
Dashboards departamentales en tiempo real con KPIs predefinidos, motor de IA
integrado y sistema de alertas multicanal (Dashboard, WhatsApp, Telegram).

Características principales:
- Actualización automática via bus.bus sin recargar la página (badge ⚡ LIVE)
- KPIs predefinidos para 7 roles: CEO, Ventas, Marketing, CFO, CTO, Ops, RRHH
- KPIs de tipo Fórmula: combina KPIs con {nombre} en expresiones aritméticas
- Tokens de fecha dinámicos en dominios: {hoy}, {inicio_mes}, {hace_30d}...
- Selector visual de iconos: más de 130 emojis + Font Awesome agrupados por categoría
- Tamaño de icono configurable por KPI: Pequeño / Mediano / Grande
- Color de acento por KPI aplicado al icono y borde de tarjeta
- Función avg_monthly para burn rate (SUM / meses distintos)
- IA: detección de anomalías, briefing ejecutivo diario, generador NL→KPI
- Alertas: in-app banner, WhatsApp Business API, Telegram Bot API
- Historial de alertas con nivel, canal, valor y resultado
    """,
    'author': 'Uniasser Consulting S.L.',
    'website': 'https://www.uniasser.com',
    'support': 'info@uniasser.com',
    'maintainer': 'Uniasser Consulting S.L.',
    'images': ['static/description/main_screenshot.png'],
    'price': 69.00,
    'currency': 'EUR',
    'license': 'OPL-1',
    'depends': [
        'base',
        'web',
        'bus',
        'mail',
    ],
    'external_dependencies': {
        'python': ['anthropic'],
    },
    'data': [
        'security/rt_dashboard_security.xml',
        'security/ir.model.access.csv',
        'data/rt_cron.xml',
        'data/default_kpis.xml',
        'views/rt_kpi_definition_views.xml',
        'views/rt_alert_rule_views.xml',
        'views/rt_ai_briefing_views.xml',
        'views/wizard_nl_kpi_views.xml',
        'views/rt_dashboard_views.xml',
        'views/menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'odoo_rt_dashboard/static/src/css/rt_dashboard.css',
            'odoo_rt_dashboard/static/src/js/bus_listener.js',
            'odoo_rt_dashboard/static/src/js/field_selector_widget.js',
            'odoo_rt_dashboard/static/src/js/icon_picker_widget.js',
            'odoo_rt_dashboard/static/src/js/kpi_widget.js',
            'odoo_rt_dashboard/static/src/js/rt_dashboard_view.js',
            'odoo_rt_dashboard/static/src/xml/field_selector_widget.xml',
            'odoo_rt_dashboard/static/src/xml/icon_picker_widget.xml',
            'odoo_rt_dashboard/static/src/xml/kpi_widget.xml',
            'odoo_rt_dashboard/static/src/xml/rt_dashboard.xml',
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
}
