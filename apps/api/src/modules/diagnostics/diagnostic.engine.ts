export const DIAGNOSTIC_CRITERIA_VERSION = "orvia-diagnostico-1.1.0";

export type DiagnosticProfile = {
  profession: string | null;
  specialty: string | null;
  region: string | null;
  targetAudience: string | null;
  professionalGoals: string[];
  weeklyTimeMinutes: number | null;
  socialExperience: string | null;
  postingFrequency: string | null;
  serviceMode: string | null;
  communicationPreferences: string[];
};

type Dimension = { id: string; label: string; score: number; explanation: string; evidence: string[]; missing: string[] };
type Action = { title: string; description: string; why: string; effortHours: number; indicator: string; sequence: number };

const hasText = (value: string | null) => Boolean(value?.trim());
const round = (value: number) => Math.round(value * 100) / 100;

export function createDiagnostic(profile: DiagnosticProfile) {
  const foundationalEvidence = [profile.profession && `Profissão informada: ${profile.profession}`, profile.specialty && `Especialidade informada: ${profile.specialty}`, profile.region && `Região informada: ${profile.region}`, profile.targetAudience && "Público-alvo registrado no perfil."].filter((value): value is string => Boolean(value));
  const dimensions: Dimension[] = [
    {
      id: "fundamentos", label: "Fundamentos do perfil", score: Math.round([profile.profession, profile.specialty, profile.region, profile.targetAudience].filter(hasText).length / 4 * 100),
      explanation: "Cada um dos quatro campos informados (profissão, especialidade, região e público-alvo) vale 25 pontos. Não avalia qualidade ou demanda de mercado.", evidence: foundationalEvidence,
      missing: [[profile.profession, "Profissão"], [profile.specialty, "Especialidade"], [profile.region, "Região"], [profile.targetAudience, "Público-alvo"]].filter(([value]) => !hasText(value as string | null)).map(([, label]) => `Campo ausente: ${label}`),
    },
    {
      id: "direcao", label: "Direção profissional", score: Math.min(profile.professionalGoals.length, 2) * 50,
      explanation: "Nenhum objetivo vale 0; um objetivo vale 50; dois ou mais valem 100. Objetivos adicionais não aumentam a pontuação e não indicam chance de resultado.", evidence: profile.professionalGoals.map(goal => `Objetivo selecionado: ${goal}`), missing: profile.professionalGoals.length ? [] : ["Nenhum objetivo selecionado"],
    },
    {
      id: "rotina", label: "Rotina digital declarada", score: Math.round(([hasText(profile.socialExperience), hasText(profile.postingFrequency)].filter(Boolean).length / 2) * 100),
      explanation: "Experiência e frequência informadas valem 50 pontos cada. Não mede alcance, engajamento ou consistência observada.",
      evidence: [profile.socialExperience && `Experiência declarada: ${profile.socialExperience}`, profile.postingFrequency && `Frequência declarada: ${profile.postingFrequency}`].filter((value): value is string => Boolean(value)),
      missing: [!hasText(profile.socialExperience) && "Experiência com redes sociais não informada", !hasText(profile.postingFrequency) && "Frequência de publicações não informada"].filter((value): value is string => Boolean(value)),
    },
    {
      id: "disponibilidade", label: "Disponibilidade para planejar", score: profile.weeklyTimeMinutes === null ? 0 : 100,
      explanation: "Disponibilidade informada vale 100; campo ausente vale 0. A quantidade de horas não reduz a pontuação, apenas limita o tamanho do plano.",
      evidence: profile.weeklyTimeMinutes === null ? [] : [`Disponibilidade autodeclarada: ${round(profile.weeklyTimeMinutes / 60)} hora(s) por semana`], missing: profile.weeklyTimeMinutes === null ? ["Disponibilidade semanal não informada"] : [],
    },
  ];
  const score = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  const strengths = [
    ...(profile.professionalGoals.length ? [`Você já definiu ${profile.professionalGoals.length} objetivo(s) profissional(is) para orientar as próximas escolhas.`] : []),
    ...(hasText(profile.targetAudience) ? ["Seu perfil já registra um público que pode ajudar a direcionar a comunicação."] : []),
    ...(profile.weeklyTimeMinutes !== null && profile.weeklyTimeMinutes > 0 ? [`Você informou ${round(profile.weeklyTimeMinutes / 60)} hora(s) semanais disponíveis para essa frente.`] : []),
    ...(profile.profession && profile.serviceMode ? [`Profissão e modalidade de atendimento estão registradas.`] : []),
  ];
  const opportunities = [
    ...dimensions.flatMap(dimension => dimension.missing.map(item => ({ title: item, reason: "Essa informação não consta no perfil disponível e pode tornar o próximo plano mais específico." }))),
    ...(profile.professionalGoals.length > 1 ? [{ title: "Escolher um foco inicial", reason: "Priorizar um objetivo por vez ajuda a manter o plano compatível com o tempo informado." }] : []),
    ...(!profile.postingFrequency || profile.postingFrequency === "Ainda não publico" ? [{ title: "Definir um ritmo sustentável", reason: "A frequência é autodeclarada; comece por um ritmo que caiba na sua rotina, sem promessa de alcance." }] : []),
  ];
  const limitations = [
    "Esta análise usa somente as informações autodeclaradas no perfil e não verifica redes sociais, audiência, concorrentes, mercado, resultados ou procura por serviços.",
    "A pontuação representa preenchimento e organização das informações disponíveis, não qualidade profissional, desempenho digital ou probabilidade de crescimento.",
    ...(dimensions.flatMap(item => item.missing).length ? ["Informações ausentes foram tratadas como desconhecidas, nunca como fatos negativos."] : []),
  ];
  const context = [
    profile.profession && `Você informou profissão: ${profile.profession}${profile.specialty ? `, com especialidade em ${profile.specialty}` : ""}.`,
    profile.region && `Região informada: ${profile.region}.`,
    profile.serviceMode && `Modalidade de atendimento informada: ${profile.serviceMode}.`,
    profile.targetAudience && "O perfil inclui uma descrição de público-alvo; o texto livre não é repetido no diagnóstico.",
    profile.professionalGoals.length && `Objetivos profissionais registrados: ${profile.professionalGoals.slice(0, 3).join("; ")}.`,
    profile.weeklyTimeMinutes !== null && `Disponibilidade semanal declarada: ${round(profile.weeklyTimeMinutes / 60)} hora(s).`,
  ].filter((value): value is string => Boolean(value));
  const result = {
    professionalSummary: context.length ? context.join(" ") : "Ainda não há informações suficientes no perfil para resumir sua situação profissional.",
    summary: score >= 75 ? "Seu perfil reúne boa parte das informações usadas para organizar um primeiro plano." : score >= 45 ? "Seu perfil já oferece alguns pontos de partida; completar informações pode deixar as recomendações mais específicas." : "Ainda há informações importantes em aberto. O resultado é um ponto de partida e pode melhorar quando o perfil for completado.",
    score,
    scoreLabel: "Organização das informações do perfil",
    scoreMethod: "Média simples de quatro dimensões de preenchimento (fundamentos, direção, rotina digital declarada e disponibilidade), com pesos iguais. Cada dimensão usa somente os campos indicados em sua explicação.",
    dimensions, strengths, opportunities, limitations,
    evidenceBoundary: "Declarações vêm do perfil; leituras são inferências limitadas a essas declarações; recomendações são sugestões, não previsões. Não há dados externos nesta análise.",
  };
  return { result, strategy: createInitialStrategy(profile) };
}

