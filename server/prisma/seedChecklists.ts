// seedChecklists.ts — cria/atualiza Booster, Compressor e Membrana.
// Idempotente e NÃO destrutivo: preserva mod-1 (After Cooler) e inspeções reais.
//   Rode com:  cd server && npx tsx prisma/seedChecklists.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Tipo = 'STATUS' | 'CERTIFICADO' | 'MEDICAO' | 'TEXTO';
interface Item { secao: string; descricao: string; tipo: Tipo; obrigatorio: boolean; unidade?: string }

// Construtores por seção (curry) — deixam a montagem legível.
const sec = (secao: string) => ({
  ce: (descricao: string): Item => ({ secao, descricao, tipo: 'CERTIFICADO', obrigatorio: true }),
  st: (descricao: string): Item => ({ secao, descricao, tipo: 'STATUS', obrigatorio: true }),
  md: (descricao: string, unidade: string): Item => ({ secao, descricao, tipo: 'MEDICAO', obrigatorio: false, unidade }),
  tx: (descricao: string): Item => ({ secao, descricao, tipo: 'TEXTO', obrigatorio: false }),
});

/* ============================ BOOSTER ============================ */
// Bloco de 25 leituras repetido em cada estágio operacional.
// vib: 'mms' = sensores como MEDICAO (mm/s); 'zero' = STATUS "marcando zero" (pré-partida).
function leituras(s: ReturnType<typeof sec>, vib: 'mms' | 'zero'): Item[] {
  const arr: Item[] = [
    s.md('Pressão de ar comprimido no balão de ar (alvo 8 bar)', 'bar'),
    s.md('Temperatura de entrada de nitrogênio (abaixo de 42 °C)', '°C'),
    s.md('Pressão de entrada de nitrogênio (entre 17 e 23 bar)', 'bar'),
    s.md('Temperatura do óleo de lubrificação', '°C'),
    s.md('Pressão do óleo lubrificante (entre 3,5 e 4,5 bar)', 'bar'),
    s.md('Temperatura de descarga — estágio 1', '°C'),
    s.md('Temperatura de descarga — estágio 2', '°C'),
    s.md('Temperatura de descarga — estágio 3', '°C'),
    s.md('Temperatura de descarga — estágio 4', '°C'),
    s.md('Pressão de descarga de nitrogênio — estágio 1', 'bar'),
    s.md('Pressão de descarga de nitrogênio — estágio 2', 'bar'),
    s.md('Pressão de descarga de nitrogênio — estágio 3', 'bar'),
    s.md('Pressão de descarga de nitrogênio — estágio 4', 'bar'),
    s.md('Temperatura do rolamento — estágio 1', '°C'),
    s.md('Temperatura do rolamento — estágio 2', '°C'),
    s.md('Temperatura do rolamento — estágio 3', '°C'),
    s.md('Temperatura do rolamento — estágio 4', '°C'),
  ];
  if (vib === 'mms') {
    arr.push(s.md('Sensor de vibração do compressor', 'mm/s'));
    arr.push(s.md('Sensor de vibração do motor', 'mm/s'));
  } else {
    arr.push(s.st('Sensor de vibração do compressor marcando zero'));
    arr.push(s.st('Sensor de vibração do motor marcando zero'));
  }
  arr.push(
    s.st('Manômetro de pressão de ar de instrumentação compatível (8 bar)'),
    s.st('Manômetro de pressão de nitrogênio inlet compatível com o painel'),
    s.st('Manômetro de pressão de nitrogênio do 1º estágio compatível com o painel'),
    s.st('Manômetro de pressão de nitrogênio do 2º estágio compatível com o painel'),
    s.st('Manômetro de pressão de nitrogênio do 3º estágio compatível com o painel'),
    s.st('Manômetro de pressão de nitrogênio do 4º estágio compatível com o painel'),
  );
  return arr;
}

