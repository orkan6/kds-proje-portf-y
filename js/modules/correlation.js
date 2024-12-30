// Korelasyon matrisi için ayrı bir modül
export class CorrelationMatrix {
    constructor(tableId) {
        this.table = document.getElementById(tableId);
        if (!this.table) {
            console.warn(`Korelasyon matrisi tablosu bulunamadı: ${tableId}`);
        }
    }

    update(correlationData) {
        if (!this.table) {
            console.warn('Korelasyon matrisi tablosu mevcut değil');
            return;
        }

        if (!correlationData || !Array.isArray(correlationData.assets)) {
            console.warn('Geçersiz korelasyon verisi:', correlationData);
            this._showEmptyState();
            return;
        }

        const { assets, matrix } = correlationData;
        
        if (assets.length === 0 || !matrix || matrix.length === 0) {
            this._showEmptyState();
            return;
        }

        try {
            this._updateHeader(assets);
            this._updateBody(assets, matrix);
        } catch (error) {
            console.error('Korelasyon matrisi güncellenirken hata:', error);
            this._showEmptyState();
        }
    }

    _showEmptyState() {
        if (this.table) {
            this.table.innerHTML = `
                <thead>
                    <tr><th>Veri Yok</th></tr>
                </thead>
                <tbody>
                    <tr><td>Korelasyon verisi bulunamadı</td></tr>
                </tbody>
            `;
        }
    }

    _updateHeader(assets) {
        const thead = this.table.querySelector('thead tr');
        thead.innerHTML = '<th>Varlık</th>' + 
            assets.map(symbol => `<th>${symbol || 'N/A'}</th>`).join('');
    }

    _updateBody(assets, matrix) {
        const tbody = this.table.querySelector('tbody');
        tbody.innerHTML = matrix.map((row, i) => `
            <tr>
                <td><strong>${assets[i] || 'N/A'}</strong></td>
                ${row.map((value, j) => this._createCell(value, i === j)).join('')}
            </tr>
        `).join('');
    }

    _createCell(value, isPerfect) {
        const formattedValue = parseFloat(value).toFixed(2);
        const cellClass = isPerfect ? 'correlation-perfect' : 
            this._getCorrelationClass(value);
        return `<td class="${cellClass}">${formattedValue}</td>`;
    }

    _getCorrelationClass(value) {
        if (value === 1) return 'correlation-perfect';
        if (value >= 0.7) return 'correlation-high-positive';
        if (value >= 0.3) return 'correlation-moderate-positive';
        if (value > -0.3) return 'correlation-neutral';
        if (value > -0.7) return 'correlation-moderate-negative';
        return 'correlation-high-negative';
    }
} 