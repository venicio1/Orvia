import { describe, expect, it } from "vitest";
import { createDiagnostic, DIAGNOSTIC_CRITERIA_VERSION, type DiagnosticProfile } from "../src/modules/diagnostics/diagnostic.engine";

const complete: DiagnosticProfile = {
  profession: "Psicóloga", specialty: "Psicologia clínica", region: "Paraná", targetAudience: "Adultos",
  professionalGoals: ["Comunicar meu trabalho com clareza", "Organizar minha rotina de conteúdo"],
  weeklyTimeMinutes: 120, socialExperience: "Estou começando", postingFrequency: "Ainda não publico",
  serviceMode: "Online", communicationPreferences: ["Tom acolhedor"],
};

describe("deterministic professional diagnostic", () => {
  it("uses explicit profile fields and discloses the scoring method and criteria version", () => {
    const { result } = createDiagnostic(complete);
    expect(DIAGNOSTIC_CRITERIA_VERSION).toBe("orvia-diagnostico-1.1.0");
    expect(result.score).toBe(100);
    expect(result.professionalSummary).toContain("Você informou profissão: Psicóloga");
    expect(result.professionalSummary).toContain("2 hora(s)");
    expect(result.dimensions).toHaveLength(4);
    expect(result.scoreMethod).toContain("Média simples de quatro dimensões");
    expect(result.dimensions[2]?.evidence).toContain("Frequência declarada: Ainda não publico");
    expect(result.dimensions[0]?.evidence).toContain("Público-alvo registrado no perfil.");
    expect(result.limitations.join(" ")).toContain("não verifica redes sociais");
    expect(JSON.stringify(result)).not.toMatch(/Instagram|seguidores|alcance atual/i);
    expect(JSON.stringify(result)).not.toContain("Adultos");
  });

  it("treats missing fields as unknown and reports them without invented facts", () => {
    const partial = { ...complete, profession: null, specialty: null, region: null, targetAudience: null, professionalGoals: [], socialExperience: null, postingFrequency: null, weeklyTimeMinutes: null };
    const { result, strategy } = createDiagnostic(partial);
    expect(result.dimensions[0]?.score).toBe(0);
    expect(result.opportunities.map(item => item.title)).toContain("Campo ausente: Profissão");
    expect(result.strengths).toEqual([]);
    expect(strategy.weeklyBudgetHours).toBeNull();
    expect(strategy.priorities[0]?.title).toBe("Definir uma disponibilidade realista");
    expect(strategy.priorities[0]?.actions[0]?.effortHours).toBeGreaterThan(0);
  });

  it("keeps a small weekly budget within the declared availability", () => {
    const { strategy } = createDiagnostic({ ...complete, weeklyTimeMinutes: 15 });
    const total = strategy.priorities.flatMap(item => item.actions).reduce((sum, action) => sum + action.effortHours, 0);
    expect(total).toBeLessThanOrEqual(0.25);
    expect(strategy.priorities.length).toBe(1);
  });

  it("does not schedule execution when weekly availability is zero", () => {
    const { strategy } = createDiagnostic({ ...complete, weeklyTimeMinutes: 0 });
    const actions = strategy.priorities.flatMap(item => item.actions);
    expect(strategy.weeklyBudgetHours).toBe(0);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.effortHours).toBe(0);
    expect(actions[0]?.description).toContain("Nenhuma tarefa de execução");
  });

  it("limits priorities to three and includes general communication guardrails", () => {
    const { strategy } = createDiagnostic({ ...complete, professionalGoals: ["A", "B", "C", "D"] });
    expect(strategy.priorities).toHaveLength(3);
    expect(strategy.guardrails.join(" ")).toContain("Não publique dados que identifiquem pacientes");
    expect(strategy.guardrails.join(" ")).toContain("conselho da sua profissão");
  });

  it("maps each supported professional objective to a concrete action", () => {
    const goals = ["Atrair novos clientes", "Fortalecer minha presença digital", "Comunicar meu trabalho com clareza", "Organizar minha rotina de conteúdo", "Consolidar minha marca profissional"];
    for (const goal of goals) {
      const { strategy } = createDiagnostic({ ...complete, professionalGoals: [goal] });
      expect(strategy.priorities[0]?.title).toBe(goal);
      expect(strategy.priorities[0]?.actions[0]?.description.length).toBeGreaterThan(30);
    }
  });
});