function buildBooster(): Item[] {
  const itens: Item[] = [];

  const sl = sec('INSPEÇÃO DO SKID E LINGADA');
  itens.push(
    sl.ce('Verificar validade do certificado do SKID'),
    sl.ce('Verificar validade do certificado da LINGADA'),
  );

  const g = sec('INSPEÇÃO GERAL');
  itens.push(
    g.st('Verificar danos ao skid, painel, válvulas, tubulações e radiador'),
    g.st('Remover objetos soltos dentro do skid'),
    g.st('Inspecionar visualmente o conjunto de içamento (pintura, travamento das manilhas com contra-pinos, lubrificação e danos dos cabos de aço) — substituir o conjunto caso necessário'),
    g.st('Conferir se todos os manômetros e vasos de pressão estão íntegros e identificados com adesivos de certificação e NR13'),
    g.st('Inspeção visual de vazamentos de glicol, diesel e óleo em todo o equipamento. Verificar nível de óleo do motor, diesel, glicol e óleos lubrificantes (600W e Pegasus)'),
    g.st('Conferir fechamento total dos painéis elétricos, verificar se faltam parafusos, verificação visual de dano ao cabo elétrico de alimentação de bateria e prensa-cabos no painel elétrico, válvulas e sensores'),
    g.st('Verificar radiador, executar limpeza da colmeia com água para remover sal e obstruções'),
    g.st('Verificar etiqueta externa de status do equipamento (laranja/verde/vermelha)'),
  );

  const pd = sec('INSPEÇÃO DO SISTEMA PNEUMÁTICO (DESPRESSURIZADO)');
  itens.push(
    pd.ce('Verificar certificação das válvulas de segurança (PSV) — total de 6 un.'),
    pd.ce('Verificar certificação dos manômetros'),
    pd.ce('Verificar certificação NR13 dos reservatórios de ar'),
    pd.st('Inspecionar filtros coalescentes (4 unidades)'),
    pd.st('Inspecionar fixação dos atuadores pneumáticos e válvulas grandes'),
    pd.st('Inspecionar os pequenos filtros dourados em todos os atuadores pneumáticos (se estiverem entupidos ou enferrujados, trocar)'),
  );

  const mo = sec('INSPEÇÃO DO MOTOR DIESEL');
  itens.push(
    mo.st('Realizar troca de filtros e óleo do motor'),
    mo.st('Realizar troca do filtro de ar do motor'),
    mo.st('Verificar nível de glicol e vazamentos de mangotes e braçadeiras'),
    mo.st('Verificar limpeza do piroban e abraçadeiras da turbina; inspecionar se a tampa da descarga está corretamente instalada e não bloqueada pela lingada ou pela lona'),
    mo.st('Verificar o sistema de isolamento térmico da descarga do motor'),
    mo.tx('Observações (Motor Diesel)'),
  );

  const di = sec('INSPEÇÃO DO SISTEMA DIESEL');
  itens.push(
    di.st('Checar os mangotes de alimentação de diesel até o tanque'),
    di.st('Verificar a qualidade do diesel no tanque e nos filtros Racor. Verificar coloração e a presença de água no combustível. Caso necessário, drenar todo o sistema'),
    di.st('Realizar troca de filtros diesel'),
    di.tx('Observações (Sistema Diesel)'),
  );

  const hi = sec('INSPEÇÃO DO SISTEMA HIDRÁULICO');
  itens.push(
    hi.st('Verificar níveis de óleo e mangotes do sistema (600W e Pegasus)'),
    hi.st('Trocar óleo Pegasus e filtro de bypass do crankcase'),
    hi.st('Verificar o sistema de lubrificação forçada (bomba pneumática, mangotes, sensor de nível e manômetros sobre o filtro de bypass) e realizar 2 prelubes'),
    hi.st('Verificar filtro e sistema de lubrificação do blink blink; remover entrada de ar do sistema e acionar as bombas de lubrificação manual até o blink blink piscar 20 vezes cada'),
    hi.st('Instalar a estrela na cremalheira e girar o motor 3 rotações completas, removendo a estrela imediatamente após os 3 giros'),
    hi.tx('Observações (Sistema Hidráulico)'),
  );

  const el = sec('INSPEÇÃO DO SISTEMA ELÉTRICO');
  itens.push(
    el.st('Abrir o painel e verificar reaperto de todos os componentes'),
    el.st('Verificar cabos e prensa-cabos na entrada dos painéis elétricos e em todos os instrumentos e válvulas (em caso de danos, substituir)'),
    el.st('Verificar funcionamento do sistema 24 VDC, inspecionar a caixa de bateria'),
    el.st('Verificar estado e tensão das correias do ventilador e do alternador e retensionar se necessário'),
    el.st('Ligar o sistema elétrico e verificar na HMI que todos os parâmetros estão visíveis e compatíveis com a realidade (caso não haja conformidade ou apareça "####", informar imediatamente)'),
    el.tx('Observações (Sistema Elétrico)'),
  );

  const pp = sec('INSPEÇÃO DO SISTEMA PNEUMÁTICO (PRESSURIZADO)');
  itens.push(
    pp.st('Pressurizar o sistema de ar comprimido com pelo menos 8 bar e drenar água do reservatório de ar; verificar mangotes e se as válvulas manuais estão operando normalmente; estabilizar a pressão em 8 bar'),
    pp.st('Com o painel elétrico ligado, verificar se as válvulas de controle de pressão (atuadores pneumáticos) estão reguladas para 5 bar e se as válvulas de "production" e "load/unload" estão corretamente posicionadas'),
    pp.st('Verificar se os drenos pneumáticos estão funcionando corretamente e se existem mangotes ou válvulas danificadas (acionar as válvulas de dreno manual para confirmar que estão operacionais)'),
    pp.st('Verificar se existem vazamentos em mangotes e tubbings de ar comprimido e se a pressão está estabilizando (caso não esteja, procurar vazamentos no sistema de ar comprimido)'),
    pp.st('Acionar a válvula de pré-lube e verificar a operação da bomba pneumática e os manômetros de lubrificação forçada (mín. 3,5 bar)'),
    pp.tx('Observações (Sistema Pneumático Pressurizado)'),
  );

  // --- CONTROLE DE VARIÁVEIS — PRÉ-PARTIDA ---
  const pre = sec('CONTROLE DE VARIÁVEIS — PRÉ-PARTIDA');
  itens.push(pre.md('Temperatura ambiente', '°C'));
  itens.push(...leituras(pre, 'zero'));
  itens.push(
    pre.st('Posição da válvula de vent (deve estar aberta)'),
    pre.st('Posição da válvula de load/unload (deve estar aberta)'),
    pre.tx('Observações (Pré-partida)'),
  );

  // --- TESTE OPERACIONAL — 900/1200 RPM ---
  const t1 = sec('TESTE OPERACIONAL — 900/1200 RPM (10 MIN)');
  itens.push(
    t1.st('Checar correias da polia do ventilador do motor'),
    t1.st('Checar vazamentos e ruídos ao redor do booster'),
  );
  itens.push(...leituras(t1, 'mms'));
  itens.push(
    t1.st('Posição da válvula de vent (deve estar aberta)'),
    t1.st('Posição da válvula de load/unload (deve estar aberta)'),
    t1.tx('Observações (900/1200 RPM)'),
  );

  // --- TESTE OPERACIONAL — 1450 RPM ---
  const t2 = sec('TESTE OPERACIONAL — 1450 RPM (10 MIN)');
  itens.push(
    t2.st('Checar correias da polia do ventilador do motor'),
    t2.st('Checar vazamentos e ruídos ao redor do booster'),
    t2.st('Checar blink blink dos estágios 1 e 2 e manômetro de lubrificação'),
    t2.st('Checar blink blink dos estágios 3 e 4 e manômetro de lubrificação'),
    t2.md('Tempo entre LEDs do blink blink — estágios 1 e 2', 's'),
    t2.md('Tempo entre LEDs do blink blink — estágios 3 e 4', 's'),
  );
  itens.push(...leituras(t2, 'mms'));
  itens.push(
    t2.tx('Acionar a válvula de load (carga)'),
    t2.st('Posição da válvula de vent (deve estar aberta)'),
    t2.st('Posição da válvula de load/unload (deve estar fechada)'),
    t2.tx('Observações (1450 RPM)'),
  );

  // --- TESTE DE PRODUÇÃO — 100 BAR ---
  const p100 = sec('TESTE DE PRODUÇÃO — 100 BAR');
  itens.push(
    p100.tx('Abrir metade da válvula manual de produção no manifold'),
    p100.tx('Setar a pressão de controle no painel para 180 bar, acionar o botão "Production" e fechar a válvula de controle manual até alcançar 100 bar no painel'),
    p100.st('Posição da válvula de vent (deve estar fechada)'),
    p100.st('Posição da válvula de load/unload (deve estar fechada)'),
    p100.st('Checar correias da polia do ventilador do motor'),
    p100.st('Checar vazamentos e ruídos ao redor do booster'),
  );
  itens.push(...leituras(p100, 'mms'));
  itens.push(
    p100.tx('Observações (Produção 100 bar)'),
    p100.tx('Setar a pressão de controle no painel para 100 bar e dar enter para acionar a válvula de alívio'),
    p100.st('Posição da válvula de vent (deve estar aberta)'),
    p100.st('Posição da válvula de load/unload (deve estar fechada)'),
    p100.tx('Observações (Alívio 100 bar)'),
  );

  // --- TESTE DE PRODUÇÃO — 200 BAR ---
  const p200 = sec('TESTE DE PRODUÇÃO — 200 BAR');
  itens.push(
    p200.tx('Setar a pressão de controle no painel para 300 bar, acionar o botão "Production" e fechar a válvula de controle manual até alcançar 200 bar no painel'),
    p200.st('Posição da válvula de vent (deve estar fechada)'),
    p200.st('Posição da válvula de load/unload (deve estar fechada)'),
    p200.st('Checar correias da polia do ventilador do motor'),
    p200.st('Checar vazamentos e ruídos ao redor do booster'),
  );
  itens.push(...leituras(p200, 'mms'));
  itens.push(
    p200.tx('Observações (Produção 200 bar)'),
    p200.tx('Setar a pressão de controle no painel para 200 bar e dar enter para acionar a válvula de alívio'),
    p200.st('Posição da válvula de vent (deve estar aberta)'),
    p200.st('Posição da válvula de load/unload (deve estar fechada)'),
    p200.tx('Observações (Alívio 200 bar)'),
  );

  // --- TESTE DE PRODUÇÃO — 300 BAR ---
  const p300 = sec('TESTE DE PRODUÇÃO — 300 BAR');
  itens.push(
    p300.tx('Setar a pressão de controle no painel para 350 bar, acionar o botão "Production" e fechar a válvula de controle manual até alcançar 300 bar no painel'),
    p300.st('Posição da válvula de vent (deve estar fechada)'),
    p300.st('Posição da válvula de load/unload (deve estar fechada)'),
    p300.st('Checar correias da polia do ventilador do motor'),
    p300.st('Checar vazamentos e ruídos ao redor do booster'),
  );
  itens.push(...leituras(p300, 'mms'));
  itens.push(
    p300.tx('Observações (Produção 300 bar)'),
    p300.tx('Setar a pressão de controle no painel para 300 bar e dar enter para acionar a válvula de alívio'),
    p300.st('Posição da válvula de vent (deve estar aberta)'),
    p300.st('Posição da válvula de load/unload (deve estar fechada)'),
    p300.tx('Observações (Alívio 300 bar)'),
  );

  // --- COOLING DOWN TEST ---
  const cd = sec('COOLING DOWN TEST');
  itens.push(
    cd.tx('Com a válvula de vent aberta, fechar a válvula de controle manual e desacelerar o motor para 1200 RPM por 10 minutos'),
    cd.st('Posição da válvula de vent (deve estar aberta)'),
    cd.st('Posição da válvula de load/unload (deve estar fechada)'),
    cd.st('Checar correias da polia do ventilador do motor'),
    cd.st('Checar vazamentos e ruídos ao redor do booster'),
  );
  itens.push(...leituras(cd, 'mms'));
  itens.push(cd.tx('Observações (Cooling Down)'));

  // --- APÓS O DESLIGAMENTO DO MOTOR ---
  const off = sec('APÓS O DESLIGAMENTO DO MOTOR');
  itens.push(
    off.tx('Apertar o botão de parada vermelho e aguardar a sequência de desligamento, mantendo o nitrogênio fluindo mesmo após a parada do motor'),
    off.st('Posição da válvula de vent (deve estar aberta)'),
    off.st('Posição da válvula de load/unload (deve estar aberta)'),
    off.st('Checar correias da polia do ventilador do motor'),
    off.st('Checar vazamentos e ruídos ao redor do booster'),
    off.md('Pressão de ar comprimido no balão de ar (8 bar)', 'bar'),
    off.st('Checar bomba de diafragma e manômetros de lubrificação forçada'),
    off.tx('Observações (Após o desligamento)'),
  );

  return itens;
}

