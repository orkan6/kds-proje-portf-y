const { getPeriodDays } = require('./dateUtils');

const calculateCovariance = (returns1, returns2) => {
    if (!returns1 || !returns2 || returns1.length !== returns2.length || returns1.length < 2) {
        return 0;
    }

    const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

    let covariance = 0;
    for (let i = 0; i < returns1.length; i++) {
        covariance += (returns1[i] - mean1) * (returns2[i] - mean2);
    }

    return covariance / (returns1.length - 1);
};

const calculateVariance = (returns) => {
    if (!returns || returns.length < 2) return 0;
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    return returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
};

const calculateCorrelation = (returns1, returns2) => {
    if (!returns1 || !returns2 || returns1.length < 2 || returns2.length < 2) {
        return 0;
    }

    const covariance = calculateCovariance(returns1, returns2);
    const std1 = Math.sqrt(calculateVariance(returns1));
    const std2 = Math.sqrt(calculateVariance(returns2));

    if (std1 === 0 || std2 === 0) return 0;
    return covariance / (std1 * std2);
};

const calculateDailyReturns = (prices) => {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        const dailyReturn = (prices[i] - prices[i-1]) / prices[i-1];
        returns.push(dailyReturn);
    }
    return returns;
};

const calculatePortfolioVolatility = (returns) => {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (returns.length - 1);
    return Math.sqrt(variance * 252);
};

const calculateExpectedReturn = (returns, weights) => {
    return returns.reduce((total, ret, i) => total + ret * weights[i], 0);
};

const calculateMaxDrawdown = (prices) => {
    let maxDrawdown = 0;
    let peak = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
        if (prices[i] > peak) {
            peak = prices[i];
        }
        const drawdown = (peak - prices[i]) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
};

const calculateTrackingError = (portfolioReturns, benchmarkReturns) => {
    const differences = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
    const squaredDiffs = differences.map(d => d * d);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (differences.length - 1);
    return Math.sqrt(variance * 252);
};

module.exports = {
    calculateCovariance,
    calculateVariance,
    calculateCorrelation,
    calculateDailyReturns,
    calculatePortfolioVolatility,
    calculateExpectedReturn,
    calculateMaxDrawdown,
    calculateTrackingError
}; 