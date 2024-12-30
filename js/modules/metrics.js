// Metrik hesaplamaları ve görüntüleme için ayrı bir modül
export class MetricsManager {
    constructor() {
        this.periods = ['1M', '3M', '6M', '1Y'];
    }

    updateMetrics(analysis) {
        this._updateExpectedReturns(analysis.expected_portfolio_returns);
        this._updateVolatilities(analysis.portfolio_volatilities);
        this._updateRiskMetrics(analysis.risk_metrics);
        this._updatePerformanceRatios(analysis.performance_ratios);
    }

    _updateExpectedReturns(returns) {
        this.periods.forEach(period => {
            const value = returns?.[period];
            const element = document.getElementById(`expectedReturn${period}`);
            if (element) {
                element.textContent = value ? `${(value * 100).toFixed(2)}%` : '-';
            }
        });
    }

    _updateVolatilities(volatilities) {
        this.periods.forEach(period => {
            const value = volatilities?.[period];
            const element = document.getElementById(`volatility${period}`);
            if (element) {
                element.textContent = value ? `${(value * 100).toFixed(2)}%` : '-';
            }
        });
    }

    _updateRiskMetrics(metrics) {
        const riskElements = {
            'betaValue': metrics?.beta?.toFixed(2),
            'alphaValue': metrics?.alpha?.['1Y'] ? 
                `${(metrics.alpha['1Y'] * 100).toFixed(2)}%` : '-',
            'alpha6M': metrics?.alpha?.['6M'] ? 
                `${(metrics.alpha['6M'] * 100).toFixed(2)}%` : '-',
            'alpha3M': metrics?.alpha?.['3M'] ? 
                `${(metrics.alpha['3M'] * 100).toFixed(2)}%` : '-'
        };

        Object.entries(riskElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value || '-';
        });
    }

    _updatePerformanceRatios(ratios) {
        this._updateRatioType('sharpe', ratios?.sharpe);
        this._updateRatioType('treynor', ratios?.treynor);
    }

    _updateRatioType(type, values) {
        if (!values) return;

        this.periods.forEach(period => {
            const element = document.getElementById(`${type}Ratio${period}`);
            if (element) {
                element.textContent = values[period]?.toFixed(2) || '-';
            }
        });

        // Update current value
        const currentElement = document.getElementById(`${type}RatioCurrent`);
        if (currentElement) {
            currentElement.textContent = values['1Y']?.toFixed(2) || '-';
        }
    }
} 