/* ============================ COMPRESSOR PRIMÁRIO ============================ */
function buildCompressor(): Item[] {
  const itens: Item[] = [];

  const sl = sec('INSPEÇÃO DO SKID E LINGADA');
  itens.push(
    sl.ce('Verificar validade do certificado do SKID'),
    sl.ce('Verificar validade do certificado da LINGADA'),
  );

  const ge = sec('INSPEÇÃO GERAL (ESTÁTICA)');
  itens.push(
    ge.st('Skid, lingada e compressor estão dessalinizados e limpos'),
    ge.st('Verificar se existe vazamento de óleo do compressor (mangotes e válvula de saída de ar comprimido)'),
    ge.st('Nível de óleo do compressor'),
    ge.st('Verificar se existe vazamento de óleo do motor'),
    ge.st('Nível de óleo do motor'),
    ge.st('Rolamento da hélice do ventilador do motor'),
    ge.st('Esticador e correias do alternador'),
    ge.st('Filtros de ar do motor (primário e secundário)'),
    ge.st('Sensores e chicote elétrico'),
    ge.st('Botoeira de emergência'),
    ge.st('Limpeza e desobstrução dos radiadores'),
    ge.st('Verificar nível de glicol'),
    ge.st('Verificar pistão pneumático da gaveta do compressor (ferrugem)'),
    ge.st('Verificar pistão pneumático de aceleração do motor (ferrugem)'),
    ge.st('Inspecionar mangotes do comando pneumático'),
    ge.st('Verificar fixação dos bornes, cabos e tensão das baterias'),
    ge.st('Fechadura das portas'),
    ge.st('Sistema de descarga (tubulação e flap)'),
    ge.st('Fixação das braçadeiras dos filtros de ar (turbina, motor e compressor)'),
    ge.st('Cabos de aterramento'),
    ge.st('Verificar manta de proteção do cano de descarga'),
    ge.tx('Observações (Inspeção Geral Estática)'),
  );

  const li = sec('INSPEÇÃO DA LINGADA');
  itens.push(
    li.st('Verificar que a lingada não encosta no chão (anelão deve estar na altura do peito)'),
    li.st('Lubrificação da lingada'),
    li.st('Contrapinos instalados e dobrados'),
    li.st('Porcas e parafusos das manilhas compatíveis'),
    li.st('Fios de aço da lingada em condições de uso'),
    li.st('Sem amassamento no cabo de aço da lingada'),
    li.st('Sem amassamento das sapatilhas da lingada'),
    li.st('Pintura da lingada e anelões'),
    li.st('Plaqueta de identificação'),
  );

  const sk = sec('INSPEÇÃO DO SKID');
  itens.push(
    sk.st('Verificar pintura dos olhais (amarelo fluorescente)'),
    sk.st('Verificar amassados na estrutura (danos severos)'),
    sk.st('Verificar estado dos furos dos olhais'),
    sk.st('Verificar se todos os parafusos dos travões estão apertados'),
    sk.st('Verificar por material solto em todo o skid'),
    sk.st('Verificar se os bujões de dreno estão fixados no local'),
    sk.st('Verificar por corrosão severa na chapa do piso do skid'),
    sk.st('Verificar por corrosão severa na chapa do teto do skid'),
    sk.st('Plaqueta de identificação'),
    sk.tx('Observações (Inspeção do Skid)'),
  );

  const go = sec('INSPEÇÃO GERAL (OPERACIONAL)');
  itens.push(
    go.st('Verificar danos ao skid, painel, válvulas, tubulações e radiador'),
    go.st('Remover objetos soltos dentro do skid'),
    go.st('Inspecionar visualmente o conjunto de içamento (pintura, travamento das manilhas com contra-pinos, lubrificação e danos dos cabos de aço) — substituir o conjunto caso necessário'),
    go.st('Conferir se todos os manômetros e vasos de pressão estão íntegros e identificados com adesivos de certificação e NR13'),
    go.st('Inspeção visual de vazamentos de glicol, diesel e óleo em todo o equipamento. Verificar nível de óleo do motor, diesel, glicol e óleos lubrificantes'),
    go.st('Conferir fixação do painel elétrico, verificar se faltam parafusos, verificação visual de dano ao cabo elétrico de alimentação de bateria e prensa-cabos no painel elétrico, válvulas e sensores'),
    go.st('Verificar radiador, executar limpeza da colmeia com água para remover sal e obstruções'),
    go.st('Verificar etiqueta externa de status do equipamento (laranja/verde/vermelha)'),
  );

  const pd = sec('INSPEÇÃO DO SISTEMA PNEUMÁTICO (DESPRESSURIZADO)');
  itens.push(
    pd.ce('Verificar certificação da válvula de segurança (PSV) — total de 1 un.'),
    pd.ce('Verificar certificação dos manômetros'),
    pd.ce('Verificar certificação NR13 dos reservatórios de ar'),
    pd.st('Inspecionar fixação e status dos atuadores pneumáticos da gaveta e do acelerador do motor (verificar ferrugem interna)'),
    pd.st('Inspecionar mangotes do comando pneumático'),
  );

  const mo = sec('INSPEÇÃO DO MOTOR DIESEL');
  itens.push(
    mo.st('Realizar troca de filtros e óleo do motor'),
    mo.st('Realizar troca do filtro de ar do motor'),
    mo.st('Verificar nível de glicol e vazamentos de mangotes e braçadeiras'),
    mo.st('Verificar abraçadeiras e dutos da turbina; inspecionar se a tampa da descarga está corretamente instalada e não bloqueada pela lingada ou pela lona'),
    mo.st('Verificar o sistema de isolamento térmico da descarga do motor'),
    mo.tx('Observações (Motor Diesel)'),
  );

  const di = sec('INSPEÇÃO DO SISTEMA DIESEL');
  itens.push(
    di.st('Checar os mangotes de alimentação de diesel até o tanque'),
    di.st('Verificar a qualidade do diesel no tanque e nos filtros Racor. Verificar coloração e a presença de água no combustível. Caso necessário, drenar todo o sistema'),
    di.st('Realizar troca de filtros diesel'),
    di.tx('Observações (Sistema Diesel)'),
  );

  const hi = sec('INSPEÇÃO DO SISTEMA HIDRÁULICO');
  itens.push(
    hi.st('Verificar níveis de óleo hidráulico do compressor e mangotes do sistema'),
    hi.st('Drenar o sistema hidráulico pelos 4 pontos de dreno (tanque, radiador, unidade compressora)'),
    hi.st('Verificar se existe vestígio de óleo hidráulico na saída de ar comprimido do compressor; inspecionar o filtro separador ar/óleo'),
    hi.st('Verificar e, se necessário, trocar o filtro de bypass'),
    hi.tx('Observações (Sistema Hidráulico)'),
  );

  const el = sec('INSPEÇÃO DO SISTEMA ELÉTRICO');
  itens.push(
    el.st('Abrir o painel e verificar reaperto de todos os componentes'),
    el.st('Verificar cabos e prensa-cabos na entrada dos painéis elétricos e em todos os instrumentos e válvulas (em caso de danos, substituir)'),
    el.st('Verificar funcionamento do sistema 24 VDC, inspecionar cabos de bateria'),
    el.st('Verificar estado e tensão das correias do ventilador e do alternador e retensionar se necessário'),
    el.st('Verificar se o botão de parada de emergência está atuando'),
    el.tx('Observações (Sistema Elétrico)'),
  );

  const al = sec('PARTIDA EM ALÍVIO');
  itens.push(
    al.tx('Fechar a válvula de saída de ar comprimido, colocar a chave seletora no modo unload (alívio), ligar o compressor e aguardar 10 minutos'),
    al.st('Verificar a pressão do sistema no painel (verificar se a pressão estabilizou ou continua subindo muito lentamente)'),
    al.st('Verificar as correias do ventilador e do alternador; verificar se o alternador está carregando no amperímetro'),
    al.st('Verificar a pressão de óleo e a temperatura do motor e do compressor'),
    al.st('Verificar se existem vazamentos em mangotes, tubbings de ar comprimido, mangotes de diesel e mangotes do radiador'),
    al.st('Verificar se o flap da descarga está liberado e trabalhando corretamente'),
    al.tx('Observações (Partida em Alívio)'),
  );

  const to = sec('TESTE OPERACIONAL DO SISTEMA');
  itens.push(
    to.tx('Colocar a chave seletora no modo load (carga) e aguardar o compressor acelerar e entrar em carga'),
    to.st('Checar correias da polia do ventilador do motor'),
    to.st('Checar vazamentos e ruídos ao redor do compressor'),
    to.st('Checar manômetro para confirmar que a pressão estabilizou'),
    to.st('Abrir bem pouco a válvula de saída de ar e aguardar a aceleração (no máximo 1500 RPM), mantendo esta rotação por 5 minutos'),
    to.st('Fechar a válvula de saída de ar e aguardar a aceleração reduzir (aproximadamente 1200 RPM); verificar o manômetro de pressão para confirmar que a pressão estabilizou'),
    to.st('Compressor liberado para teste dinâmico (utilizar a tabela de controle dinâmico)'),
  );

  return itens;
}