function createInitialStrategy(profile: DiagnosticProfile) {
  const priorities = profile.professionalGoals.slice(0, 3);
  const selected = priorities.length ? priorities : ["Organizar uma presença profissional clara"];
  const availableHours = profile.weeklyTimeMinutes === null ? null : profile.weeklyTimeMinutes / 60;
  const noCapacity = availableHours === 0;
  const prioritiesWithActions: { title: string; rationale: string; actions: Action[] }[] = [];

  if (noCapacity) {
    prioritiesWithActions.push({ title: "Respeitar sua disponibilidade atual", rationale: "Você informou que não tem horas semanais disponíveis; por isso não foi programada nenhuma atividade de execução.", actions: [{ title: "Revisar sua disponibilidade quando fizer sentido", description: "Atualize o perfil se sua disponibilidade mudar. Nenhuma tarefa de execução foi planejada para esta semana.", why: "O plano não deve pressupor tempo que você não informou.", effortHours: 0, indicator: "Disponibilidade semanal revisada no perfil, se houver mudança", sequence: 1 }] });
  } else if (availableHours === null) {
    prioritiesWithActions.push({ title: "Definir uma disponibilidade realista", rationale: "Sem uma disponibilidade semanal informada, o Orvia não consegue dimensionar atividades de execução.", actions: [{ title: "Informar sua disponibilidade semanal", description: "No perfil, registre quanto tempo você poderia dedicar por semana, mesmo que seja pouco.", why: "Esse dado permite limitar o plano sem presumir tempo livre.", effortHours: 0.17, indicator: "Disponibilidade semanal registrada no perfil", sequence: 1 }] });
  } else {
    const count = Math.min(selected.length, 3, Math.max(1, Math.floor(availableHours / 0.25)));
    const chosen = selected.slice(0, count);
    const budgetPerAction = Math.min(0.5, availableHours / count);
    chosen.forEach((goal, index) => {
      const [title, description] = actionFor(goal, profile);
      prioritiesWithActions.push({ title: goal, rationale: `Prioridade selecionada no perfil. Esta sugestão é dimensionada para até ${round(availableHours)} hora(s) semanal(is) informada(s).`, actions: [{ title, description, why: "A ação transforma o objetivo autodeclarado em um próximo passo pequeno e observável, sem prometer resultado.", effortHours: round(budgetPerAction), indicator: "Ação registrada como concluída ou ajustada à rotina", sequence: index + 1 }] });
    });
  }

  return {
    objective: priorities.length ? `Criar próximos passos compatíveis com: ${priorities.slice(0, 2).join(" e ")}.` : "Organizar informações básicas para escolher um primeiro foco profissional.",
    weeklyBudgetHours: availableHours === null ? null : round(availableHours),
    priorities: prioritiesWithActions,
    estimateNote: "Estimativas de esforço são aproximações para planejamento, não garantias de duração ou resultado.",
    indicators: ["Ação registrada como concluída, adaptada ou adiada pela profissional", "Disponibilidade semanal revista no perfil quando necessário"],
    guardrails: [
      "Use informações profissionais verdadeiras e que possam ser sustentadas.",
      "Não publique dados que identifiquem pacientes nem relatos de atendimento que permitam identificá-los.",
      "Não prometa cura, resultado clínico, renda ou crescimento de audiência.",
      "Evite transformar orientação geral em diagnóstico ou aconselhamento clínico individual nas redes.",
      "Estas são salvaguardas gerais do produto; confira também as regras vigentes do conselho da sua profissão antes de publicar.",
    ],
  };
}

