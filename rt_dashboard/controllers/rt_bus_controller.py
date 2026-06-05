import logging

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class RtBusController(http.Controller):
    """HTTP endpoints for KPI snapshots and fallback polling."""

    @http.route('/rt_dashboard/snapshot', type='json', auth='user')
    def kpi_snapshot(self, dashboard_id: int) -> dict:
        """Return current values for all KPIs in a dashboard.

        Called by the OWL view on mount to populate initial state before
        the bus.bus listener takes over live updates.

        Args:
            dashboard_id: ID of the rt.dashboard record.

        Returns:
            {
                'dashboard_id': int,
                'kpis': {
                    kpi_id: {
                        'label', 'value', 'cached_value', 'chart_type',
                        'icon', 'color', 'threshold_warn', 'threshold_crit',
                        'threshold_dir', 'level', 'refresh_mode', 'refresh_secs'
                    }
                }
            }
        """
        from ..services.kpi_evaluator import KpiEvaluator

        dashboard = request.env['rt.dashboard'].browse(dashboard_id)
        if not dashboard.exists():
            return {'error': 'Dashboard not found', 'dashboard_id': dashboard_id}

        evaluator = KpiEvaluator(request.env)
        kpis: dict = {}

        for kpi in dashboard.kpi_ids.filtered('active'):
            try:
                value = evaluator.evaluate(kpi)
                level = evaluator._compute_level(kpi, value)

                # Record count for subtitle (only for standard non-count aggregations)
                record_count = None
                if (getattr(kpi, 'kpi_type', 'standard') != 'formula'
                        and kpi.agg_function != 'count'
                        and kpi.model_name and kpi.model_name in request.env):
                    try:
                        from ..services.kpi_evaluator import _expand_date_tokens
                        import ast as _ast
                        dom = _ast.literal_eval(_expand_date_tokens(kpi.domain or '[]'))
                        record_count = request.env[kpi.model_name].search_count(dom)
                    except Exception:
                        pass

                kpis[kpi.id] = {
                    'label': kpi.label,
                    'value': value,
                    'cached_value': kpi.cached_value,
                    'chart_type': kpi.chart_type,
                    'groupby_field': kpi.groupby_field or '',
                    'icon': kpi.icon,
                    'color': kpi.color,
                    'threshold_warn': kpi.threshold_warn,
                    'threshold_crit': kpi.threshold_crit,
                    'threshold_dir': kpi.threshold_dir,
                    'level': level,
                    'refresh_mode': kpi.refresh_mode,
                    'refresh_secs': kpi.refresh_secs,
                    'display_format': kpi.display_format or 'number',
                    'currency_symbol': kpi.currency_symbol or '€',
                    'font_size': kpi.font_size or 'md',
                    'icon_size': kpi.icon_size or 'md',
                    'accent_color': kpi.accent_color or '',
                    'record_count': record_count,
                    'chart_data': evaluator.evaluate_chart_data(kpi),
                    'sparkline': evaluator.get_sparkline(kpi.id),
                }
            except Exception:
                _logger.exception('snapshot: failed for KPI %s (id=%s)', kpi.label, kpi.id)
                kpis[kpi.id] = {
                    'label': kpi.label,
                    'value': 0.0,
                    'cached_value': 0.0,
                    'chart_type': kpi.chart_type,
                    'icon': kpi.icon,
                    'color': kpi.color,
                    'level': 'ok',
                    'display_format': 'number',
                    'currency_symbol': '€',
                    'font_size': kpi.font_size or 'md',
                    'icon_size': kpi.icon_size or 'md',
                    'accent_color': kpi.accent_color or '',
                    'chart_data': None,
                    'sparkline': [],
                    'error': True,
                }

        return {'dashboard_id': dashboard_id, 'kpis': kpis}

    @http.route('/rt_dashboard/setup/defaults', type='json', auth='user')
    def setup_defaults(self) -> dict:
        """Create default KPIs and dashboards for the current user.

        Safe to call multiple times (idempotent).  Returns the list of
        dashboards that now belong to the user so the frontend can reload.
        """
        env = request.env

        # 1. Ensure KPI catalogue is populated
        env['rt.kpi.definition'].sudo()._create_default_kpis()

        # 2. Create dashboards for the current user
        env['rt.dashboard'].sudo()._create_default_dashboards(user=env.user)

        # 3. Return only dashboards belonging to this user
        dashboards = env['rt.dashboard'].search_read(
            [['active', '=', True], ['user_id', '=', env.user.id]],
            ['id', 'name', 'department', 'layout'],
            order='sequence, name',
        )
        return {'ok': True, 'dashboards': dashboards}

    @http.route('/rt_dashboard/save_layout', type='json', auth='user')
    def save_layout(self, dashboard_id: int, layout: list) -> dict:
        """Persist the KPI display order for a dashboard.

        Args:
            dashboard_id: ID of the rt.dashboard record.
            layout:       Ordered list of KPI IDs as integers.

        Returns:
            {'ok': True} or {'error': str}
        """
        import json as _json

        dashboard = request.env['rt.dashboard'].browse(dashboard_id)
        if not dashboard.exists():
            return {'error': 'Dashboard not found'}

        dashboard.sudo().write({'layout': _json.dumps(layout)})
        return {'ok': True}

    @http.route('/rt_dashboard/poll', type='json', auth='user')
    def poll_kpis(self, dashboard_id: int, last_ts: float = 0.0) -> dict:
        """Fallback polling endpoint for poll-mode KPIs.

        Returns KPIs whose last_computed timestamp is newer than last_ts.

        Args:
            dashboard_id: ID of the rt.dashboard record.
            last_ts:      Unix timestamp (seconds) of the client's last update.

        Returns:
            {'updates': {kpi_id: {'value', 'level', 'last_computed'}}}
        """
        from ..services.kpi_evaluator import KpiEvaluator
        from odoo.fields import Datetime

        dashboard = request.env['rt.dashboard'].browse(dashboard_id)
        if not dashboard.exists():
            return {'error': 'Dashboard not found'}

        evaluator = KpiEvaluator(request.env)
        updates: dict = {}

        poll_kpis = dashboard.kpi_ids.filtered(
            lambda k: k.active and k.refresh_mode == 'poll'
        )
        for kpi in poll_kpis:
            try:
                value = evaluator.evaluate(kpi)
                level = evaluator._compute_level(kpi, value)
                kpi.sudo().write({
                    'cached_value': value,
                    'last_computed': Datetime.now(),
                })
                updates[kpi.id] = {
                    'value': value,
                    'level': level,
                }
            except Exception:
                _logger.exception('poll: failed for KPI %s (id=%s)', kpi.label, kpi.id)

        return {'updates': updates}
