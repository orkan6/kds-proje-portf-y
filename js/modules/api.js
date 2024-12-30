import { ErrorHandler } from './ErrorHandler.js';

export class ApiService {
    constructor(baseUrl = '/api') {
        this.baseUrl = baseUrl;
    }

    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API isteği hatası:', error);
            throw error;
        }
    }

    async getPortfolios() {
        return this.request('/portfolios');
    }

    async getPortfolioAnalysis(portfolioId) {
        return this.request(`/portfolios/${portfolioId}/analysis`);
    }

    
}

export default ApiService; 