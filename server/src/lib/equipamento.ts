// Status de liberação dinâmico: LIBERADO se há checklist VALIDADA sem pendência aberta;
// VENCIDO se o certificado expirou; senão PENDENTE.
export function calcularStatusLiberacao(eq: any): 'PENDENTE' | 'LIBERADO' | 'VENCIDO' {
  const inspecoes = eq.inspecoes || [];
  const liberado = inspecoes.some(
    (i: any) =>
      i.status === 'VALIDADA' &&
      !(i.respostas || []).some((r: any) => r.status === 'PENDENTE' && r.pendenciaResolvida !== true)
  );
  if (liberado) return 'LIBERADO';
  if (eq.validadeCertificado && new Date(eq.validadeCertificado) < new Date()) return 'VENCIDO';
  return 'PENDENTE';
}
