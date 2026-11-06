import { BarChart3, BellRing, Clock3, Fingerprint, Headphones, ImageDown, Medal, RefreshCcw, Share2, Sparkles, Trophy, Users } from 'lucide-react';
import type { ReactElement } from 'react';
import type { SpotlightTab } from './Spotlight';
import { GramophoneIcon } from './Gramophone';

export type ExtrasTarget = { tab: SpotlightTab } | { page: 'library' | 'studio' | 'settings'; focus: string } | { action: 'card' | 'welcome' | 'invite' };
interface Feature { id: string; title: string; icon: ReactElement; what: string; steps: string[]; cta: string; target: ExtrasTarget; tone: 'gold' | 'green' | 'cyan' }
const features: Feature[] = [
  { id: 'achievements', title: 'Conquistas de milhões', icon: <Trophy size={24}/>, tone: 'gold', what: 'Mais de 200 missões de fandoms, gêneros, décadas e hábitos. Acompanhe seu progresso e colecione selos.', steps: ['Escolha sua missão', 'Dê play nas suas músicas', 'Baixe ou compartilhe o selo'], cta: 'Abrir coleção', target: { tab: 'achievements' } },
  { id: 'awards', title: 'Premiação Grammy pessoal', icon: <GramophoneIcon size={26} />, tone: 'gold', what: 'As 100 categorias do Grammy 2027 com o seu histórico: você vota ou deixa um júri de 6 jurados decidir em segredo.', steps: ['Escolha as categorias', 'Vote ou convoque o júri', 'Abra a cerimônia e revele'], cta: 'Montar premiação', target: { tab: 'awards' } },
  { id: 'profile', title: 'Seu perfil musical', icon: <Fingerprint size={24} />, tone: 'green', what: 'Descubra qual dos 16 perfis de ouvinte você é, seus selos e o seu signo musical, por semana, mês, ano ou todo o histórico.', steps: ['Escolha o período', 'Veja eixos, selos e signo', 'Toque nas habilidades para ver o motivo'], cta: 'Ver meu perfil', target: { tab: 'profile' } },
  { id: 'chart', title: 'Sua edição de charts', icon: <Trophy size={24} />, tone: 'gold', what: 'Dê um nome à sua parada, escolha a época e o Top, e transforme em vídeo no estúdio.', steps: ['Nomeie a edição', 'Escolha época e Top', 'Toque em Animar esta edição'], cta: 'Criar edição', target: { tab: 'chart' } },
  { id: 'compare', title: 'Comparar até 5 perfis', icon: <Users size={24} />, tone: 'cyan', what: 'Você + até 4 amigos: duelo lado a lado, matriz de afinidade, parada do grupo, o que todos ouvem e quem ouviu primeiro.', steps: ['Adicione os usuários', 'Baixe as semanas de cada um', 'Veja duelo e grupo'], cta: 'Comparar', target: { tab: 'compare' } },
  { id: 'records', title: 'Recordes do período', icon: <Medal size={24} />, tone: 'gold', what: 'Reinado do #1, maior subida, retorno triunfal e outros recordes calculados das suas semanas.', steps: ['Escolha a época', 'Abra um recorde', 'Baixe o card'], cta: 'Ver recordes', target: { tab: 'records' } },
  { id: 'insights', title: 'Insights e hábitos', icon: <Sparkles size={24} />, tone: 'green', what: 'Pulso das últimas semanas, você em duas épocas, concentração do gosto e tesouros para revisitar.', steps: ['Escolha a época', 'Leia os quatro painéis'], cta: 'Abrir insights', target: { tab: 'insights' } },
  { id: 'catalog', title: 'Gêneros e tempo ouvido', icon: <Clock3 size={24} />, tone: 'cyan', what: 'Consulte gênero, lançamento e duração no catálogo e veja o tempo estimado com a cobertura em %.', steps: ['Abra o Acervo', 'Toque em Consultar', 'Filtre por gênero ou época'], cta: 'Ir ao Acervo', target: { page: 'library', focus: '.catalog-panel' } },
  { id: 'soundtrack', title: 'Trilha do #1 no vídeo', icon: <Headphones size={24} />, tone: 'green', what: 'O som acompanha quem lidera nas linhas e barras: modo manual, automático pela sua biblioteca local ou os dois.', steps: ['Abra o Estúdio', 'Ative a Trilha do #1', 'Associe seus arquivos'], cta: 'Ir à trilha', target: { page: 'studio', focus: '.leader-soundtrack' } },
  { id: 'card', title: 'Card Top 10 da semana', icon: <ImageDown size={24} />, tone: 'cyan', what: 'Imagem pronta para redes sociais com o Top 10 da semana selecionada.', steps: ['Escolha a semana em Charts', 'Baixe o card'], cta: 'Baixar card', target: { action: 'card' } },
  { id: 'sync', title: 'Projetos entre aparelhos', icon: <RefreshCcw size={24} />, tone: 'green', what: 'Leve ajustes, premiações e trilhas para outro aparelho com uma chave só sua, ou por arquivo.', steps: ['Crie a chave', 'Envie deste aparelho', 'Use a chave no outro'], cta: 'Configurar', target: { page: 'settings', focus: '.device-sync' } },
  { id: 'notify', title: 'Notificações de marcos', icon: <BellRing size={24} />, tone: 'gold', what: 'Avisos opcionais de novo #1, certificações, aniversários de #1 e recordes, com horário silencioso.', steps: ['Ative o aviso', 'Escolha tipos e horário'], cta: 'Configurar', target: { page: 'settings', focus: '.notify-panel' } },
  { id: 'welcome', title: 'Tour pelo LastChart', icon: <Share2 size={24} />, tone: 'green', what: 'Qualquer pessoa pode ter os próprios charts, prêmios e perfil. Passo a passo para conectar e link de convite para amigos.', steps: ['Abra o passo a passo', 'Digite o usuário do Last.fm', 'Envie o convite para amigos'], cta: 'Rever tutorial', target: { action: 'welcome' } },
  { id: 'charts', title: 'Tabela semanal completa', icon: <BarChart3 size={24} />, tone: 'cyan', what: 'Top 100 de cada semana com picos, estreias, retornos, CSV e chart run completo de cada item.', steps: ['Abra Charts', 'Escolha a semana', 'Toque em um item'], cta: 'Abrir Charts', target: { page: 'library', focus: '' } },
];

/** Central de recursos extras: tudo num lugar, com o que é e como usar. */
export function Extras({ onOpen }: { onOpen: (target: ExtrasTarget | { page: 'charts' }) => void }) {
  return <section className="extras" aria-label="Extras">
    <div className="extras-grid">{features.map((f, i) => <article key={f.id} className={`extra-card tone-${f.tone}`} style={{ animationDelay: `${i * 45}ms` }}>
      <div className="extra-top"><span className="extra-icon">{f.icon}</span><h3>{f.title}</h3></div>
      <p>{f.what}</p>
      <ol className="extra-steps">{f.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <button type="button" className="button small primary" onClick={() => onOpen(f.id === 'charts' ? { page: 'charts' } : f.target)}><span>{f.cta}</span></button>
    </article>)}</div>
  </section>;
}