function actionFor(goal: string, profile: DiagnosticProfile): [string, string] {
  if (goal === "Atrair novos clientes") return ["Rascunhar uma apresentação do seu trabalho", "Escreva uma apresentação factual sobre sua atuação, modalidade e público que atende. Evite promessas de resultado e dados de pacientes."];
  if (goal === "Fortalecer minha presença digital") return ["Revisar a clareza do seu perfil profissional", "Confira se sua descrição informa atuação, especialidade e como encontrar informações profissionais, sem incluir dados de pacientes."];
  if (goal === "Comunicar meu trabalho com clareza") return ["Rascunhar uma explicação educativa", "Escolha uma dúvida ampla da sua área e rascunhe uma explicação geral, sem avaliar ou orientar um caso individual."];
  if (goal === "Organizar minha rotina de conteúdo") return ["Escolher um tema e um formato possíveis", `Use sua preferência de comunicação${profile.communicationPreferences.length ? ` (${profile.communicationPreferences.join(", ")})` : ""} para escolher um tema profissional amplo e um formato simples.`];
  if (goal === "Consolidar minha marca profissional") return ["Registrar três pontos factuais da sua apresentação", "Anote temas de atuação, público que atende e modalidade de atendimento para manter sua comunicação coerente."];
  return ["Definir um próximo passo profissional", "Escolha uma pequena ação relacionada ao seu objetivo e ajuste-a à sua disponibilidade."];
}