/* ============================ MEMBRANA ============================ */
function buildMembrana(): Item[] {
  const itens: Item[] = [];

  const cl = sec('INSPEÇÃO DO CONTAINER E LINGADA');
  itens.push(
    cl.ce('Verificar validade do certificado do CONTAINER'),
    cl.ce('Verificar validade do certificado da LINGADA'),
  );

  const g = sec('INSPEÇÃO GERAL');
  itens.push(
    g.st('Verificar portinhola de descarga de oxigênio'),
    g.st('Remover objetos soltos dentro do container'),
    g.st('Inspecionar visualmente o conjunto de içamento (pintura, travamento das manilhas com contra-pinos, lubrificação e danos dos cabos de aço) — substituir o conjunto caso necessário'),
    g.st('Conferir se todos os manômetros e vasos de pressão estão íntegros e identificados com adesivos de certificação e NR13'),
    g.st('Inspecionar limpeza, identificação e danos físicos ao container (interno e externo), incluindo portas, dobradiças e travões'),
    g.st('Conferir fechamento total dos painéis elétricos, verificar se faltam parafusos, adesivos de "220 VOLTS" e "PERIGO PAINEL ELÉTRICO", verificação visual de dano ao cabo elétrico de alimentação e prensa-cabos no painel elétrico, válvulas e sensores'),
    g.st('Verificar etiqueta externa de status do equipamento (laranja/verde/vermelha)'),
  );

  const pd = sec('INSPEÇÃO DO SISTEMA PNEUMÁTICO (DESPRESSURIZADO)');
  itens.push(
    pd.ce('Verificar certificação da válvula de segurança (PSV)'),
    pd.ce('Verificar certificação dos manômetros'),
    pd.ce('Verificar certificação NR13 dos reservatórios de ar'),
    pd.st('Inspecionar filtros coalescentes, confirmar que todos são FEA'),
    pd.st('Inspecionar fixação dos atuadores pneumáticos'),
  );

  const el = sec('INSPEÇÃO DO SISTEMA ELÉTRICO');
  itens.push(
    el.st('Abrir o painel e verificar reaperto de todos os componentes'),
    el.st('Verificar cabos e prensa-cabos na entrada dos painéis elétricos e em todos os instrumentos (em caso de danos, substituir)'),
    el.st('Verificar funcionamento do sistema 220 VCA × 24 VDC'),
    el.st('Verificar se o controlador de temperatura está operacional e se as válvulas pneumáticas de bloqueio de ar comprimido e de controle de glicol estão funcionando'),
    el.st('Verificar no flowmeter se os dados estão sendo apresentados de forma correta'),
    el.tx('Observações (Sistema Elétrico)'),
  );

  const pp = sec('INSPEÇÃO DO SISTEMA PNEUMÁTICO (PRESSURIZADO)');
  itens.push(
    pp.st('Verificar se as válvulas de controle de pressão (válvulas pneumáticas) estão reguladas para 5 bar — exceto a de controle de oxigênio (0,1 bar)'),
    pp.st('Verificar se os drenos pneumáticos estão funcionando corretamente e se existem mangotes ou válvulas danificadas (acionar as válvulas de dreno manual para confirmar que estão operacionais)'),
    pp.st('Drenar água dos reservatórios de ar e drenos; verificar mangotes e se as válvulas estão operando normalmente'),
    pp.st('Verificar se existem vazamentos nos flanges e tubulações'),
    pp.st('Verificar se existem vazamentos nas conexões dos mangotes e cartuchos e nas válvulas manuais e pneumáticas de nitrogênio'),
  );

  const me = sec('INSPEÇÃO DO SISTEMA DE MEDIÇÃO DE QUALIDADE DE NITROGÊNIO (PRESSURIZADO)');
  itens.push(
    me.ce('Verificar certificação do aparelho de medição de oxigênio'),
    me.st('Verificar válvula redutora de pressão do medidor de oxigênio'),
    me.ce('Verificar certificação do flowmeter'),
  );

  const ci = sec('TESTE OPERACIONAL — CARTUCHO INDIVIDUAL A 50 PCMS');
  for (let n = 1; n <= 12; n++) {
    itens.push(ci.md(`Cartucho ${n} — % de O₂ após 5 min`, '%'));
  }

  const pl = sec('TESTE OPERACIONAL — SISTEMA PLENO');
  for (const cfm of [400, 650, 750, 1000, 1200, 1500]) {
    itens.push(pl.md(`Sistema pleno a ${cfm} CFMS — % de O₂ após 5 min`, '%'));
  }

  return itens;
}

