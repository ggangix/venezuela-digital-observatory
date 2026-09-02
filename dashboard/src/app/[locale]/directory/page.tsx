'use client';

import { useEffect, useState } from 'react';

interface DomainEntry {
    domain: string;
    org: string;
    category: string;
    city?: string;
    state?: string;
}

interface DomainsData {
    domains: DomainEntry[];
    generated: string;
    total: number;
}

export default function DirectoryPage() {
    const [data, setData] = useState<DomainEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [stats, setStats] = useState<Record<string, number>>({});

    useEffect(() => {
        fetch('/data/domains_categorized.json')
            .then((res) => res.json())
            .then((json) => {
                // Handle both structure formats (list vs object with domains key)
                const list = Array.isArray(json) ? json : json.domains || [];
                setData(list);

                // Calculate stats
                const counts: Record<string, number> = {};
                list.forEach((d: DomainEntry) => {
                    const cat = d.category || 'Uncategorized';
                    counts[cat] = (counts[cat] || 0) + 1;
                });
                setStats(counts);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Failed to load domains', err);
                setLoading(false);
            });
    }, []);

    const categories = ['All', ...Object.keys(stats).sort()];

    const filteredData = data.filter((item) => {
        const matchesText = item.domain.toLowerCase().includes(filter.toLowerCase()) ||
            (item.org && item.org.toLowerCase().includes(filter.toLowerCase()));
        const matchesCategory = categoryFilter === 'All' || (item.category || 'Uncategorized') === categoryFilter;
        return matchesText && matchesCategory;
    });

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Directorio de Entes (.gob.ve)</h1>
                <p className="text-gray-600 dark:text-gray-400">
                    Clasificación automática basada en nombres de dominio y registros WHOIS.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                {/* Stats Cards */}
                <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-100 dark:border-blue-900">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.length}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Dominios</div>
                </div>
                <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-100 dark:border-green-900">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats['Gobernación/Alcaldía'] || 0}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Regionales/Locales</div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 p-4 rounded-lg border border-purple-100 dark:border-purple-900">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats['Educación'] || 0}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Educación</div>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/20 p-4 rounded-lg border border-orange-100 dark:border-orange-900">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats['Poderes Públicos'] || 0}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Poderes Públicos</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <input
                    type="text"
                    placeholder="Buscar dominio u organización..."
                    className="flex-1 p-2 border rounded dark:bg-slate-900 dark:border-slate-800"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <select
                    className="p-2 border rounded dark:bg-slate-900 dark:border-slate-800"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                >
                    {categories.map(cat => (
                        <option key={cat} value={cat}>{cat} ({cat === 'All' ? data.length : stats[cat]})</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border rounded-lg dark:border-slate-800">
                <table className="w-full text-left bg-white dark:bg-slate-950">
                    <thead className="bg-gray-50 dark:bg-slate-900 border-b dark:border-slate-800">
                        <tr>
                            <th className="p-3 font-medium">Dominio</th>
                            <th className="p-3 font-medium">Organización (WHOIS)</th>
                            <th className="p-3 font-medium">Categoría</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={3} className="p-8 text-center">Cargando datos...</td></tr>
                        ) : filteredData.length === 0 ? (
                            <tr><td colSpan={3} className="p-8 text-center text-gray-500">No se encontraron resultados</td></tr>
                        ) : (
                            filteredData.slice(0, 100).map((item) => (
                                <tr key={item.domain} className="border-b last:border-0 dark:border-slate-900 hover:bg-gray-50 dark:hover:bg-slate-900/50">
                                    <td className="p-3 font-medium text-blue-600 dark:text-blue-400">
                                        <a href={`http://${item.domain}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                            {item.domain}
                                        </a>
                                    </td>
                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                        {item.org || <span className="italic text-gray-400">Desconocido</span>}
                                    </td>
                                    <td className="p-3">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${item.category === 'Uncategorized' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' :
                                                'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                                            {item.category || 'Uncategorized'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <p className="mt-4 text-xs text-center text-gray-500">Mostrando {Math.min(filteredData.length, 100)} de {filteredData.length} resultados (limitado para rendimiento)</p>
        </div>
    );
}
