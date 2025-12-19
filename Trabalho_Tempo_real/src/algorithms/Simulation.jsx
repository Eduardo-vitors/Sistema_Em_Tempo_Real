import { useEffect, useState, useRef } from "react";
import TimelineBlock from "../components/TimelineBlock";
import { IoMdPlay, IoMdPause } from "react-icons/io";
import { MdSkipPrevious, MdSkipNext } from "react-icons/md";
import { RiResetLeftFill } from "react-icons/ri";
import { AiFillThunderbolt } from "react-icons/ai";

import "./style.css";

function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.max(min, Math.min(max, n));
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function lcm(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a / gcd(a, b)) * b);
}

function computeHyperperiod(tasks) {
  const Ts = tasks.map((t) => clampInt(t.periodo ?? 1, 1, 10_000));
  return Ts.reduce((acc, cur) => lcm(acc, cur), 1);
}

function pickJob(readyJobs, algorithm, tasks) {
  if (readyJobs.length === 0) return null;

  if (algorithm === "rm") {
    // menor T => maior prioridade (fixa)
    return readyJobs
      .slice()
      .sort((a, b) => {
        const Ta = tasks.get(a.taskId).periodo;
        const Tb = tasks.get(b.taskId).periodo;
        if (Ta !== Tb) return Ta - Tb;
        if (a.release !== b.release) return a.release - b.release;
        return a.taskId - b.taskId;
      })[0];
  }

  // EDF: menor deadline absoluto primeiro
  return readyJobs
    .slice()
    .sort((a, b) => {
      if (a.deadlineAbs !== b.deadlineAbs) return a.deadlineAbs - b.deadlineAbs;
      if (a.release !== b.release) return a.release - b.release;
      return a.taskId - b.taskId;
    })[0];
}

// ✅ Opção 1: escalonável se NÃO houver nenhum "miss" no horizonte simulado
function hasDeadlineMiss(tasksArr) {
  return tasksArr.some((t) => t.timeline.some((state) => state === "miss"));
}

/**
 * Simulador de eventos discretos para um conjunto de tarefas periódicas.
 * Saída: Gantt por tarefa (blocos por unidade de tempo), usando TimelineBlock.
 */
