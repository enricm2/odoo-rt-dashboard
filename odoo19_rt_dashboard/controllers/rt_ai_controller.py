"""AI Controller — Phase 5 (briefing) and Phase 6 (NL→KPI)."""
import json
import logging

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class RtAiController(http.Controller):

    # ── Phase 6: NL → KPI config ─────────────────────────────────────────────

    @http.route('/rt_dashboard/ai/nl_to_kpi', type='json', auth='user')
    def nl_to_kpi(self, prompt: str) -> dict:
        """Convert a natural-language description into a KPI config dict.

        The frontend sends the user's free-form text; we call the LLM and
        return a validated config dict ready to pre-fill the KPI form.

        Returns:
            KPI config dict or {'error': reason}
        """
        if not prompt or not prompt.strip():
            return {'error': 'El prompt no puede estar vacío'}

        # Build catalogue of installed models (limit to relevant ones)
        env = request.env
        model_catalog = env['ir.model'].sudo().search_read(
            [('transient', '=', False)],
            ['model'],
            limit=300,
        )
        catalog = [m['model'] for m in model_catalog]

        from ..services.llm_service import LLMService
        try:
            result = LLMService(env).generate_kpi_config(prompt, catalog)
        except RuntimeError as exc:
            return {'error': str(exc)}
        except Exception:
            _logger.exception('nl_to_kpi: unexpected error')
            return {'error': 'Error interno generando la configuración KPI'}

        # Validate the model field returned by LLM
        if 'error' not in result and 'model' in result:
            if result['model'] not in env:
                result['error'] = (
                    f"El modelo '{result['model']}' no está disponible en este Odoo. "
                    "Intenta reformular tu descripción."
                )
        return result

    # ── Phase 5: Daily AI briefing ────────────────────────────────────────────

    @http.route('/rt_dashboard/ai/briefing', type='json', auth='user')
    def get_briefing(self, department: str) -> dict:
        """Return today's AI briefing for a department, generating if needed.

        If a briefing already exists for today + department, returns the
        cached version. Otherwise calls the LLM and persists the result.

        Args:
            department: Selection value (ceo, ventas, cfo, …).

        Returns:
            {'content': str, 'generated_at': str, 'from_cache': bool}
            or {'error': str}
        """
        from odoo.fields import Date, Datetime
        from ..services.llm_service import LLMService
        from ..services.kpi_evaluator import KpiEvaluator

        env = request.env
        today = Date.today()

        # Check cache
        existing = env['rt.ai.briefing'].search([
            ('department', '=', department),
            ('date', '=', today),
        ], limit=1)
        if existing and existing.content:
            return {
                'content': existing.content,
                'generated_at': Datetime.to_string(existing.generated_at),
                'from_cache': True,
                'model_used': existing.model_used,
            }

        # Build KPI snapshot for this department
        evaluator = KpiEvaluator(env)
        kpis = env['rt.kpi.definition'].search([
            ('department', '=', department),
            ('active', '=', True),
        ])
        snapshot = {}
        for kpi in kpis:
            try:
                snapshot[kpi.label] = evaluator.evaluate(kpi)
            except Exception:
                snapshot[kpi.label] = kpi.cached_value or 0.0

        if not snapshot:
            return {'error': f'No hay KPIs configurados para el departamento {department}'}

        kpi_json = json.dumps(snapshot, ensure_ascii=False)

        # Call LLM
        try:
            llm = LLMService(env)
            content = llm.generate_briefing(department, kpi_json)
        except RuntimeError as exc:
            return {'error': str(exc)}
        except Exception:
            _logger.exception('get_briefing: unexpected LLM error')
            return {'error': 'Error al contactar el servicio de IA'}

        # Persist (upsert for idempotency)
        ICP = env['ir.config_parameter'].sudo()
        model_used = ICP.get_param('rt_dashboard.llm_model', 'claude-sonnet-4-20250514')

        if existing:
            existing.sudo().write({'content': content, 'generated_at': Datetime.now()})
            record = existing
        else:
            record = env['rt.ai.briefing'].sudo().create({
                'department': department,
                'date': today,
                'content': content,
                'kpi_snapshot': kpi_json,
                'model_used': model_used,
            })

        return {
            'content': content,
            'generated_at': Datetime.to_string(record.generated_at),
            'from_cache': False,
            'model_used': model_used,
        }

    # ── Phase 5: Trigger anomaly detection manually ───────────────────────────

    @http.route('/rt_dashboard/ai/anomaly_check', type='json', auth='user')
    def anomaly_check(self) -> dict:
        """Manually trigger anomaly detection for all KPIs.

        Returns summary of detected anomalies.
        """
        from ..services.anomaly_detector import AnomalyDetector
        from ..services.kpi_evaluator import KpiEvaluator

        env = request.env
        evaluator = KpiEvaluator(env)
        detector = AnomalyDetector(env)

        kpis = env['rt.kpi.definition'].search([('active', '=', True)])
        anomalies = []
        for kpi in kpis:
            try:
                value = evaluator.evaluate(kpi)
                is_anomaly, msg = detector.check(kpi, value)
                if is_anomaly:
                    anomalies.append({'kpi': kpi.label, 'value': value, 'message': msg})
            except Exception:
                _logger.exception('anomaly_check: failed for KPI %s', kpi.label)

        return {'anomalies': anomalies, 'total': len(anomalies)}
