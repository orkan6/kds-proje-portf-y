class AnasayfaManager {
    static async loadPortfolios() {
        try {
            const response = await fetch('/api/portfolios');
            if (!response.ok) throw new Error('Portföy listesi alınamadı');
            
            const portfolios = await response.json();
            console.log('Gelen portföyler:', portfolios);
            
            const portfolioList = document.getElementById('portfolioList');
            if (!portfolioList) return;

            portfolioList.innerHTML = portfolios.map(portfolio => {
                
                const value = portfolio.initial_value || 0;

                return `
                    <tr>
                        <td>${portfolio.portfolio_name || 'İsimsiz Portföy'}</td>
                        <td>${this.formatCurrency(value)}</td>
                        <td>
                            <a href="analiz.html?id=${portfolio.portfolio_id}" class="btn btn-sm btn-primary">Detaylar</a>
                        </td>
                    </tr>
                `;
            }).join('');

            if (!portfolios || portfolios.length === 0) {
                portfolioList.innerHTML = `
                    <tr>
                        <td colspan="3" class="text-center">Henüz portföy bulunmuyor</td>
                    </tr>
                `;
            }

        } catch (error) {
            console.error('Portföy listesi yüklenirken hata:', error);
            const portfolioList = document.getElementById('portfolioList');
            if (portfolioList) {
                portfolioList.innerHTML = `
                    <tr>
                        <td colspan="3" class="text-center text-danger">
                            Portföy listesi yüklenirken bir hata oluştu
                        </td>
                    </tr>
                `;
            }
        }
    }

    static formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    AnasayfaManager.loadPortfolios();
}); 