export default function Simulation({ algorithm, processData, horizon = 50 }) {
  const [simulationData, setSimulationData] = useState([]);
  const moment = useRef(0);
  const lastTick = useRef(Date.now());
  const [majorTime, setMajorTime] = useState(0);
  const [minorTime, setMinorTime] = useState(0);
  const [finalTime, setFinalTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [simulationState, setSimulationState] = useState("paused");

  // ✅ NOVO: status de escalonabilidade (Opção 1)
  const [isSchedulable, setIsSchedulable] = useState(true);

  // clock visual
  useEffect(() => {
    const interval = setInterval(() => {
      if (finalTime === majorTime) setSimulationState("paused");
      if (simulationState !== "running") return;

      moment.current += ((Date.now() - lastTick.current) * speed) / 1000;
      lastTick.current = Date.now();

      const mj = Math.floor(moment.current);
      setMinorTime(moment.current - mj);

      if (mj !== majorTime) setMajorTime(mj);
    }, 50);

    return () => clearInterval(interval);
  }, [finalTime, majorTime, simulationState, speed]);

  // simulação
  useEffect(() => {
    const H = clampInt(horizon, 1, 10_000);

    // normaliza/copias (não mutar o state externo)
    const tasksArr = (processData ?? []).map((t, i) => {
      const T = clampInt(t.periodo ?? 1, 1, 10_000);
      const C = clampInt(t.tempo ?? 1, 1, 10_000);
      const offset = clampInt(t.chegada ?? 0, 0, 10_000);
      const Draw = clampInt(t.deadline ?? 0, 0, 10_000);
      const D = Draw === 0 ? T : Draw; // D=0 => assume D=T

      return {
        id: t.id ?? i + 1,
        chegada: offset,
        tempo: C,
        periodo: T,
        deadline: D,
        timeline: Array(H).fill("idle"),
      };
    });

    const tasks = new Map(tasksArr.map((t) => [t.id, t]));

    // Próxima liberação (release) de cada tarefa
    const nextRelease = new Map();
    tasksArr.forEach((t) => nextRelease.set(t.id, t.chegada));

    // fila global de jobs prontos + job rodando
    let ready = [];
    let running = null;

    // helper: marca estados em um intervalo [t0, t1)
    function fillInterval(t0, t1, runningJob, readyJobs) {
      for (let t = t0; t < t1 && t < H; t++) {
        const overdueByTask = new Set(
          readyJobs
            .filter((j) => j.deadlineAbs <= t && j.remaining > 0)
            .map((j) => j.taskId)
        );

        if (runningJob && runningJob.deadlineAbs <= t && runningJob.remaining > 0) {
          overdueByTask.add(runningJob.taskId);
        }

        tasksArr.forEach((task) => {
          const isRunning = runningJob && runningJob.taskId === task.id;
          const hasPending = readyJobs.some((j) => j.taskId === task.id);
          const notReleasedYet = t < task.chegada;

          let state = "idle";
          if (notReleasedYet) state = "idle";
          else if (isRunning) state = "exe";
          else if (hasPending) state = "wait";
          else state = "idle";

          if (overdueByTask.has(task.id)) state = "miss";

          task.timeline[t] = state;
        });
      }
    }

    // Simulador evento-a-evento
    let time = 0;

    while (time < H) {
      // 1) Releases em `time`
      tasksArr.forEach((task) => {
        const nr = nextRelease.get(task.id);
        if (nr === time) {
          ready.push({
            taskId: task.id,
            remaining: task.tempo,
            release: time,
            deadlineAbs: time + task.deadline,
          });
          nextRelease.set(task.id, time + task.periodo);
        }
      });

      // 2) Escolha preemptiva
      const chosen = pickJob(ready, algorithm, tasks);
      if (chosen !== running) running = chosen;

      // 3) Próximo evento (release futuro ou término)
      const futureReleases = Array.from(nextRelease.values()).filter((v) => v > time);
      const nextRel = futureReleases.length ? Math.min(...futureReleases) : Infinity;

      const finish = running ? time + running.remaining : Infinity;
      const tNext = Math.min(nextRel, finish, H);

      // CPU ociosa até o próximo release
      if (!running && ready.length === 0) {
        const jumpTo = Number.isFinite(nextRel) ? Math.min(nextRel, H) : H;
        fillInterval(time, jumpTo, null, ready);
        time = jumpTo;
        continue;
      }

      // 4) Preenche Gantt e consome execução
      fillInterval(time, tNext, running, ready);

      if (running) {
        const delta = tNext - time;
        running.remaining -= delta;
        if (running.remaining <= 0) {
          ready = ready.filter((j) => j !== running);
          running = null;
        }
      }

      time = tNext;
    }

    // ✅ Opção 1: escalonável se não houver "miss"
    setIsSchedulable(!hasDeadlineMiss(tasksArr));

    setSimulationData(tasksArr);
    setFinalTime(H);

    moment.current = 0;
    setMajorTime(0);
    setMinorTime(0);
    setSimulationState("paused");
  }, [algorithm, processData, horizon]);

  function getStatus(task, time) {
    const index = minorTime === 0 ? time - 1 : time;
    if (index < 0) return "";
    if (index >= finalTime) return "Finalizado";

    switch (task.timeline[index]) {
      case "exe":
        return "Executando";
      case "wait":
        return "Pronto";
      case "miss":
        return "Deadline Miss";
      case "idle":
        return "Ocioso";
      default:
        return "";
    }
  }

  const algoLabel = algorithm === "rm" ? "RM" : "EDF";

  return (
    <>
      <div className="simulation-header">
        <div>
          <h3>Simulação {algoLabel} (tempo 0 → {finalTime})</h3>

          {/* ✅ Opção 1: badge Escalonável / Não escalonável */}
          <div
            style={{
              marginTop: "0.6rem",
              padding: "0.35rem 0.75rem",
              borderRadius: "10px",
              fontWeight: 700,
              width: "fit-content",
              backgroundColor: isSchedulable ? "#d4edda" : "#f8d7da",
              color: isSchedulable ? "#155724" : "#721c24",
              border: `1px solid ${isSchedulable ? "#c3e6cb" : "#f5c6cb"}`,
            }}
          >
            {isSchedulable ? "✔ Conjunto Escalonável" : "✖ Conjunto NÃO Escalonável"}
          </div>
        </div>
      </div>

      <div className="simulation-controls">
        <button
          className="simulation-controller-button"
          onClick={() => {
            moment.current = 0;
            setMajorTime(0);
            setMinorTime(0);
            setSimulationState("paused");
          }}
        >
          <RiResetLeftFill size={32} />
        </button>

        <button
          className="simulation-controller-button"
          disabled={simulationState !== "paused" || majorTime === 0}
          onClick={() => {
            moment.current = majorTime - 1;
            setMajorTime(majorTime - 1);
            setMinorTime(0);
          }}
        >
          <MdSkipPrevious size={32} />
        </button>

        <button
          className="simulation-controller-button"
          disabled={majorTime === finalTime}
          onClick={() => {
            if (simulationState === "running") setSimulationState("paused");
            else {
              lastTick.current = Date.now();
              setSimulationState("running");
            }
          }}
        >
          {simulationState !== "running" && <IoMdPlay size={32} />}
          {simulationState !== "paused" && <IoMdPause size={32} />}
        </button>

        <button
          className="simulation-controller-button"
          disabled={simulationState !== "paused" || majorTime === finalTime}
          onClick={() => {
            moment.current = majorTime + 1;
            setMajorTime(majorTime + 1);
            setMinorTime(0);
          }}
        >
          <MdSkipNext size={32} />
        </button>

        <button
          className="simulation-controller-button"
          onClick={() => {
            moment.current = finalTime;
            setMajorTime(finalTime);
            setMinorTime(0);
            setSimulationState("paused");
          }}
        >
          <AiFillThunderbolt size={32} />
        </button>
      </div>

      <div className="simulation-speed">
        <div>
          <input
            disabled={simulationState !== "paused"}
            type="range"
            min="0.1"
            max="4"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          <label>Clock Speed: {Number(speed).toFixed(1)}</label>
        </div>

        <span>Tempo: {majorTime}</span>
      </div>

      <div className="simulation-container">
        {simulationData.map((t) => (
          <div key={t.id} className="process-row">
            <h4>
              <strong>Tarefa {t.id}</strong>
              <br />
              {getStatus(t, majorTime)}
              <br />
              <span style={{ fontWeight: 400, opacity: 0.85 }}>
                C={t.tempo} T={t.periodo} D={t.deadline} offset={t.chegada}
              </span>
            </h4>

            <div className="process-timeline">
              {t.timeline.map((state, i) => (
                <TimelineBlock key={i} state={state} index={i} majorTime={majorTime} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
