class RiskMetrics {
    static calculateBeta(portfolioReturns, marketReturns) {
        const covariance = window.PortfolioCalculator.calculateCovariance(
            portfolioReturns, 
            marketReturns
        );
        const marketVariance = window.PortfolioCalculator.calculateVariance(marketReturns);
        return marketVariance !== 0 ? covariance / marketVariance : 1;
    }

    static calculateSharpeRatio(portfolioReturn, portfolioRisk, riskFreeRate) {
        return portfolioRisk !== 0 ? 
            (portfolioReturn - riskFreeRate) / portfolioRisk : 0;
    }

    static calculateCVaR(returns, confidence = 0.95) {
        if (!returns || returns.length === 0) return 0;
        
        const sortedReturns = [...returns].sort((a, b) => a - b);
        const cutoffIndex = Math.floor((1 - confidence) * returns.length);
        if (cutoffIndex === 0) return sortedReturns[0];
        
        const tailReturns = sortedReturns.slice(0, cutoffIndex);
        return tailReturns.reduce((a, b) => a + b, 0) / cutoffIndex;
    }

    static calculateMaxDrawdown(prices) {
        if (!prices || prices.length === 0) return 0;
        
        let maxDrawdown = 0;
        let peak = prices[0];
        
        for (const price of prices) {
            if (price > peak) {
                peak = price;
            } else {
                const drawdown = (peak - price) / peak;
                maxDrawdown = Math.max(maxDrawdown, drawdown);
            }
        }
        
        return maxDrawdown;
    }
}

window.RiskMetrics = RiskMetrics; 