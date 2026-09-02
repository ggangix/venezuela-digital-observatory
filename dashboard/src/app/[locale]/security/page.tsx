'use client';

import { useEffect, useState } from 'react';

interface SecurityResult {
  domain: string;
  mx: { has_mx: boolean; records: string[]; error?: string };
  spf: { has_spf: boolean; record?: string; error?: string };
  dmarc: { has_dmarc: boolean; record?: string; error?: string };
  timestamp: number;
}

export default function SecurityPage() {
  const [data, setData] = useState<SecurityResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data/security_results.json')
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading security data:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-8 text-center">Cargando análisis de seguridad...</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Análisis de Seguridad de Email (MX, SPF, DMARC)</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 shadow-md rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3 px-4 text-left font-medium text-gray-700 border-b">Dominio</th>
              <th className="py-3 px-4 text-left font-medium text-gray-700 border-b">MX (Mail Exchange)</th>
              <th className="py-3 px-4 text-left font-medium text-gray-700 border-b">SPF (Sender Policy)</th>
              <th className="py-3 px-4 text-left font-medium text-gray-700 border-b">DMARC</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.domain} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 border-b font-medium text-blue-600">{item.domain}</td>
                
                {/* MX Cell */}
                <td className="py-3 px-4 border-b">
                  {item.mx.has_mx ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Activo ({item.mx.records.length})
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      Inactivo
                    </span>
                  )}
                </td>

                {/* SPF Cell */}
                <td className="py-3 px-4 border-b">
                  {item.spf.has_spf ? (
                    <div className="flex flex-col">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 w-fit">
                        Configurado
                      </span>
                      <span className="text-xs text-gray-500 mt-1 truncate max-w-[200px]" title={item.spf.record}>
                        {item.spf.record}
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 w-fit">
                      No encontrado
                    </span>
                  )}
                </td>

                {/* DMARC Cell */}
                <td className="py-3 px-4 border-b">
                  {item.dmarc.has_dmarc ? (
                    <div className="flex flex-col">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 w-fit">
                        Configurado
                      </span>
                      <span className="text-xs text-gray-500 mt-1 truncate max-w-[200px]" title={item.dmarc.record}>
                        {item.dmarc.record}
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 w-fit">
                      No encontrado
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