/* ============================ PERSISTÊNCIA ============================ */
async function resetModelo(id: string) {
  const itens = await prisma.itemChecklist.findMany({ where: { modeloId: id }, select: { id: true } });
  const itemIds = itens.map((i) => i.id);
  if (itemIds.length) {
    await prisma.respostaItem.deleteMany({ where: { itemId: { in: itemIds } } });
  }
  // Preserva inspeções reais: só desvincula do modelo antigo (não as apaga).
  await prisma.inspecao.updateMany({ where: { modeloId: id }, data: { modeloId: null } });
  await prisma.itemChecklist.deleteMany({ where: { modeloId: id } });
  await prisma.checklistModelo.deleteMany({ where: { id } });
}

async function semearModelo(id: string, nome: string, tipoEquipamento: string, itens: Item[]) {
  await resetModelo(id);
  await prisma.checklistModelo.create({
    data: { id, nome, tipoEquipamento, versao: 1, ativo: true },
  });
  await prisma.itemChecklist.createMany({
    data: itens.map((it, idx) => ({
      id: `${id}-${String(idx + 1).padStart(3, '0')}`,
      modeloId: id,
      secao: it.secao,
      descricao: it.descricao,
      ordem: idx + 1,
      obrigatorio: it.obrigatorio,
      tipo: it.tipo,
      unidade: it.unidade ?? null,
    })),
  });
  console.log(`  ${nome} (${tipoEquipamento}) — ${itens.length} itens`);
}

async function main() {
  console.log('Semeando novos modelos de checklist (preservando mod-1 e inspeções reais)...');
  await semearModelo('mod-membrana', 'Checklist Operacional de Liberação de Membrana', 'Membrana', buildMembrana());
  await semearModelo('mod-compressor', 'Checklist Operacional de Liberação de Compressor Primário', 'Compressor', buildCompressor());
  await semearModelo('mod-booster', 'Checklist Operacional de Liberação de Booster', 'Booster', buildBooster());
  console.log('Concluído!');
}

main()
  .catch((e) => { console.error('Erro ao semear:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
