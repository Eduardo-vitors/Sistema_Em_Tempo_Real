import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ProcessCard } from "../components/ProcessCard";

export function Home() {
  const [numProcesses, setNumProcesses] = useState(2);
  const [algorithm, setAlgorithm] = useState("rm");
  const [horizon, setHorizon] = useState(50);
  const [processData, setProcessData] = useState([]);

  const navigate = useNavigate();

  useEffect(() => {
    fillProcesses(numProcesses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numProcesses]);

  function fillProcesses(newNum) {
    setProcessData((prev) => {
      const copy = [...prev];
      if (newNum > copy.length) {
        const offset = newNum - copy.length;
        const extras = Array.from({ length: offset }, (_, i) => ({
          id: copy.length + i + 1,
          chegada: 0,
          tempo: 1,
          periodo: 4,
          deadline: 0,
        }));
        return copy.concat(extras);
      } else {
        return copy.slice(0, newNum);
      }
    });
  }

  function handleProcessChange(index, field, value) {
    setProcessData((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: Number(value),
      };
      if (field === "chegada" && index === 0) {
        updated[index].chegada = 0;
      }
      return updated;
    });
  }

  function handleRunSimulation() {
    // navega para /simulacao com os dados atuais
    navigate("/simulacao", {
      state: {
        algorithm,
        horizon,
        processData,
      },
    });
  }

  return (
    <section className="config-section">
      <h2 style={{ marginBottom: "1rem" }}>Configuração das Tarefas Periódicas</h2>

      <form
        className="config-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleRunSimulation();
        }}
      >
        <div className="config-form-options">
          <label>
            Número de Processos:
            <input
              type="number"
              min="1"
              value={numProcesses}
              onChange={(e) => setNumProcesses(Math.max(1, Number(e.target.value)))}
            />
          </label>

          <label>
            Método:
            <select
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
            >
              <option value="rm">RM (Rate Monotonic)</option>
              <option value="edf">EDF (Earliest Deadline First)</option>
            </select>
          </label>

          <label>
            Horizonte (tempo final):
            <input
              type="number"
              min="1"
              value={horizon}
              onChange={(e) => setHorizon(Math.max(1, Number(e.target.value)))}
            />
          </label>
        </div>

        <div className="process-config">
          <div className="process-config-cards_container">
            {processData.map((p, index) => (
              <ProcessCard
                key={p.id}
                task={p}
                index={index}
                algorithm={algorithm}
                onChange={handleProcessChange}
              />
            ))}
          </div>
        </div>

        <p style={{ marginTop: "0.25rem", fontSize: "0.9rem", opacity: 0.85 }}>
          Modelo: tarefa periódica com C (execução), T (período), D (deadline relativo) e offset (primeira liberação).
        </p>

        <div className="config-form-button-group">
          <button type="submit">Executar Simulação</button>
        </div>
      </form>
    </section>
  );
}
