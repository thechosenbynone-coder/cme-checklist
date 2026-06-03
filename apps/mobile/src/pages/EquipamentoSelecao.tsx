import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, MapPin, User, Settings2 } from 'lucide-react';
import { Card, Button } from '@cme/ui';
import api from '../services/api';
import { Equipamento, TipoInspecao } from '@cme/types';

export const EquipamentoSelecao: React.FC = () => {
  const navigate = useNavigate();
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [selectedEqId, setSelectedEqId] = useState('');
  const [tipoInspecao, setTipoInspecao] = useState<TipoInspecao>('PRE_EMBARQUE');
  const [responsavel, setResponsavel] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [compressorUtilizado, setCompressorUtilizado] = useState('');
  const [classificacao, setClassificacao] = useState<'NIVEL_1' | 'NIVEL_2' | 'REBUILD'>('NIVEL_1');

  useEffect(() => {
    api.equipamentos.list().then(data => {
      setEquipamentos(data);
      if (data.length > 0) {
        setSelectedEqId(data[0].id);
      }
    });

    const user = api.auth.currentUser();
    if (user) {
      setResponsavel(user.nome);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEqId) return;

    // Salvar metadados iniciais temporários na sessão para a próxima página
    const metadata = {
      equipamentoId: selectedEqId,
      tipo: tipoInspecao,
      responsavelGeral: responsavel,
      localizacao,
      compressorUtilizado,
      classificacao
    };
    window.sessionStorage.setItem('cme_nova_inspecao_meta', JSON.stringify(metadata));
    navigate('/checklist');
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6">
      <div className="text-center">
        <span className="text-4xl block">📱</span>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-white mt-3">
          Checklist de Campo CME
        </h1>
        <p className="text-slate-500 text-xs mt-1 uppercase font-semibold tracking-wider">
          Inspeção e Liberação de Equipamentos
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* Equipamento */}
        <Card title="1. Selecionar Equipamento">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Equipamento</label>
              <select
                className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                value={selectedEqId}
                onChange={(e) => setSelectedEqId(e.target.value)}
              >
                {equipamentos.map(eq => (
                  <option key={eq.id} value={eq.id}>
                    {eq.codigo} - {eq.nome} ({eq.status})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Tipo de Inspeção */}
        <Card title="2. Tipo de Inspeção">
          <div className="grid grid-cols-3 gap-2">
            {(['PRE_EMBARQUE', 'OPERACIONAL', 'RETORNO_EMBARQUE'] as TipoInspecao[]).map(tipo => (
              <button
                key={tipo}
                type="button"
                onClick={() => setTipoInspecao(tipo)}
                className={`py-3 px-1 rounded-xl text-xs font-bold text-center border transition-all duration-200 ${
                  tipoInspecao === tipo
                    ? 'bg-brand-900 border-brand-900 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tipo === 'PRE_EMBARQUE' && 'Pré-Embarque'}
                {tipo === 'OPERACIONAL' && 'Operacional'}
                {tipo === 'RETORNO_EMBARQUE' && 'Retorno'}
              </button>
            ))}
          </div>
        </Card>

        {/* Informações de Campo */}
        <Card title="3. Detalhes Operacionais">
          <div className="space-y-4">
            
            {/* Responsável */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>Responsável Técnico</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="Nome do inspetor"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
              />
            </div>

            {/* Localização */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span>Localização / Base</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="Ex: Plataforma P-51, Oficina Macaé"
                value={localizacao}
                onChange={(e) => setLocalizacao(e.target.value)}
              />
            </div>

            {/* Compressor */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-slate-400" />
                <span>Compressores Utilizados no Teste</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="Ex: Sullair 750 (ID: CP-01)"
                value={compressorUtilizado}
                onChange={(e) => setCompressorUtilizado(e.target.value)}
              />
            </div>

            {/* Classificação */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Classificação do Equipamento</label>
              <div className="grid grid-cols-3 gap-2">
                {(['NIVEL_1', 'NIVEL_2', 'REBUILD'] as const).map(classVal => (
                  <button
                    key={classVal}
                    type="button"
                    onClick={() => setClassificacao(classVal)}
                    className={`py-2 px-1 rounded-lg text-xs font-bold text-center border transition-all duration-200 ${
                      classificacao === classVal
                        ? 'bg-slate-800 border-slate-800 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {classVal.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </Card>

        {/* Submit */}
        <Button type="submit" fullWidth size="xl" className="flex items-center space-x-2">
          <span>Iniciar Preenchimento</span>
          <ArrowRight className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
};
export default EquipamentoSelecao;
