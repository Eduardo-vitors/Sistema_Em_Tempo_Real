import "./ProcessCard.css";

/**
 * Card de configuração de TAREFA PERIÓDICA.
 * Campos esperados em `task`:
 *  - id
 *  - chegada   (offset, primeira liberação)
 *  - tempo     (C, execução por instância)
 *  - periodo   (T)
 *  - deadline  (D relativo; 0 => assume D=T)
 */
export function ProcessCard({ task, index, onChange, algorithm }) {
  const disableArrival = index === 0;
  const showDeadlineHint = algorithm === "edf";

  return (
    <div className="process-card">
      <h4>Tarefa {task.id}</h4>

      <div className="process-card-fields">
        <label className={disableArrival ? "disabled" : ""}>
          Offset (chegada):
          <input
            type="number"
            min="0"
            value={task.chegada}
            disabled={disableArrival}
            onChange={(e) => onChange(index, "chegada", e.target.value)}
          />
        </label>

        <label>
          Execução (C):
          <input
            type="number"
            min="1"
            value={task.tempo}
            onChange={(e) => onChange(index, "tempo", e.target.value)}
          />
        </label>

        <label>
          Período (T):
          <input
            type="number"
            min="1"
            value={task.periodo}
            onChange={(e) => onChange(index, "periodo", e.target.value)}
          />
        </label>

        <label>
          Deadline (D):
          <input
            type="number"
            min="0"
            value={task.deadline}
            onChange={(e) => onChange(index, "deadline", e.target.value)}
          />
        </label>
      </div>

      {showDeadlineHint && (
        <p style={{ marginTop: "0.6rem", fontSize: "0.85rem", opacity: 0.85 }}>
          EDF usa o *deadline absoluto* (release + D). Se D=0, o simulador assume D=T.
        </p>
      )}
    </div>
  );
}
